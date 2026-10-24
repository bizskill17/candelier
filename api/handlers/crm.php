<?php
// CRM: leads and follow-ups.
//
//   GET    leads?q=&status=&temperature=&source_id=&customer_type=&page=
//   GET    leads/{id}                         lead with its follow-up history
//   POST   leads                              { lead_date, customer_type: Existing|New, customer_id | name, phone, address,
//                                              email, city, state_id, contact_person, contact_mobile, source_id, requirement,
//                                              temperature: Hot|Cold (shown as Lead Type), remarks }
//   PUT    leads/{id}
//   DELETE leads/{id}                         only while it has no follow-ups and no order
//   POST   leads/{id}/followups               { followup_date, status, next_date, next_time, followup_by, remarks }
//   DELETE leads/{id}/followups/{fid}         undo the latest follow-up
//   POST   leads/{id}/customer                customer for the order (adds a new lead's customer to Customers)
//   GET    followup-logs?from=&to=&status=&followup_by=&q=&page=   every follow-up entered, newest first
//   GET    follow-ups?tab=all|overdue|today|upcoming&q=   all = every open lead (Hot or Cold); the others: Hot leads by due date
//
// Hot leads are due for follow-up (first on the lead date). Cold leads are not, until made Hot.
// Follow-up statuses: Follow Up Again (needs next date, optional time), Success, Fail.
// Success closes the lead and adds a new lead's customer to Customers automatically; Fail closes it.

const LEAD_STATUSES = ['Open', 'Success', 'Fail'];
const FOLLOWUP_STATUSES = ['Follow Up Again', 'Success', 'Fail'];

function leads_route(string $method, array $parts): void
{
    $id = isset($parts[0]) ? (int) $parts[0] : null;
    $sub = $parts[1] ?? null;
    if ($id === null) {
        if ($method === 'GET')  { json_out(lead_list()); return; }
        if ($method === 'POST') { json_out(lead_save(null, request_body()), 201); return; }
    } elseif ($sub === null) {
        if ($method === 'GET')    { json_out(['data' => lead_find($id)]); return; }
        if ($method === 'PUT')    { json_out(lead_save($id, request_body())); return; }
        if ($method === 'DELETE') { json_out(lead_delete($id)); return; }
    } elseif ($sub === 'followups') {
        if ($method === 'POST' && !isset($parts[2])) { json_out(followup_save($id, request_body()), 201); return; }
        if ($method === 'DELETE' && isset($parts[2])) { json_out(followup_delete($id, (int) $parts[2])); return; }
    } elseif ($sub === 'customer' && $method === 'POST') {
        json_out(lead_customer($id));
        return;
    }
    throw new ApiError('Not found.', 404);
}

const LEAD_SELECT = "SELECT l.*, COALESCE(c.name, l.name) AS display_name, COALESCE(c.phone, l.phone) AS display_phone,
                            COALESCE(c.address, l.address) AS display_address, COALESCE(l.city, c.city) AS customer_city, s.name AS source_name, st.name AS state_name,
                            o.order_no, u.name AS created_by_name,
                            (SELECT COUNT(*) FROM lead_followups f WHERE f.lead_id = l.id) AS followup_count
                       FROM leads l LEFT JOIN customers c ON c.id = l.customer_id LEFT JOIN lead_sources s ON s.id = l.source_id LEFT JOIN states st ON st.id = l.state_id
                       LEFT JOIN orders o ON o.id = l.order_id LEFT JOIN users u ON u.id = l.created_by";

function lead_cast(array $r): array
{
    foreach (['id', 'followup_count'] as $k) $r[$k] = (int) $r[$k];
    foreach (['customer_id', 'source_id', 'state_id', 'order_id', 'created_by'] as $k) $r[$k] = $r[$k] === null ? null : (int) $r[$k];
    $r['next_followup_time'] = $r['next_followup_time'] ? substr($r['next_followup_time'], 0, 5) : null;
    $last = db_one('SELECT f.followup_date, f.status, f.remarks, u.name AS followup_by_name FROM lead_followups f LEFT JOIN users u ON u.id = f.followup_by
                     WHERE f.lead_id = :l ORDER BY f.followup_date DESC, f.id DESC LIMIT 1', ['l' => $r['id']]);
    $r['last_followup'] = $last ?: null;
    $r['due'] = $r['status'] === 'Open' && $r['temperature'] === 'Hot' && $r['next_followup_date'] !== null;
    return $r;
}

function lead_list(): array
{
    $where = [];
    $params = [];
    $st = $_GET['status'] ?? '';
    if (in_array($st, LEAD_STATUSES, true)) { $where[] = 'l.status = :st'; $params['st'] = $st; }
    $t = $_GET['temperature'] ?? '';
    if (in_array($t, ['Hot', 'Cold'], true)) { $where[] = 'l.temperature = :t'; $params['t'] = $t; }
    $ct = $_GET['customer_type'] ?? '';
    if (in_array($ct, ['Existing', 'New'], true)) { $where[] = 'l.customer_type = :ct'; $params['ct'] = $ct; }
    if (!empty($_GET['source_id'])) { $where[] = 'l.source_id = :sid'; $params['sid'] = (int) $_GET['source_id']; }
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $cols = ['l.lead_no', 'c.name', 'l.name', 'c.phone', 'l.phone', 'l.requirement', 'l.remarks', 'l.address', 'l.city', 'st.name', 'l.contact_person', 'l.contact_mobile', 'l.email'];
        $or = [];
        foreach ($cols as $i => $c) { $or[] = "$c LIKE :q$i"; $params["q$i"] = "%$q%"; }
        $where[] = '(' . implode(' OR ', $or) . ')';
    }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $perPage = max(1, min(200, (int) ($_GET['per_page'] ?? 25)));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $offset = ($page - 1) * $perPage;
    $total = (int) db_value('SELECT COUNT(*) FROM (' . LEAD_SELECT . "$whereSql) x", $params);
    $rows = db_all(LEAD_SELECT . "$whereSql ORDER BY l.lead_date DESC, l.id DESC LIMIT $perPage OFFSET $offset", $params);
    $counts = ['Hot' => 0, 'Cold' => 0];
    foreach (db_all("SELECT temperature, COUNT(*) AS n FROM leads WHERE status = 'Open' GROUP BY temperature") as $r) $counts[$r['temperature']] = (int) $r['n'];
    return ['data' => array_map('lead_cast', $rows), 'total' => $total, 'page' => $page, 'per_page' => $perPage, 'open_counts' => $counts];
}

function lead_find(int $id): array
{
    $r = db_one(LEAD_SELECT . ' WHERE l.id = :id', ['id' => $id]);
    if (!$r) throw new ApiError('Lead not found. It may have been deleted.', 404);
    $r = lead_cast($r);
    $r['followups'] = array_map(function ($f) {
        $f['id'] = (int) $f['id'];
        $f['followup_by'] = $f['followup_by'] === null ? null : (int) $f['followup_by'];
        $f['next_time'] = $f['next_time'] ? substr($f['next_time'], 0, 5) : null;
        return $f;
    }, db_all('SELECT f.*, u.name AS followup_by_name FROM lead_followups f LEFT JOIN users u ON u.id = f.followup_by WHERE f.lead_id = :l ORDER BY f.followup_date DESC, f.id DESC', ['l' => $id]));
    return $r;
}

// A mobile number: exactly 10 digits (spaces allowed while typing, removed when saved).
function mobile10($v, string $key, array &$errors): ?string
{
    $v = preg_replace('/\s+/', '', trim((string) $v));
    if ($v === '') return null;
    if (!preg_match('/^\d{10}$/', $v)) { $errors[$key] = 'Enter a 10-digit mobile number.'; return null; }
    return $v;
}

function clean_text($v, int $max, string $key, array &$errors): ?string
{
    $v = trim((string) ($v ?? ''));
    if (mb_strlen($v) > $max) $errors[$key] = "Keep this under $max characters.";
    return $v === '' ? null : $v;
}

function lead_save(?int $id, array $in): array
{
    $existing = $id !== null ? lead_find($id) : null;
    $errors = [];
    $h = [];
    $h['lead_date'] = trim((string) ($in['lead_date'] ?? ''));
    if (!valid_date($h['lead_date'])) $errors['lead_date'] = 'Enter the lead date.';
    elseif ($h['lead_date'] > date('Y-m-d')) $errors['lead_date'] = 'The date cannot be in the future.';
    $h['customer_type'] = in_array($in['customer_type'] ?? '', ['Existing', 'New'], true) ? $in['customer_type'] : '';
    if ($h['customer_type'] === '') $errors['customer_type'] = 'Choose Existing or New customer.';
    if ($h['customer_type'] === 'Existing') {
        $cid = (int) ($in['customer_id'] ?? 0);
        $c = $cid ? db_one('SELECT id, name, is_active FROM customers WHERE id = :id', ['id' => $cid]) : null;
        if (!$c) $errors['customer_id'] = 'Choose the customer.';
        elseif (!$c['is_active'] && (!$existing || $existing['customer_id'] !== $cid)) $errors['customer_id'] = "{$c['name']} is inactive.";
        $h['customer_id'] = $cid ?: null;
        $h['name'] = $h['phone'] = $h['address'] = null;
    } else {
        // A new customer stays on the lead until an order is made (then it is added to Customers).
        $h['customer_id'] = $existing && $existing['customer_type'] === 'New' ? $existing['customer_id'] : null;
        $h['name'] = clean_text($in['name'] ?? '', 150, 'name', $errors);
        if ($h['customer_type'] === 'New' && $h['name'] === null) $errors['name'] = 'Enter the name.';
        $h['phone'] = mobile10($in['phone'] ?? '', 'phone', $errors);
        $h['address'] = clean_text($in['address'] ?? '', 255, 'address', $errors);
    }
    $h['city'] = clean_text($in['city'] ?? '', 80, 'city', $errors);
    $stid = (int) ($in['state_id'] ?? 0);
    if ($stid && !db_value('SELECT COUNT(*) FROM states WHERE id = :id', ['id' => $stid])) $errors['state_id'] = 'Choose a valid state.';
    $h['state_id'] = $stid ?: null;
    $h['contact_person'] = clean_text($in['contact_person'] ?? '', 100, 'contact_person', $errors);
    $h['contact_mobile'] = mobile10($in['contact_mobile'] ?? '', 'contact_mobile', $errors);
    $h['email'] = clean_text($in['email'] ?? '', 150, 'email', $errors);
    if ($h['email'] !== null && !isset($errors['email']) && !filter_var($h['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Enter a valid email address.';
    $sid = (int) ($in['source_id'] ?? 0);
    if ($sid && !db_value('SELECT COUNT(*) FROM lead_sources WHERE id = :id', ['id' => $sid])) $errors['source_id'] = 'Choose a valid source.';
    $h['source_id'] = $sid ?: null;
    $h['requirement'] = clean_text($in['requirement'] ?? '', 255, 'requirement', $errors);
    if ($h['requirement'] === null) $errors['requirement'] = 'Enter the requirement.';
    $h['temperature'] = in_array($in['temperature'] ?? 'Hot', ['Hot', 'Cold'], true) ? ($in['temperature'] ?? 'Hot') : '';
    if ($h['temperature'] === '') $errors['temperature'] = 'Choose the lead type: Hot or Cold.';
    $h['remarks'] = clean_text($in['remarks'] ?? '', 500, 'remarks', $errors);
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);

    // Hot leads are due for follow-up: the first time on the lead date; when a Cold lead turns Hot, from today.
    if ($h['temperature'] === 'Hot' && (!$existing || $existing['status'] === 'Open') && (!$existing || $existing['next_followup_date'] === null)) {
        $h['next_followup_date'] = $existing ? date('Y-m-d') : $h['lead_date'];
    }
    $h['updated_at'] = now();
    if ($id === null) {
        $h['lead_no'] = next_doc_no('leads', 'LD', 'lead_no');
        $h['status'] = 'Open';
        $h['created_by'] = current_user()['id'] ?? null;
        $h['created_at'] = now();
        $cols = array_keys($h);
        db()->prepare('INSERT INTO leads (' . implode(', ', $cols) . ') VALUES (:' . implode(', :', $cols) . ')')->execute($h);
        $id = (int) db()->lastInsertId();
        $msg = "Lead {$h['lead_no']} added." . ($h['temperature'] === 'Hot' ? ' It is due for follow-up.' : '');
    } else {
        $set = implode(', ', array_map(fn ($c) => "$c = :$c", array_keys($h)));
        db()->prepare("UPDATE leads SET $set WHERE id = :id")->execute($h + ['id' => $id]);
        $msg = "Lead {$existing['lead_no']} updated.";
    }
    return ['data' => lead_find($id), 'message' => $msg];
}

function lead_delete(int $id): array
{
    $l = lead_find($id);
    if ($l['followup_count'] > 0 || $l['order_id']) throw new ApiError("Lead {$l['lead_no']} has follow-ups or an order, so it can't be deleted. Mark it Fail with a follow-up instead.", 409);
    db()->prepare('DELETE FROM leads WHERE id = :id')->execute(['id' => $id]);
    return ['message' => "Lead {$l['lead_no']} deleted."];
}

function followup_save(int $leadId, array $in): array
{
    $l = lead_find($leadId);
    if ($l['status'] !== 'Open') throw new ApiError("Lead {$l['lead_no']} is already closed ({$l['status']}).", 409);
    $errors = [];
    $f = [];
    $f['followup_date'] = trim((string) ($in['followup_date'] ?? ''));
    if (!valid_date($f['followup_date'])) $errors['followup_date'] = 'Enter the follow-up date.';
    elseif ($f['followup_date'] > date('Y-m-d')) $errors['followup_date'] = 'The date cannot be in the future.';
    elseif ($f['followup_date'] < $l['lead_date']) $errors['followup_date'] = 'Cannot be before the lead date.';
    $f['status'] = in_array($in['status'] ?? '', FOLLOWUP_STATUSES, true) ? $in['status'] : '';
    if ($f['status'] === '') $errors['status'] = 'Choose the status.';
    $f['next_date'] = null;
    $f['next_time'] = null;
    if ($f['status'] === 'Follow Up Again') {
        $nd = trim((string) ($in['next_date'] ?? ''));
        if (!valid_date($nd)) $errors['next_date'] = 'Enter the next follow-up date.';
        elseif (!isset($errors['followup_date']) && $nd < $f['followup_date']) $errors['next_date'] = 'Cannot be before the follow-up date.';
        else $f['next_date'] = $nd;
        $nt = trim((string) ($in['next_time'] ?? ''));
        if ($nt !== '') {
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $nt)) $errors['next_time'] = 'Enter a time like 14:30.';
            else $f['next_time'] = "$nt:00";
        }
    }
    $by = (int) ($in['followup_by'] ?? 0);
    if (!$by) $errors['followup_by'] = 'Choose who followed up.';
    elseif (!db_value('SELECT COUNT(*) FROM users WHERE id = :id', ['id' => $by])) $errors['followup_by'] = 'Choose a valid user.';
    $f['followup_by'] = $by ?: null;
    $f['remarks'] = clean_text($in['remarks'] ?? '', 500, 'remarks', $errors);
    if ($errors) throw new ApiError('Please fix the highlighted fields.', 422, $errors);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $f['lead_id'] = $leadId;
        $f['created_at'] = $f['updated_at'] = now();
        $cols = array_keys($f);
        $pdo->prepare('INSERT INTO lead_followups (' . implode(', ', $cols) . ') VALUES (:' . implode(', :', $cols) . ')')->execute($f);
        if ($f['status'] === 'Follow Up Again') {
            // Following up again keeps (or makes) the lead Hot so it comes back on the next date.
            $pdo->prepare("UPDATE leads SET next_followup_date = :d, next_followup_time = :t, temperature = 'Hot', updated_at = :u WHERE id = :id")
                ->execute(['d' => $f['next_date'], 't' => $f['next_time'], 'u' => now(), 'id' => $leadId]);
            $msg = "Next follow-up for {$l['lead_no']} on " . date('d-m-Y', strtotime($f['next_date'])) . ($f['next_time'] ? ' at ' . substr($f['next_time'], 0, 5) : '') . '.';
        } else {
            $status = $f['status'];
            $pdo->prepare('UPDATE leads SET status = :s, next_followup_date = NULL, next_followup_time = NULL, updated_at = :u WHERE id = :id')
                ->execute(['s' => $status, 'u' => now(), 'id' => $leadId]);
            if ($status === 'Success') {
                $msg = "Lead {$l['lead_no']}: Success.";
                if (!$l['customer_id']) {
                    lead_make_customer($l);
                    $msg .= " {$l['display_name']} added to Customers.";
                }
                $msg .= ' You can now create the order.';
            } else {
                $msg = "Lead {$l['lead_no']} marked Fail.";
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['data' => lead_find($leadId), 'message' => $msg];
}

// Undo the latest follow-up: the lead goes back to how it was before it.
function followup_delete(int $leadId, int $fid): array
{
    $l = lead_find($leadId);
    $latest = $l['followups'][0] ?? null;
    if (!$latest || $latest['id'] !== $fid) throw new ApiError('Only the latest follow-up can be removed.', 409);
    if ($l['order_id']) throw new ApiError("An order ({$l['order_no']}) was already made from this lead.", 409);
    $prev = $l['followups'][1] ?? null;
    $next = $prev && $prev['status'] === 'Follow Up Again' ? [$prev['next_date'], $prev['next_time'] ? $prev['next_time'] . ':00' : null]
        : [$l['temperature'] === 'Hot' ? $l['lead_date'] : null, null];
    db()->prepare('DELETE FROM lead_followups WHERE id = :id')->execute(['id' => $fid]);
    db()->prepare("UPDATE leads SET status = 'Open', next_followup_date = :d, next_followup_time = :t, updated_at = :u WHERE id = :id")
        ->execute(['d' => $next[0], 't' => $next[1], 'u' => now(), 'id' => $leadId]);
    return ['data' => lead_find($leadId), 'message' => 'Follow-up removed.'];
}

// The customer to put on the order. A new lead's customer is added to Customers the first time.
function lead_customer(int $id): array
{
    $l = lead_find($id);
    if (!$l['customer_id']) {
        lead_make_customer($l);
        $l = lead_find($id);
        $msg = "{$l['display_name']} added to Customers.";
    }
    $c = db_one('SELECT id, name, address FROM customers WHERE id = :id', ['id' => $l['customer_id']]);
    return ['data' => ['lead' => $l, 'customer' => ['id' => (int) $c['id'], 'name' => $c['name'], 'address' => $c['address']]], 'message' => $msg ?? null];
}

// Adds a new lead's customer to Customers (with all the lead's contact details) and links it to the lead.
function lead_make_customer(array $l): int
{
    $code = master_next_code(entity('customers'));
    db()->prepare('INSERT INTO customers (code, name, phone, email, contact_person, contact_mobile, city, state_id, address, is_active, created_at, updated_at)
                       VALUES (:c, :n, :p, :e, :cp, :cm, :ci, :st, :a, 1, :t, :u)')
            ->execute(['c' => $code, 'n' => $l['name'], 'p' => $l['phone'], 'e' => $l['email'], 'cp' => $l['contact_person'], 'cm' => $l['contact_mobile'],
                       'ci' => $l['city'], 'st' => $l['state_id'], 'a' => $l['address'], 't' => now(), 'u' => now()]);
        $cid = (int) db()->lastInsertId();
        db()->prepare('UPDATE leads SET customer_id = :c, updated_at = :u WHERE id = :id')->execute(['c' => $cid, 'u' => now(), 'id' => $l['id']]);
        return $cid;
}

// Hot open leads due for follow-up.
function followups_due(): array
{
    $today = date('Y-m-d');
    $tab = $_GET['tab'] ?? 'today';
    $base = "l.status = 'Open' AND l.temperature = 'Hot' AND l.next_followup_date IS NOT NULL";
    $conds = ['overdue' => 'l.next_followup_date < :d', 'today' => 'l.next_followup_date = :d', 'upcoming' => 'l.next_followup_date > :d'];
    $counts = ['all' => (int) db_value("SELECT COUNT(*) FROM leads WHERE status = 'Open'")];
    foreach ($conds as $k => $c) $counts[$k] = (int) db_value("SELECT COUNT(*) FROM leads l WHERE $base AND $c", ['d' => $today]);
    if ($tab !== 'all' && !isset($conds[$tab])) $tab = 'today';
    $params = $tab === 'all' ? [] : ['d' => $today];
    $where = $tab === 'all' ? "l.status = 'Open'" : "$base AND {$conds[$tab]}";
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $or = [];
        foreach (['l.lead_no', 'c.name', 'l.name', 'c.phone', 'l.phone', 'l.requirement', 'l.city', 'l.contact_person', 'l.contact_mobile'] as $i => $c) { $or[] = "$c LIKE :q$i"; $params["q$i"] = "%$q%"; }
        $where .= ' AND (' . implode(' OR ', $or) . ')';
    }
    $rows = db_all(LEAD_SELECT . " WHERE $where ORDER BY l.next_followup_date IS NULL, l.next_followup_date, l.next_followup_time IS NULL, l.next_followup_time, l.id LIMIT 500", $params);
    return ['data' => array_map('lead_cast', $rows), 'counts' => $counts, 'tab' => $tab, 'today' => $today];
}

// Follow Up Logs: every follow-up entered, with its lead's details.
function followup_logs(): array
{
    $where = [];
    $params = [];
    if (valid_date($_GET['from'] ?? '')) { $where[] = 'f.followup_date >= :f'; $params['f'] = $_GET['from']; }
    if (valid_date($_GET['to'] ?? '')) { $where[] = 'f.followup_date <= :t'; $params['t'] = $_GET['to']; }
    if (in_array($_GET['status'] ?? '', FOLLOWUP_STATUSES, true)) { $where[] = 'f.status = :st'; $params['st'] = $_GET['status']; }
    if (!empty($_GET['followup_by'])) { $where[] = 'f.followup_by = :by'; $params['by'] = (int) $_GET['followup_by']; }
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $or = [];
        foreach (['l.lead_no', 'c.name', 'l.name', 'c.phone', 'l.phone', 'l.requirement', 'f.remarks', 'l.city', 'l.contact_person', 'l.contact_mobile'] as $i => $col) { $or[] = "$col LIKE :q$i"; $params["q$i"] = "%$q%"; }
        $where[] = '(' . implode(' OR ', $or) . ')';
    }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $from = 'FROM lead_followups f JOIN leads l ON l.id = f.lead_id LEFT JOIN customers c ON c.id = l.customer_id
             LEFT JOIN lead_sources s ON s.id = l.source_id LEFT JOIN states st ON st.id = l.state_id LEFT JOIN users u ON u.id = f.followup_by';
    $perPage = max(1, min(200, (int) ($_GET['per_page'] ?? 50)));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $offset = ($page - 1) * $perPage;
    $total = (int) db_value("SELECT COUNT(*) $from$whereSql", $params);
    $rows = db_all("SELECT f.id, f.lead_id, f.followup_date, f.status, f.next_date, f.next_time, f.remarks, u.name AS followup_by_name,
                           l.lead_no, l.requirement, l.temperature, l.status AS lead_status, COALESCE(c.name, l.name) AS display_name,
                           COALESCE(c.phone, l.phone) AS display_phone, COALESCE(l.city, c.city) AS city, st.name AS state_name,
                           l.contact_person, l.contact_mobile, s.name AS source_name
                    $from$whereSql ORDER BY f.followup_date DESC, f.id DESC LIMIT $perPage OFFSET $offset", $params);
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['lead_id'] = (int) $r['lead_id'];
        $r['next_time'] = $r['next_time'] ? substr($r['next_time'], 0, 5) : null;
    }
    unset($r);
    return ['data' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
}
