<?php
// Materials with their specification fields, and the specification catalogue.
//
//   GET    materials                     all materials with fields and variant counts
//   GET    materials/{id}
//   POST   materials                     { name, unit, sort_order, fields: [{ id?, name }] }
//   PUT    materials/{id}
//   PATCH  materials/{id}/status         { is_active }
//   DELETE materials/{id}                only when never used
//   GET    variants/catalog              every material with fields + every variant with its values (for suggestions)
//   GET    variants/stats?ids=1,2&order_item_id=   live In Stock, Booked, Available, Booked (item), Consumed

const UNITS = ['Nos', 'Pcs', 'Set', 'Pair', 'Mtr', 'Ft', 'Kg', 'g', 'Box', 'Roll', 'Coil', 'Ltr'];

function materials_route(string $method, array $parts): void
{
    if (($parts[0] ?? '') === 'bulk' && $method === 'POST') { json_out(material_bulk(request_body())); return; }
    $id = isset($parts[0]) ? (int) $parts[0] : null;
    $sub = $parts[1] ?? null;
    if($id&&$sub==='photo'&&$method==='PATCH'){require_roles(['Admin','Store']);$p=clean_image_path(request_body()['photo_path']??'');if(!$p||!is_file(upload_root().'/'.$p)||!@getimagesize(upload_root().'/'.$p))throw new ApiError('Upload a valid material photo first.',422);material_find($id);db()->prepare('UPDATE materials SET photo_path=?,updated_at=? WHERE id=?')->execute([$p,now(),$id]);json_out(['data'=>material_find($id),'message'=>'Material photo updated.']);return;}
    if ($id === null) {
        if ($method === 'GET')  { json_out(['data' => material_list()]); return; }
        if ($method === 'POST') { json_out(material_save(null, request_body()), 201); return; }
    } elseif ($sub === 'status' && $method === 'PATCH') {
        $m = material_find($id);
        db()->prepare('UPDATE materials SET is_active = :a, updated_at = :u WHERE id = :id')->execute(['a' => !empty(request_body()['is_active']) ? 1 : 0, 'u' => now(), 'id' => $id]);
        json_out(['data' => material_find($id), 'message' => "{$m['name']} " . (!empty(request_body()['is_active']) ? 'activated.' : 'deactivated.')]);
        return;
    } elseif ($sub === null) {
        if ($method === 'GET')    { json_out(['data' => material_find($id)]); return; }
        if ($method === 'PUT')    { json_out(material_save($id, request_body())); return; }
        if ($method === 'DELETE') { json_out(material_delete($id)); return; }
    }
    throw new ApiError('Not found.', 404);
}

function material_cast(array $m): array
{
    $m['id'] = (int) $m['id'];
    $m['category_id'] = (int) $m['category_id'];
    $m['category_name'] = db_value('SELECT name FROM material_categories WHERE id = :c', ['c' => $m['category_id']]);
    $m['sort_order'] = (int) $m['sort_order'];
    $m['is_active'] = (bool) $m['is_active'];
    $m['fields'] = material_fields($m['id']);
    $m['variant_count'] = (int) db_value('SELECT COUNT(*) FROM material_variants WHERE material_id = :m', ['m' => $m['id']]);
    return $m;
}

function material_list(): array
{
    $where = '';
    if (($_GET['status'] ?? 'all') === 'active') $where = ' WHERE is_active = 1';
    return array_map('material_cast', db_all("SELECT * FROM materials$where ORDER BY sort_order, name"));
}

function material_find(int $id): array
{
    $m = db_one('SELECT * FROM materials WHERE id = :id', ['id' => $id]);
    if (!$m) throw new ApiError('Material not found.', 404);
    return material_cast($m);
}

function material_validate(?int $id, array $in, bool $allowMissingPhoto = false): array
{
    $errors = [];
    $code = trim((string) ($in['material_code'] ?? ''));
    if ($code === '' || mb_strlen($code) > 50 || preg_match('/[\x00-\x1F\x7F]/', $code)) $errors['material_code'] = 'Enter a material code (up to 50 characters).';
    elseif (db_value('SELECT COUNT(*) FROM materials WHERE material_code=:c AND id<>:id', ['c'=>$code,'id'=>$id??0])) $errors['material_code'] = 'This material code already exists.';
    $rawPhoto = trim((string) ($in['photo_path'] ?? ''));
    $remotePhoto = filter_var($rawPhoto, FILTER_VALIDATE_URL) && in_array(strtolower(parse_url($rawPhoto, PHP_URL_SCHEME) ?: ''), ['http', 'https'], true) && !parse_url($rawPhoto, PHP_URL_USER) && mb_strlen($rawPhoto) <= 255;
    $photo = $remotePhoto ? $rawPhoto : clean_image_path($rawPhoto);
    if ($photo === false || (!$remotePhoto && $photo && !is_file(upload_root() . '/' . $photo))) $errors['photo_path'] = 'Upload a valid material photo or enter a public image URL (up to 255 characters).';
    elseif (!$photo && !$allowMissingPhoto) $errors['photo_path'] = 'A material photo is required. Upload or take a photo.';
    $name = trim((string) ($in['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) $errors['name'] = 'Enter a material name (up to 100 characters).';
    
    $color = trim((string) ($in['color'] ?? ''));
    if (db_value("SELECT COUNT(*) FROM materials WHERE LOWER(TRIM(name))=LOWER(:n) AND LOWER(TRIM(COALESCE(color,'')))=LOWER(:c) AND id<>:id", ['n'=>$name,'c'=>$color,'id'=>$id??0])) $errors['name'] = 'This material and color combination already exists.';
    if (mb_strlen($color) > 100) $errors['color'] = 'Color can be up to 100 characters.';
    $unit = trim((string) ($in['unit'] ?? ''));
    if (!in_array($unit, UNITS, true)) $errors['unit'] = 'Choose a valid unit.';
    $cid = (int) ($in['category_id'] ?? 0);
    $category = db_one('SELECT id, is_active FROM material_categories WHERE id = :c', ['c' => $cid]);
    $same = $id && (int) db_value('SELECT category_id FROM materials WHERE id = :i', ['i' => $id]) === $cid;
    if (!$category || (!$category['is_active'] && !$same)) $errors['category_id'] = 'Choose an active material category.';
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);
    return ['name' => $name, 'color' => $color, 'unit' => $unit, 'category_id' => $cid, 'material_code' => $code, 'photo_path' => $photo];
}

function material_save(?int $id, array $in, bool $allowMissingPhoto = false): array
{
    if($id)require_admin();else require_roles(['Admin','Store']);
    if ($id) material_find($id);
    $data = material_validate($id, $in, $allowMissingPhoto);
    $pdo = db();
    $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
        if ($id) {
            $pdo->prepare('UPDATE materials SET name = :name, color = :color, unit = :unit, category_id = :category_id, material_code = :material_code, photo_path = :photo_path, updated_at = :t WHERE id = :id')->execute($data + ['t' => now(), 'id' => $id]);
        } else {
            $sort = (int) db_value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM materials');
            $pdo->prepare('INSERT INTO materials (name, color, unit, category_id, material_code, photo_path, sort_order, is_active, created_at, updated_at) VALUES (:name, :color, :unit, :category_id, :material_code, :photo_path, :s, 1, :t, :t2)')->execute($data + ['s' => $sort, 't' => now(), 't2' => now()]);
            $id = (int) $pdo->lastInsertId();
        }
        variant_resolve($id, []);
        if ($own) $pdo->commit();
    } catch (Throwable $e) {
        if ($own && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['data' => material_find($id), 'message' => 'Material saved.'];
}

function material_bulk(array $in): array
{
    require_roles(['Admin', 'Store']);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = material_bulk_rows($in);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function material_bulk_rows(array $in): array
{
    $rows = $in['rows'] ?? [];
    if (!is_array($rows) || !$rows || count($rows) > 500) throw new ApiError('Upload between 1 and 500 material rows.', 422);
    $errors = []; $clean = []; $seen = []; $codes = [];
    foreach ($rows as $i => $row) {
        $row = is_array($row) ? $row : [];
        $category = trim((string) ($row['category'] ?? ''));
        $cid = db_value('SELECT id FROM material_categories WHERE LOWER(name) = LOWER(:n) AND is_active = 1', ['n' => $category]);
        try {
            if ($category === '' || mb_strlen($category) > 100) throw new ApiError('Enter a category name up to 100 characters.', 422);
            if (!$cid) {
                $existing = db_value('SELECT id FROM material_categories WHERE LOWER(name)=LOWER(?)', [$category]);
                if ($existing) throw new ApiError('This category is inactive. Activate it before importing.', 422);
                db()->prepare('INSERT INTO material_categories(code,name,is_active,created_at,updated_at) VALUES(?,?,1,?,?)')->execute(['MC-' . bin2hex(random_bytes(8)), $category, now(), now()]);
                $cid = (int) db()->lastInsertId();
            }
            $data = material_validate(null, ['category_id' => $cid, 'name' => $row['name'] ?? '', 'color' => $row['color'] ?? '', 'photo_path' => $row['photo_path'] ?? '', 'unit' => $row['unit'] ?? '', 'material_code' => $row['material_code'] ?? ''], true);
            $key = mb_strtolower(trim($data['name'])) . '|' . mb_strtolower(trim($data['color'] ?? ''));
            if (isset($seen[$key])) $errors['Row ' . ($i + 2)] = 'Duplicate material in upload.';
            $codeKey = mb_strtolower($data['material_code']);
            if (isset($codes[$codeKey])) $errors['Row ' . ($i + 2)] = 'Duplicate material code in upload.';
            $codes[$codeKey] = true; $seen[$key] = true; $clean[] = $data;
        } catch (ApiError $e) {
            $errors['Row ' . ($i + 2)] = implode(' ', $e->fields ?: [$e->getMessage()]);
        }
    }
    if ($errors) throw new ApiError('No materials imported. Correct the listed rows.', 422, $errors);
    $pdo = db();
    try {
        foreach ($clean as $index => $data) {
            $photo = $data['photo_path'] ?? '';
            if (preg_match('#^https?://drive\\.google\\.com/#i', $photo)) {
                try { $data['photo_path'] = material_copy_drive_photo($photo); }
                catch (Throwable $e) { throw new ApiError('No materials imported. Photo download failed.', 422, ['Row ' . ($index + 2) => $e->getMessage()]); }
            }
            material_save(null, $data, true);
        }

    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['message' => count($clean) . ' materials imported.', 'count' => count($clean)];
}

function material_delete(int $id): array
{
    require_admin();
    $m = material_find($id);
    foreach (db_all("SELECT boq_draft_json FROM order_items WHERE boq_status = 'Draft' AND boq_draft_json IS NOT NULL") as $draft) {
        foreach (json_decode($draft['boq_draft_json'], true) ?: [] as $line) {
            if ((int) ($line['material_id'] ?? 0) === $id) throw new ApiError('This material is used in a Draft BOQ. Deactivate it instead.', 409);
        }
    }
    foreach (['sample_moves','sample_issues','sample_legacy_review','boq_lines', 'bookings', 'stock_moves', 'opening_stock', 'material_receipt_items', 'material_issue_items', 'damage_items', 'stock_adjustments'] as $table) {
        if (db_value("SELECT COUNT(*) FROM $table WHERE variant_id IN (SELECT id FROM material_variants WHERE material_id = :m)", ['m' => $id])) throw new ApiError('This material is in use. Deactivate it instead.', 409);
    }
    $pdo = db(); $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM material_variant_values WHERE variant_id IN (SELECT id FROM material_variants WHERE material_id = :m)')->execute(['m' => $id]);
        $pdo->prepare('DELETE FROM material_variants WHERE material_id = :m')->execute(['m' => $id]);
        $pdo->prepare('DELETE FROM material_spec_fields WHERE material_id = :m')->execute(['m' => $id]);
        $pdo->prepare('DELETE FROM materials WHERE id = :m')->execute(['m' => $id]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    return ['message' => "{$m['name']} deleted."];
}

// ---------------------------------------------------------------------------

function variants_route(string $method, array $parts): void
{
    if ($method !== 'GET') throw new ApiError('Not found.', 404);
    $first = $parts[0] ?? '';
    if ($first === 'catalog') { json_out(variant_catalog()); return; }
    if ($first === 'stats') {
        $ids = array_filter(array_map('intval', explode(',', (string) ($_GET['ids'] ?? ''))));
        $item = (int) ($_GET['order_item_id'] ?? 0) ?: null;
        if($item)require_item_access($item);
        json_out(['data' => variant_stats($ids, $item)]);
        return;
    }
    throw new ApiError('Not found.', 404);
}

function variant_catalog(): array
{
    $materials = array_map(fn ($m) => [
        'id' => (int) $m['id'], 'name' => $m['name'], 'color' => $m['color'], 'unit' => $m['unit'], 'sort_order' => (int) $m['sort_order'],
        'category_id' => (int) $m['category_id'], 'material_code' => $m['material_code'], 'photo_path' => $m['photo_path'],
        'is_active' => (bool) $m['is_active'], 'fields' => material_fields((int) $m['id']),
    ], db_all('SELECT * FROM materials ORDER BY sort_order, name'));
    $variants = db_all('SELECT id, material_id, spec_key, spec_text FROM material_variants ORDER BY spec_text');
    $vals = variant_values(array_column($variants, 'id'));
    foreach ($variants as &$v) {
        $v['id'] = (int) $v['id'];
        $v['material_id'] = (int) $v['material_id'];
        $v['values'] = (object) ($vals[$v['id']] ?? []);
    }
    unset($v);
    return ['data' => ['materials' => $materials, 'variants' => $variants, 'categories' => db_all('SELECT id, name, is_active FROM material_categories ORDER BY name')]];
}

function material_copy_drive_photo(string $url): string
{
    if (!function_exists('curl_init')) throw new ApiError('Server image download support is unavailable.',422);
    $id = '';
    if (preg_match('#/file/d/([a-zA-Z0-9_-]+)#', $url, $match)) $id = $match[1];
    else { parse_str(parse_url($url, PHP_URL_QUERY) ?: '', $query); $id = (string) ($query['id'] ?? ''); }
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $id)) throw new ApiError('Invalid Drive photo link.',422);
    $next = 'https://drive.google.com/thumbnail?id=' . rawurlencode($id) . '&sz=w1600';
    $bytes = '';
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $host = strtolower((string) parse_url($next, PHP_URL_HOST));
        if (parse_url($next, PHP_URL_SCHEME) !== 'https' || !($host === 'drive.google.com' || str_ends_with($host, '.googleusercontent.com'))) throw new ApiError('Unsupported photo redirect.',422);
        $ip = gethostbyname($host);
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) throw new ApiError('Photo host could not be resolved safely.',422);
        $bytes = ''; $location = '';
        $ch = curl_init($next);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 25,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_RESOLVE => [$host . ':443:' . $ip],
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$location) {
                if (stripos($line, 'Location:') === 0) $location = trim(substr($line, 9));
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$bytes) {
                if (strlen($bytes) + strlen($chunk) > 5 * 1024 * 1024) return 0;
                $bytes .= $chunk; return strlen($chunk);
            },
        ]);
        $ok = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
        if ($ok === false) throw new ApiError('Photo download failed or exceeded 5 MB.',422);
        if ($status >= 300 && $status < 400 && $location !== '') { $next = $location; continue; }
        if ($status !== 200) throw new ApiError('Drive photo is inaccessible. Allow anyone with the link to view it.',422);
        $info = @getimagesizefromstring($bytes);
        $ext = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif'][$info['mime'] ?? ''] ?? null;
        if (!$ext) throw new ApiError('The Drive link did not return a supported image.',422);
        $relative = 'uploads/materials/' . bin2hex(random_bytes(16)) . '.' . $ext;
        $folder = upload_root() . '/uploads/materials';
        if (!is_dir($folder) && !mkdir($folder,0755,true) && !is_dir($folder)) throw new ApiError('Photo folder is not writable.',422);
        if (file_put_contents(upload_root() . '/' . $relative,$bytes,LOCK_EX) === false) throw new ApiError('Could not save the photo.',422);
        return $relative;
    }
    throw new ApiError('Drive returned too many photo redirects.',422);
}
