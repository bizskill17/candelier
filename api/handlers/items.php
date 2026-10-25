<?php
// Order item fields (your own list: Area, Size, Glass Colour ...), their values per order item,
// and the two photos of an order item (component picture, reference image).
//
//   GET  item-fields                 { data: [{ id, name, sort_order, is_active, used }], suggestions: { remarks: [], <field_id>: [] } }
//   PUT  item-fields                 { fields: [{ id?, name, is_active }] }  the whole list, in display order
//   POST uploads                     multipart "file" (a photo) -> { data: { path } }
//   POST uploads?kind=drawing        multipart "file" (PDF or image) -> { data: { path, name } }

const UPLOAD_DIR = 'uploads/items';           // relative to the site root (public_html)
const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const DRAWING_DIR = 'uploads/drawings';
const DRAWING_MAX_BYTES = 25 * 1024 * 1024;

function item_fields_route(string $method): void
{
    if ($method === 'GET') { json_out(item_fields_list()); return; }
    if ($method === 'PUT') { json_out(item_fields_save(request_body())); return; }
    throw new ApiError('Not found.', 404);
}

function item_fields(bool $activeOnly = false): array
{
    $rows = db_all('SELECT f.id, f.name, f.sort_order, f.is_active, (SELECT COUNT(*) FROM order_item_values v WHERE v.field_id = f.id) AS used
                      FROM item_fields f' . ($activeOnly ? ' WHERE f.is_active = 1' : '') . ' ORDER BY f.sort_order, f.id');
    return array_map(fn ($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'sort_order' => (int) $r['sort_order'], 'is_active' => (bool) $r['is_active'], 'used' => (int) $r['used']], $rows);
}

function distinct_values(string $sql, array $params = []): array
{
    $seen = [];
    foreach (db_all($sql, $params) as $r) {
        $v = trim((string) $r['v']);
        if ($v !== '' && !isset($seen[mb_strtolower($v)])) $seen[mb_strtolower($v)] = $v;
    }
    $out = array_values($seen);
    natcasesort($out);
    return array_values($out);
}

function item_fields_list(): array
{
    $fields = item_fields();
    $sug = [
        'remarks' => distinct_values('SELECT DISTINCT i.remarks AS v FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.remarks IS NOT NULL AND '.order_visibility_sql()),
    ];
    foreach ($fields as $f) {
        $sug[(string) $f['id']] = distinct_values('SELECT DISTINCT v.value AS v FROM order_item_values v JOIN order_items i ON i.id=v.order_item_id JOIN orders o ON o.id=i.order_id WHERE v.field_id=:f AND '.order_visibility_sql(), ['f' => $f['id']]);
    }
    return ['data' => $fields, 'suggestions' => $sug];
}

function item_fields_save(array $in): array
{
    $rows = is_array($in['fields'] ?? null) ? $in['fields'] : [];
    $current = [];
    foreach (item_fields() as $f) $current[$f['id']] = $f;
    $errors = [];
    $clean = [];
    $names = [];
    foreach ($rows as $n => $r) {
        $name = preg_replace('/\s+/', ' ', trim((string) ($r['name'] ?? '')));
        $fid = (int) ($r['id'] ?? 0);
        if ($name === '' && !$fid) continue;
        if ($name === '') $errors["fields.$n.name"] = 'Enter a name.';
        elseif (mb_strlen($name) > 50) $errors["fields.$n.name"] = 'Keep this under 50 characters.';
        elseif (isset($names[mb_strtolower($name)])) $errors["fields.$n.name"] = 'This name is used twice.';
        $names[mb_strtolower($name)] = true;
        $clean[] = ['id' => isset($current[$fid]) ? $fid : null, 'name' => $name, 'is_active' => !array_key_exists('is_active', $r) || (bool) $r['is_active']];
    }
    $kept = array_filter(array_column($clean, 'id'));
    foreach ($current as $fid => $f) {
        if (!in_array($fid, $kept, true) && $f['used'] > 0) {
            $errors['fields'] = "{$f['name']} has values on {$f['used']} order items, so it can't be removed. Switch it off instead.";
        }
    }
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($current as $fid => $f) {
            if (!in_array($fid, $kept, true)) $pdo->prepare('DELETE FROM item_fields WHERE id = :id')->execute(['id' => $fid]);
        }
        foreach ($clean as $n => $f) {
            if ($f['id']) {
                $pdo->prepare('UPDATE item_fields SET name = :n, sort_order = :s, is_active = :a, updated_at = :u WHERE id = :id')
                    ->execute(['n' => $f['name'], 's' => $n + 1, 'a' => $f['is_active'] ? 1 : 0, 'u' => now(), 'id' => $f['id']]);
            } else {
                $pdo->prepare('INSERT INTO item_fields (name, sort_order, is_active, created_at, updated_at) VALUES (:n, :s, :a, :c, :u)')
                    ->execute(['n' => $f['name'], 's' => $n + 1, 'a' => $f['is_active'] ? 1 : 0, 'c' => now(), 'u' => now()]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return item_fields_list() + ['message' => 'Item fields saved.'];
}

// ---------------------------------------------------------------------------
// Details of order items: field values, a one-line summary and a title for labels.

// [item_id => ['values' => [field_id => value], 'details' => [[name, value]], 'info' => 'Size: 6.5 ft X 6.5 ft · Glass Colour: Amber']]
function item_details(array $ids): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    $out = [];
    foreach ($ids as $id) $out[$id] = ['values' => [], 'details' => [], 'info' => ''];
    if (!$ids) return $out;
    $in = implode(',', $ids);
    $rows = db_all("SELECT v.order_item_id, v.field_id, v.value, f.name FROM order_item_values v JOIN item_fields f ON f.id = v.field_id
                     WHERE v.order_item_id IN ($in) ORDER BY f.sort_order, f.id");
    $parts = [];
    foreach ($rows as $r) {
        $iid = (int) $r['order_item_id'];
        $out[$iid]['values'][(string) $r['field_id']] = $r['value'];
        $out[$iid]['details'][] = ['name' => $r['name'], 'value' => $r['value']];
        $parts[$iid][] = "{$r['name']}: {$r['value']}";
    }
    foreach ($parts as $iid => $p) $out[$iid]['info'] = implode(' · ', $p);
    return $out;
}

// Adds item_info (labelled values joined, e.g. "Size: 6.5 ft X 6.5 ft · Glass Colour: Amber") and item_title (area + item_info,
// e.g. "Dining · 6.5 ft X 6.5 ft X 2.5 ft · Amber"),
// values, details and photos to rows that have the order item id in $idKey.
function with_item_details(array $rows, string $idKey = 'order_item_id'): array
{
    $det = item_details(array_column($rows, $idKey));
    foreach ($rows as &$r) {
        $d = $det[(int) $r[$idKey]] ?? ['values' => [], 'details' => [], 'info' => ''];
        $r['values'] = (object) $d['values'];
        $r['details'] = $d['details'];
        $r['item_info'] = $d['info'];
        $area = trim((string) ($r['area'] ?? ''));
        $r['area'] = $area === '' ? null : $area;
        $title = implode(' · ', array_filter([$area, $d['info']], fn ($x) => $x !== ''));
        $r['item_title'] = $title !== '' ? $title : 'No details';
        foreach (['component_image', 'reference_image', 'drawing_file', 'drawing_name'] as $k) {
            if (array_key_exists($k, $r)) $r[$k] = $r[$k] ?: null;
        }
    }
    unset($r);
    return $rows;
}

// Saves the values of one order item ($values: field_id => text). Unknown/empty values are dropped.
function item_values_save(int $itemId, array $values): void
{
    $valid = array_column(item_fields(), 'id');
    db()->prepare('DELETE FROM order_item_values WHERE order_item_id = :i')->execute(['i' => $itemId]);
    $ins = db()->prepare('INSERT INTO order_item_values (order_item_id, field_id, value, created_at, updated_at) VALUES (:i, :f, :v, :c, :u)');
    foreach ($values as $fid => $v) {
        $v = preg_replace('/\s+/', ' ', trim((string) $v));
        if ($v === '' || !in_array((int) $fid, $valid, true)) continue;
        $ins->execute(['i' => $itemId, 'f' => (int) $fid, 'v' => mb_substr($v, 0, 150), 'c' => now(), 'u' => now()]);
    }
}

// ---------------------------------------------------------------------------
// Photo uploads

function upload_root(): string
{
    return rtrim($GLOBALS['CONFIG']['upload_root'] ?? dirname(__DIR__, 2), '/');
}

function upload_image(): array
{
    $f = $_FILES['file'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) throw new ApiError('Choose a photo to upload.', 422);
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > UPLOAD_MAX_BYTES) throw new ApiError('The photo is too large. Use one under 8 MB.', 422);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) throw new ApiError('The photo could not be uploaded. Please try again.', 422);
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $info = @getimagesize($f['tmp_name']);
    $mime = $info['mime'] ?? '';
    if (!isset($types[$mime])) throw new ApiError('Upload a JPG, PNG, WEBP or GIF photo.', 422);
    $dir = upload_root() . '/' . UPLOAD_DIR . '/' . date('Y/m');
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) throw new ApiError('The uploads folder could not be created on the server.', 500);
    $name = date('Ymd-His') . '-' . bin2hex(random_bytes(5)) . '.' . $types[$mime];
    if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) throw new ApiError('The photo could not be saved on the server.', 500);
    return ['data' => ['path' => UPLOAD_DIR . '/' . date('Y/m') . "/$name"], 'message' => 'Photo uploaded.'];
}

function upload_drawing(): array
{
    $f = $_FILES['file'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) throw new ApiError('Choose a drawing to upload.', 422);
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) throw new ApiError('The drawing is larger than the server allows (' . ini_get('upload_max_filesize') . '). Ask the administrator to raise "upload_max_filesize" in hPanel → PHP Configuration.', 422);
    if ($f['size'] > DRAWING_MAX_BYTES) throw new ApiError('The drawing is too large. Use a file under 25 MB.', 422);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) throw new ApiError('The drawing could not be uploaded. Please try again.', 422);
    $head = (string) file_get_contents($f['tmp_name'], false, null, 0, 5);
    if ($head === '%PDF-') $ext = 'pdf';
    else {
        $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        $mime = (@getimagesize($f['tmp_name']))['mime'] ?? '';
        if (!isset($types[$mime])) throw new ApiError('Upload the drawing as a PDF, JPG, PNG or WEBP file.', 422);
        $ext = $types[$mime];
    }
    $dir = upload_root() . '/' . DRAWING_DIR . '/' . date('Y/m');
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) throw new ApiError('The uploads folder could not be created on the server.', 500);
    $name = date('Ymd-His') . '-' . bin2hex(random_bytes(5)) . ".$ext";
    if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) throw new ApiError('The drawing could not be saved on the server.', 500);
    $orig = mb_substr(preg_replace('/[^\w .()&+-]+/u', '', basename((string) $f['name'])) ?: "drawing.$ext", 0, 150);
    return ['data' => ['path' => DRAWING_DIR . '/' . date('Y/m') . "/$name", 'name' => $orig], 'message' => 'Drawing uploaded.'];
}

// '' -> null, a path not made by upload_drawing() -> false
function clean_drawing_path($v): string|null|false
{
    $v = trim((string) $v);
    if ($v === '') return null;
    return preg_match('#^' . preg_quote(DRAWING_DIR, '#') . '/\d{4}/\d{2}/[A-Za-z0-9-]+\.(pdf|jpg|png|webp)$#', $v) ? $v : false;
}

// Only paths produced by upload_image() are accepted: '' -> null, a bad path -> false.
function clean_image_path($v): string|null|false
{
    $v = trim((string) $v);
    if ($v === '') return null;
    return preg_match('#^' . preg_quote(UPLOAD_DIR, '#') . '/\d{4}/\d{2}/[A-Za-z0-9-]+\.(jpg|png|webp|gif)$#', $v) ? $v : false;
}
