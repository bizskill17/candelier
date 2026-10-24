<?php
// Integration tests run only against an isolated CI/local MySQL database.
declare(strict_types=1);
$dsn = getenv('TEST_DB_DSN');
if (!$dsn || !str_contains($dsn, 'candelier_test')) throw new RuntimeException('TEST_DB_DSN must point to an isolated candelier_test database.');
$GLOBALS['CONFIG'] = ['db' => ['dsn' => $dsn, 'user' => 'root', 'password' => '']];
date_default_timezone_set('Asia/Kolkata');
$root = dirname(__DIR__);
foreach (['lib/http', 'lib/db', 'lib/stock', 'lib/migrate', 'entities', 'handlers/auth', 'handlers/masters', 'handlers/materials', 'handlers/items', 'handlers/orders', 'handlers/boq', 'handlers/stores', 'handlers/inventory'] as $file) require "$root/api/$file.php";
session_begin();
function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); echo "PASS: $message\n"; }
function reject(callable $action, string $message): void {
    try { $action(); } catch (ApiError $e) { check(!db()->inTransaction(), "$message (transaction closed)"); return; }
    throw new RuntimeException("Expected rejection: $message");
}
$pdo = db();
$schema = file_get_contents("$root/database/schema.sql");
$pdo->exec($schema);
// Reconstruct the legacy shape before the migration.
$pdo->exec('ALTER TABLE materials DROP FOREIGN KEY fk_material_category, DROP COLUMN category_id');
$pdo->exec('ALTER TABLE order_items DROP COLUMN boq_draft_json');
$pdo->exec("INSERT INTO customers (code, name) VALUES ('CUS-TEST', 'Test customer')");
$customer = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO suppliers (code, name) VALUES ('SUP-TEST', 'Test supplier')");
$supplier = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO orders (order_no, order_date, customer_id, status) VALUES ('ORD-TEST', :t, :c, 'Open')")->execute(['t' => date('Y-m-d'), 'c' => $customer]);
$order = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO order_items (order_id, line_no, area, boq_status) VALUES (:o, 1, 'Dining', 'Saved')")->execute(['o' => $order]);
$legacyItem = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO order_items (order_id, line_no, area, boq_status) VALUES (:o, 2, 'Living', 'Pending')")->execute(['o' => $order]);
$item = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO materials (name, unit) VALUES ('Crystal', 'Pcs'), ('Wire', 'Mtr')");
$crystal = (int) db_value("SELECT id FROM materials WHERE name = 'Crystal'");
$wire = (int) db_value("SELECT id FROM materials WHERE name = 'Wire'");
$pdo->prepare("INSERT INTO material_spec_fields (material_id, name) VALUES (:m, 'Colour')")->execute(['m' => $crystal]);
$field = (int) $pdo->lastInsertId();
foreach (['Clear', 'Amber'] as $i => $colour) {
    $pdo->prepare('INSERT INTO material_variants (material_id, spec_key, spec_text) VALUES (:m, :k, :t)')->execute(['m' => $crystal, 'k' => strtolower($colour), 't' => $colour]);
    $vid = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO material_variant_values (variant_id, spec_field_id, value) VALUES (:v, :f, :t)')->execute(['v' => $vid, 'f' => $field, 't' => $colour]);
    $pdo->prepare('INSERT INTO boq_lines (order_item_id, line_no, material_id, variant_id, qty_required) VALUES (:i, :n, :m, :v, 5)')->execute(['i' => $legacyItem, 'n' => $i + 1, 'm' => $crystal, 'v' => $vid]);
    $pdo->prepare("INSERT INTO stock_moves (move_date, variant_id, quantity, ref_type, ref_id, ref_no) VALUES (:d, :v, :q, 'opening', :i, 'OPEN-TEST')")->execute(['d' => date('Y-m-d'), 'v' => $vid, 'q' => $i ? 20 : 10, 'i' => $i + 1]);
}
$before = db_all('SELECT id, variant_id, quantity FROM stock_moves ORDER BY id');
$variantIds = array_column(db_all('SELECT id FROM material_variants ORDER BY id'), 'id');
migrate_material_categories();
check($before === db_all('SELECT id, variant_id, quantity FROM stock_moves ORDER BY id'), 'Migration preserves ledger rows and balances');
check((int) db_value('SELECT COUNT(*) FROM materials') === 3, 'Distinct legacy specifications become separate materials');
check((int) db_value('SELECT COUNT(*) FROM materials WHERE category_id IS NULL') === 0, 'Existing materials assigned a category');
check((int) db_value('SELECT COUNT(*) FROM material_variants') === 3, 'Unused material gets its own stock identity');
check((int) db_value('SELECT COUNT(*) FROM boq_lines b JOIN material_variants v ON v.id = b.variant_id WHERE b.material_id <> v.material_id') === 0, 'Legacy BOQ material links match preserved ledger identities');
check(db_value('SELECT boq_status FROM order_items WHERE id = ' . $legacyItem) === 'Final', 'Legacy Saved BOQ becomes Final');
check((int) db_value('SELECT COUNT(*) FROM backup_categories_materials') === 2, 'Migration retains a pre-conversion material snapshot');
migrate_material_categories();
check((int) db_value('SELECT COUNT(*) FROM materials') === 3, 'Migration is idempotent');
$category = (int) db_value('SELECT category_id FROM materials WHERE id = ' . $wire);
$line = ['material_id' => $wire, 'category_id' => $category, 'qty_required' => 5];
$draftLine = ['category_id' => $category, 'material_id' => '', 'qty_required' => ''];
boq_save($item, ['status' => 'Draft', 'lines' => [$draftLine]]);
check(boq_find($item)['lines'][0]['material_id'] === '', 'Draft preserves a category-only incomplete row');
$_GET = [];
check(in_array($item, array_column(pending_boq()['data'], 'id'), true), 'Draft appears in Pending BOQ');
check(in_array($item, array_column(saved_boq()['data'], 'id'), true), 'Draft appears in BOQ Master');
reject(fn () => boq_save($item, ['status' => 'Final', 'lines' => [$draftLine]]), 'Cannot finalise incomplete rows');
reject(fn () => boq_save($item, ['status' => 'Final', 'lines' => [$line, $line]]), 'Cannot finalise duplicate materials');
reject(fn () => boq_save($item, ['status' => 'Draft', 'lines' => [array_replace($line, ['qty_required' => -1])]]), 'Draft rejects invalid entered quantities');
reject(fn () => boq_save($item, ['status' => 'Final', 'lines' => []]), 'Cannot finalise an empty BOQ');
$receiptDef = doc_def('material-in'); $issueDef = doc_def('material-issue');
doc_save($receiptDef, null, ['receipt_date' => date('Y-m-d'), 'receipt_type' => 'Purchase', 'supplier_id' => $supplier, 'challan_no' => 'INV-TEST', 'lines' => [['material_id' => $wire, 'quantity' => 20]]]);
$issue = ['issue_date' => date('Y-m-d'), 'order_item_id' => $item, 'issued_to' => 'Test user', 'lines' => [['material_id' => $wire, 'quantity' => 2]]];
reject(fn () => doc_save($issueDef, null, $issue), 'Draft blocks Material Issue on backend');
reject(fn () => issue_prefill($item, null), 'Draft blocks Material Issue prefill');
boq_save($item, ['status' => 'Final', 'lines' => [$line]]);
check(!in_array($item, array_column(pending_boq()['data'], 'id'), true), 'Final no longer appears in Pending BOQ');
$_GET = ['final_boq' => 1];
check(in_array($item, array_column(order_items_lookup()['data'], 'id'), true), 'Issue selector includes Final BOQ');
$_GET = [];
$issued = doc_save($issueDef, null, $issue)['data'];
check(variant_stats([(int) variant_resolve($wire, [])], $item)[variant_resolve($wire, [])]['consumed'] === 2.0, 'Final permits issue and records consumption');
$tooMuch = $issue; $tooMuch['lines'][0]['quantity'] = 4;
reject(fn () => doc_save($issueDef, null, $tooMuch), 'Issue cannot exceed remaining BOQ quantity');
$outside = $issue; $outside['lines'][0]['material_id'] = $crystal;
reject(fn () => doc_save($issueDef, null, $outside), 'Issue cannot use a material outside the Final BOQ');
reject(fn () => boq_save($item, ['status' => 'Final', 'lines' => [array_replace($line, ['qty_required' => 1])]]), 'Cannot reduce BOQ below quantity already issued');
reject(fn () => boq_save($item, ['status' => 'Draft', 'lines' => []]), 'Cannot remove an issued material');
boq_save($item, ['status' => 'Draft', 'lines' => [array_replace($line, ['qty_required' => 6]), $draftLine]]);
reject(fn () => doc_save($issueDef, null, $issue), 'Returning Final to Draft blocks further issues');
boq_save($item, ['status' => 'Final', 'lines' => [array_replace($line, ['qty_required' => 6])]]);
check(doc_find($issueDef, $issued['id'])['lines'][0]['quantity'] === 2.0, 'BOQ edits retain existing material issues');
$vid = variant_resolve($wire, []);
boq_book($item, ['variant_id' => $vid, 'quantity' => 3]);
reject(fn () => boq_save($item, ['status' => 'Final', 'lines' => [array_replace($line, ['qty_required' => 4])]]), 'BOQ reduction protects booked stock');
boq_release($item, ['variant_id' => $vid]);
boq_save($item, ['status' => 'Final', 'lines' => [array_replace($line, ['qty_required' => 4])]]);
check(boq_find($item)['boq_status'] === 'Final', 'Final BOQs remain editable after releasing excess bookings');
reject(fn () => material_save(null, ['name' => 'No category', 'unit' => 'Pcs']), 'Material requires category');
$count = (int) db_value('SELECT COUNT(*) FROM materials');
reject(fn () => material_bulk(['rows' => [['category' => 'Uncategorised', 'name' => 'Valid but rolled back', 'unit' => 'Pcs'], ['category' => 'Missing category', 'name' => 'Bad', 'unit' => 'Pcs']]]), 'Bulk import validates category names');
check((int) db_value('SELECT COUNT(*) FROM materials') === $count, 'Invalid bulk upload imports no rows');
reject(fn () => material_bulk(['rows' => [['category' => 'Uncategorised', 'name' => 'Duplicate', 'unit' => 'Pcs'], ['category' => 'Uncategorised', 'name' => 'duplicate', 'unit' => 'Pcs']]]), 'Bulk import rejects case-insensitive duplicate names');
material_bulk(['rows' => [['category' => 'Uncategorised', 'name' => 'Bulk cable', 'unit' => 'Mtr'], ['category' => 'Uncategorised', 'name' => 'Bulk plate', 'unit' => 'Pcs']]]);
check((int) db_value('SELECT COUNT(*) FROM materials') === $count + 2, 'Valid bulk import creates materials');
reject(fn () => master_delete(entity('material_categories'), $category), 'Categories in use cannot be deleted');
reject(fn () => material_delete($wire), 'Materials with stock/issues cannot be deleted');
check((float) db_value('SELECT SUM(quantity) FROM stock_moves WHERE variant_id = ' . $vid) === 18.0, 'Final stock balance remains correct');

// Order creation/editing no longer depends on the retired scheduling field.
$newOrder = order_save(null, ['customer_id' => $customer, 'order_date' => date('Y-m-d'), 'items' => [['area' => 'Test room', 'production_date' => 'obsolete-invalid-date']]]);
$newOrderId = $newOrder['data']['id'];
$newItemId = $newOrder['data']['items'][0]['id'];
check(!array_key_exists('production_date', $newOrder['data']['items'][0]), 'Order creation omits retired scheduling field');
$pdo->prepare("UPDATE order_items SET production_date = '2020-01-01' WHERE id = :i")->execute(['i' => $newItemId]);
$editedOrder = order_save($newOrderId, ['customer_id' => $customer, 'order_date' => date('Y-m-d'), 'items' => [['id' => $newItemId, 'area' => 'Updated room']]]);
check($editedOrder['data']['items'][0]['area'] === 'Updated room', 'Orders remain editable without scheduling dates');
check($editedOrder['data']['items'][0]['stage'] === 'BOQ Pending', 'Archived dates do not change item stage');
check(!array_key_exists('production_date', item_find($newItemId)), 'BOQ and item responses omit retired field');
check(!array_key_exists('planned_week', dashboard()['data']), 'Dashboard omits retired planning count');


$filters = issue_filter_options()['data'];
check(in_array((string) $customer, array_map('strval', array_column($filters['customers'], 'id')), true), 'Issue filters include customers across all records');
check(in_array('Living', array_column($filters['areas'], 'name'), true), 'Issue filters include linked order item areas');
$_GET = ['customer_id' => $customer, 'area' => 'Living'];
check(doc_list($issueDef)['total'] === 1, 'Issue customer and area filters combine correctly');
$_GET = ['customer_id' => $customer, 'area' => 'Not a matching area'];
check(doc_list($issueDef)['total'] === 0, 'Issue filters exclude nonmatching areas');
$_GET = ['customer_id' => $customer + 100000];
check(doc_list($issueDef)['total'] === 0, 'Issue filters exclude nonmatching customers');
$_GET = [];
check(doc_list($issueDef)['total'] === 1, 'Clearing issue filters restores records');

echo "All migration and workflow integration checks passed.\n";
