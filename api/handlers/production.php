<?php
// Production membership is derived from saved issues, never from issue-line joins.
// This keeps one row per item and automatically reflects issue edits/deletions.
function production_route(string $method, array $parts): void
{
    if ($method === 'PATCH' && $parts === ['bulk']) { json_out(production_bulk_update(request_body())); return; }
    if ($method === 'GET' && !$parts) { json_out(production_list()); return; }
    if ($method === 'GET' && $parts === ['filters']) { json_out(production_filters()); return; }
    throw new ApiError('Not found.', 404);
}

function production_status($value): string
{
    if (!in_array($value, ['In Progress', 'Complete'], true)) throw new ApiError('Choose In Progress or Complete.', 422);
    return $value;
}

function production_scope(): string
{
    return order_visibility_sql()." AND o.status <> 'Cancelled' AND d.id IS NULL AND i.production_status = :status
            AND EXISTS (SELECT 1 FROM material_issues mi WHERE mi.order_item_id = i.id)";
}

function production_filters(): array
{
    $params = ['status' => production_status($_GET['status'] ?? 'In Progress')];
    $join = ' FROM order_items i JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = o.customer_id LEFT JOIN dispatches d ON d.order_item_id = i.id WHERE ' . production_scope();
    return ['data' => [
        'customers' => db_all('SELECT DISTINCT c.id, c.name' . $join . ' ORDER BY c.name, c.id', $params),
        'areas' => db_all("SELECT DISTINCT o.customer_id, i.area AS name" . $join . " AND i.area IS NOT NULL AND TRIM(i.area) <> '' ORDER BY name", $params),
    ]];
}

function production_list(): array
{
    $params = ['status' => production_status($_GET['status'] ?? 'In Progress')];
    $where = production_scope();
    if (isset($_GET['customer_id']) && $_GET['customer_id'] !== '') {
        $where .= ' AND o.customer_id = :customer';
        $params['customer'] = (int) $_GET['customer_id'];
    }
    $area = trim((string) ($_GET['area'] ?? ''));
    if ($area !== '') { $where .= ' AND i.area = :area'; $params['area'] = $area; }
    $q = trim((string) ($_GET['q'] ?? ''));
    if ($q !== '') {
        $where .= ' AND (o.order_no LIKE :q1 OR c.name LIKE :q2 OR o.project_name LIKE :q3 OR i.area LIKE :q4 OR i.remarks LIKE :q5
                    OR EXISTS (SELECT 1 FROM order_item_values v WHERE v.order_item_id = i.id AND v.value LIKE :q6))';
        for ($k = 1; $k <= 6; $k++) $params["q$k"] = "%$q%";
    }
    $total = (int) db_value('SELECT COUNT(*) FROM (' . ITEM_SELECT . " WHERE $where) eligible", $params);
    $pages = max(1, (int) ceil($total / 20));
    $page = min($pages, max(1, (int) ($_GET['page'] ?? 1)));
    $offset = ($page - 1) * 20;
    $rows = db_all(ITEM_SELECT . " WHERE $where ORDER BY o.delivery_date IS NULL, o.delivery_date, o.order_date, o.id, i.line_no LIMIT 20 OFFSET $offset", $params);
    return ['data' => items_cast($rows), 'total' => $total, 'page' => $page, 'pages' => $pages, 'per_page' => 20];
}

function production_set_status(int $id, array $in): array
{
    require_roles(['Admin','Store']);
    if(app_role()==='Store'&&($in['status']??'')!=='Complete')throw new ApiError('Only Admin may reverse production completion.',403);
    $status = production_status($in['status'] ?? null);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        if (!db_one('SELECT id FROM order_items WHERE id = :i FOR UPDATE', ['i' => $id])) throw new ApiError('Order item not found.', 404);
        $item = item_find($id);
        if ($item['dispatch_id']) throw new ApiError('Dispatched items cannot change production status.', 409);
        if ($item['order_status'] === 'Cancelled') throw new ApiError('This order is cancelled.', 409);
        if (!db_value('SELECT COUNT(*) FROM material_issues WHERE order_item_id = :i', ['i' => $id])) throw new ApiError('Save a Material Issue before updating production status.', 409);
        $pdo->prepare('UPDATE order_items SET production_status = :s, updated_at = :t WHERE id = :i')->execute(['s' => $status, 't' => now(), 'i' => $id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['data' => item_find($id), 'message' => $status === 'Complete' ? 'Item moved to Ready to Dispatch.' : 'Item moved to Production In Progress.'];
}

// Save the entire edited set atomically. Only changed fields are written.
function production_bulk_update(array $in): array
{
    require_roles(['Admin','Store']);
    $changes = $in['changes'] ?? null;
    if (!is_array($changes) || !$changes || count($changes) > 200) throw new ApiError('Update between 1 and 200 items at a time.', 422);
    $seen = [];
    foreach ($changes as $row) {
        if (!is_array($row) || !ctype_digit((string) ($row['id'] ?? '')) || (int) $row['id'] < 1) throw new ApiError('Choose a valid order item.', 422);
        if(app_role()==='Store'&&(array_key_exists('remarks',$row)||($row['status']??'')!=='Complete'))throw new ApiError('Store may complete production; only Admin may correct remarks or reverse a status.',403);
        $id = (int) $row['id'];
        if (isset($seen[$id])) throw new ApiError('Each order item can only appear once.', 422);
        if (!array_key_exists('status', $row) && !array_key_exists('remarks', $row)) throw new ApiError('Choose a status or enter remarks to update.', 422);
        if (array_key_exists('status', $row)) production_status($row['status']);
        if (array_key_exists('remarks', $row) && (!is_string($row['remarks']) || mb_strlen($row['remarks']) > 255)) throw new ApiError('Remarks must be text of up to 255 characters.', 422);
        $seen[$id] = $row;
    }
    ksort($seen, SORT_NUMERIC);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($seen as $id => $row) {
            if (!db_one('SELECT id FROM order_items WHERE id = :i FOR UPDATE', ['i' => $id])) throw new ApiError('An order item no longer exists. Refresh and try again.', 409);
            $item = item_find($id);
            if ($item['dispatch_id'] || $item['order_status'] === 'Cancelled') throw new ApiError("{$item['label']} is dispatched or cancelled. No changes were saved.", 409);
            if (!db_value('SELECT COUNT(*) FROM material_issues WHERE order_item_id = :i', ['i' => $id])) throw new ApiError('Every updated item must have a saved Material Issue.', 409);
            foreach (['status' => 'production_status', 'remarks' => 'remarks'] as $field => $column) {
                if (array_key_exists($field, $row) && array_key_exists('expected_' . $field, $row) && (string) ($item[$column] ?? '') !== (string) $row['expected_' . $field]) throw new ApiError("{$item['label']} was changed by another update. Refresh, discard changes and try again. No changes were saved.", 409);
            }
            $sets = ['updated_at = :t'];
            $params = ['i' => $id, 't' => now()];
            if (array_key_exists('status', $row)) { $sets[] = 'production_status = :s'; $params['s'] = $row['status']; }
            if (array_key_exists('remarks', $row)) { $sets[] = 'remarks = :r'; $params['r'] = trim($row['remarks']) === '' ? null : $row['remarks']; }
            $pdo->prepare('UPDATE order_items SET ' . implode(', ', $sets) . ' WHERE id = :i')->execute($params);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    $count = count($seen);
    return ['updated' => $count, 'message' => $count . ($count === 1 ? ' item updated.' : ' items updated.')];
}
