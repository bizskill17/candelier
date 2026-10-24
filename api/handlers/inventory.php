<?php
// Inventory per material + specification, history, bookings, reorder level, count corrections, low stock.
//
//   GET   inventory?material_id=&q=&only=instock|zero|booked|low
//   GET   inventory/{variant_id}             history (running balance) and bookings
//   PATCH inventory/{variant_id}             { reorder_level }
//   POST  inventory/{variant_id}/adjust      { adj_date, quantity (+/-), notes }   count correction
//   GET   low-stock?material_id=&supplier_id=
//   GET   dashboard

function inventory_route(string $method, array $parts): void
{
    $vid = isset($parts[0]) ? (int) $parts[0] : null;
    $sub = $parts[1] ?? null;
    if ($vid === null && $method === 'GET') { json_out(inventory_list()); return; }
    if ($vid && $sub === null && $method === 'GET') { json_out(['data' => inventory_detail($vid)]); return; }
    if ($vid && $sub === null && $method === 'PATCH') { json_out(inventory_set_reorder($vid, request_body())); return; }
    if ($vid && $sub === 'adjust' && $method === 'POST') { json_out(inventory_adjust($vid, request_body()), 201); return; }
    throw new ApiError('Not found.', 404);
}

// One row per variant with every figure.
function inventory_rows(?int $materialId = null, string $q = ''): array
{
    $where = ['1 = 1'];
    $params = [];
    if ($materialId) { $where[] = 'v.material_id = :m'; $params['m'] = $materialId; }
    if ($q !== '') { $where[] = '(v.spec_text LIKE :q1 OR m.name LIKE :q2)'; $params += ['q1' => "%$q%", 'q2' => "%$q%"]; }
    $rows = db_all(
        "SELECT v.id, v.material_id, v.spec_text, v.reorder_level, m.name AS material_name, m.unit, m.sort_order,
                COALESCE(SUM(CASE WHEN s.ref_type = 'opening' THEN s.quantity END), 0) AS opening,
                COALESCE(SUM(CASE WHEN s.ref_type = 'receipt' AND r.receipt_type = 'Purchase' THEN s.quantity END), 0) AS purchased,
                COALESCE(SUM(CASE WHEN s.ref_type = 'receipt' AND r.receipt_type = 'Sample' THEN s.quantity END), 0) AS samples,
                COALESCE(-SUM(CASE WHEN s.ref_type = 'issue' THEN s.quantity END), 0) AS issued,
                COALESCE(-SUM(CASE WHEN s.ref_type = 'damage' THEN s.quantity END), 0) AS damaged,
                COALESCE(SUM(CASE WHEN s.ref_type = 'adjustment' THEN s.quantity END), 0) AS adjusted,
                COALESCE(SUM(s.quantity), 0) AS in_stock,
                MAX(s.move_date) AS last_move
           FROM material_variants v JOIN materials m ON m.id = v.material_id
           LEFT JOIN stock_moves s ON s.variant_id = v.id
           LEFT JOIN material_receipts r ON s.ref_type = 'receipt' AND r.id = s.ref_id
          WHERE " . implode(' AND ', $where) . '
          GROUP BY v.id, v.material_id, v.spec_text, v.reorder_level, m.name, m.unit, m.sort_order
          ORDER BY m.sort_order, m.name, v.spec_text',
        $params
    );
    $bf = booking_figures();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['material_id'] = (int) $r['material_id'];
        foreach (['opening', 'purchased', 'samples', 'issued', 'damaged', 'adjusted', 'in_stock'] as $k) $r[$k] = round((float) $r[$k], 3);
        $r['reorder_level'] = $r['reorder_level'] === null ? null : (float) $r['reorder_level'];
        $r['booked'] = $bf['all'][$r['id']] ?? 0.0;
        $r['available'] = round($r['in_stock'] - $r['booked'], 3);
        $r['is_low'] = $r['reorder_level'] !== null && $r['available'] < $r['reorder_level'];
        unset($r['sort_order']);
    }
    unset($r);
    return $rows;
}

function inventory_list(): array
{
    $rows = inventory_rows((int) ($_GET['material_id'] ?? 0) ?: null, trim($_GET['q'] ?? ''));
    $summary = ['specs' => count($rows), 'in_stock' => 0, 'zero' => 0, 'booked' => 0, 'low' => 0];
    $out = [];
    $only = $_GET['only'] ?? '';
    foreach ($rows as $r) {
        if ($r['in_stock'] > 0) $summary['in_stock']++; else $summary['zero']++;
        if ($r['booked'] > 0) $summary['booked']++;
        if ($r['is_low']) $summary['low']++;
        if ($only === 'instock' && $r['in_stock'] <= 0) continue;
        if ($only === 'zero' && $r['in_stock'] > 0) continue;
        if ($only === 'booked' && $r['booked'] <= 0) continue;
        if ($only === 'low' && !$r['is_low']) continue;
        $out[] = $r;
    }
    return ['data' => $out, 'summary' => $summary];
}

function inventory_detail(int $vid): array
{
    $v = db_one('SELECT v.id, v.material_id, v.spec_text, v.reorder_level, m.name AS material_name, m.unit FROM material_variants v JOIN materials m ON m.id = v.material_id WHERE v.id = :id', ['id' => $vid]);
    if (!$v) throw new ApiError('Specification not found.', 404);
    $moves = db_all('SELECT * FROM stock_moves WHERE variant_id = :v ORDER BY move_date, id', ['v' => $vid]);
    $bal = 0.0;
    $hist = [];
    foreach ($moves as $m) {
        $bal = round($bal + (float) $m['quantity'], 3);
        $hist[] = ['move_date' => $m['move_date'], 'ref_type' => $m['ref_type'], 'ref_id' => (int) $m['ref_id'], 'ref_no' => $m['ref_no'],
                   'quantity' => (float) $m['quantity'], 'balance' => $bal, 'party' => move_party($m['ref_type'], (int) $m['ref_id'])];
    }
    $bf = booking_figures([$vid]);
    $bookings = [];
    foreach ($bf['items'] as $itemId => $vs) {
        $f = $vs[$vid] ?? null;
        if (!$f || ($f['open'] <= 0 && $f['consumed'] <= 0)) continue;
        $it = item_find($itemId);
        $bookings[] = ['order_item_id' => $itemId, 'order_id' => $it['order_id'], 'label' => $it['label'], 'customer_name' => $it['customer_name'], 'booked' => $f['open'], 'consumed' => $f['consumed']];
    }
    $st = variant_stats([$vid])[$vid];
    return [
        'id' => (int) $v['id'], 'material_id' => (int) $v['material_id'], 'material_name' => $v['material_name'], 'spec_text' => $v['spec_text'], 'unit' => $v['unit'],
        'reorder_level' => $v['reorder_level'] === null ? null : (float) $v['reorder_level'],
        'in_stock' => $st['in_stock'], 'booked' => $st['booked_all'], 'available' => $st['available'],
        'history' => array_reverse($hist), 'bookings' => $bookings,
    ];
}

function move_party(string $type, int $id): ?string
{
    switch ($type) {
        case 'receipt':
            $r = db_one('SELECT h.receipt_type, s.name FROM material_receipts h JOIN suppliers s ON s.id = h.supplier_id WHERE h.id = :id', ['id' => $id]);
            return $r ? "{$r['name']} ({$r['receipt_type']})" : null;
        case 'issue':
            $iid = db_value('SELECT order_item_id FROM material_issues WHERE id = :id', ['id' => $id]);
            return $iid ? item_find((int) $iid)['label'] : null;
        case 'damage':
            $r = db_one("SELECT GROUP_CONCAT(DISTINCT reason) AS r FROM damage_items WHERE damage_id = :id", ['id' => $id]);
            return $r && $r['r'] ? 'Damage: ' . $r['r'] : 'Damage';
        case 'adjustment':
            return db_value('SELECT notes FROM stock_adjustments WHERE id = :id', ['id' => $id]) ?: 'Count correction';
        case 'opening':
            return 'Opening stock';
    }
    return null;
}

function inventory_set_reorder(int $vid, array $in): array
{
    $lvl = $in['reorder_level'] ?? '';
    if ($lvl !== '' && $lvl !== null && (!is_numeric($lvl) || (float) $lvl < 0)) throw new ApiError('Please fix the highlighted fields.', 422, ['reorder_level' => 'Enter 0 or more, or leave blank.']);
    if (!db_value('SELECT COUNT(*) FROM material_variants WHERE id = :v', ['v' => $vid])) throw new ApiError('Specification not found.', 404);
    db()->prepare('UPDATE material_variants SET reorder_level = :l, updated_at = :u WHERE id = :id')->execute(['l' => $lvl === '' || $lvl === null ? null : round((float) $lvl, 3), 'u' => now(), 'id' => $vid]);
    $lbl = variant_label($vid);
    return ['message' => $lvl === '' || $lvl === null ? "Reorder level cleared for {$lbl['label']}." : "Reorder level of {$lbl['label']} set to " . fmt_qty($lvl) . " {$lbl['unit']}."];
}

function inventory_adjust(int $vid, array $in): array
{
    if (!db_value('SELECT COUNT(*) FROM material_variants WHERE id = :v', ['v' => $vid])) throw new ApiError('Specification not found.', 404);
    $errors = [];
    $date = trim((string) ($in['adj_date'] ?? ''));
    if (!valid_date($date)) $errors['adj_date'] = 'Enter the date.';
    elseif ($date > date('Y-m-d')) $errors['adj_date'] = 'Cannot be in the future.';
    $qty = $in['quantity'] ?? '';
    if (!is_numeric($qty) || round((float) $qty, 3) == 0.0) $errors['quantity'] = 'Enter the quantity to add (+) or remove (−).';
    $notes = trim((string) ($in['notes'] ?? ''));
    if ($notes === '') $errors['notes'] = 'Say why, e.g. "Physical count 12-10".';
    if (!$errors && ($p = stock_check([], [[$vid, round((float) $qty, 3)]]))) $errors['quantity'] = reset($p);
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);
    $qty = round((float) $qty, 3);
    $no = next_doc_no('stock_adjustments', 'ADJ', 'adj_no');
    db()->prepare('INSERT INTO stock_adjustments (adj_no, adj_date, variant_id, quantity, notes, created_by, created_at, updated_at) VALUES (:n, :d, :v, :q, :t, :b, :c, :u)')
        ->execute(['n' => $no, 'd' => $date, 'v' => $vid, 'q' => $qty, 't' => mb_substr($notes, 0, 255), 'b' => current_user()['id'] ?? null, 'c' => now(), 'u' => now()]);
    $id = (int) db()->lastInsertId();
    stock_post('adjustment', $id, $no, $date, [[$vid, $qty]]);
    $lbl = variant_label($vid);
    return ['data' => inventory_detail($vid), 'message' => "Stock of {$lbl['label']} " . ($qty > 0 ? 'increased' : 'reduced') . ' by ' . fmt_qty(abs($qty)) . " {$lbl['unit']} ($no)."];
}

function low_stock(): array
{
    $rows = array_values(array_filter(inventory_rows((int) ($_GET['material_id'] ?? 0) ?: null), fn ($r) => $r['is_low']));
    $sid = (int) ($_GET['supplier_id'] ?? 0);
    foreach ($rows as &$r) {
        $last = db_one("SELECT s.id, s.name FROM stock_moves m JOIN material_receipts h ON h.id = m.ref_id JOIN suppliers s ON s.id = h.supplier_id
                         WHERE m.ref_type = 'receipt' AND m.variant_id = :v ORDER BY m.move_date DESC, m.id DESC LIMIT 1", ['v' => $r['id']]);
        $r['last_supplier_id'] = $last ? (int) $last['id'] : null;
        $r['last_supplier'] = $last['name'] ?? null;
        $r['short_by'] = round($r['reorder_level'] - $r['available'], 3);
    }
    unset($r);
    if ($sid) $rows = array_values(array_filter($rows, fn ($r) => $r['last_supplier_id'] === $sid));
    return ['data' => $rows, 'total' => count($rows)];
}

function dashboard(): array
{
    $today = date('Y-m-d');
    $week = date('Y-m-d', strtotime('+6 days'));
    return ['data' => [
        'open_orders' => (int) db_value("SELECT COUNT(*) FROM orders WHERE status IN ('Open', 'Partly Dispatched')"),
        'boq_pending' => (int) db_value("SELECT COUNT(*) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.boq_status = 'Pending' AND o.status <> 'Cancelled' AND NOT EXISTS (SELECT 1 FROM dispatches d WHERE d.order_item_id = i.id)"),
        'planned_week' => (int) db_value("SELECT COUNT(*) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.production_date BETWEEN :a AND :b AND o.status <> 'Cancelled' AND NOT EXISTS (SELECT 1 FROM dispatches d WHERE d.order_item_id = i.id)", ['a' => $today, 'b' => $week]),
        'to_dispatch' => (int) db_value("SELECT COUNT(*) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status <> 'Cancelled' AND NOT EXISTS (SELECT 1 FROM dispatches d WHERE d.order_item_id = i.id)"),
        'low_stock' => count(array_filter(inventory_rows(), fn ($r) => $r['is_low'])),
        'followups_today' => (int) db_value("SELECT COUNT(*) FROM leads WHERE status = 'Open' AND temperature = 'Hot' AND next_followup_date = :d", ['d' => $today]),
        'followups_overdue' => (int) db_value("SELECT COUNT(*) FROM leads WHERE status = 'Open' AND temperature = 'Hot' AND next_followup_date < :d", ['d' => $today]),
        'week_from' => $today, 'week_to' => $week,
    ]];
}
