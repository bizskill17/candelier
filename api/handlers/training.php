<?php

function migrate_training(): void
{
    $version = '20261124_training_lessons_v1';
    if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version=?', [$version])) return;
    $lock = 'training_' . substr(hash('sha256', (string) db_value('SELECT DATABASE()')), 0, 20);
    if (!db_value('SELECT GET_LOCK(?,30)', [$lock])) throw new ApiError('Application update in progress.', 503);
    try {
        if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version=?', [$version])) return;
        db()->exec("CREATE TABLE IF NOT EXISTS training_lessons (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            module VARCHAR(80) NOT NULL, title VARCHAR(150) NOT NULL,
            menu_path VARCHAR(200) NOT NULL, checklist TEXT NOT NULL,
            video_url VARCHAR(1000) NOT NULL DEFAULT '', duration VARCHAR(20) NOT NULL DEFAULT '',
            sort_order INT UNSIGNED NOT NULL DEFAULT 0,
            sales TINYINT NOT NULL DEFAULT 0, store TINYINT NOT NULL DEFAULT 0,
            published TINYINT NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $catalog = require __DIR__ . '/../training/catalog.php';
        db()->beginTransaction();
        try {
            $insert = db()->prepare('INSERT INTO training_lessons(module,title,menu_path,checklist,sort_order,sales,store) VALUES(?,?,?,?,?,?,?)');
            $order = 0;
            foreach ($catalog as $module => $lessons) {
                foreach ($lessons as [$title, $path, $check, $roles]) {
                    $insert->execute([$module, $title, $path, $check, $order += 10, str_contains($roles, 'S') ? 1 : 0, str_contains($roles, 'T') ? 1 : 0]);
                }
            }
            db()->prepare('INSERT INTO app_migrations(version,applied_at) VALUES(?,?)')->execute([$version, now()]);
            db()->commit();
        } catch (Throwable $e) {
            if (db()->inTransaction()) db()->rollBack();
            throw $e;
        }
    } finally {
        db_value('SELECT RELEASE_LOCK(?)', [$lock]);
    }
}

function training_lessons(bool $manage): array
{
    if ($manage) require_admin();
    $filter = $manage ? '' : match (app_role()) {
        'Sales' => 'WHERE published=1 AND sales=1',
        'Store' => 'WHERE published=1 AND store=1',
        default => 'WHERE published=1',
    };
    return db_all("SELECT * FROM training_lessons $filter ORDER BY sort_order,id");
}

function training_route(string $method, array $parts): void
{
    if ($method === 'GET' && $parts === ['sop']) {
        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="Candelier_Training_and_SOP.pdf"');
        header('Cache-Control: private, no-store');
        readfile(__DIR__ . '/../training/Candelier_Training_and_SOP.pdf');
        return;
    }
    if ($method === 'GET' && (!$parts || $parts === ['manage'])) {
        json_out(['data' => training_lessons((bool) $parts)]);
        return;
    }

    require_admin();
    $create = $method === 'POST' && !$parts;
    $update = $method === 'PUT' && count($parts) === 1 && ctype_digit($parts[0]);
    if (!$create && !$update) throw new ApiError('Not found.', 404);
    if ($update && !db_value('SELECT id FROM training_lessons WHERE id=?', [$parts[0]])) throw new ApiError('Lesson not found.', 404);

    $body = request_body();
    $fields = [];
    $values = [];
    foreach (['module'=>80, 'title'=>150, 'menu_path'=>200, 'checklist'=>5000, 'video_url'=>1000, 'duration'=>20] as $key => $limit) {
        $value = is_string($body[$key] ?? null) ? trim($body[$key]) : '';
        if (mb_strlen($value) > $limit) $fields[$key] = "Use up to $limit characters.";
        if ($value === '' && in_array($key, ['module', 'title'], true)) $fields[$key] = 'Required.';
        $values[$key] = $value;
    }
    $published = ($body['published'] ?? false) === true;
    $url = $values['video_url'];
    $parsed = parse_url($url);
    if (($url !== '' || $published) && (!filter_var($url, FILTER_VALIDATE_URL) || ($parsed['scheme'] ?? '') !== 'https' || isset($parsed['user']) || isset($parsed['pass']))) {
        $fields['video_url'] = 'Enter a valid HTTPS video URL.';
    }
    $order = filter_var($body['sort_order'] ?? 0, FILTER_VALIDATE_INT, ['options'=>['min_range'=>0,'max_range'=>999999]]);
    if ($order === false) $fields['sort_order'] = 'Enter a whole number from 0 to 999999.';
    if ($fields) throw new ApiError('Check the lesson details.', 422, $fields);

    $values = array_merge(array_values($values), [$order, ($body['sales'] ?? false) === true ? 1 : 0, ($body['store'] ?? false) === true ? 1 : 0, $published ? 1 : 0]);
    if ($create) {
        db()->prepare('INSERT INTO training_lessons(module,title,menu_path,checklist,video_url,duration,sort_order,sales,store,published) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute($values);
    } else {
        db()->prepare('UPDATE training_lessons SET module=?,title=?,menu_path=?,checklist=?,video_url=?,duration=?,sort_order=?,sales=?,store=?,published=? WHERE id=?')->execute([...$values, $parts[0]]);
    }
    json_out(['ok'=>true], $create ? 201 : 200);
}
