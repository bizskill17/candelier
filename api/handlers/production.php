<?php
// Production membership is derived from saved issues, never from issue-line joins.
// This keeps one row per item and automatically reflects issue edits/deletions.
function production_route(string $method, array $parts): void
{
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
    return "o.status <> 'Cancelled' AND d.id IS NULL AND i.production_status = :status
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
