<?php
// Orders, order items (each exactly one piece), dispatch.
//
//   GET    orders?q=&status=&customer_id=&page=
//   GET    orders/{id}
//   POST   orders                         { customer_id, project_name, order_date, delivery_date, order_by_id, shipping_address,
//                                            items: [{ id?, area, values: { field_id: text }, remarks, component_image, reference_image, drawing_file, drawing_name }] }
//   PUT    orders/{id}
//   PATCH  orders/{id}/status             { status: Cancelled | Reopen }
//   DELETE orders/{id}                    only when nothing was booked, issued or dispatched
//   GET    order-items?open=1&q=          order items for dropdowns (Material Issue)
//   GET    order-items?pending_boq=1&q=   items whose BOQ is not saved yet (open orders, not dispatched)
//   PUT    order-items/{id}/dispatch      { dispatch_date, transporter_id, vehicle_no, docket_no, remarks }
//   DELETE order-items/{id}/dispatch      undo a dispatch
//   GET    dispatches?q=&from=&to=

const ORDER_STATUSES = ['Open', 'Partly Dispatched', 'Dispatched', 'Cancelled'];

function orders_route(string $method, array $parts): void
{
    $id = isset($parts[0]) ? (int) $parts[0] : null;
    $sub = $parts[1] ?? null;
    if ($id === null) {
        if ($method === 'GET')  { json_out(order_list()); return; }
        if ($method === 'POST') { json_out(order_save(null, request_body()), 201); return; }
    } elseif ($sub === 'status' && $method === 'PATCH') {
        json_out(order_set_status($id, request_body()));
        return;
    } elseif ($sub === null) {
        if ($method === 'GET')    { json_out(['data' => order_find($id)]); return; }
        if ($method === 'PUT')    { json_out(order_save($id, request_body())); return; }
        if ($method === 'DELETE') { json_out(order_delete($id)); return; }
    }
    throw new ApiError('Not found.', 404);
}

function order_items_route(string $method, array $parts): void
{
    $id = isset($parts[0]) ? (int) $parts[0] : null;
    $sub = $parts[1] ?? null;
    if ($id === null && $method === 'GET') { json_out(order_items_lookup()); return; }
    if($id!==null&&$sub==='drawing'&&$method==='PUT'){json_out(order_drawing_save($id,request_body()));return;}
    if ($id !== null && $sub === 'production-status' && $method === 'PATCH') {
        json_out(production_set_status($id, request_body())); return;
    }
    if ($id !== null && $sub === 'dispatch') {
        if ($method === 'PUT')    { json_out(dispatch_save($id, request_body())); return; }
        if ($method === 'DELETE') { json_out(dispatch_delete($id)); return; }
    }
    throw new ApiError('Not found.', 404);
}

// ---------------------------------------------------------------------------

const ORDER_SELECT = 'SELECT o.*, c.name AS customer_name, c.city AS customer_city, ub.name AS order_by_name, assignee.name AS assigned_salesperson_name,
                             (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count,
                             (SELECT COUNT(*) FROM order_items i JOIN dispatches d ON d.order_item_id = i.id WHERE i.order_id = o.id) AS dispatched_count,
                             (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.boq_status = \'Final\') AS boq_count
                        FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN users ub ON ub.id = o.order_by_id LEFT JOIN users assignee ON assignee.id=o.assigned_salesperson_id';

function order_cast(array $r): array
{
    foreach (['id', 'assigned_salesperson_id', 'customer_id', 'item_count', 'dispatched_count', 'boq_count'] as $k) {
        if (isset($r[$k])) $r[$k] = (int) $r[$k];
    }
    $r['order_by_id'] = $r['order_by_id'] === null ? null : (int) $r['order_by_id'];
    return $r;
}

function order_list(): array
{
    $where = [order_visibility_sql()];
    $params = [];
    $status = $_GET['status'] ?? '';
    if ($status === 'open') $where[] = "o.status IN ('Open', 'Partly Dispatched')";
    elseif (in_array($status, ORDER_STATUSES, true)) { $where[] = 'o.status = :s'; $params['s'] = $status; }
    if (!empty($_GET['customer_id'])) { $where[] = 'o.customer_id = :cid'; $params['cid'] = (int) $_GET['customer_id']; }
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $where[] = '(o.order_no LIKE :q1 OR c.name LIKE :q2 OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND (i.area LIKE :q3 OR i.remarks LIKE :q4 OR EXISTS (SELECT 1 FROM order_item_values v WHERE v.order_item_id = i.id AND v.value LIKE :q5))) OR o.project_name LIKE :q6)';
        for ($k = 1; $k <= 6; $k++) $params["q$k"] = "%$q%";
    }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $perPage = max(1, min(200, (int) ($_GET['per_page'] ?? 20)));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $offset = ($page - 1) * $perPage;
    $total = (int) db_value('SELECT COUNT(*) FROM (' . ORDER_SELECT . "$whereSql) x", $params);
    $rows = db_all(ORDER_SELECT . "$whereSql ORDER BY o.order_date DESC, o.id DESC LIMIT $perPage OFFSET $offset", $params);
    $counts = array_fill_keys(ORDER_STATUSES, 0);
    foreach (db_all('SELECT o.status, COUNT(*) AS n FROM orders o WHERE '.order_visibility_sql().' GROUP BY o.status') as $r) $counts[$r['status']] = (int) $r['n'];
    return ['data' => array_map('order_cast', $rows), 'total' => $total, 'page' => $page, 'per_page' => $perPage, 'counts' => $counts];
}

// Display stage of one order item
function item_stage(array $it): string
{
    if (!empty($it['dispatch'])) return 'Dispatched';
    if($it['boq_status']==='Pending'&&empty($it['drawing_file']))return 'Pending Drawing';
    return 'BOQ ' . $it['boq_status'];
}

function order_items_of(int $orderId): array
{
    require_order_access($orderId);
    $items = db_all(
        'SELECT i.*, i.id AS order_item_id,
                d.id AS dispatch_id, d.dispatch_no, d.dispatch_date, d.transporter_id, t.name AS transporter_name, d.vehicle_no, d.docket_no, d.dispatch_by, d.dispatch_document, d.dispatch_document_name, d.dispatch_lr_copy, d.dispatch_lr_copy_name, d.remarks AS dispatch_remarks,
                (SELECT COUNT(*) FROM material_issues mi WHERE mi.order_item_id = i.id) AS issue_count,
                (SELECT COUNT(*) FROM boq_lines b WHERE b.order_item_id = i.id) AS boq_lines
           FROM order_items i
           LEFT JOIN dispatches d ON d.order_item_id = i.id LEFT JOIN transporters t ON t.id = d.transporter_id
          WHERE i.order_id = :o ORDER BY i.line_no',
        ['o' => $orderId]
    );
    $items = with_item_details($items);
    $bf = booking_figures();
    return array_map(function ($i) use ($bf) {
        $out = [
            'id' => (int) $i['id'], 'line_no' => (int) $i['line_no'], 'area' => $i['area'], 'values' => $i['values'], 'details' => $i['details'],
            'item_title' => $i['item_title'], 'item_info' => $i['item_info'], 'remarks' => $i['remarks'],
            'component_image' => $i['component_image'], 'reference_image' => $i['reference_image'],
            'drawing_file' => $i['drawing_file'], 'drawing_name' => $i['drawing_name'],
            'boq_status' => $i['boq_status'], 'production_status'=>$i['production_status'], 'boq_lines' => (int) $i['boq_lines'],
            'issue_count' => (int) $i['issue_count'],
            'booked_lines' => count(array_filter($bf['items'][(int) $i['id']] ?? [], fn ($f) => $f['open'] > 0)),
            'dispatch' => $i['dispatch_id'] ? [
                'id' => (int) $i['dispatch_id'], 'dispatch_no' => $i['dispatch_no'], 'dispatch_date' => $i['dispatch_date'],
                'transporter_id' => $i['transporter_id'] === null ? null : (int) $i['transporter_id'], 'transporter_name' => $i['transporter_name'],
                'vehicle_no' => $i['vehicle_no'], 'docket_no' => $i['docket_no'], 'dispatch_by' => $i['dispatch_by'], 'dispatch_document' => $i['dispatch_document'], 'dispatch_document_name' => $i['dispatch_document_name'], 'dispatch_lr_copy' => $i['dispatch_lr_copy'], 'dispatch_lr_copy_name' => $i['dispatch_lr_copy_name'], 'remarks' => $i['dispatch_remarks'],
            ] : null,
        ];
        $out['stage'] = item_stage($out);
        return $out;
    }, $items);
}

function order_find(int $id): array
{
    require_order_access($id);
    $o = db_one(ORDER_SELECT . ' WHERE o.id = :id', ['id' => $id]);
    if (!$o) throw new ApiError('Order not found. It may have been deleted.', 404);
    $o = order_cast($o);
    $lead = db_one('SELECT l.id, l.lead_no FROM leads l JOIN orders o ON o.lead_id=l.id WHERE o.id = :o', ['o' => $id]);
    $o['lead'] = $lead ? ['id' => (int) $lead['id'], 'lead_no' => $lead['lead_no']] : null;
    $o['items'] = order_items_of($id);
    return $o;
}

function order_validate(?array $existing, array $in): array
{
    $assignee=(int)($in['assigned_salesperson_id']??($existing['assigned_salesperson_id']??0));
    if(app_role()==='Sales') {
        if($assignee && $assignee!==(int)current_user()['id'])throw new ApiError('Sales may create Orders only for themselves.',403);
        $assignee=(int)current_user()['id'];
    }
    if($assignee && !db_value("SELECT COUNT(*) FROM users WHERE id=:id AND role='Sales' AND is_active=1",['id'=>$assignee]))throw new ApiError('Choose an active Assigned Salesperson.',422,['assigned_salesperson_id'=>'Choose an active Sales user.']);
    $errors = [];
    $h = [];
    $cid = (int) ($in['customer_id'] ?? 0);
    $c = $cid ? db_one('SELECT id, name, is_active FROM customers WHERE id = :id', ['id' => $cid]) : null;
    if (!$c) $errors['customer_id'] = 'Choose a customer.';
    elseif (!$c['is_active'] && (!$existing || $existing['customer_id'] !== $cid)) $errors['customer_id'] = "{$c['name']} is inactive.";
    $h['customer_id'] = $cid;
    $h['assigned_salesperson_id']=$assignee?:null;
    $pn = preg_replace('/\s+/', ' ', trim((string) ($in['project_name'] ?? '')));
    if (mb_strlen($pn) > 150) $errors['project_name'] = 'Keep this under 150 characters.';
    $h['project_name'] = $pn === '' ? null : $pn;
    $h['order_date'] = trim((string) ($in['order_date'] ?? ''));
    if (!valid_date($h['order_date'])) $errors['order_date'] = 'Enter the order date.';
    $dd = trim((string) ($in['delivery_date'] ?? ''));
    if ($dd === '') $errors['delivery_date'] = 'Enter the target delivery date.';
    elseif (!valid_date($dd)) $errors['delivery_date'] = 'Enter a valid date.';
    elseif (!isset($errors['order_date']) && $dd < $h['order_date']) $errors['delivery_date'] = 'Target delivery date cannot be before the order date.';
    else $h['delivery_date'] = $dd;
    $ob = (int) ($in['order_by_id'] ?? 0);
    if ($ob && !db_value('SELECT COUNT(*) FROM users WHERE id = :id', ['id' => $ob])) $errors['order_by_id'] = 'Choose a valid user.';
    $h['order_by_id'] = $ob ?: null;
    $addr = trim((string) ($in['shipping_address'] ?? ''));
    if (mb_strlen($addr) > 255) $errors['shipping_address'] = 'Keep this under 255 characters.';
    $h['shipping_address'] = $addr === '' ? null : $addr;
    $leadId = (int) ($existing ? ($existing['lead']['id'] ?? 0) : ($in['lead_id'] ?? 0));
    if ($leadId) {
        $lead = db_one('SELECT lead_no, status, order_id, customer_id FROM crm_lead_current WHERE id = :id', ['id' => $leadId]);
        if (!$lead) $errors['lead_id'] = 'That lead no longer exists.';
        elseif ((int)$lead['customer_id'] !== $cid) $errors['lead_id'] = 'The order Contact must match the Lead Contact.';
        elseif (!$existing && $lead['status'] !== 'Success') $errors['lead_id'] = "Lead {$lead['lead_no']} is not marked Success.";
    }
    $h['_lead_id'] = $leadId && !$existing ? $leadId : null;

    $items = [];
    $existingIds = $existing ? array_column($existing['items'], 'id') : [];
    foreach (is_array($in['items'] ?? null) ? $in['items'] : [] as $n => $row) {
        $iid = (int) ($row['id'] ?? 0);
        $remarks = trim((string) ($row['remarks'] ?? ''));
        $area = preg_replace('/\s+/', ' ', trim((string) ($row['area'] ?? '')));
        if (mb_strlen($area) > 100) $errors["items.$n.area"] = 'Keep this under 100 characters.';
        $values = [];
        foreach (is_array($row['values'] ?? null) ? $row['values'] : [] as $fid => $v) {
            $v = preg_replace('/\s+/', ' ', trim((string) $v));
            if ($v === '') continue;
            if (mb_strlen($v) > 150) $errors["items.$n.values.$fid"] = 'Keep this under 150 characters.';
            $values[(string) $fid] = $v;
        }
        $imgs = [];
        foreach (['component_image', 'reference_image'] as $k) {
            $imgs[$k] = clean_image_path($row[$k] ?? '');
            if ($imgs[$k] === false) { $errors["items.$n.$k"] = 'Upload this photo again.'; $imgs[$k] = null; }
        }
        $imgs['drawing_file'] = clean_drawing_path($row['drawing_file'] ?? '');
        if ($imgs['drawing_file'] === false) { $errors["items.$n.drawing_file"] = 'Upload this drawing again.'; $imgs['drawing_file'] = null; }
        $dn = mb_substr(trim((string) ($row['drawing_name'] ?? '')), 0, 150);
        $imgs['drawing_name'] = $imgs['drawing_file'] ? ($dn !== '' ? $dn : 'Drawing') : null;
        if (!$iid && $area === '' && !$values && $remarks === '' && !$imgs['component_image'] && !$imgs['reference_image'] && !$imgs['drawing_file']) continue;
        if (!$values && $area === '') $errors["items.$n.values"] = 'Fill the area or the item details.';
        if (mb_strlen($remarks) > 255) $errors["items.$n.remarks"] = 'Keep this under 255 characters.';
        $items[] = ['id' => in_array($iid, $existingIds, true) ? $iid : null, 'area' => $area === '' ? null : $area, 'values' => $values, 'remarks' => $remarks === '' ? null : $remarks] + $imgs;
    }
    if (!$items) $errors['items'] = 'Add at least one order item.';
    if ($existing) {
        $kept = array_filter(array_column($items, 'id'));
        foreach ($existing['items'] as $old) {
            if (in_array($old['id'], $kept, true)) continue;
            if ($old['dispatch'] || $old['issue_count'] > 0 || db_value('SELECT COUNT(*) FROM sample_issues WHERE order_item_id=?',[$old['id']])) {
                $errors['items'] = "Item {$old['line_no']} ({$old['item_title']}) already has materials issued or is dispatched, so it can't be removed.";
            }
        }
    }
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);
    return [$h, $items];
}

function order_save(?int $id, array $in): array
{
    if($id)require_admin();else require_roles(['Admin','Sales']);
    if(!$id&&app_role()==='Sales')$in['order_by_id']=current_user()['id'];
    $existing = $id !== null ? order_find($id) : null;
    if ($existing && $existing['status'] === 'Cancelled') throw new ApiError("Order {$existing['order_no']} is cancelled. Reopen it to make changes.", 409);
    [$h, $items] = order_validate($existing, $in);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $leadId = $h['_lead_id'];
        unset($h['_lead_id']);
        if ($leadId) $h['lead_id']=$leadId;
        $h['updated_at'] = now();
        if ($id === null) {
            $h['order_no'] = next_doc_no('orders', 'ORD', 'order_no');
            $h['status'] = 'Open';
            $h['created_at'] = now();
            $cols = array_keys($h);
            $pdo->prepare('INSERT INTO orders (' . implode(', ', $cols) . ') VALUES (:' . implode(', :', $cols) . ')')->execute($h);
            $id = (int) $pdo->lastInsertId();
            $msg = "Order {$h['order_no']} created.";
        } else {
            $set = implode(', ', array_map(fn ($c) => "$c = :$c", array_keys($h)));
            $pdo->prepare("UPDATE orders SET $set WHERE id = :id")->execute($h + ['id' => $id]);
            $msg = "Order {$existing['order_no']} updated.";
        }
        $keep = [];
        foreach ($items as $n => $it) {
            $row = ['l' => $n + 1, 'a' => $it['area'], 'r' => $it['remarks'], 'ci' => $it['component_image'], 'ri' => $it['reference_image'], 'df' => $it['drawing_file'], 'dn' => $it['drawing_name'], 'u' => now()];
            if ($it['id']) {
                $pdo->prepare('UPDATE order_items SET line_no = :l, area = :a, remarks = :r, component_image = :ci, reference_image = :ri, drawing_file = :df, drawing_name = :dn, updated_at = :u WHERE id = :id')
                    ->execute($row + ['id' => $it['id']]);
                $iid = $it['id'];
            } else {
                $pdo->prepare('INSERT INTO order_items (order_id, line_no, area, remarks, component_image, reference_image, drawing_file, drawing_name, boq_status, created_at, updated_at)
                               VALUES (:o, :l, :a, :r, :ci, :ri, :df, :dn, :b, :c, :u)')
                    ->execute($row + ['o' => $id, 'b' => 'Pending', 'c' => now()]);
                $iid = (int) $pdo->lastInsertId();
            }
            item_values_save($iid, $it['values']);
            $keep[] = $iid;
        }
        foreach ($existing['items'] ?? [] as $old) {
            if (in_array($old['id'], $keep, true)) continue;
            $pdo->prepare('DELETE FROM bookings WHERE order_item_id = :i')->execute(['i' => $old['id']]);
            $pdo->prepare('DELETE FROM boq_lines WHERE order_item_id = :i')->execute(['i' => $old['id']]);
            $pdo->prepare('DELETE FROM order_item_values WHERE order_item_id = :i')->execute(['i' => $old['id']]);
            $pdo->prepare('DELETE FROM order_items WHERE id = :i')->execute(['i' => $old['id']]);
        }
        if ($leadId) {
            // The originating Lead is linked on orders.lead_id; no state is duplicated on Leads.
            $msg .= ' Linked to lead ' . db_value('SELECT lead_no FROM leads WHERE id = :l', ['l' => $leadId]) . '.';
        }
        order_refresh_status($id);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['data' => order_find($id), 'message' => $msg];
}

function order_refresh_status(int $orderId): void
{
    $o = db_one('SELECT status FROM orders WHERE id = :id', ['id' => $orderId]);
    if (!$o || $o['status'] === 'Cancelled') return;
    $total = (int) db_value('SELECT COUNT(*) FROM order_items WHERE order_id = :o', ['o' => $orderId]);
    $done = (int) db_value('SELECT COUNT(*) FROM order_items i JOIN dispatches d ON d.order_item_id = i.id WHERE i.order_id = :o', ['o' => $orderId]);
    $status = $total > 0 && $done === $total ? 'Dispatched' : ($done > 0 ? 'Partly Dispatched' : 'Open');
    if ($status !== $o['status']) {
        db()->prepare('UPDATE orders SET status = :s, updated_at = :u WHERE id = :id')->execute(['s' => $status, 'u' => now(), 'id' => $orderId]);
    }
}

function order_set_status(int $id, array $in): array
{
    require_admin();
    $o = order_find($id);
    $action = $in['status'] ?? '';
    if ($action === 'Cancelled') {
        if ($o['dispatched_count'] > 0) throw new ApiError("Order {$o['order_no']} has dispatched items, so it can't be cancelled.", 409);
        db()->prepare("UPDATE orders SET status = 'Cancelled', updated_at = :u WHERE id = :id")->execute(['u' => now(), 'id' => $id]);
        return ['data' => order_find($id), 'message' => "Order {$o['order_no']} cancelled. Its blocks no longer hold stock."];
    }
    if ($action === 'Reopen') {
        db()->prepare("UPDATE orders SET status = 'Open', updated_at = :u WHERE id = :id")->execute(['u' => now(), 'id' => $id]);
        order_refresh_status($id);
        return ['data' => order_find($id), 'message' => "Order {$o['order_no']} reopened."];
    }
    throw new ApiError('You can only cancel or reopen an order; other statuses follow dispatch.', 422);
}

function order_delete(int $id): array
{
    require_admin();
    $o = order_find($id);
    $ids = array_column($o['items'], 'id');
    if ($ids) {
        $in = implode(',', array_map('intval', $ids));
        if (db_value("SELECT COUNT(*) FROM sample_issues WHERE order_item_id IN ($in)") || db_value("SELECT COUNT(*) FROM bookings WHERE order_item_id IN ($in)") || db_value("SELECT COUNT(*) FROM material_issues WHERE order_item_id IN ($in)") || db_value("SELECT COUNT(*) FROM dispatches WHERE order_item_id IN ($in)")) {
            throw new ApiError("Order {$o['order_no']} has bookings, issues or dispatches, so it can't be deleted. Cancel it instead.", 409);
        }
        db()->exec("DELETE FROM boq_lines WHERE order_item_id IN ($in)");
        db()->exec("DELETE FROM order_item_values WHERE order_item_id IN ($in)");
    }

    db()->prepare('DELETE FROM order_items WHERE order_id = :id')->execute(['id' => $id]);
    db()->prepare('DELETE FROM orders WHERE id = :id')->execute(['id' => $id]);
    return ['message' => "Order {$o['order_no']} deleted."];
}

// ---------------------------------------------------------------------------
// Order items

const ITEM_SELECT = 'SELECT i.id, i.id AS order_item_id, i.order_id, i.line_no, i.area, i.remarks, i.component_image, i.reference_image, i.drawing_file, i.drawing_name, i.boq_status, i.production_status, o.customer_id,
                            o.order_no, o.order_date, o.delivery_date, o.project_name, o.status AS order_status, c.name AS customer_name,
                            d.id AS dispatch_id, d.dispatch_date
                       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = o.customer_id
                       LEFT JOIN dispatches d ON d.order_item_id = i.id';

// $rows from ITEM_SELECT -> typed rows with item details and a label like "ORD-0004 · #1 Custom Made Chandelier · Living Room"
function items_cast(array $rows): array
{
    $rows = with_item_details($rows);
    foreach ($rows as &$r) {
        foreach (['id', 'order_id', 'line_no'] as $k) $r[$k] = (int) $r[$k];
        unset($r['order_item_id']);
        $r['dispatch_id'] = $r['dispatch_id'] === null ? null : (int) $r['dispatch_id'];
        $r['label'] = "{$r['order_no']} · #{$r['line_no']} {$r['item_title']}";
    }
    unset($r);
    return $rows;
}

function item_cast(array $r): array
{
    return items_cast([$r])[0];
}

function item_find(int $id): array
{
    require_item_access($id);
    $r = db_one(ITEM_SELECT . ' WHERE i.id = :id', ['id' => $id]);
    if (!$r) throw new ApiError('Order item not found.', 404);
    return item_cast($r);
}

// Open (not dispatched, order not cancelled) items for dropdowns; include one more by id.
function order_items_lookup(): array
{
    if (!empty($_GET['pending_issue'])) return pending_material_issue();
    if (!empty($_GET['saved_boq'])) return saved_boq();
    if (!empty($_GET['pending_drawing'])) return pending_boq(true);
    if (!empty($_GET['pending_boq'])) return pending_boq();
    $inc = (int) ($_GET['include'] ?? 0);
    $final = (app_role()==='Store'||!empty($_GET['final_boq'])) ? " AND i.boq_status = 'Final'" : '';
    $rows = db_all(ITEM_SELECT . " WHERE ((o.status <> 'Cancelled' AND d.id IS NULL$final) OR i.id = :inc)$final AND " . order_visibility_sql() . " ORDER BY o.order_date DESC, o.id DESC, i.line_no", ['inc' => $inc]);
    return ['data' => items_cast($rows)];
}

// Pending BOQ: items of open orders whose BOQ is not saved yet, earliest delivery first.
function pending_boq(bool $drawing=false): array
{
    $where = "i.boq_status IN ('Pending', 'Draft') AND o.status <> 'Cancelled' AND d.id IS NULL AND ".order_visibility_sql();
    $where.=$drawing?" AND i.boq_status='Pending' AND (i.drawing_file IS NULL OR i.drawing_file='')":" AND (i.boq_status='Draft' OR (i.drawing_file IS NOT NULL AND i.drawing_file<>''))";
    if(app_role()==='Store'&&!$drawing)$where.=' AND 1=0';
    $params = [];
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $where .= ' AND (o.order_no LIKE :q1 OR c.name LIKE :q2 OR o.project_name LIKE :q3 OR i.area LIKE :q4 OR i.remarks LIKE :q5
                    OR EXISTS (SELECT 1 FROM order_item_values v WHERE v.order_item_id = i.id AND v.value LIKE :q6))';
        for ($k = 1; $k <= 6; $k++) $params["q$k"] = "%$q%";
    }
    $rows = db_all(ITEM_SELECT . " WHERE $where ORDER BY o.delivery_date IS NULL, o.delivery_date, o.order_date, o.id, i.line_no", $params);
    return ['data' => items_cast($rows)];
}

function dispatch_save(int $itemId, array $in): array
{
    require_roles(['Admin','Store']);
    $it = item_find($itemId);
    if ($it['order_status'] === 'Cancelled') throw new ApiError("Order {$it['order_no']} is cancelled.", 409);
    $errors = [];
    $h = [];
    $h['dispatch_date'] = trim((string) ($in['dispatch_date'] ?? ''));
    if (!valid_date($h['dispatch_date'])) $errors['dispatch_date'] = 'Enter the dispatch date.';
    elseif ($h['dispatch_date'] > date('Y-m-d')) $errors['dispatch_date'] = 'Cannot be in the future.';
    $tid = (int) ($in['transporter_id'] ?? 0);
    if ($tid && !db_value('SELECT COUNT(*) FROM transporters WHERE id = :id', ['id' => $tid])) $errors['transporter_id'] = 'Choose a valid transporter.';
    $h['transporter_id'] = $tid ?: null;
    foreach (['vehicle_no' => 20, 'docket_no' => 50, 'remarks' => 255, 'dispatch_by' => 100] as $f => $max) {
        $v = trim((string) ($in[$f] ?? ''));
        if ($f === 'vehicle_no') $v = strtoupper(str_replace(' ', '', $v));
        if (mb_strlen($v) > $max) $errors[$f] = "Keep this under $max characters.";
        $h[$f] = $v === '' ? null : $v;
    }
    $h['dispatch_document'] = clean_drawing_path($in['dispatch_document'] ?? '');
    if ($h['dispatch_document'] === false) $errors['dispatch_document'] = 'Upload a PDF, JPG, PNG or WEBP dispatch document.';
    $documentName = trim((string) ($in['dispatch_document_name'] ?? ''));
    if (mb_strlen($documentName) > 150) $errors['dispatch_document'] = 'Keep the document name under 150 characters.';
    $h['dispatch_document_name'] = $h['dispatch_document'] ? ($documentName ?: 'Dispatch document') : null;
    $h['dispatch_lr_copy'] = clean_drawing_path($in['dispatch_lr_copy'] ?? '');
    if ($h['dispatch_lr_copy'] === false) $errors['dispatch_lr_copy'] = 'Upload a PDF, JPG, PNG or WEBP LR copy.';
    $lrCopyName = trim((string) ($in['dispatch_lr_copy_name'] ?? ''));
    if (mb_strlen($lrCopyName) > 150) $errors['dispatch_lr_copy'] = 'Keep the LR copy name under 150 characters.';
    $h['dispatch_lr_copy_name'] = $h['dispatch_lr_copy'] ? ($lrCopyName ?: 'LR Copy') : null;
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        db_one('SELECT id FROM order_items WHERE id = :i FOR UPDATE', ['i' => $itemId]);
        $it = item_find($itemId);
        if ($it['order_status'] === 'Cancelled') throw new ApiError('This order is cancelled.', 409);
        if(app_role()==='Store'&&!$it['dispatch_id']&&($it['production_status']!=='Complete'||!production_issue_count($itemId)))throw new ApiError('Complete production before dispatching this item.',409);
        $h['updated_at'] = now();
        if ($it['dispatch_id']) {
            require_admin();
            $set = implode(', ', array_map(fn ($c) => "$c = :$c", array_keys($h)));
            $pdo->prepare("UPDATE dispatches SET $set WHERE id = :id")->execute($h + ['id' => $it['dispatch_id']]);
            $msg = "Dispatch of {$it['label']} updated.";
        } else {
            $h['dispatch_no'] = next_doc_no('dispatches', 'DSP', 'dispatch_no');
            $h['order_item_id'] = $itemId;
            $h['created_at'] = now();
            $cols = array_keys($h);
            $pdo->prepare('INSERT INTO dispatches (' . implode(', ', $cols) . ') VALUES (:' . implode(', :', $cols) . ')')->execute($h);
            $msg = "{$it['label']} dispatched ({$h['dispatch_no']}).";
        }
        order_refresh_status($it['order_id']);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['data' => order_find($it['order_id']), 'message' => $msg];
}

function dispatch_delete(int $itemId): array
{
    require_admin();
    $it = item_find($itemId);
    if (!$it['dispatch_id']) throw new ApiError('This item has not been dispatched.', 409);
    db()->prepare('DELETE FROM dispatches WHERE id = :id')->execute(['id' => $it['dispatch_id']]);
    order_refresh_status($it['order_id']);
    return ['data' => order_find($it['order_id']), 'message' => "Dispatch of {$it['label']} undone."];
}

function dispatch_list(): array
{
    $where = [order_visibility_sql()];
    $params = [];
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $where[] = '(d.dispatch_no LIKE :q1 OR o.order_no LIKE :q2 OR c.name LIKE :q3 OR o.project_name LIKE :q4 OR d.docket_no LIKE :q5 OR d.vehicle_no LIKE :q6)';
        for ($i = 1; $i <= 6; $i++) $params["q$i"] = "%$q%";
    }
    if (valid_date($_GET['from'] ?? '')) { $where[] = 'd.dispatch_date >= :f'; $params['f'] = $_GET['from']; }
    if (valid_date($_GET['to'] ?? '')) { $where[] = 'd.dispatch_date <= :t'; $params['t'] = $_GET['to']; }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $rows = db_all(
        "SELECT d.*, i.order_id, i.line_no, i.area, i.remarks AS item_remarks, o.order_no, o.project_name, c.name AS customer_name, t.name AS transporter_name
           FROM dispatches d JOIN order_items i ON i.id = d.order_item_id JOIN orders o ON o.id = i.order_id
           JOIN customers c ON c.id = o.customer_id LEFT JOIN transporters t ON t.id = d.transporter_id
         $whereSql ORDER BY d.dispatch_date DESC, d.id DESC",
        $params
    );
    $rows = with_item_details($rows);
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; $r['order_id'] = (int) $r['order_id']; $r['order_item_id'] = (int) $r['order_item_id']; $r['line_no'] = (int) $r['line_no']; }
    unset($r);
    return ['data' => $rows, 'total' => count($rows)];
}

function saved_boq(): array
{
    $where = "i.boq_status IN ('Draft', 'Final') AND ".order_visibility_sql();
    if(app_role()==='Store')$where.=" AND i.boq_status='Final'";
    $params = [];
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $where .= ' AND (o.order_no LIKE :q1 OR c.name LIKE :q2 OR o.project_name LIKE :q3 OR i.area LIKE :q4 OR i.remarks LIKE :q5
                    OR EXISTS (SELECT 1 FROM order_item_values v WHERE v.order_item_id = i.id AND v.value LIKE :q6))';
        for ($k = 1; $k <= 6; $k++) $params["q$k"] = "%$q%";
    }
    $rows = db_all(ITEM_SELECT . " WHERE $where ORDER BY o.order_date DESC, o.id DESC, i.line_no", $params);
    return ['data' => items_cast($rows)];
}

function pending_material_issue(): array
{
    $where=order_visibility_sql()." AND i.boq_status='Final' AND o.status<>'Cancelled' AND d.id IS NULL AND EXISTS (
        SELECT 1 FROM boq_lines b WHERE b.order_item_id=i.id AND b.qty_required>(SELECT COALESCE(SUM(x.quantity),0) FROM material_issue_items x JOIN material_issues h ON h.id=x.issue_id WHERE h.order_item_id=i.id AND x.variant_id=b.variant_id)+(SELECT COALESCE(SUM(si.quantity),0) FROM sample_issues si WHERE si.order_item_id=i.id AND si.variant_id=b.variant_id AND si.fulfills_boq=1))";
    $params=[];$q=trim((string)($_GET['q']??''));
    if($q!==''){$where.=' AND (o.order_no LIKE :q1 OR c.name LIKE :q2 OR o.project_name LIKE :q3 OR i.area LIKE :q4)';for($n=1;$n<=4;$n++)$params['q'.$n]="%$q%";}
    $rows=items_cast(db_all(ITEM_SELECT." WHERE $where ORDER BY o.delivery_date IS NULL,o.delivery_date,o.id,i.line_no",$params));
    foreach($rows as&$row)$row['issue_status']=production_issue_count((int)$row['id'])?'Partially Issued':'Not Issued';
    return ['data'=>$rows];
}

function order_drawing_save(int $id,array $in): array {
 require_roles(['Admin','Sales','Store']);require_item_access($id);$path=clean_drawing_path($in['drawing_file']??'');if(!$path||!is_file(upload_root().'/'.$path))throw new ApiError('Upload a drawing PDF or image first.',422);
 db()->beginTransaction();try{db_one('SELECT id FROM order_items WHERE id=? FOR UPDATE',[$id]);$it=item_find($id);if($it['order_status']==='Cancelled'||$it['dispatch_id'])throw new ApiError('This order item is closed.',409);if($it['drawing_file'])require_admin();
 db()->prepare('UPDATE order_items SET drawing_file=?,drawing_name=?,updated_at=? WHERE id=?')->execute([$path,crm_text($in['drawing_name']??'Drawing',150),now(),$id]);db()->commit();return ['data'=>item_find($id),'message'=>'Drawing saved. The item is now available for BOQ.'];
 }catch(Throwable$e){if(db()->inTransaction())db()->rollBack();throw$e;}
}
