<?php
// Stores documents. Every line is a material + specification values + quantity.
//
//   GET    docs/{type}?q=&from=&to=&party_id=&receipt_type=&page=     type: material-in | material-issue | damage
//   GET    docs/{type}/{id}
//   POST   docs/{type}
//   PUT    docs/{type}/{id}
//   DELETE docs/{type}/{id}
//   GET    docs/issue-prefill?order_item_id=&except_id=   the item's BOQ with consumed and still-to-issue
//
//   GET    opening-stock                   all opening stock lines
//   PUT    opening-stock                   { lines: [{ id?, entry_date, material_id, values, quantity, remarks }] }  (replaces the list)

function doc_types(): array
{
    return [
        'material-in' => [
            'label' => 'Material receipt', 'table' => 'material_receipts', 'items' => 'material_receipt_items', 'fk' => 'receipt_id',
            'no' => 'receipt_no', 'date' => 'receipt_date', 'prefix' => 'MIN', 'sign' => 1, 'ref' => 'receipt',
            'fields' => ['challan_no' => 50, 'notes' => 255],
        ],
        'material-issue' => [
            'label' => 'Material issue', 'table' => 'material_issues', 'items' => 'material_issue_items', 'fk' => 'issue_id',
            'no' => 'issue_no', 'date' => 'issue_date', 'prefix' => 'ISS', 'sign' => -1, 'ref' => 'issue',
            'fields' => ['issued_to' => 100, 'notes' => 255],
        ],
        'damage' => [
            'label' => 'Damage entry', 'table' => 'damages', 'items' => 'damage_items', 'fk' => 'damage_id',
            'no' => 'damage_no', 'date' => 'damage_date', 'prefix' => 'DMG', 'sign' => -1, 'ref' => 'damage',
            'fields' => ['reported_by' => 100, 'notes' => 255],
        ],
    ];
}

const DAMAGE_REASONS = ['Broken', 'Defective', 'Lost', 'Other'];

function doc_def(string $type): array
{
    $all = doc_types();
    if (!isset($all[$type])) throw new ApiError('Not found.', 404);
    return $all[$type] + ['type' => $type];
}

function docs_route(string $method, array $parts): void
{
    $first = $parts[0] ?? '';
    if ($first === 'issue-prefill' && $method === 'GET') { json_out(issue_prefill((int) ($_GET['order_item_id'] ?? 0), (int) ($_GET['except_id'] ?? 0) ?: null)); return; }
    if ($first === 'material-issue' && ($parts[1] ?? '') === 'filters' && $method === 'GET') { json_out(issue_filter_options()); return; }
    $d = doc_def($first);
    $id = isset($parts[1]) ? (int) $parts[1] : null;
    if ($id === null) {
        if ($method === 'GET')  { json_out(doc_list($d)); return; }
        if ($method === 'POST') { json_out(doc_save($d, null, request_body()), 201); return; }
    } else {
        if ($method === 'GET')    { json_out(['data' => doc_find($d, $id)]); return; }
        if ($method === 'PUT')    { json_out(doc_save($d, $id, request_body())); return; }
        if ($method === 'DELETE') { json_out(doc_delete($d, $id)); return; }
    }
    throw new ApiError('Not found.', 404);
}

function doc_select(array $d): string
{
    $t = $d['table'];
    switch ($d['type']) {
        case 'material-in':
            return "SELECT h.*, s.name AS supplier_name FROM $t h JOIN suppliers s ON s.id = h.supplier_id";
        case 'material-issue':
            return "SELECT h.*, i.line_no, i.order_id, i.area, o.order_no, o.project_name, c.name AS customer_name
                      FROM $t h JOIN order_items i ON i.id = h.order_item_id JOIN orders o ON o.id = i.order_id
                      JOIN customers c ON c.id = o.customer_id";
    }
    return "SELECT h.* FROM $t h";
}

function issue_filter_options(): array
{
    $join = ' FROM material_issues h JOIN order_items i ON i.id = h.order_item_id JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = o.customer_id';
    return ['data' => [
        'customers' => db_all('SELECT DISTINCT c.id, c.name' . $join . ' ORDER BY c.name, c.id'),
        'areas' => db_all("SELECT DISTINCT o.customer_id, TRIM(i.area) AS name" . $join . " WHERE i.area IS NOT NULL AND TRIM(i.area) <> '' ORDER BY name"),
    ]];
}

function doc_list(array $d): array
{
    if($d['type']==='material-in')return receipt_item_list();
    $where = [];
    $params = [];
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $cols = ['h.' . $d['no'], 'h.notes'];
        foreach (array_keys($d['fields']) as $f) $cols[] = "h.$f";
        if ($d['type'] === 'material-in') $cols[] = 's.name';
        if ($d['type'] === 'material-issue') { $cols[] = 'o.order_no'; $cols[] = 'c.name'; $cols[] = 'o.project_name'; $cols[] = 'i.area'; }
        $or = [];
        foreach (array_unique($cols) as $i => $c) { $or[] = "$c LIKE :q$i"; $params["q$i"] = "%$q%"; }
        $or[] = "EXISTS (SELECT 1 FROM {$d['items']} x JOIN material_variants v ON v.id = x.variant_id JOIN materials m ON m.id = v.material_id WHERE x.{$d['fk']} = h.id AND (m.name LIKE :qm OR v.spec_text LIKE :qv))";
        $params['qm'] = "%$q%";
        $params['qv'] = "%$q%";
        $where[] = '(' . implode(' OR ', $or) . ')';
    }
    if ($d['type'] === 'material-in') {
        if (!empty($_GET['party_id'])) { $where[] = 'h.supplier_id = :sid'; $params['sid'] = (int) $_GET['party_id']; }
        if (in_array($_GET['receipt_type'] ?? '', ['Purchase', 'Sample'], true)) { $where[] = 'h.receipt_type = :rt'; $params['rt'] = $_GET['receipt_type']; }
    }
    if ($d['type'] === 'material-issue') {
        if (!empty($_GET['customer_id'])) { $where[] = 'o.customer_id = :customer'; $params['customer'] = (int) $_GET['customer_id']; }
        $area = trim((string) ($_GET['area'] ?? ''));
        if ($area !== '') { $where[] = 'TRIM(i.area) = :area'; $params['area'] = $area; }
    }
    if (valid_date($_GET['from'] ?? '')) { $where[] = "h.{$d['date']} >= :f"; $params['f'] = $_GET['from']; }
    if (valid_date($_GET['to'] ?? '')) { $where[] = "h.{$d['date']} <= :t"; $params['t'] = $_GET['to']; }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $perPage = max(1, min(200, (int) ($_GET['per_page'] ?? 20)));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $offset = ($page - 1) * $perPage;
    $base = doc_select($d) . $whereSql;
    $total = (int) db_value("SELECT COUNT(*) FROM ($base) x", $params);
    $rows = db_all("$base ORDER BY h.{$d['date']} DESC, h.id DESC LIMIT $perPage OFFSET $offset", $params);
    if ($d['type'] === 'material-issue') $rows = with_item_details($rows);
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['lines'] = doc_lines($d, $r['id']);
    }
    unset($r);
    return ['data' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
}

function doc_lines(array $d, int $id): array
{
    $extra = $d['type'] === 'damage' ? ', x.reason' : ($d['type']==='material-in'?', x.inventory_type,x.project_name,x.order_by_id':'');
    $lines = db_all(
        "SELECT x.id, x.variant_id, x.quantity, x.remarks$extra, v.material_id, v.spec_text, m.name AS material_name, m.unit
           FROM {$d['items']} x JOIN material_variants v ON v.id = x.variant_id JOIN materials m ON m.id = v.material_id
          WHERE x.{$d['fk']} = :id ORDER BY x.line_no",
        ['id' => $id]
    );
    $vals = variant_values(array_column($lines, 'variant_id'));
    foreach ($lines as &$l) {
        foreach (['id', 'variant_id', 'material_id'] as $k) $l[$k] = (int) $l[$k];
        $l['quantity'] = (float) $l['quantity'];
        $l['values'] = (object) ($vals[$l['variant_id']] ?? []);
    }
    unset($l);
    return $lines;
}

function doc_find(array $d, int $id): array
{
    $h = db_one(doc_select($d) . ' WHERE h.id = :id', ['id' => $id]);
    if (!$h) throw new ApiError("{$d['label']} not found. It may have been deleted.", 404);
    $h['id'] = (int) $h['id'];
    if (isset($h['supplier_id'])) $h['supplier_id'] = (int) $h['supplier_id'];
    if (isset($h['order_item_id'])) { $h['order_item_id'] = (int) $h['order_item_id']; $h = with_item_details([$h])[0]; }
    $h['lines'] = doc_lines($d, $id);
    return $h;
}

function doc_validate(array $d, ?array $existing, array $in): array
{
    $errors = [];
    $h = [];
    $h[$d['date']] = trim((string) ($in[$d['date']] ?? ''));
    if (!valid_date($h[$d['date']])) $errors[$d['date']] = 'Enter the date.';
    elseif ($h[$d['date']] > date('Y-m-d')) $errors[$d['date']] = 'The date cannot be in the future.';

    if ($d['type'] === 'material-in') {
        $type = $in['receipt_type'] ?? 'Purchase';
        if (!in_array($type, ['Purchase', 'Sample'], true)) $errors['receipt_type'] = 'Choose Purchase or Sample.';
        $h['receipt_type'] = $type;
        $sid = (int) ($in['supplier_id'] ?? 0);
        $s = $sid ? db_one('SELECT id, name, is_active FROM suppliers WHERE id = :id', ['id' => $sid]) : null;
        if (!$s) $errors['supplier_id'] = 'Choose the supplier.';
        elseif (!$s['is_active'] && (!$existing || $existing['supplier_id'] !== $sid)) $errors['supplier_id'] = "{$s['name']} is inactive.";
        $h['supplier_id'] = $sid;
    }
    $item = null;
    if ($d['type'] === 'material-issue') {
        $iid = (int) ($in['order_item_id'] ?? 0);
        $item = $iid ? db_one('SELECT i.id, o.status, d.id AS dispatch_id FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN dispatches d ON d.order_item_id = i.id WHERE i.id = :id', ['id' => $iid]) : null;
        $same = $existing && $existing['order_item_id'] === $iid;
        if (!$item) $errors['order_item_id'] = 'Choose the order item.';
        elseif (!$same && $item['status'] === 'Cancelled') $errors['order_item_id'] = 'That order is cancelled.';
        elseif (!$same && $item['dispatch_id']) $errors['order_item_id'] = 'That item is already dispatched.';
        $h['order_item_id'] = $iid;
    }
    foreach ($d['fields'] as $f => $max) {
        $v = trim((string) ($in[$f] ?? ''));
        if (mb_strlen($v) > $max) $errors[$f] = "Keep this under $max characters.";
        $h[$f] = $v === '' ? null : $v;
    }
    if ($d['type'] === 'material-in' && $h['receipt_type'] === 'Purchase' && $h['challan_no'] === null) {
        $errors['challan_no'] = 'Enter the challan / invoice no. for a purchase.';
    }

    // Lines
    $existingMaterials = $existing ? array_map('intval', array_column($existing['lines'], 'material_id')) : [];
    $lines = [];
    foreach (is_array($in['lines'] ?? null) ? $in['lines'] : [] as $n => $row) {
        $qty = $row['quantity'] ?? '';
        $hasValues = is_array($row['values'] ?? null) && array_filter(array_map(fn ($v) => trim((string) $v), $row['values']), fn ($v) => $v !== '');
        if (empty($row['material_id']) && ($qty === '' || $qty === null) && !$hasValues) continue;
        $chk = spec_line_check($row, "lines.$n", $errors, $existingMaterials);
        if (!qty_ok($qty)) $errors["lines.$n.quantity"] = 'Enter a quantity above 0.';
        $line = ['n' => $n, 'quantity' => round((float) $qty, 3), 'remarks' => mb_substr(trim((string) ($row['remarks'] ?? '')), 0, 255) ?: null];
        if($d['type']==='material-in'){
            $pool=$row['inventory_type']??($h['receipt_type']==='Sample'?'Sample':'Normal');if(!in_array($pool,['Normal','Sample'],true))$errors["lines.$n.inventory_type"]='Choose Normal or Sample.';
            $by=(int)($row['order_by_id']??0);if($by&&!db_value('SELECT COUNT(*) FROM users WHERE id=?',[$by]))$errors["lines.$n.order_by_id"]='Choose a user.';
            $project=trim((string)($row['project_name']??''));if(mb_strlen($project)>150)$errors["lines.$n.project_name"]='Keep project name under 150 characters.';
            $line+=['inventory_type'=>$pool,'project_name'=>$project?:null,'order_by_id'=>$by?:null];
        }
        if ($d['type'] === 'damage') {
            $reason = $row['reason'] ?? 'Broken';
            if (!in_array($reason, DAMAGE_REASONS, true)) $errors["lines.$n.reason"] = 'Choose a reason.';
            $line['reason'] = $reason;
        }
        if ($chk) $lines[] = $line + ['material_id' => (int) $chk[0]['id'], 'values' => $chk[1]];
    }
    if (!$lines && !array_filter(array_keys($errors), fn ($k) => str_starts_with($k, 'lines.'))) $errors['lines'] = 'Add at least one material.';
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);
    return [$h, $lines];
}

function doc_save(array $d, ?int $id, array $in): array
{
    if($id)require_admin();else require_roles(['Admin','Store']);
    $existing = $id !== null ? doc_find($d, $id) : null;
    [$h, $lines] = doc_validate($d, $existing, $in);
    $t = $d['table'];
    $pdo = db();
    stock_transaction_begin();
    try {
        if ($d['type'] === 'material-issue') {
            $lockedItem = db_one('SELECT boq_status FROM order_items WHERE id = :i FOR UPDATE', ['i' => $h['order_item_id']]);
            if (!$lockedItem || $lockedItem['boq_status'] !== 'Final') throw new ApiError('Finalise the BOQ before issuing materials.', 409);
        }
        // Resolve specifications (creates new ones) and merge duplicate lines check
        $seen = [];$duplicates=[];
        foreach ($lines as &$l) {
            $l['variant_id'] = variant_resolve($l['material_id'], $l['values']);
            if ($d['type']!=='material-in' && isset($duplicates[$l['variant_id'].':'.($l['inventory_type']??'Normal')])) {
                throw new ApiError('Please fix the highlighted fields.', 422, ["lines.{$l['n']}.values" => 'This material is already listed. Change the quantity on that line instead.']);
            }
            $duplicates[$l['variant_id'].':'.($l['inventory_type']??'Normal')]=true;
            if(!isset($seen[$l['variant_id']])||($l['inventory_type']??'Normal')==='Normal')$seen[$l['variant_id']] = $l['n'];
        }
        unset($l);
        $lockIds = array_values(array_unique(array_merge(array_column($lines,'variant_id'),$existing?array_column($existing['lines'],'variant_id'):[])));
        sort($lockIds);
        foreach ($lockIds as $vid) db_one('SELECT id FROM material_variants WHERE id = :v FOR UPDATE', ['v' => $vid]);
        if ($d['type'] === 'material-issue') {
            foreach ($lines as $l) {
                $needed = db_value('SELECT qty_required FROM boq_lines WHERE order_item_id = :i AND variant_id = :v', ['i' => $h['order_item_id'], 'v' => $l['variant_id']]);
                $issued = (float) db_value('SELECT COALESCE(SUM(x.quantity), 0) FROM material_issue_items x JOIN material_issues h ON h.id = x.issue_id WHERE h.order_item_id = :i AND x.variant_id = :v AND h.id <> :ex', ['i' => $h['order_item_id'], 'v' => $l['variant_id'], 'ex' => $id ?? 0]);
                if (($needed === false || $needed === null) || $l['quantity'] > (float) $needed - $issued - sample_boq_consumed($h['order_item_id'],$l['variant_id']) + 0.0005) throw new ApiError('Please fix the highlighted rows.', 422, ["lines.{$l['n']}.quantity" => ($needed === false || $needed === null) ? 'Material is not in the Final BOQ.' : 'Quantity exceeds the remaining BOQ requirement (' . fmt_qty(max(0, (float) $needed - $issued - sample_boq_consumed($h['order_item_id'],$l['variant_id']))) . ').']);
            }
        }
        $except = $existing ? [[$d['ref'], $id]] : [];
        $normalLines=$d['type']==='material-in'?array_values(array_filter($lines,fn($l)=>$l['inventory_type']==='Normal')):$lines;
        $sampleLines=$d['type']==='material-in'?array_values(array_filter($lines,fn($l)=>$l['inventory_type']==='Sample')):[];
        $moves = array_map(fn ($l) => [$l['variant_id'], $d['sign'] * $l['quantity']], $normalLines);
        if($d['type']==='material-in'){
            foreach($lockIds as $vid)if(db_value('SELECT COUNT(*) FROM sample_legacy_review WHERE variant_id=? AND resolved_at IS NULL',[$vid])&&$existing)throw new ApiError('Review historical sample stock in Sample Inventory before editing this receipt.',409);
            $sampleBefore=sample_balances($lockIds,$except);foreach($sampleLines as $l)$sampleBefore[$l['variant_id']]=($sampleBefore[$l['variant_id']]??0)+$l['quantity'];
            foreach($sampleBefore as $qty)if($qty< -0.0005)throw new ApiError('This receipt change would reduce sample stock below zero.',409);
        }
        $also = $existing ? array_column($existing['lines'], 'variant_id') : [];
        $errors = [];
        foreach (stock_check($except, $moves, $also) as $vid => $msg) {
            if (isset($seen[$vid])) $errors["lines.{$seen[$vid]}.quantity"] = $msg;
            else $errors['lines'] = 'This change would take stock below zero. ' . $msg;
        }
        if($d['type']==='material-in'&&!$errors){$normal=stock_balances($lockIds,$except);foreach($moves as[$v,$q])$normal[$v]=($normal[$v]??0)+$q;$blocks=booking_figures($lockIds)['all'];foreach($normal as$v=>$q)if($q+0.0005<($blocks[$v]??0))$errors['lines']='This receipt change would remove normal stock blocked for an order.';}
        // An issue may use this item's bookings and the stock available to book, but not other items' bookings
        if ($d['type'] === 'material-issue' && !$errors) {
            $bf = booking_figures(array_keys($seen));
            $stock = stock_balances(array_keys($seen), $except);
            foreach ($lines as $l) {
                $vid = $l['variant_id'];
                $othersOpen = ($bf['all'][$vid] ?? 0) - ($bf['items'][$h['order_item_id']][$vid]['open'] ?? 0);
                $limit = round(($stock[$vid] ?? 0) - $othersOpen, 3);
                if ($l['quantity'] > $limit + 0.0005) {
                    $errors["lines.{$l['n']}.quantity"] = $limit > 0 ? 'Only ' . fmt_qty($limit) . ' can be issued (the rest is blocked for other orders).' : 'All stock of this material is blocked for other orders.';
                }
            }
        }
        if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);

        $h['updated_at'] = now();
        if ($id === null) {
            $h[$d['no']] = next_doc_no($t, $d['prefix'], $d['no']);
            $h['created_at'] = now();
            $cols = array_keys($h);
            $pdo->prepare("INSERT INTO $t (" . implode(', ', $cols) . ') VALUES (:' . implode(', :', $cols) . ')')->execute($h);
            $id = (int) $pdo->lastInsertId();
            $no = $h[$d['no']];
            $msg = "{$d['label']} $no saved.";
        } else {
            $set = implode(', ', array_map(fn ($c) => "$c = :$c", array_keys($h)));
            $pdo->prepare("UPDATE $t SET $set WHERE id = :id")->execute($h + ['id' => $id]);
            $pdo->prepare("DELETE FROM {$d['items']} WHERE {$d['fk']} = :id")->execute(['id' => $id]);
            $no = $existing[$d['no']];
            $msg = "{$d['label']} $no updated.";
        }
        $extraCol = $d['type'] === 'damage' ? ', reason' : ($d['type']==='material-in'?', inventory_type,project_name,order_by_id':'');
        $extraVal = $d['type'] === 'damage' ? ', :reason' : ($d['type']==='material-in'?', :pool,:project,:by':'');
        $ins = $pdo->prepare("INSERT INTO {$d['items']} ({$d['fk']}, line_no, variant_id, quantity, remarks$extraCol, created_at, updated_at) VALUES (:doc, :l, :v, :q, :r$extraVal, :c, :u)");
        foreach ($lines as $n => $l) {
            $p = ['doc' => $id, 'l' => $n + 1, 'v' => $l['variant_id'], 'q' => $l['quantity'], 'r' => $l['remarks'], 'c' => now(), 'u' => now()];
            if ($d['type'] === 'damage') $p['reason'] = $l['reason'];
            if($d['type']==='material-in')$p+=['pool'=>$l['inventory_type'],'project'=>$l['project_name'],'by'=>$l['order_by_id']];
            $ins->execute($p);
        }
        stock_post($d['ref'], $id, $no, $h[$d['date']], $moves);
        if($d['type']==='material-in'){db()->prepare("DELETE FROM sample_moves WHERE ref_type='receipt' AND ref_id=?")->execute([$id]);foreach($sampleLines as $l)sample_post_line('receipt',$id,$no,$h[$d['date']],$l['variant_id'],$l['quantity']);}
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['data' => doc_find($d, $id), 'message' => $msg];
}

function doc_delete(array $d,int $id): array {
 require_admin();$pdo=db();stock_transaction_begin();try{$doc=doc_find($d,$id);$ids=array_unique(array_column($doc['lines'],'variant_id'));sort($ids);foreach($ids as$v)db_one('SELECT id FROM material_variants WHERE id=? FOR UPDATE',[$v]);
 if(stock_check([[$d['ref'],$id]],[],$ids))throw new ApiError('This receipt stock has already been used. Correct the stock instead.',409);
 if($d['type']==='material-in'){
 $normal=stock_balances($ids,[[$d['ref'],$id]]);$blocks=booking_figures($ids)['all'];foreach($normal as$v=>$q)if($q+0.0005<($blocks[$v]??0))throw new ApiError('This receipt stock is blocked for an order.',409);
 foreach($ids as$v)if(db_value('SELECT COUNT(*) FROM sample_legacy_review WHERE variant_id=? AND resolved_at IS NULL',[$v]))throw new ApiError('Complete the historical sample review first.',409);
 foreach(sample_balances($ids,[['receipt',$id]])as$q)if($q< -0.0005)throw new ApiError('Some sample stock from this receipt has already been issued.',409);
 $pdo->prepare("DELETE FROM sample_moves WHERE ref_type='receipt' AND ref_id=?")->execute([$id]);}
 stock_clear($d['ref'],$id);$pdo->prepare("DELETE FROM {$d['items']} WHERE {$d['fk']}=?")->execute([$id]);$pdo->prepare("DELETE FROM {$d['table']} WHERE id=?")->execute([$id]);$pdo->commit();return ['message'=>"{$d['label']} deleted."];
 }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
}

// The order item's BOQ with what is consumed and still to issue.
function issue_prefill(int $itemId, ?int $exceptIssue): array
{
    $item = boq_item($itemId);
    if ($item['boq_status'] !== 'Final') throw new ApiError('Finalise the BOQ before issuing materials.', 409);
    $lines = db_all('SELECT b.material_id, b.variant_id, b.qty_required, v.spec_text FROM boq_lines b JOIN material_variants v ON v.id = b.variant_id WHERE b.order_item_id = :i ORDER BY b.line_no', ['i' => $itemId]);
    $ids = array_column($lines, 'variant_id');
    $stats = variant_stats($ids, $itemId);
    $vals = variant_values($ids);
    $mine = [];
    if ($exceptIssue) {
        foreach (db_all('SELECT variant_id, quantity FROM material_issue_items WHERE issue_id = :i', ['i' => $exceptIssue]) as $r) $mine[(int) $r['variant_id']] = (float) $r['quantity'];
    }
    $out = [];
    foreach ($lines as $l) {
        $v = (int) $l['variant_id'];
        $consumed = round($stats[$v]['consumed'] - ($mine[$v] ?? 0), 3);
        $out[] = [
            'material_id' => (int) $l['material_id'], 'variant_id' => $v, 'spec_text' => $l['spec_text'], 'values' => (object) ($vals[$v] ?? []),
            'qty_required' => (float) $l['qty_required'], 'consumed' => $consumed,
            'pending' => max(0, round((float) $l['qty_required'] - $consumed, 3)),
            'in_stock' => $stats[$v]['in_stock'], 'booked_item' => $stats[$v]['booked_item'],
        ];
    }
    return ['data' => ['item' => $item, 'lines' => $out]];
}

// ---------------------------------------------------------------------------
// Opening stock: one list of lines, saved together.

function opening_route(string $method): void
{
    if ($method === 'GET') { json_out(['data' => opening_list()]); return; }
    if ($method === 'PUT' || $method==='POST') {
        $lock='opening_'.substr(hash('sha256',(string)db_value('SELECT DATABASE()')),0,20);
        if(!(int)db_value('SELECT GET_LOCK(:k,30)',['k'=>$lock]))throw new ApiError('Opening stock is being updated. Please retry.',409);
        try {json_out(opening_save(request_body(),$method==='POST'));}finally{db_value('SELECT RELEASE_LOCK(:k)',['k'=>$lock]);}return;
    }
    throw new ApiError('Not found.', 404);
}

function opening_list(): array
{
    $rows = db_all('SELECT o.id, o.entry_date, o.variant_id, o.quantity, o.remarks, v.material_id, v.spec_text, m.name AS material_name, m.unit
                      FROM opening_stock o JOIN material_variants v ON v.id = o.variant_id JOIN materials m ON m.id = v.material_id
                     ORDER BY m.sort_order, m.name, v.spec_text');
    $vals = variant_values(array_column($rows, 'variant_id'));
    foreach ($rows as &$r) {
        foreach (['id', 'variant_id', 'material_id'] as $k) $r[$k] = (int) $r[$k];
        $r['quantity'] = (float) $r['quantity'];
        $r['values'] = (object) ($vals[$r['variant_id']] ?? []);
    }
    unset($r);
    return $rows;
}

function opening_save(array $in,bool $append=false): array
{
    if($append)require_roles(['Admin','Store']);else require_admin();
    $existing = opening_list();
    if($append){$new=$in['lines']??[];if(!is_array($new)||!$new)throw new ApiError('Add a new opening stock row.',422);foreach($new as$row)if(!empty($row['id']))throw new ApiError('Only Admin can change saved opening stock.',403);$in['lines']=array_merge($existing,$new);}
    $existingIds = array_column($existing, 'id');
    $errors = [];
    $lines = [];
    foreach (is_array($in['lines'] ?? null) ? $in['lines'] : [] as $n => $row) {
        $qty = $row['quantity'] ?? '';
        $hasValues = is_array($row['values'] ?? null) && array_filter(array_map(fn ($v) => trim((string) $v), $row['values']), fn ($v) => $v !== '');
        if (empty($row['material_id']) && ($qty === '' || $qty === null) && !$hasValues) continue;
        $chk = spec_line_check($row, "lines.$n", $errors, array_map('intval', array_column($existing, 'material_id')));
        if (!qty_ok($qty)) $errors["lines.$n.quantity"] = 'Enter a quantity above 0.';
        $date = trim((string) ($row['entry_date'] ?? ''));
        if (!valid_date($date)) $errors["lines.$n.entry_date"] = 'Enter the date.';
        elseif ($date > date('Y-m-d')) $errors["lines.$n.entry_date"] = 'Cannot be in the future.';
        $id = (int) ($row['id'] ?? 0);
        if ($chk) $lines[] = ['n' => $n, 'id' => in_array($id, $existingIds, true) ? $id : null, 'entry_date' => $date, 'material_id' => (int) $chk[0]['id'], 'values' => $chk[1], 'quantity' => round((float) $qty, 3), 'remarks' => mb_substr(trim((string) ($row['remarks'] ?? '')), 0, 255) ?: null];
    }
    if ($errors) throw new ApiError('Please fix the highlighted rows.', 422, $errors);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $seen = [];$duplicates=[];
        foreach ($lines as &$l) {
            $l['variant_id'] = variant_resolve($l['material_id'], $l['values']);
            if ($d['type']!=='material-in' && isset($duplicates[$l['variant_id'].':'.($l['inventory_type']??'Normal')])) throw new ApiError('Please fix the highlighted rows.', 422, ["lines.{$l['n']}.values" => 'This material is already listed. Change the quantity on that row instead.']);
            $duplicates[$l['variant_id'].':'.($l['inventory_type']??'Normal')]=true;
            if(!isset($seen[$l['variant_id']])||($l['inventory_type']??'Normal')==='Normal')$seen[$l['variant_id']] = $l['n'];
        }
        unset($l);
        // Stock check: replace all opening moves with the new ones
        $before = [];
        $affected = array_unique(array_merge(array_keys($seen), array_column($existing, 'variant_id')));
        $withoutOpening = $affected ? db_all('SELECT variant_id, SUM(quantity) AS q FROM stock_moves WHERE ref_type <> \'opening\' AND variant_id IN (' . implode(',', array_map('intval', $affected)) . ') GROUP BY variant_id') : [];
        foreach ($withoutOpening as $r) $before[(int) $r['variant_id']] = (float) $r['q'];
        foreach ($affected as $vid) {
            $after = round(($before[$vid] ?? 0) + (isset($seen[$vid]) ? $lines[array_search($vid, array_column($lines, 'variant_id'), true)]['quantity'] : 0), 3);
            if ($after < 0) {
                $lbl = variant_label($vid);
                $used = -($before[$vid] ?? 0);
                $msg = "{$lbl['label']}: " . fmt_qty($used) . " {$lbl['unit']} have already been used, so the opening stock can't be less than that.";
                if (isset($seen[$vid])) $errors["lines.{$seen[$vid]}.quantity"] = $msg; else $errors['lines'] = $msg;
            }
        }
        if ($errors) throw new ApiError('Please fix the highlighted rows.', 422, $errors);

        $keep = [];
        foreach ($lines as $l) {
            if($append&&$l['id']){$keep[]=$l['id'];continue;}
            if ($l['id']) {
                $pdo->prepare('UPDATE opening_stock SET entry_date = :d, variant_id = :v, quantity = :q, remarks = :r, updated_at = :u WHERE id = :id')
                    ->execute(['d' => $l['entry_date'], 'v' => $l['variant_id'], 'q' => $l['quantity'], 'r' => $l['remarks'], 'u' => now(), 'id' => $l['id']]);
                $oid = $l['id'];
            } else {
                $pdo->prepare('INSERT INTO opening_stock (entry_date, variant_id, quantity, remarks, created_by, created_at, updated_at) VALUES (:d, :v, :q, :r, :b, :c, :u)')
                    ->execute(['d' => $l['entry_date'], 'v' => $l['variant_id'], 'q' => $l['quantity'], 'r' => $l['remarks'], 'b' => current_user()['id'] ?? null, 'c' => now(), 'u' => now()]);
                $oid = (int) $pdo->lastInsertId();
            }
            $keep[] = $oid;
            stock_post('opening', $oid, 'OPENING', $l['entry_date'], [[$l['variant_id'], $l['quantity']]]);
        }
        foreach ($existingIds as $oid) {
            if (in_array($oid, $keep, true)) continue;
            stock_clear('opening', $oid);
            $pdo->prepare('DELETE FROM opening_stock WHERE id = :id')->execute(['id' => $oid]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['data' => opening_list(), 'message' => 'Opening stock saved (' . count($lines) . ' ' . (count($lines) === 1 ? 'line' : 'lines') . ').'];
}

function receipt_item_list(): array {
 $w=[];$p=[];crm_where_search($w,$p,['h.receipt_no','h.challan_no','s.name','m.name','m.material_code','x.project_name']);
 if(!empty($_GET['party_id'])){$w[]='h.supplier_id=:supplier';$p['supplier']=(int)$_GET['party_id'];}
 if(in_array($_GET['receipt_type']??'',['Sample','Purchase'],true)){$w[]='x.inventory_type=:pool';$p['pool']=$_GET['receipt_type']==='Sample'?'Sample':'Normal';}
 foreach(['from'=>'>=','to'=>'<=']as$key=>$op)if(valid_date($_GET[$key]??'')){$w[]="h.receipt_date $op :$key";$p[$key]=$_GET[$key];}
 return crm_page('SELECT h.id,h.receipt_no,h.receipt_date,h.challan_no,h.notes,h.supplier_id,s.name AS supplier_name,x.id AS receipt_item_id,x.line_no,x.quantity,x.remarks,x.inventory_type,x.project_name,x.order_by_id,u.name AS order_by_name,m.name AS material_name,m.material_code,m.photo_path,m.unit,c.name AS category_name FROM material_receipts h JOIN material_receipt_items x ON x.receipt_id=h.id JOIN suppliers s ON s.id=h.supplier_id JOIN material_variants v ON v.id=x.variant_id JOIN materials m ON m.id=v.material_id LEFT JOIN material_categories c ON c.id=m.category_id LEFT JOIN users u ON u.id=x.order_by_id'.($w?' WHERE '.implode(' AND ',$w):'').' ORDER BY h.receipt_date DESC,h.id DESC,x.line_no',$p);
}
