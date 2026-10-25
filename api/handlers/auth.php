<?php
// Login with PHP sessions. Roles:
//   Admin  – everything, including Users
//   Sales – shared CRM, assigned Orders and Draft BOQs
//   Store – stock operations, production completion and dispatch
//
//   GET  auth/me         { user, needs_setup }
//   POST auth/setup      { name, username, password }   only while there are no users
//   POST auth/login      { username, password }
//   POST auth/logout
//   POST auth/password   { current, new }               change own password

function session_begin(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('candelier_sid');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function current_user(): ?array
{
    static $user = false;
    static $cachedId = null;
    session_begin();
    $id = $_SESSION['uid'] ?? null;
    if ($user !== false && $cachedId === $id) {
        return $user;
    }
    session_begin();
    $id = $_SESSION['uid'] ?? null;
    $cachedId = $id;
    $user = null;
    if ($id) {
        $u = db_one('SELECT id, code, name, username, role, is_active FROM users WHERE id = :id', ['id' => $id]);
        if ($u && $u['is_active']) {
            $u['id'] = (int) $u['id'];
            unset($u['is_active']);
            $user = $u;
        } else {
            unset($_SESSION['uid']);
        }
    }
    return $user;
}

function require_login(): array
{
    $u = current_user();
    if (!$u) {
        throw new ApiError('Please sign in.', 401);
    }
    return $u;
}

function auth_route(string $method, array $parts): void
{
    $action = $parts[0] ?? '';
    session_begin();

    if ($action === 'me' && $method === 'GET') {
        json_out(['user' => current_user(), 'needs_setup' => (int) db_value('SELECT COUNT(*) FROM users') === 0]);
        return;
    }

    if ($action === 'setup' && $method === 'POST') {
        if ((int) db_value('SELECT COUNT(*) FROM users') > 0) {
            throw new ApiError('Setup is already done. Please sign in.', 409);
        }
        $in = request_body();
        $in['role'] = 'Admin';
        $in['is_active'] = true;
        $res = master_save(entity('users'), null, $in);
        session_regenerate_id(true);
        $_SESSION['uid'] = $res['data']['id'];
        json_out(['user' => current_user_fresh(), 'message' => 'Administrator account created.']);
        return;
    }

    if ($action === 'login' && $method === 'POST') {
        $in = request_body();
        $username = strtolower(trim((string) ($in['username'] ?? '')));
        $password = (string) ($in['password'] ?? '');
        $u = $username !== '' ? db_one('SELECT * FROM users WHERE username = :u', ['u' => $username]) : null;
        if (!$u || !password_verify($password, $u['password_hash'])) {
            usleep(800000); // slow down guessing
            throw new ApiError('Wrong username or password.', 401);
        }
        if (!$u['is_active']) {
            throw new ApiError('This account is inactive. Ask an administrator to activate it.', 403);
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $u['id'];
        db()->prepare('UPDATE users SET last_login = :t WHERE id = :id')->execute(['t' => now(), 'id' => $u['id']]);
        json_out(['user' => current_user_fresh()]);
        return;
    }

    if ($action === 'logout' && $method === 'POST') {
        $_SESSION = [];
        session_destroy();
        json_out(['message' => 'Signed out.']);
        return;
    }

    if ($action === 'password' && $method === 'POST') {
        $me = require_login();
        $in = request_body();
        $row = db_one('SELECT password_hash FROM users WHERE id = :id', ['id' => $me['id']]);
        if (!password_verify((string) ($in['current'] ?? ''), $row['password_hash'])) {
            throw new ApiError('Please fix the highlighted fields.', 422, ['current' => 'Current password is wrong.']);
        }
        $new = (string) ($in['new'] ?? '');
        if (mb_strlen($new) < 6) {
            throw new ApiError('Please fix the highlighted fields.', 422, ['new' => 'Use at least 6 characters.']);
        }
        db()->prepare('UPDATE users SET password_hash = :h, updated_at = :t WHERE id = :id')
            ->execute(['h' => password_hash($new, PASSWORD_DEFAULT), 't' => now(), 'id' => $me['id']]);
        json_out(['message' => 'Password changed.']);
        return;
    }

    throw new ApiError('Not found.', 404);
}

function current_user_fresh(): ?array
{
    $u = db_one('SELECT id, code, name, username, role FROM users WHERE id = :id', ['id' => $_SESSION['uid'] ?? 0]);
    if ($u) {
        $u['id'] = (int) $u['id'];
    }
    return $u;
}

// Rules for changing users: nobody can lock themselves out, and there is always an active Admin.
function users_guard(string $action, int $id, array $in): void
{
    $me = current_user();
    $target = db_one('SELECT id, role, is_active FROM users WHERE id = :id', ['id' => $id]);
    $isSelf = $me && $me['id'] === $id;

    if ($action === 'delete' && $isSelf) {
        throw new ApiError("You can't delete your own account.", 409);
    }
    if ($action === 'status' && $isSelf && empty($in['is_active'])) {
        throw new ApiError("You can't deactivate your own account.", 409);
    }
    if ($action === 'save' && $isSelf && array_key_exists('is_active', $in) && !$in['is_active']) {
        throw new ApiError("You can't deactivate your own account.", 409);
    }
    if ($action === 'save' && $isSelf && ($in['role'] ?? 'Admin') !== 'Admin') {
        throw new ApiError("You can't remove your own Admin role. Ask another administrator.", 409);
    }

    // Would this leave no active Admin?
    $losesAdmin = $target && $target['role'] === 'Admin' && $target['is_active'] && (
        $action === 'delete'
        || ($action === 'status' && empty($in['is_active']))
        || ($action === 'save' && (($in['role'] ?? 'Admin') !== 'Admin' || (array_key_exists('is_active', $in) && !$in['is_active'])))
    );
    if ($losesAdmin && (int) db_value("SELECT COUNT(*) FROM users WHERE role = 'Admin' AND is_active = 1 AND id <> :id", ['id' => $id]) === 0) {
        throw new ApiError('There must always be at least one active Admin.', 409);
    }
}
