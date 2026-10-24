<?php
// Generic CRUD for all masters defined in entities.php.
//
//   GET    masters/{entity}?q=&status=active|inactive|all&page=&per_page=&sort=&dir=
//   GET    masters/{entity}/{id}
//   POST   masters/{entity}
//   PUT    masters/{entity}/{id}
//   PATCH  masters/{entity}/{id}/status   { "is_active": true|false }
//   DELETE masters/{entity}/{id}
//   GET    lookup/{entity}                 id, code, name, is_active (for dropdowns)

function masters_route(string $method, array $parts): void
{
    $e  = entity($parts[0] ?? '');
    $id = isset($parts[1]) ? (int) $parts[1] : null;
    $sub = $parts[2] ?? null;

    if ($id === null) {
        if ($method === 'GET')  { json_out(master_list($e)); return; }
        if ($method === 'POST') { json_out(master_save($e, null, request_body()), 201); return; }
    } elseif ($sub === 'status') {
        if ($method === 'PATCH') { json_out(master_set_status($e, $id, request_body())); return; }
    } elseif ($sub === null) {
        if ($method === 'GET')    { json_out(master_get($e, $id)); return; }
        if ($method === 'PUT')    { json_out(master_save($e, $id, request_body())); return; }
        if ($method === 'DELETE') { json_out(master_delete($e, $id)); return; }
    }
    throw new ApiError('Not found.', 404);
}

function lookup_route(string $method, array $parts): void
{
    if ($method !== 'GET') {
        throw new ApiError('Not found.', 404);
    }
    $e = entity($parts[0] ?? '');
    $t = $e['table'];
    $extra = implode('', array_map(fn ($c) => ", $c", $e['lookup'] ?? []));
    $rows = db_all("SELECT id, code, name, is_active$extra FROM $t ORDER BY name");
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['is_active'] = (bool) $r['is_active'];
    }
    json_out(['data' => $rows]);
}

// ---------------------------------------------------------------------------

function master_select(array $e): string
{
    $t = $e['table'];
    $cols = ["$t.*"];
    $joins = '';
    $i = 0;
    foreach ($e['joins'] ?? [] as $col => $j) {
        $alias = 'j' . $i++;
        $cols[] = "$alias.name AS {$j['as']}";
        $joins .= " LEFT JOIN {$j['table']} $alias ON $alias.id = $t.$col";
    }
    return 'SELECT ' . implode(', ', $cols) . " FROM $t$joins";
}

function master_list(array $e): array
{
    $t = $e['table'];
    $where = [];
    $params = [];

    $status = $_GET['status'] ?? 'active';
    if ($status === 'active')   { $where[] = "$t.is_active = 1"; }
    if ($status === 'inactive') { $where[] = "$t.is_active = 0"; }

    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $or = [];
        foreach ($e['search'] as $i => $col) {
            $or[] = "$t.$col LIKE :q$i";
            $params["q$i"] = '%' . $q . '%';
        }
        $where[] = '(' . implode(' OR ', $or) . ')';
    }

    // Optional filter on a linked column, e.g. ?category_id=3
    foreach ($e['fields'] as $name => $f) {
        if ($f['type'] === 'fk' && isset($_GET[$name]) && $_GET[$name] !== '') {
            $where[] = "$t.$name = :f_$name";
            $params["f_$name"] = (int) $_GET[$name];
        }
    }

    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    // Any column shown in the list can be sorted: its fields, code, status, and joined names.
    $joinAliases = array_column($e['joins'] ?? [], 'as');
    $sortable = array_merge(['code', 'is_active', 'updated_at'], $t === 'users' ? ['last_login'] : [], array_keys(array_filter($e['fields'], fn ($f) => $f['type'] !== 'password')), $joinAliases);
    $sort = $_GET['sort'] ?? 'name';
    if (!in_array($sort, $sortable, true)) {
        $sort = 'name';
    }
    $sortSql = in_array($sort, $joinAliases, true) ? $sort : "$t.$sort";
    if (($e['fields'][$sort]['type'] ?? '') === 'fk') {
        $sortSql = "$t.$sort"; // fk ids: sort by joined name instead when available
        foreach ($e['joins'] ?? [] as $col => $j) {
            if ($col === $sort) { $sortSql = $j['as']; }
        }
    }
    $dir = strtolower($_GET['dir'] ?? 'asc') === 'desc' ? 'DESC' : 'ASC';

    $perPage = max(1, min(200, (int) ($_GET['per_page'] ?? 20)));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $offset = ($page - 1) * $perPage;

    $total = (int) db_value("SELECT COUNT(*) FROM $t$whereSql", $params);
    $rows = db_all(master_select($e) . "$whereSql ORDER BY $sortSql $dir, $t.id DESC LIMIT $perPage OFFSET $offset", $params);

    return [
        'data'     => array_map(fn ($r) => master_cast($e, $r), $rows),
        'total'    => $total,
        'page'     => $page,
        'per_page' => $perPage,
        'counts'   => [
            'active'   => (int) db_value("SELECT COUNT(*) FROM $t WHERE is_active = 1"),
            'inactive' => (int) db_value("SELECT COUNT(*) FROM $t WHERE is_active = 0"),
        ],
    ];
}

function master_find(array $e, int $id): array
{
    $t = $e['table'];
    $row = db_one(master_select($e) . " WHERE $t.id = :id", ['id' => $id]);
    if (!$row) {
        throw new ApiError("{$e['label']} not found. It may have been deleted.", 404);
    }
    return master_cast($e, $row);
}

function master_get(array $e, int $id): array
{
    return ['data' => master_find($e, $id)];
}

function master_cast(array $e, array $row): array
{
    $row['id'] = (int) $row['id'];
    $row['is_active'] = (bool) $row['is_active'];
    unset($row['password_hash']);
    foreach ($e['fields'] as $name => $f) {
        if (!array_key_exists($name, $row) || $row[$name] === null) {
            continue;
        }
        if ($f['type'] === 'fk')     { $row[$name] = (int) $row[$name]; }
        if ($f['type'] === 'number') { $row[$name] = (float) $row[$name]; }
    }
    return $row;
}

// ---------------------------------------------------------------------------

function master_validate(array $e, ?int $id, array $in): array
{
    $t = $e['table'];
    $clean = [];
    $errors = [];

    foreach ($e['fields'] as $name => $f) {
        $v = $in[$name] ?? null;
        if (is_string($v) && $f['type'] !== 'password') {
            $v = trim($v);
        }
        if ($f['type'] === 'password') {
            // Stored only as a hash. Blank on edit keeps the current password.
            if ($v === '' || $v === null) {
                if ($id === null) {
                    $errors[$name] = 'Set a password.';
                }
            } elseif (mb_strlen($v) < 6) {
                $errors[$name] = 'Use at least 6 characters.';
            } else {
                $clean['password_hash'] = password_hash($v, PASSWORD_DEFAULT);
            }
            continue;
        }
        if ($v === '' || $v === null) {
            if (!empty($f['required'])) {
                $errors[$name] = "{$f['label']} is required.";
            }
            $clean[$name] = null;
            continue;
        }

        switch ($f['type']) {
            case 'text':
            case 'textarea':
                $v = (string) $v;
                break;
            case 'username':
                $v = strtolower((string) $v);
                if (!preg_match('/^[a-z0-9._-]{3,50}$/', $v)) {
                    $errors[$name] = 'Use 3 to 50 letters, numbers, dots, dashes or underscores, with no spaces.';
                }
                break;
            case 'email':
                if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
                    $errors[$name] = 'Enter a valid email address, like name@company.com.';
                }
                $v = strtolower($v);
                break;
            case 'mobile':
                $v = preg_replace('/\s+/', '', (string) $v);
                if (!preg_match('/^\d{10}$/', $v)) {
                    $errors[$name] = 'Enter a 10-digit mobile number.';
                }
                break;
            case 'phone':
                if (!preg_match('/^\+?[0-9][0-9 \-]{6,18}$/', $v)) {
                    $errors[$name] = 'Enter a phone number using digits only, e.g. 98640 12345.';
                }
                break;
            case 'gstin':
                $v = strtoupper(str_replace(' ', '', $v));
                if (!preg_match('/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/', $v)) {
                    $errors[$name] = 'GSTIN should be 15 characters, like 18AABCU9603R1ZM.';
                }
                break;
            case 'pincode':
                if (!preg_match('/^[1-9][0-9]{5}$/', $v)) {
                    $errors[$name] = 'PIN code should be 6 digits.';
                }
                break;
            case 'url':
                if (!preg_match('#^https?://#i', $v)) {
                    $v = 'https://' . $v;
                }
                if (!filter_var($v, FILTER_VALIDATE_URL)) {
                    $errors[$name] = 'Enter a valid website address.';
                }
                break;
            case 'number':
                if (!is_numeric($v)) {
                    $errors[$name] = "{$f['label']} must be a number.";
                } elseif (isset($f['min']) && $v < $f['min']) {
                    $errors[$name] = "{$f['label']} cannot be less than {$f['min']}.";
                }
                $v = is_numeric($v) ? (float) $v : $v;
                break;
            case 'enum':
                if (!in_array($v, $f['options'], true)) {
                    $errors[$name] = "Choose a valid {$f['label']}.";
                }
                break;
            case 'fk':
                $ref = entity($f['ref']);
                $v = (int) $v;
                $refRow = db_one("SELECT id, is_active FROM {$ref['table']} WHERE id = :id", ['id' => $v]);
                if (!$refRow) {
                    $errors[$name] = "Choose a valid {$f['label']}.";
                }
                break;
        }

        if (isset($f['max']) && is_string($v) && mb_strlen($v) > $f['max']) {
            $errors[$name] = "{$f['label']} can be at most {$f['max']} characters.";
        }

        if (!empty($f['unique']) && !isset($errors[$name])) {
            $dup = db_value(
                "SELECT COUNT(*) FROM $t WHERE LOWER($name) = LOWER(:v) AND id <> :id",
                ['v' => $v, 'id' => $id ?? 0]
            );
            if ($dup) {
                $errors[$name] = "\"$v\" already exists. Use a different name.";
            }
        }

        $clean[$name] = $v;
    }

    // Codes are always generated automatically; any code sent by the client is ignored.

    if ($errors) {
        throw new ApiError('Please fix the highlighted fields.', 422, $errors);
    }
    return $clean;
}

function master_next_code(array $e): string
{
    $t = $e['table'];
    $prefix = $e['prefix'] . '-';
    $n = (int) db_value("SELECT COUNT(*) FROM $t") + 1;
    do {
        $code = $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
        $n++;
    } while (db_value("SELECT COUNT(*) FROM $t WHERE code = :c", ['c' => $code]));
    return $code;
}

function master_save(array $e, ?int $id, array $in): array
{
    $t = $e['table'];
    if ($id !== null) {
        master_find($e, $id); // 404 if missing
        master_guard($e, 'save', $id, $in);
    }
    $data = master_validate($e, $id, $in);

    if ($id === null) {
        $data['code'] = master_next_code($e);
        $data['is_active'] = array_key_exists('is_active', $in) ? (int) (bool) $in['is_active'] : 1;
        $data['created_at'] = now();
        $data['updated_at'] = now();
        $cols = array_keys($data);
        $sql = "INSERT INTO $t (" . implode(', ', $cols) . ') VALUES (:' . implode(', :', $cols) . ')';
        db()->prepare($sql)->execute($data);
        $id = (int) db()->lastInsertId();
        $msg = "{$e['label']} added.";
    } else {
        if (array_key_exists('is_active', $in)) {
            $data['is_active'] = (int) (bool) $in['is_active'];
        }
        $data['updated_at'] = now();
        $set = implode(', ', array_map(fn ($c) => "$c = :$c", array_keys($data)));
        db()->prepare("UPDATE $t SET $set WHERE id = :id")->execute($data + ['id' => $id]);
        $msg = "{$e['label']} updated.";
    }

    return ['data' => master_find($e, $id), 'message' => $msg];
}

function master_set_status(array $e, int $id, array $in): array
{
    master_find($e, $id);
    master_guard($e, 'status', $id, $in);
    $active = (int) (bool) ($in['is_active'] ?? false);
    db()->prepare("UPDATE {$e['table']} SET is_active = :a, updated_at = :u WHERE id = :id")
        ->execute(['a' => $active, 'u' => now(), 'id' => $id]);
    return [
        'data'    => master_find($e, $id),
        'message' => $e['label'] . ($active ? ' activated.' : ' deactivated.'),
    ];
}

function master_delete(array $e, int $id): array
{
    $row = master_find($e, $id);
    master_guard($e, 'delete', $id, []);

    foreach ($e['referenced_by'] ?? [] as $r) {
        $n = (int) db_value("SELECT COUNT(*) FROM {$r['table']} WHERE {$r['column']} = :id", ['id' => $id]);
        if ($n > 0) {
            $what = $n === 1 ? "1 {$r['label']}" : "$n {$r['label']}s";
            throw new ApiError(
                "\"{$row['name']}\" is used by $what, so it can't be deleted. Deactivate it instead to hide it from new entries.",
                409
            );
        }
    }

    try {
        db()->prepare("DELETE FROM {$e['table']} WHERE id = :id")->execute(['id' => $id]);
    } catch (PDOException $ex) {
        if ($ex->getCode() === '23000') {
            throw new ApiError("\"{$row['name']}\" is used in other records, so it can't be deleted. Deactivate it instead.", 409);
        }
        throw $ex;
    }
    return ['message' => "{$e['label']} deleted."];
}

// Optional per-entity check before changes (e.g. users: can't lock yourself out).
function master_guard(array $e, string $action, int $id, array $in): void
{
    if (!empty($e['guard'])) {
        ($e['guard'])($action, $id, $in);
    }
}
