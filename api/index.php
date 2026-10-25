<?php
// Candelier Management System API - single entry point.
// Called as /api/index.php?r=orders/5  (works on Hostinger without extra rewrite rules)

declare(strict_types=1);

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'api/config.php is missing. Copy config.sample.php to config.php and add your database details.']);
    exit;
}
$GLOBALS['CONFIG'] = require $configFile;
date_default_timezone_set($GLOBALS['CONFIG']['timezone'] ?? 'Asia/Kolkata');

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/stock.php';
require __DIR__ . '/lib/migrate.php';
require __DIR__ . '/lib/migrate_crm.php';
require __DIR__ . '/entities.php';
require __DIR__ . '/handlers/auth.php';
require __DIR__ . '/handlers/masters.php';
require __DIR__ . '/handlers/materials.php';
require __DIR__ . '/handlers/items.php';
require __DIR__ . '/handlers/orders.php';
require __DIR__ . '/handlers/production.php';
require __DIR__ . '/handlers/boq.php';
require __DIR__ . '/handlers/stores.php';
require __DIR__ . '/handlers/inventory.php';
require __DIR__ . '/handlers/crm.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$route  = trim((string) ($_GET['r'] ?? ''), '/');
$parts  = $route === '' ? [] : explode('/', $route);
$area   = array_shift($parts);

try {
    migrate_material_categories();
    migrate_production_status();
    migrate_dispatch_fields();
    migrate_client_categories();
    migrate_crm();
    if ($area === 'auth') { auth_route($method, $parts); exit; }
    if ($area === 'health') { db_value('SELECT 1'); json_out(['ok' => true, 'time' => now()]); exit; }

    $me = require_login();
    if ($me['role'] === 'Viewer' && $method !== 'GET') {
        throw new ApiError('You have view-only access. Ask an administrator if you need to make changes.', 403);
    }
    if (in_array($area, ['masters', 'lookup'], true) && ($parts[0] ?? '') === 'users' && $me['role'] !== 'Admin') {
        throw new ApiError('Only administrators can manage users.', 403);
    }

    switch ($area) {
        case 'masters':         masters_route($method, $parts); break;
        case 'lookup':          lookup_route($method, $parts); break;
        case 'materials':       materials_route($method, $parts); break;
        case 'variants':        variants_route($method, $parts); break;
        case 'item-fields':     item_fields_route($method); break;
        case 'uploads':         if ($method !== 'POST') throw new ApiError('Not found.', 404); json_out(($_GET['kind'] ?? '') === 'drawing' ? upload_drawing() : upload_image(), 201); break;
        case 'production':      production_route($method, $parts); break;
        case 'orders':          orders_route($method, $parts); break;
        case 'order-items':     order_items_route($method, $parts); break;
        case 'boq':             boq_route($method, $parts); break;
        case 'docs':            docs_route($method, $parts); break;
        case 'opening-stock':   opening_route($method); break;
        case 'inventory':       inventory_route($method, $parts); break;
        case 'users-list':
            // Names of users for "Order By" (every signed-in user may read)
            $rows = db_all('SELECT id, name, is_active FROM users ORDER BY name');
            foreach ($rows as &$r) { $r['id'] = (int) $r['id']; $r['is_active'] = (bool) $r['is_active']; }
            json_out(['data' => $rows]);
            break;
        case 'contacts': contacts_route($method, $parts); break;
        case 'crm-followups': crm_followups_route($method, $parts); break;
        case 'leads':           leads_route($method, $parts); break;
        case 'followup-logs':   if ($method !== 'GET') throw new ApiError('Not found.', 404); json_out(followup_logs()); break;
        case 'follow-ups':      if ($method !== 'GET') throw new ApiError('Not found.', 404); json_out(followups_due()); break;
        case 'dispatches':      if ($method !== 'GET') throw new ApiError('Not found.', 404); json_out(dispatch_list()); break;
        case 'low-stock':       if ($method !== 'GET') throw new ApiError('Not found.', 404); json_out(low_stock()); break;
        case 'dashboard':       if ($method !== 'GET') throw new ApiError('Not found.', 404); json_out(dashboard()); break;
        default: throw new ApiError('Not found.', 404);
    }
} catch (ApiError $e) {
    $out = ['error' => $e->getMessage()];
    if ($e->fields) $out['fields'] = $e->fields;
    json_out($out, $e->status);
} catch (Throwable $e) {
    error_log('[candelier-api] ' . $e);
    $msg = !empty($GLOBALS['CONFIG']['debug']) ? $e->getMessage() : 'Something went wrong on the server. Please try again, and contact the administrator if it keeps happening.';
    json_out(['error' => $msg], 500);
}
