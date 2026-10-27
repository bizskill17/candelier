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
    require_item_access($id);
    $r = db_one(ITEM_SELECT . ' WHERE i.id = :id', ['id' => $id]);
    if (!$r) throw new ApiError('Order item not found.', 404);
    if(app_role()==='Store'&&$r['boq_status']!=='Final')throw new ApiError('Store may view Final BOQs only.',403);
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
    $draft = db_value('SELECT boq_draft_json FROM order_items WHERE id = :i', ['i' => $id]);
    $item['lines'] = $item['boq_status'] === 'Draft' && $draft !== null ? json_decode($draft, true) : $lines;
    $item['drawing_required']=$item['boq_status']==='Pending'&&empty($item['drawing_file']);
    $item['extra'] = $extra;
    $item['stats'] = (object) variant_stats(array_merge($onBoq, $extraIds), $id);
    return $item;
}

function boq_save(int $id, array $in): array
{
    $status = $in['status'] ?? '';
    if (!in_array($status, ['Draft', 'Final'], true)) throw new ApiError('Choose Save as Draft or Save as Final.', 422);
    $pdo = db(); $pdo->beginTransaction();
    try {
        if(app_role()==='Sales'&&!db_one('SELECT o.id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE i.id=:i AND '.order_visibility_sql().' FOR UPDATE',['i'=>$id]))throw new ApiError('Order item is no longer assigned to you.',404);
        // Serialize changes to this BOQ with material issues for the same item.
        db_one('SELECT id FROM order_items WHERE id = :i FOR UPDATE', ['i' => $id]);
        $item = boq_item($id);
        require_roles(['Admin','Sales']);
        if(app_role()==='Sales'&&$item['boq_status']==='Final')throw new ApiError('Only Admin may correct a Final BOQ.',403);
        if ($item['order_status'] === 'Cancelled') throw new ApiError('Reopen the cancelled order before editing its BOQ.', 409);
        if($item['boq_status']==='Pending'&&empty($item['drawing_file']))throw new ApiError('Upload the order item drawing before adding a BOQ.',409);
        $rows = []; $draft = []; $errors = []; $seen = [];
        $old = array_map('intval', array_column(db_all('SELECT material_id FROM boq_lines WHERE order_item_id = :i', ['i' => $id]), 'material_id'));
        $inputRows = $in['lines'] ?? [];
        if (!is_array($inputRows) || count($inputRows) > 500) throw new ApiError('Use up to 500 BOQ rows.', 422);
        foreach ($inputRows as $n => $row) {
            $row = is_array($row) ? $row : [];
            $mid = (int) ($row['material_id'] ?? 0);
            $cid = (int) ($row['category_id'] ?? 0);
            $qty = $row['qty_required'] ?? '';
            if ($qty === null) $qty = '';
            if (!$mid && !$cid && $qty === '') continue;
            $m = $mid ? material_find($mid) : null;
            if ($m && !$cid) $cid = $m['category_id'];
            if ($cid && !db_value('SELECT COUNT(*) FROM material_categories WHERE id = :c', ['c' => $cid])) $errors["lines.$n.category_id"] = 'Choose a valid category.';
            if ($m && $m['category_id'] !== $cid) $errors["lines.$n.material_id"] = 'Material does not belong to this category.';
            if ($m && !$m['is_active'] && !in_array($mid, $old, true)) $errors["lines.$n.material_id"] = 'This material is inactive.';
            if ($mid && isset($seen[$mid])) $errors["lines.$n.material_id"] = 'Material already listed. Change the quantity on its existing row.';
            if ($mid) $seen[$mid] = true;
            if ($qty !== '' && (!qty_ok($qty) || round((float) $qty, 3) <= 0 || (float) $qty > 999999999)) $errors["lines.$n.qty_required"] = 'Enter a quantity above zero (up to 999999999).';
            if ($status === 'Final') {
                if (!$cid) $errors["lines.$n.category_id"] = 'Select a category.';
                if (!$m) $errors["lines.$n.material_id"] = 'Select a material.';
                if ($qty === '') $errors["lines.$n.qty_required"] = 'Enter the required quantity.';
            }
            $draft[] = ['category_id' => $cid ?: '', 'material_id' => $mid ?: '', 'qty_required' => $qty === '' ? '' : round((float) $qty, 3), 'values' => (object) []];
            if ($m && qty_ok($qty)) $rows[] = ['material_id' => $mid, 'variant_id' => variant_resolve($mid, []), 'qty' => round((float) $qty, 3), 'n' => $n];
        }
        if ($status === 'Final' && !$rows) $errors['lines'] = 'Add at least one complete material row.';
        if ($errors) throw new ApiError('Please fix the highlighted rows.', 422, $errors);
        $quantities = array_column($rows, 'qty', 'variant_id');
        $figures = booking_figures();
        foreach ($figures['items'][$id] ?? [] as $vid => $f) {
            if (($quantities[$vid] ?? 0) + 0.0005 < $f['consumed']) throw new ApiError('An issued material cannot be removed or reduced below the quantity already issued.', 409);
            if ($status === 'Final' && ($quantities[$vid] ?? 0) + 0.0005 < $f['consumed'] + $f['open']) throw new ApiError('Release excess blocked stock before reducing or removing this material.', 409);
        }
        // Draft rows (including category-only rows) are stored independently of the last complete plan.
        if ($status === 'Final') {
            $pdo->prepare('DELETE FROM boq_lines WHERE order_item_id = :i')->execute(['i' => $id]);
            $stmt = $pdo->prepare('INSERT INTO boq_lines (order_item_id, line_no, material_id, variant_id, qty_required, created_at, updated_at) VALUES (:i, :l, :m, :v, :q, :t, :t2)');
            foreach ($rows as $n => $r) $stmt->execute(['i' => $id, 'l' => $n + 1, 'm' => $r['material_id'], 'v' => $r['variant_id'], 'q' => $r['qty'], 't' => now(), 't2' => now()]);
        }
        $pdo->prepare('UPDATE order_items SET boq_status = :s, boq_draft_json = :d, updated_at = :t WHERE id = :i')->execute(['s' => $status, 'd' => $status === 'Draft' ? json_encode($draft) : null, 't' => now(), 'i' => $id]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    return ['data' => boq_find($id), 'message' => "BOQ saved as $status."];
}

function boq_sources(): array
{
    $ex = (int) ($_GET['exclude'] ?? 0);
    $rows = db_all(
        "SELECT i.id, i.id AS order_item_id, i.line_no, i.area, i.remarks, o.order_no, o.order_date, o.project_name, c.name AS customer_name,
                (SELECT COUNT(*) FROM boq_lines b WHERE b.order_item_id = i.id) AS line_count
           FROM order_items i JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = o.customer_id
          WHERE i.boq_status = 'Final' AND i.id <> :ex AND ".order_visibility_sql()." ORDER BY o.order_date DESC, o.id DESC, i.line_no LIMIT 500",
        ['ex' => $ex]
    );
    $rows = with_item_details($rows);
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; unset($r['order_item_id']); $r['line_no'] = (int) $r['line_no']; $r['line_count'] = (int) $r['line_count']; }
    unset($r);
    return ['data' => $rows];
}

function boq_book(int $id, array $in): array
{
    require_roles(['Admin','Store']);
    $pdo = db(); stock_transaction_begin();
    try {
        db_one('SELECT id FROM order_items WHERE id = :i FOR UPDATE', ['i' => $id]);
        $item = boq_item($id);
        if ($item['closed']) throw new ApiError('This order item is closed.', 409);
        if ($item['boq_status'] !== 'Final') throw new ApiError('Finalise the BOQ before booking materials.', 409);
        $vid = (int) ($in['variant_id'] ?? 0);
        // Material lock serializes allocation/issue against the same stock balance.
        db_one('SELECT id FROM material_variants WHERE id = :v FOR UPDATE', ['v' => $vid]);
        $need = db_value('SELECT qty_required FROM boq_lines WHERE order_item_id = :i AND variant_id = :v', ['i' => $id, 'v' => $vid]);
        if ($need === false || $need === null) throw new ApiError('Material is not in this BOQ.', 422);
        $qty = $in['quantity'] ?? '';
        if (!qty_ok($qty) || round((float) $qty, 3) <= 0) throw new ApiError('Enter a quantity above zero.', 422);
        $qty = round((float) $qty, 3);
        $st = variant_stats([$vid], $id)[$vid];
        if ($qty > $st['available'] + 0.0005 || $qty > (float) $need - $st['booked_item'] - $st['consumed'] + 0.0005) throw new ApiError('Quantity exceeds available stock or the remaining BOQ requirement.', 422);
        // Booking totals include material already consumed. Compensate when an
        // earlier issue used free stock, so a new booking reserves the full requested amount.
        $bf = booking_figures([$vid]);
        $rawBooked = $bf['items'][$id][$vid]['booked'] ?? 0.0;
        $entryQty = $qty + max(0.0, $st['consumed'] - $rawBooked);
        $pdo->prepare('INSERT INTO bookings (order_item_id, variant_id, quantity, booked_on, booked_by, created_at, updated_at) VALUES (:i, :v, :q, :t, :u, :t2, :t3)')->execute(['i' => $id, 'v' => $vid, 'q' => $entryQty, 't' => now(), 'u' => current_user()['id'] ?? null, 't2' => now(), 't3' => now()]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    return ['data' => boq_find($id), 'message' => 'Stock blocked.'];
}

function boq_release(int $id, array $in): array
{
    require_admin();
    $pdo=db();stock_transaction_begin();
    try {
        // Same lock order as booking/issue: item, then material identity.
        db_one('SELECT id FROM order_items WHERE id=:i FOR UPDATE',['i'=>$id]);
        $item=boq_item($id);
        $vid=(int)($in['variant_id']??0);
        db_one('SELECT id FROM material_variants WHERE id=:v FOR UPDATE',['v'=>$vid]);
        $st=variant_stats([$vid],$id)[$vid]??null;
        if(!$st||$st['booked_item']<=0)throw new ApiError('Nothing is blocked for this material.',409);
        $qty=($in['quantity']??'')===''?$st['booked_item']:$in['quantity'];
        if(!qty_ok($qty)||(float)$qty>$st['booked_item']+0.0005)throw new ApiError('Please fix the highlighted fields.',422,['quantity'=>'Enter up to '.fmt_qty($st['booked_item']).'.']);
        $qty=round((float)$qty,3);
        $pdo->prepare('INSERT INTO bookings(order_item_id,variant_id,quantity,booked_on,booked_by,notes,created_at,updated_at) VALUES(:i,:v,:q,:t,:b,:n,:c,:u)')->execute(['i'=>$id,'v'=>$vid,'q'=>-$qty,'t'=>now(),'b'=>current_user()['id'],'n'=>'Release','c'=>now(),'u'=>now()]);
        $pdo->commit();
    } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    $lbl=variant_label($vid);
    return ['data'=>boq_find($id),'message'=>'Released '.fmt_qty($qty)." {$lbl['unit']} of {$lbl['label']}."];
}
