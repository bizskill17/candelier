<?php
// BOQ of an order item (the plan) and booking of stock to it.
//
//   GET  boq/{order_item_id}           item, saved lines with values, live figures, extra rows (issued/booked but not on the BOQ)
//   PUT  boq/{order_item_id}           { lines: [{ material_id, values: {field_id: value}, qty_required, remarks }] }
//   GET  boq/sources?exclude=ID        order items with a saved BOQ (for "Copy from an earlier BOQ")
//   POST boq/{order_item_id}/book      { variant_id, quantity }
//   POST boq/{order_item_id}/release   { variant_id, quantity? }   (default: everything still booked)
//
// Saved: specification + Qty Required only. Live (never saved):
//   In Stock, Booked (All Orders), Available to Book, Booked (This Item), Required, Consumed.

function boq_route(string $method, array $parts): void
{
    $first = $parts[0] ?? '';
    if ($first === 'sources' && $method === 'GET') { json_out(boq_sources()); return; }
    $id = (int) $first;
    $sub = $parts[1] ?? null;
    if ($id && $sub === null && $method === 'GET') { json_out(['data' => boq_find($id)]); return; }
    if ($id && $sub === null && $method === 'PUT') { json_out(boq_save($id, request_body())); return; }
    if ($id && $sub === 'book' && $method === 'POST') { json_out(boq_book($id, request_body())); return; }
    if ($id && $sub === 'release' && $method === 'POST') { json_out(boq_release($id, request_body())); return; }
    throw new ApiError('Not found.', 404);
}

function boq_item(int $id): array
{
    $r = db_one(ITEM_SELECT . ' WHERE i.id = :id', ['id' => $id]);
    if (!$r) throw new ApiError('Order item not found.', 404);
    $r = item_cast($r);
    $r['dispatched'] = $r['dispatch_id'] !== null;
    unset($r['dispatch_id']);
    $r['closed'] = $r['dispatched'] || $r['order_status'] === 'Cancelled';
    return $r;
}

function boq_find(int $id): array
{
    $item = boq_item($id);
    $lines = db_all(
        'SELECT b.id, b.material_id, b.variant_id, b.qty_required, b.remarks, v.spec_text
           FROM boq_lines b JOIN material_variants v ON v.id = b.variant_id WHERE b.order_item_id = :i ORDER BY b.line_no',
        ['i' => $id]
    );
    $vals = variant_values(array_column($lines, 'variant_id'));
    foreach ($lines as &$l) {
        foreach (['id', 'material_id', 'variant_id'] as $k) $l[$k] = (int) $l[$k];
        $l['qty_required'] = (float) $l['qty_required'];
        $l['values'] = (object) ($vals[$l['variant_id']] ?? []);
    }
    unset($l);
    // Variants booked or issued to this item but not on the BOQ
    $onBoq = array_column($lines, 'variant_id');
    $extraIds = [];
    foreach (db_all('SELECT DISTINCT variant_id FROM bookings WHERE order_item_id = :i UNION SELECT DISTINCT x.variant_id FROM material_issue_items x JOIN material_issues h ON h.id = x.issue_id WHERE h.order_item_id = :i2', ['i' => $id, 'i2' => $id]) as $r) {
        if (!in_array((int) $r['variant_id'], $onBoq, true)) $extraIds[] = (int) $r['variant_id'];
    }
    $extra = [];
    if ($extraIds) {
        $evals = variant_values($extraIds);
        foreach (db_all('SELECT id, material_id, spec_text FROM material_variants WHERE id IN (' . implode(',', $extraIds) . ')') as $v) {
            $extra[] = ['material_id' => (int) $v['material_id'], 'variant_id' => (int) $v['id'], 'spec_text' => $v['spec_text'], 'values' => (object) ($evals[(int) $v['id']] ?? []), 'qty_required' => 0.0];
        }
    }
    $item['lines'] = $lines;
    $item['extra'] = $extra;
    $item['stats'] = (object) variant_stats(array_merge($onBoq, $extraIds), $id);
    return $item;
}

function boq_save(int $id, array $in): array
{
    $item = boq_item($id);
    if ($item['order_status'] === 'Cancelled') throw new ApiError("Order {$item['order_no']} is cancelled.", 409);
    $errors = [];
    $rows = [];
    $usedMaterials = array_map('intval', array_column(db_all('SELECT DISTINCT material_id FROM boq_lines WHERE order_item_id = :i', ['i' => $id]), 'material_id'));
    foreach (is_array($in['lines'] ?? null) ? $in['lines'] : [] as $n => $row) {
        $qty = $row['qty_required'] ?? '';
        $hasValues = is_array($row['values'] ?? null) && array_filter(array_map(fn ($v) => trim((string) $v), $row['values']), fn ($v) => $v !== '');
        if (($qty === '' || $qty === null) && !$hasValues) continue; // untouched material row
        $chk = spec_line_check($row, "lines.$n", $errors, $usedMaterials);
        if (!qty_ok($qty)) $errors["lines.$n.qty_required"] = 'Enter the quantity required.';
        $remarks = trim((string) ($row['remarks'] ?? ''));
        if ($chk) $rows[] = ['material_id' => (int) $chk[0]['id'], 'values' => $chk[1], 'qty' => round((float) $qty, 3), 'remarks' => $remarks === '' ? null : mb_substr($remarks, 0, 255)];
    }
    if ($errors) throw new ApiError('Please fix the highlighted rows.', 422, $errors);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $seen = [];
        $resolved = [];
        foreach ($rows as $n => $r) {
            $vid = variant_resolve($r['material_id'], $r['values']);
            if (isset($seen[$vid])) {
                $pdo->rollBack();
                throw new ApiError('Please fix the highlighted rows.', 422, ["lines.{$n}.values" => 'This specification is already on the BOQ. Change the quantity on that row instead.']);
            }
            $seen[$vid] = true;
            $resolved[] = $r + ['variant_id' => $vid];
        }
        $pdo->prepare('DELETE FROM boq_lines WHERE order_item_id = :i')->execute(['i' => $id]);
        $ins = $pdo->prepare('INSERT INTO boq_lines (order_item_id, line_no, material_id, variant_id, qty_required, remarks, created_at, updated_at) VALUES (:i, :l, :m, :v, :q, :r, :c, :u)');
        foreach ($resolved as $n => $r) {
            $ins->execute(['i' => $id, 'l' => $n + 1, 'm' => $r['material_id'], 'v' => $r['variant_id'], 'q' => $r['qty'], 'r' => $r['remarks'], 'c' => now(), 'u' => now()]);
        }
        $pdo->prepare('UPDATE order_items SET boq_status = :s, updated_at = :u WHERE id = :i')->execute(['s' => $resolved ? 'Saved' : 'Pending', 'u' => now(), 'i' => $id]);
        $pdo->commit();
    } catch (ApiError $e) {
        throw $e;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    $label = $item['label'];
    return ['data' => boq_find($id), 'message' => $resolved ? "BOQ saved for $label." : "BOQ cleared for $label."];
}

function boq_sources(): array
{
    $ex = (int) ($_GET['exclude'] ?? 0);
    $rows = db_all(
        "SELECT i.id, i.id AS order_item_id, i.line_no, i.area, i.remarks, o.order_no, o.order_date, o.project_name, c.name AS customer_name,
                (SELECT COUNT(*) FROM boq_lines b WHERE b.order_item_id = i.id) AS line_count
           FROM order_items i JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = o.customer_id
          WHERE i.boq_status = 'Saved' AND i.id <> :ex ORDER BY o.order_date DESC, o.id DESC, i.line_no LIMIT 500",
        ['ex' => $ex]
    );
    $rows = with_item_details($rows);
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; unset($r['order_item_id']); $r['line_no'] = (int) $r['line_no']; $r['line_count'] = (int) $r['line_count']; }
    unset($r);
    return ['data' => $rows];
}

function boq_book(int $id, array $in): array
{
    $item = boq_item($id);
    if ($item['closed']) throw new ApiError($item['dispatched'] ? 'This item is already dispatched.' : "Order {$item['order_no']} is cancelled.", 409);
    $vid = (int) ($in['variant_id'] ?? 0);
    if (!$vid || !db_value('SELECT COUNT(*) FROM material_variants WHERE id = :v', ['v' => $vid])) throw new ApiError('Save the specification first.', 422);
    $qty = $in['quantity'] ?? '';
    if (!qty_ok($qty)) throw new ApiError('Please fix the highlighted fields.', 422, ['quantity' => 'Enter a quantity above 0.']);
    $qty = round((float) $qty, 3);
    $st = variant_stats([$vid], $id)[$vid];
    if ($qty > $st['available'] + 0.0005) {
        throw new ApiError('Please fix the highlighted fields.', 422, ['quantity' => $st['available'] > 0 ? 'Only ' . fmt_qty($st['available']) . ' available to book.' : 'Nothing available to book.']);
    }
    db()->prepare('INSERT INTO bookings (order_item_id, variant_id, quantity, booked_on, booked_by, notes, created_at, updated_at) VALUES (:i, :v, :q, :t, :b, :n, :c, :u)')
        ->execute(['i' => $id, 'v' => $vid, 'q' => $qty, 't' => now(), 'b' => current_user()['id'] ?? null, 'n' => null, 'c' => now(), 'u' => now()]);
    $lbl = variant_label($vid);
    return ['data' => boq_find($id), 'message' => 'Booked ' . fmt_qty($qty) . " {$lbl['unit']} of {$lbl['label']}."];
}

function boq_release(int $id, array $in): array
{
    $item = boq_item($id);
    $vid = (int) ($in['variant_id'] ?? 0);
    $st = variant_stats([$vid], $id)[$vid] ?? null;
    if (!$st || $st['booked_item'] <= 0) throw new ApiError('Nothing is booked for this specification.', 409);
    $qty = ($in['quantity'] ?? '') === '' ? $st['booked_item'] : $in['quantity'];
    if (!qty_ok($qty) || (float) $qty > $st['booked_item'] + 0.0005) {
        throw new ApiError('Please fix the highlighted fields.', 422, ['quantity' => 'Enter up to ' . fmt_qty($st['booked_item']) . '.']);
    }
    $qty = round((float) $qty, 3);
    db()->prepare('INSERT INTO bookings (order_item_id, variant_id, quantity, booked_on, booked_by, notes, created_at, updated_at) VALUES (:i, :v, :q, :t, :b, :n, :c, :u)')
        ->execute(['i' => $id, 'v' => $vid, 'q' => -$qty, 't' => now(), 'b' => current_user()['id'] ?? null, 'n' => 'Release', 'c' => now(), 'u' => now()]);
    $lbl = variant_label($vid);
    return ['data' => boq_find($id), 'message' => 'Released ' . fmt_qty($qty) . " {$lbl['unit']} of {$lbl['label']}."];
}
