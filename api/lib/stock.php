<?php
// Stock, specification ("variant") and booking helpers.
//
// A variant is one material + one set of specification values.
// Stock in hand = SUM(stock_moves.quantity) for the variant.
//
// Bookings: + book, - release. For an order item and a variant:
//   consumed = total issued to the item
//   open     = max(0, booked - consumed)   (0 once the item is dispatched or its order cancelled)
// Booked (All Orders) = sum of open over every order item.
// Available to Book   = stock in hand - Booked (All Orders).

function fmt_qty($n): string
{
    $s = number_format((float) $n, 3, '.', '');
    return rtrim(rtrim($s, '0'), '.');
}

function valid_date(?string $d): bool
{
    if (!$d || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return false;
    [$y, $m, $day] = array_map('intval', explode('-', $d));
    return checkdate($m, $day, $y);
}

// Next running number like MIN-0001.
function next_doc_no(string $table, string $prefix, string $col): string
{
    $n = (int) db_value("SELECT COUNT(*) FROM $table") + 1;
    do {
        $no = $prefix . '-' . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
        $n++;
    } while (db_value("SELECT COUNT(*) FROM $table WHERE $col = :n", ['n' => $no]));
    return $no;
}

function qty_ok($v): bool
{
    return is_numeric($v) && (float) $v > 0;
}

// ---------------------------------------------------------------------------
// Variants

function spec_norm(string $v): string
{
    return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $v)));
}

function material_fields(int $materialId): array
{
    return array_map(function ($f) {
        $f['id'] = (int) $f['id'];
        $f['sort_order'] = (int) $f['sort_order'];
        return $f;
    }, db_all('SELECT id, name, sort_order FROM material_spec_fields WHERE material_id = :m ORDER BY sort_order, id', ['m' => $materialId]));
}

// spec_key and spec_text for a set of values [field_id => value] in field order.
function spec_build(array $fields, array $values): array
{
    $keys = [];
    $texts = [];
    foreach ($fields as $f) {
        $v = trim(preg_replace('/\s+/u', ' ', (string) ($values[$f['id']] ?? $values[(string) $f['id']] ?? '')));
        $keys[] = spec_norm($v);
        if ($v !== '') $texts[] = $v;
    }
    return [implode('|', $keys), implode(' · ', $texts)];
}

// Find the variant for a material and its values; create it when $create is true. Returns id or null.
function variant_resolve(int $materialId, array $values, bool $create = true): ?int
{
    $fields = material_fields($materialId);
    [$key, $text] = spec_build($fields, $values);
    $id = db_value('SELECT id FROM material_variants WHERE material_id = :m AND spec_key = :k', ['m' => $materialId, 'k' => $key]);
    if ($id) return (int) $id;
    if (!$create) return null;
    db()->prepare('INSERT INTO material_variants (material_id, spec_key, spec_text, created_at, updated_at) VALUES (:m, :k, :t, :c, :u)')
        ->execute(['m' => $materialId, 'k' => $key, 't' => $text, 'c' => now(), 'u' => now()]);
    $id = (int) db()->lastInsertId();
    $ins = db()->prepare('INSERT INTO material_variant_values (variant_id, spec_field_id, value, created_at, updated_at) VALUES (:v, :f, :val, :c, :u)');
    foreach ($fields as $f) {
        $v = trim(preg_replace('/\s+/u', ' ', (string) ($values[$f['id']] ?? $values[(string) $f['id']] ?? '')));
        if ($v !== '') $ins->execute(['v' => $id, 'f' => $f['id'], 'val' => $v, 'c' => now(), 'u' => now()]);
    }
    return $id;
}

// Recalculate spec_key / spec_text of all variants of a material (after its fields change).
function variant_rekey(int $materialId): void
{
    $fields = material_fields($materialId);
    foreach (db_all('SELECT id FROM material_variants WHERE material_id = :m', ['m' => $materialId]) as $v) {
        $vals = [];
        foreach (db_all('SELECT spec_field_id, value FROM material_variant_values WHERE variant_id = :v', ['v' => $v['id']]) as $r) {
            $vals[(int) $r['spec_field_id']] = $r['value'];
        }
        [$key, $text] = spec_build($fields, $vals);
        db()->prepare('UPDATE material_variants SET spec_key = :k, spec_text = :t WHERE id = :id')->execute(['k' => $key, 't' => $text, 'id' => $v['id']]);
    }
}

// Values of variants: [variant_id => [field_id => value]]
function variant_values(array $ids): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return [];
    $out = array_fill_keys($ids, []);
    foreach (db_all('SELECT variant_id, spec_field_id, value FROM material_variant_values WHERE variant_id IN (' . implode(',', $ids) . ')') as $r) {
        $out[(int) $r['variant_id']][(int) $r['spec_field_id']] = $r['value'];
    }
    return $out;
}

// Validate one specification line from a form: { material_id, values: {field_id: value} }.
// Returns [material row, values] or adds errors.
function spec_line_check(array $row, string $prefix, array &$errors, array $allowInactiveMaterials = []): ?array
{
    $mid = (int) ($row['material_id'] ?? 0);
    $m = $mid ? db_one('SELECT id, name, unit, is_active FROM materials WHERE id = :id', ['id' => $mid]) : null;
    if (!$m) {
        $errors["$prefix.material_id"] = 'Choose a material.';
        return null;
    }
    if (!$m['is_active'] && !in_array($mid, $allowInactiveMaterials, true)) {
        $errors["$prefix.material_id"] = "{$m['name']} is inactive.";
        return null;
    }
    $values = is_array($row['values'] ?? null) ? $row['values'] : [];
    $fields = material_fields($mid);
    if ($fields) {
        $any = false;
        foreach ($fields as $f) {
            $v = trim((string) ($values[$f['id']] ?? $values[(string) $f['id']] ?? ''));
            if (mb_strlen($v) > 100) { $errors["$prefix.values"] = "{$f['name']} is too long."; return null; }
            if ($v !== '') $any = true;
        }
        if (!$any) {
            $errors["$prefix.values"] = 'Fill the specification.';
            return null;
        }
    }
    return [$m, $values];
}

// ---------------------------------------------------------------------------
// Ledger

function stock_post(string $refType, int $refId, string $refNo, string $date, array $moves): void
{
    stock_clear($refType, $refId);
    $ins = db()->prepare('INSERT INTO stock_moves (move_date, variant_id, quantity, ref_type, ref_id, ref_no, created_at) VALUES (:d, :v, :q, :rt, :ri, :rn, :c)');
    foreach ($moves as [$variantId, $qty]) {
        if (round((float) $qty, 3) == 0.0) continue;
        $ins->execute(['d' => $date, 'v' => $variantId, 'q' => $qty, 'rt' => $refType, 'ri' => $refId, 'rn' => $refNo, 'c' => now()]);
    }
}

function stock_clear(string $refType, int $refId): void
{
    db()->prepare('DELETE FROM stock_moves WHERE ref_type = :t AND ref_id = :i')->execute(['t' => $refType, 'i' => $refId]);
}

// Stock in hand per variant: [id => qty]. Optionally ignoring the moves of documents [[type, id], ...].
function stock_balances(array $ids, array $except = []): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return [];
    $out = array_fill_keys($ids, 0.0);
    $sql = 'SELECT variant_id, SUM(quantity) AS q FROM stock_moves WHERE variant_id IN (' . implode(',', $ids) . ')';
    $params = [];
    foreach ($except as $i => [$t, $rid]) {
        $sql .= " AND NOT (ref_type = :et$i AND ref_id = :ei$i)";
        $params["et$i"] = $t;
        $params["ei$i"] = $rid;
    }
    foreach (db_all("$sql GROUP BY variant_id", $params) as $r) {
        $out[(int) $r['variant_id']] = round((float) $r['q'], 3);
    }
    return $out;
}

// Would replacing the moves of documents $except with $newMoves [[variant, signed qty]] take any stock below zero?
// Returns [variant_id => message].
function stock_check(array $except, array $newMoves, array $alsoIds = []): array
{
    $delta = [];
    foreach ($newMoves as [$v, $q]) $delta[(int) $v] = ($delta[(int) $v] ?? 0) + $q;
    foreach ($alsoIds as $v) $delta[(int) $v] = $delta[(int) $v] ?? 0;
    $before = stock_balances(array_keys($delta), $except);
    $out = [];
    foreach ($delta as $v => $q) {
        $b = $before[$v] ?? 0.0;
        if (round($b + $q, 3) < 0) {
            $info = variant_label($v);
            $out[$v] = $b <= 0 ? "No {$info['label']} in stock." : 'Only ' . fmt_qty($b) . " {$info['unit']} of {$info['label']} in stock.";
        }
    }
    return $out;
}

function variant_label(int $variantId): array
{
    $r = db_one('SELECT v.spec_text, m.name, m.unit FROM material_variants v JOIN materials m ON m.id = v.material_id WHERE v.id = :id', ['id' => $variantId]);
    return ['label' => $r ? trim($r['name'] . ($r['spec_text'] !== '' ? ' · ' . $r['spec_text'] : '')) : 'this material', 'unit' => $r['unit'] ?? ''];
}

// ---------------------------------------------------------------------------
// Bookings and consumption

// Per item and variant: booked, consumed, open. Plus booked_all per variant.
// $variantIds = null for all variants.
function booking_figures(?array $variantIds = null): array
{
    $filter = '';
    if ($variantIds !== null) {
        $ids = array_values(array_unique(array_map('intval', $variantIds)));
        if (!$ids) return ['items' => [], 'all' => []];
        $filter = ' AND x.variant_id IN (' . implode(',', $ids) . ')';
    }
    $items = [];
    foreach (db_all("SELECT x.order_item_id, x.variant_id, SUM(x.quantity) AS q FROM bookings x WHERE 1 = 1$filter GROUP BY x.order_item_id, x.variant_id") as $r) {
        $items[(int) $r['order_item_id']][(int) $r['variant_id']] = ['booked' => round((float) $r['q'], 3), 'consumed' => 0.0, 'open' => 0.0];
    }
    foreach (db_all("SELECT h.order_item_id, x.variant_id, SUM(x.quantity) AS q FROM material_issue_items x JOIN material_issues h ON h.id = x.issue_id WHERE 1 = 1$filter GROUP BY h.order_item_id, x.variant_id") as $r) {
        $i = (int) $r['order_item_id']; $v = (int) $r['variant_id'];
        $items[$i][$v] ??= ['booked' => 0.0, 'consumed' => 0.0, 'open' => 0.0];
        $items[$i][$v]['consumed'] = round((float) $r['q'], 3);
    }
    // Items whose bookings no longer count: dispatched, or order cancelled
    $closed = [];
    if ($items) {
        foreach (db_all('SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
                          WHERE oi.id IN (' . implode(',', array_keys($items)) . ")
                            AND (o.status = 'Cancelled' OR EXISTS (SELECT 1 FROM dispatches d WHERE d.order_item_id = oi.id))") as $r) {
            $closed[(int) $r['id']] = true;
        }
    }
    $all = [];
    foreach ($items as $i => &$vs) {
        foreach ($vs as $v => &$f) {
            $f['open'] = isset($closed[$i]) ? 0.0 : max(0.0, round($f['booked'] - $f['consumed'], 3));
            $all[$v] = round(($all[$v] ?? 0) + $f['open'], 3);
        }
    }
    unset($vs, $f);
    return ['items' => $items, 'all' => $all];
}

// Live figures for variants, optionally for one order item:
// [variant_id => in_stock, booked_all, available, booked_item, consumed]
function variant_stats(array $variantIds, ?int $orderItemId = null): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $variantIds))));
    $stock = stock_balances($ids);
    $bf = booking_figures($ids);
    $out = [];
    foreach ($ids as $v) {
        $all = $bf['all'][$v] ?? 0.0;
        $f = $orderItemId ? ($bf['items'][$orderItemId][$v] ?? null) : null;
        $out[$v] = [
            'in_stock'    => $stock[$v] ?? 0.0,
            'booked_all'  => $all,
            'available'   => round(($stock[$v] ?? 0) - $all, 3),
            'booked_item' => $f['open'] ?? 0.0,
            'consumed'    => $f['consumed'] ?? 0.0,
        ];
    }
    return $out;
}
