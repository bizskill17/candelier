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

function material_save(?int $id, array $in): array
{
    $existing = $id ? material_find($id) : null;
    $errors = [];
    $name = trim((string) ($in['name'] ?? ''));
    if ($name === '') $errors['name'] = 'Name is required.';
    elseif (mb_strlen($name) > 100) $errors['name'] = 'Keep this under 100 characters.';
    elseif (db_value('SELECT COUNT(*) FROM materials WHERE LOWER(name) = LOWER(:n) AND id <> :id', ['n' => $name, 'id' => $id ?? 0])) $errors['name'] = 'A material with this name already exists.';
    $unit = trim((string) ($in['unit'] ?? ''));
    if (!in_array($unit, UNITS, true)) $errors['unit'] = 'Choose a unit.';
    $sort = (int) ($in['sort_order'] ?? 0);

    // Specification fields
    $fields = [];
    $seen = [];
    foreach (is_array($in['fields'] ?? null) ? $in['fields'] : [] as $n => $f) {
        $fname = trim((string) ($f['name'] ?? ''));
        $fid = (int) ($f['id'] ?? 0);
        if ($fname === '' && !$fid) continue;
        if ($fname === '') { $errors["fields.$n.name"] = 'Enter the field name.'; continue; }
        if (mb_strlen($fname) > 50) { $errors["fields.$n.name"] = 'Keep this under 50 characters.'; continue; }
        if (isset($seen[mb_strtolower($fname)])) { $errors["fields.$n.name"] = 'This field is already listed.'; continue; }
        $seen[mb_strtolower($fname)] = true;
        if ($fid && (!$existing || !in_array($fid, array_column($existing['fields'], 'id'), true))) $fid = 0;
        $fields[] = ['id' => $fid ?: null, 'name' => $fname];
    }
    if ($existing) {
        $kept = array_filter(array_column($fields, 'id'));
        foreach ($existing['fields'] as $old) {
            if (!in_array($old['id'], $kept, true) && db_value('SELECT COUNT(*) FROM material_variant_values WHERE spec_field_id = :f', ['f' => $old['id']])) {
                $errors['fields'] = "\"{$old['name']}\" already has values in specifications, so it can't be removed. You can rename it.";
            }
        }
    }
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        if ($id === null) {
            if (!$sort) $sort = (int) db_value('SELECT COALESCE(MAX(sort_order), 0) FROM materials') + 1;
            $pdo->prepare('INSERT INTO materials (name, unit, sort_order, is_active, created_at, updated_at) VALUES (:n, :u, :s, 1, :c, :c2)')
                ->execute(['n' => $name, 'u' => $unit, 's' => $sort, 'c' => now(), 'c2' => now()]);
            $id = (int) $pdo->lastInsertId();
            $msg = "Material $name added.";
        } else {
            $pdo->prepare('UPDATE materials SET name = :n, unit = :u, sort_order = :s, updated_at = :t WHERE id = :id')
                ->execute(['n' => $name, 'u' => $unit, 's' => $sort, 't' => now(), 'id' => $id]);
            $msg = "Material $name updated.";
        }
        $keep = [];
        foreach ($fields as $i => $f) {
            if ($f['id']) {
                $pdo->prepare('UPDATE material_spec_fields SET name = :n, sort_order = :s, updated_at = :t WHERE id = :id')->execute(['n' => $f['name'], 's' => $i + 1, 't' => now(), 'id' => $f['id']]);
                $keep[] = $f['id'];
            } else {
                $pdo->prepare('INSERT INTO material_spec_fields (material_id, name, sort_order, created_at, updated_at) VALUES (:m, :n, :s, :c, :u)')->execute(['m' => $id, 'n' => $f['name'], 's' => $i + 1, 'c' => now(), 'u' => now()]);
                $keep[] = (int) $pdo->lastInsertId();
            }
        }
        $sql = 'DELETE FROM material_spec_fields WHERE material_id = :m' . ($keep ? ' AND id NOT IN (' . implode(',', array_map('intval', $keep)) . ')' : '');
        $pdo->prepare($sql)->execute(['m' => $id]);
        variant_rekey($id);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['data' => material_find($id), 'message' => $msg];
}

function material_delete(int $id): array
{
    $m = material_find($id);
    if ($m['variant_count'] > 0 || db_value('SELECT COUNT(*) FROM boq_lines WHERE material_id = :m', ['m' => $id])) {
        throw new ApiError("{$m['name']} already has specifications in use, so it can't be deleted. Deactivate it instead.", 409);
    }
    db()->prepare('DELETE FROM material_spec_fields WHERE material_id = :m')->execute(['m' => $id]);
    db()->prepare('DELETE FROM materials WHERE id = :m')->execute(['m' => $id]);
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
    return ['data' => ['materials' => $materials, 'variants' => $variants]];
}
