<?php
// Canonical CRM tables. Legacy tables are retained read-only for migration audit.
function migrate_crm(): void
{
    $pdo = db();
    $version = '20261025_contacts_crm_v1';
    if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
    $lock = 'crm_' . substr(hash('sha256', (string) db_value('SELECT DATABASE()')), 0, 24);
    if (!(int) db_value('SELECT GET_LOCK(:k, 60)', ['k' => $lock])) throw new ApiError('CRM update in progress. Please retry.', 503);
    try {
        if (db_value('SELECT COUNT(*) FROM app_migrations WHERE version = :v', ['v' => $version])) return;
        $column = fn ($table, $name) => (bool) db_value('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:t AND COLUMN_NAME=:c', ['t'=>$table,'c'=>$name]);
        if ($column('leads', 'customer_type')) $pdo->exec('RENAME TABLE leads TO legacy_crm_leads');
        if ($column('lead_followups', 'followup_date')) $pdo->exec('RENAME TABLE lead_followups TO legacy_crm_followups');
        $pdo->exec("CREATE TABLE IF NOT EXISTS contacts (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, contact_no VARCHAR(30) NOT NULL UNIQUE,
            name VARCHAR(150) NOT NULL, company_name VARCHAR(150) NULL, mobile VARCHAR(20) NULL,
            alternate_mobile VARCHAR(20) NULL, email VARCHAR(150) NULL, category_id INT UNSIGNED NULL,
            source_id INT UNSIGNED NULL, source_details VARCHAR(150) NULL, city VARCHAR(100) NULL,
            state_id INT UNSIGNED NULL, address TEXT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_by INT UNSIGNED NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
            KEY idx_contact_mobile(mobile), KEY idx_contact_email(email),
            FOREIGN KEY(category_id) REFERENCES client_categories(id), FOREIGN KEY(source_id) REFERENCES lead_sources(id),
            FOREIGN KEY(state_id) REFERENCES states(id), FOREIGN KEY(created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS leads (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, lead_no VARCHAR(30) NOT NULL UNIQUE,
            contact_id INT UNSIGNED NOT NULL, enquiry_date DATE NOT NULL, project_name VARCHAR(150) NULL,
            requirement TEXT NOT NULL, created_by INT UNSIGNED NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
            FOREIGN KEY(contact_id) REFERENCES contacts(id), FOREIGN KEY(created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS followups (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, contact_id INT UNSIGNED NULL, lead_id INT UNSIGNED NULL,
            entry_type VARCHAR(20) NOT NULL, activity_at DATETIME NOT NULL, method VARCHAR(20) NULL, outcome VARCHAR(30) NULL,
            remarks TEXT NULL, lead_status VARCHAR(10) NULL, lead_temperature VARCHAR(10) NULL,
            further_followup_required TINYINT(1) NOT NULL DEFAULT 0, next_followup_at DATETIME NULL,
            request_key VARCHAR(64) NULL UNIQUE, generated_lead_id INT UNSIGNED NULL UNIQUE, recorded_by INT UNSIGNED NULL, created_at DATETIME NOT NULL,
            KEY idx_followup_contact(contact_id,activity_at,id), KEY idx_followup_lead(lead_id,activity_at,id),
            KEY idx_followup_next(next_followup_at),
            FOREIGN KEY(contact_id) REFERENCES contacts(id), FOREIGN KEY(lead_id) REFERENCES leads(id),
            FOREIGN KEY(generated_lead_id) REFERENCES leads(id), FOREIGN KEY(recorded_by) REFERENCES users(id),
            CONSTRAINT chk_followup_target CHECK ((contact_id IS NULL) <> (lead_id IS NULL))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        if (!$column('orders','lead_id')) $pdo->exec('ALTER TABLE orders ADD COLUMN lead_id INT UNSIGNED NULL, ADD KEY idx_order_lead(lead_id), ADD CONSTRAINT fk_order_crm_lead FOREIGN KEY(lead_id) REFERENCES leads(id)');
        $dataVersion = $version . '_data';
        if (!db_value('SELECT COUNT(*) FROM app_migrations WHERE version=:v', ['v'=>$dataVersion])) {
            $pdo->beginTransaction();
            try {
                // Existing customer IDs remain the Contact IDs used throughout orders and stores.
                $pdo->exec("INSERT INTO contacts (id,contact_no,name,mobile,alternate_mobile,email,category_id,city,state_id,address,is_active,created_at,updated_at)
                    SELECT id,code,name,phone,contact_mobile,email,category_id,city,state_id,address,is_active,created_at,updated_at FROM customers");
                $legacy = db_all('SELECT * FROM legacy_crm_leads ORDER BY id');
                foreach ($legacy as $l) {
                    $cid = $l['customer_id'] ? (int)$l['customer_id'] : 0;
                    if (!$cid) {
                        $mobile = preg_replace('/[^0-9]/', '', (string)$l['phone']);
                        $matches = $mobile !== '' ? db_all("SELECT id FROM contacts WHERE REPLACE(REPLACE(REPLACE(mobile,' ',''),'-',''),'+','')=:p", ['p'=>$mobile]) : [];
                        if (count($matches) === 1) $cid = (int)$matches[0]['id'];
                        else {
                            $pdo->prepare('INSERT INTO contacts(contact_no,name,mobile,alternate_mobile,email,source_id,city,state_id,address,created_by,created_at,updated_at) VALUES(:no,:n,:m,:a,:e,:s,:ci,:st,:ad,:u,:t,:up)')->execute([
                                'no'=>'CON-LD-'.$l['id'],'n'=>$l['name'] ?: 'Imported contact '.$l['id'], 'm'=>$mobile ?: null,'a'=>$l['contact_mobile'],
                                'e'=>$l['email'],'s'=>$l['source_id'],'ci'=>$l['city'],'st'=>$l['state_id'],'ad'=>$l['address'],'u'=>$l['created_by'],'t'=>$l['created_at'],'up'=>$l['updated_at']]);
                            $cid=(int)$pdo->lastInsertId();
                        }
                    }
                    $pdo->prepare('UPDATE contacts SET source_id=COALESCE(source_id,:s) WHERE id=:id')->execute(['s'=>$l['source_id'],'id'=>$cid]);
                    $pdo->prepare('INSERT INTO leads(id,lead_no,contact_id,enquiry_date,requirement,created_by,created_at,updated_at) VALUES(:id,:no,:c,:d,:r,:u,:t,:up)')->execute([
                        'id'=>$l['id'],'no'=>$l['lead_no'],'c'=>$cid,'d'=>$l['lead_date'],'r'=>$l['requirement'] ?: 'Imported requirement','u'=>$l['created_by'],'t'=>$l['created_at'],'up'=>$l['updated_at']]);
                    if ($l['order_id']) $pdo->prepare('UPDATE orders SET lead_id=:l WHERE id=:o')->execute(['l'=>$l['id'],'o'=>$l['order_id']]);
                }
                foreach (db_all('SELECT f.*, l.temperature FROM legacy_crm_followups f JOIN legacy_crm_leads l ON l.id=f.lead_id ORDER BY f.id') as $f) {
                    $open=$f['status']==='Follow Up Again';
                    $pdo->prepare('INSERT INTO followups(id,lead_id,entry_type,activity_at,remarks,lead_status,lead_temperature,further_followup_required,next_followup_at,recorded_by,created_at) VALUES(:id,:l,\'Follow-up\',:at,:r,:s,:t,:req,:next,:by,:created)')->execute([
                        'id'=>$f['id'],'l'=>$f['lead_id'],'at'=>$f['followup_date'].' 00:00:00','r'=>$f['remarks'],'s'=>$open?'Open':$f['status'],'t'=>$f['temperature'],'req'=>$open?1:0,
                        'next'=>$f['next_date'] ? $f['next_date'].' '.($f['next_time'] ?: '10:00:00') : null,'by'=>$f['followup_by'],'created'=>$f['created_at']]);
                }
                foreach ($legacy as $l) {
                    $ins=$pdo->prepare('INSERT INTO followups(lead_id,entry_type,activity_at,remarks,lead_status,lead_temperature,further_followup_required,next_followup_at,recorded_by,created_at) VALUES(:l,:type,:at,:r,:s,:temp,:req,:next,:by,:created)');
                    $ins->execute(['l'=>$l['id'],'type'=>'Lead Created','at'=>$l['created_at'],'r'=>$l['remarks'],'s'=>'Open','temp'=>$l['temperature'],'req'=>0,'next'=>null,'by'=>$l['created_by'],'created'=>$l['created_at']]);
                    // Preserve the last saved legacy state, including schedule changes made outside follow-ups.
                    $latest=db_value('SELECT MAX(activity_at) FROM followups WHERE lead_id=:id',['id'=>$l['id']]);
                    $ins->execute(['l'=>$l['id'],'type'=>'Status Update','at'=>max($l['updated_at'],$latest ?: $l['created_at']),'r'=>'Migrated CRM state','s'=>$l['status'],'temp'=>$l['temperature'],
                        'req'=>$l['status']==='Open'?1:0,'next'=>$l['next_followup_date'] ? $l['next_followup_date'].' '.($l['next_followup_time'] ?: '10:00:00') : null,'by'=>$l['created_by'],'created'=>$l['updated_at']]);
                }
                $pdo->prepare('INSERT INTO app_migrations(version,applied_at) VALUES(:v,:t)')->execute(['v'=>$dataVersion,'t'=>now()]);
                $pdo->commit();
            } catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
        }
        // Audit archives must not constrain future operational edits/deletions.
        foreach (['legacy_crm_leads','legacy_crm_followups','legacy_crm_customers'] as $archive) {
            foreach (db_all("SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=:t AND CONSTRAINT_TYPE='FOREIGN KEY'", ['t'=>$archive]) as $key) {
                $name=str_replace('`','``',$key['name']); $pdo->exec("ALTER TABLE $archive DROP FOREIGN KEY `$name`");
            }
        }
        // Repoint the existing FK before archiving the old party table.
        $fk=db_one("SELECT REFERENCED_TABLE_NAME AS target FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND CONSTRAINT_NAME='fk_order_customer'");
        if ($fk && $fk['target'] !== 'contacts') $pdo->exec('ALTER TABLE orders DROP FOREIGN KEY fk_order_customer, ADD CONSTRAINT fk_order_customer FOREIGN KEY(customer_id) REFERENCES contacts(id)');
        if (db_value("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND TABLE_TYPE='BASE TABLE'")) $pdo->exec('RENAME TABLE customers TO legacy_crm_customers');
        foreach (db_all("SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='legacy_crm_customers' AND CONSTRAINT_TYPE='FOREIGN KEY'") as $key) { $name=str_replace('`','``',$key['name']); $pdo->exec("ALTER TABLE legacy_crm_customers DROP FOREIGN KEY `$name`"); }
        // Compatibility projection only: there is one writable person record, in contacts.
        $pdo->exec('CREATE OR REPLACE VIEW customers AS SELECT id,contact_no AS code,name,mobile AS phone,alternate_mobile AS contact_mobile,email,company_name AS contact_person,category_id,city,state_id,address,is_active,created_at,updated_at FROM contacts');
        $pdo->exec("CREATE OR REPLACE VIEW crm_customers AS SELECT c.* FROM contacts c WHERE EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.status<>'Cancelled')");
        $pdo->exec("CREATE OR REPLACE VIEW crm_lead_current AS SELECT l.*,l.enquiry_date AS lead_date,l.contact_id AS customer_id,
            c.name AS display_name,c.mobile AS display_phone,c.address AS display_address,c.city AS customer_city,c.city,c.email,c.company_name AS contact_person,c.alternate_mobile AS contact_mobile,c.state_id,c.source_id,
            s.name AS source_name,st.name AS state_name,u.name AS created_by_name,
            COALESCE(f.lead_status,'Open') AS status,COALESCE(f.lead_temperature,'Warm') AS temperature,
            f.next_followup_at,DATE(f.next_followup_at) AS next_followup_date,TIME(f.next_followup_at) AS next_followup_time,
            f.further_followup_required,
            (SELECT COUNT(*) FROM followups h WHERE h.lead_id=l.id AND h.entry_type='Follow-up') AS followup_count,
            (SELECT MIN(o.id) FROM orders o WHERE o.lead_id=l.id) AS order_id,
            (SELECT o.order_no FROM orders o WHERE o.lead_id=l.id ORDER BY o.id LIMIT 1) AS order_no
            FROM leads l JOIN contacts c ON c.id=l.contact_id LEFT JOIN lead_sources s ON s.id=c.source_id LEFT JOIN states st ON st.id=c.state_id LEFT JOIN users u ON u.id=l.created_by
            LEFT JOIN followups f ON f.id=(SELECT x.id FROM followups x WHERE x.lead_id=l.id ORDER BY x.activity_at DESC,x.id DESC LIMIT 1)");
        $pdo->exec("CREATE OR REPLACE VIEW crm_contact_current AS SELECT c.*,c.contact_no AS code,c.mobile AS phone,c.alternate_mobile AS contact_mobile,
            cat.name AS category_name,s.name AS source_name,st.name AS state_name,
            f.next_followup_at,f.further_followup_required,
            (SELECT COUNT(*) FROM followups h LEFT JOIN leads l ON l.id=h.lead_id WHERE h.entry_type='Follow-up' AND (h.contact_id=c.id OR l.contact_id=c.id)) AS followup_count,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.status<>'Cancelled') AS order_count
            FROM contacts c LEFT JOIN client_categories cat ON cat.id=c.category_id LEFT JOIN lead_sources s ON s.id=c.source_id LEFT JOIN states st ON st.id=c.state_id
            LEFT JOIN followups f ON f.id=(SELECT x.id FROM followups x WHERE x.contact_id=c.id ORDER BY x.activity_at DESC,x.id DESC LIMIT 1)");
        $pdo->prepare('INSERT INTO app_migrations(version,applied_at) VALUES(:v,:t)')->execute(['v'=>$version,'t'=>now()]);
    } finally { db_value('SELECT RELEASE_LOCK(:k)', ['k'=>$lock]); }
}
