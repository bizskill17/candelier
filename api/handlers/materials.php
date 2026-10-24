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

function material_validate(?int $id, array $in): array
{
    $errors = [];
    $name = trim((string) ($in['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) $errors['name'] = 'Enter a material name (up to 100 characters).';
    elseif (db_value('SELECT COUNT(*) FROM materials WHERE LOWER(name) = LOWER(:n) AND id <> :id', ['n' => $name, 'id' => $id ?? 0])) $errors['name'] = 'A material with this name already exists.';
    $unit = trim((string) ($in['unit'] ?? ''));
    if (!in_array($unit, UNITS, true)) $errors['unit'] = 'Choose a valid unit.';
    $cid = (int) ($in['category_id'] ?? 0);
    $category = db_one('SELECT id, is_active FROM material_categories WHERE id = :c', ['c' => $cid]);
    $same = $id && (int) db_value('SELECT category_id FROM materials WHERE id = :i', ['i' => $id]) === $cid;
    if (!$category || (!$category['is_active'] && !$same)) $errors['category_id'] = 'Choose an active material category.';
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);
    return ['name' => $name, 'unit' => $unit, 'category_id' => $cid];
}

function material_save(?int $id, array $in): array
{
    if ($id) material_find($id);
    $data = material_validate($id, $in);
    $pdo = db();
    $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
        if ($id) {
            $pdo->prepare('UPDATE materials SET name = :name, unit = :unit, category_id = :category_id, updated_at = :t WHERE id = :id')->execute($data + ['t' => now(), 'id' => $id]);
        } else {
            $sort = (int) db_value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM materials');
            $pdo->prepare('INSERT INTO materials (name, unit, category_id, sort_order, is_active, created_at, updated_at) VALUES (:name, :unit, :category_id, :s, 1, :t, :t2)')->execute($data + ['s' => $sort, 't' => now(), 't2' => now()]);
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
    $rows = $in['rows'] ?? [];
    if (!is_array($rows) || !$rows || count($rows) > 500) throw new ApiError('Upload between 1 and 500 material rows.', 422);
    $errors = []; $clean = []; $seen = [];
    foreach ($rows as $i => $row) {
        $row = is_array($row) ? $row : [];
        $category = trim((string) ($row['category'] ?? ''));
        $cid = db_value('SELECT id FROM material_categories WHERE LOWER(name) = LOWER(:n) AND is_active = 1', ['n' => $category]);
        try {
            $data = material_validate(null, ['category_id' => $cid, 'name' => $row['name'] ?? '', 'unit' => $row['unit'] ?? '']);
            $key = mb_strtolower($data['name']);
            if (isset($seen[$key])) $errors['Row ' . ($i + 2)] = 'Duplicate material in upload.';
            $seen[$key] = true; $clean[] = $data;
        } catch (ApiError $e) {
            $errors['Row ' . ($i + 2)] = implode(' ', $e->fields ?: [$e->getMessage()]);
        }
    }
    if ($errors) throw new ApiError('No materials imported. Correct the listed rows.', 422, $errors);
    $pdo = db(); $pdo->beginTransaction();
    try {
        foreach ($clean as $data) material_save(null, $data);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['message' => count($clean) . ' materials imported.', 'count' => count($clean)];
}

function material_delete(int $id): array
{
    $m = material_find($id);
    foreach (db_all("SELECT boq_draft_json FROM order_items WHERE boq_status = 'Draft' AND boq_draft_json IS NOT NULL") as $draft) {
        foreach (json_decode($draft['boq_draft_json'], true) ?: [] as $line) {
            if ((int) ($line['material_id'] ?? 0) === $id) throw new ApiError('This material is used in a Draft BOQ. Deactivate it instead.', 409);
        }
    }
    foreach (['boq_lines', 'bookings', 'stock_moves', 'opening_stock', 'material_receipt_items', 'material_issue_items', 'damage_items', 'stock_adjustments'] as $table) {
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
        json_out(['data' => variant_stats($ids, $item)]);
        return;
    }
    throw new ApiError('Not found.', 404);
}

function variant_catalog(): array
{
    $materials = array_map(fn ($m) => [
        'id' => (int) $m['id'], 'name' => $m['name'], 'unit' => $m['unit'], 'sort_order' => (int) $m['sort_order'],
        'category_id' => (int) $m['category_id'],
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
