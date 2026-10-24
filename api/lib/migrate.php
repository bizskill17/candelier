<?php
// Versioned, locked migration. Ledger/variant IDs never change.
function migrate_material_categories(): void
{
    $pdo = db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_migrations (version VARCHAR(80) PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB');
    $version = '20261024_categories_boq_status';
    if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
    $lock = 'candelier_categories_' . substr(hash('sha256', (string) db_value('SELECT DATABASE()')), 0, 20);
    if (!(int) db_value('SELECT GET_LOCK(:k, 30)', ['k' => $lock])) throw new ApiError('Database update in progress. Please retry shortly.', 503);
    try {
        if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
        $pdo->exec("CREATE TABLE IF NOT EXISTS material_categories (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL UNIQUE, is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        if (!db_value("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'category_id'")) {
            $pdo->exec('ALTER TABLE materials ADD COLUMN category_id INT UNSIGNED NULL, ADD KEY idx_material_category (category_id), ADD CONSTRAINT fk_material_category FOREIGN KEY (category_id) REFERENCES material_categories(id)');
        }
        if (!db_value("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'boq_draft_json'")) {
            $pdo->exec('ALTER TABLE order_items ADD COLUMN boq_draft_json LONGTEXT NULL');
        }
        // Immutable snapshots of tables changed by conversion, retained in MySQL.
        foreach (['materials', 'material_variants', 'boq_lines', 'order_items'] as $table) {
            $backup = 'backup_categories_' . $table;
            $pdo->exec("CREATE TABLE IF NOT EXISTS $backup LIKE $table");
            $pdo->exec("INSERT IGNORE INTO $backup SELECT * FROM $table");
        }
        $pdo->beginTransaction();
        if (db_value('SELECT COUNT(*) FROM materials WHERE category_id IS NULL')) {
            $pdo->exec("INSERT IGNORE INTO material_categories (code, name) VALUES ('MC-LEGACY', 'Uncategorised')");
            $category = (int) db_value("SELECT id FROM material_categories WHERE name = 'Uncategorised'");
            $pdo->prepare('UPDATE materials SET category_id = :c WHERE category_id IS NULL')->execute(['c' => $category]);
        }
        foreach (db_all('SELECT * FROM materials ORDER BY id') as $material) {
            $variants = db_all("SELECT * FROM material_variants WHERE material_id = :m ORDER BY (spec_key = '') DESC, id", ['m' => $material['id']]);
            foreach ($variants as $index => $variant) {
                $mid = (int) $material['id'];
                $suffix = trim($variant['spec_text']);
                if ($index > 0 || $suffix !== '') {
                    $name = mb_substr($material['name'] . ($suffix !== '' ? ' · ' . $suffix : ''), 0, 100);
                    if (db_value('SELECT COUNT(*) FROM materials WHERE name = :n AND id <> :i', ['n' => $name, 'i' => $index === 0 ? $mid : 0])) {
                        $name = mb_substr($name, 0, 75) . ' [stock ' . $variant['id'] . ']';
                    }
                    if ($index === 0) {
                        $pdo->prepare('UPDATE materials SET name = :n WHERE id = :i')->execute(['n' => $name, 'i' => $mid]);
                    } else {
                        $pdo->prepare('INSERT INTO materials (name, unit, category_id, sort_order, is_active, created_at, updated_at) VALUES (:n, :u, :c, :s, :a, :t, :t2)')->execute([
                            'n' => $name, 'u' => $material['unit'], 'c' => $material['category_id'], 's' => $material['sort_order'], 'a' => $material['is_active'], 't' => now(), 't2' => now()]);
                        $mid = (int) $pdo->lastInsertId();
                    }
                }
                $pdo->prepare("UPDATE material_variants SET material_id = :m, spec_key = '', spec_text = '' WHERE id = :v")->execute(['m' => $mid, 'v' => $variant['id']]);
                $pdo->prepare('UPDATE boq_lines SET material_id = :m WHERE variant_id = :v')->execute(['m' => $mid, 'v' => $variant['id']]);
            }
            if (!$variants) variant_resolve((int) $material['id'], []);
        }
        $pdo->exec("UPDATE order_items SET boq_status = 'Final' WHERE boq_status = 'Saved'");
        $pdo->commit();
        $pdo->exec('ALTER TABLE materials MODIFY category_id INT UNSIGNED NOT NULL');
        $pdo->prepare('INSERT INTO app_migrations (version, applied_at) VALUES (:v, :t)')->execute(['v' => $version, 't' => now()]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    } finally {
        db_value('SELECT RELEASE_LOCK(:k)', ['k' => $lock]);
    }
}

// Additive migration: existing issued items default to In Progress; no ledger changes.
function migrate_production_status(): void
{
    $pdo = db();
    $version = '20261024_order_item_production_status';
    if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
    $lock = 'candelier_production_' . substr(hash('sha256', (string) db_value('SELECT DATABASE()')), 0, 20);
    if (!(int) db_value('SELECT GET_LOCK(:k, 30)', ['k' => $lock])) throw new ApiError('Database update in progress. Please retry shortly.', 503);
    try {
        if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
        if (!db_value("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'production_status'")) {
            $pdo->exec("ALTER TABLE order_items ADD COLUMN production_status VARCHAR(20) NOT NULL DEFAULT 'In Progress'");
        }
        $pdo->prepare('INSERT INTO app_migrations (version, applied_at) VALUES (:v, :t)')->execute(['v' => $version, 't' => now()]);
    } finally {
        db_value('SELECT RELEASE_LOCK(:k)', ['k' => $lock]);
    }
}

function migrate_dispatch_fields(): void
{
    $version = '20261024_dispatch_form_fields';
    if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
    $lock = 'candelier_dispatch_' . substr(hash('sha256', (string) db_value('SELECT DATABASE()')), 0, 20);
    if (!(int) db_value('SELECT GET_LOCK(:k, 30)', ['k' => $lock])) throw new ApiError('Database update in progress. Please retry shortly.', 503);
    try {
        foreach (['dispatch_by' => 100, 'dispatch_document' => 255, 'dispatch_document_name' => 150] as $column => $size) {
            if (!db_value("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dispatches' AND COLUMN_NAME = :c", ['c' => $column])) db()->exec("ALTER TABLE dispatches ADD COLUMN $column VARCHAR($size) NULL");
        }
        db()->prepare('INSERT IGNORE INTO app_migrations (version, applied_at) VALUES (:v, :t)')->execute(['v' => $version, 't' => now()]);
    } finally { db_value('SELECT RELEASE_LOCK(:k)', ['k' => $lock]); }
}

// Additive: client categories master and customers.category_id.
function migrate_client_categories(): void
{
    $pdo = db();
    $version = '20261024_client_categories';
    if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
    $lock = 'candelier_client_cat_' . substr(hash('sha256', (string) db_value('SELECT DATABASE()')), 0, 20);
    if (!(int) db_value('SELECT GET_LOCK(:k, 30)', ['k' => $lock])) throw new ApiError('Database update in progress. Please retry shortly.', 503);
    try {
        if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
        $pdo->exec("CREATE TABLE IF NOT EXISTS client_categories (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL, name VARCHAR(60) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_client_category_code (code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        if (!db_value('SELECT COUNT(*) FROM client_categories')) {
            $pdo->exec("INSERT INTO client_categories (code, name) VALUES ('CC-0001', 'Architect'), ('CC-0002', 'Interior Designer'), ('CC-0003', 'Hotel'), ('CC-0004', 'Banquet'), ('CC-0005', 'Residential'), ('CC-0006', 'Dealer')");
        }
        if (!db_value("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'category_id'")) {
            $pdo->exec('ALTER TABLE customers ADD COLUMN category_id INT UNSIGNED NULL AFTER address, ADD KEY idx_customer_city (city), ADD CONSTRAINT fk_customer_category FOREIGN KEY (category_id) REFERENCES client_categories(id)');
        }
        $pdo->prepare('INSERT IGNORE INTO app_migrations (version, applied_at) VALUES (:v, :t)')->execute(['v' => $version, 't' => now()]);
    } finally {
        db_value('SELECT RELEASE_LOCK(:k)', ['k' => $lock]);
    }
}
