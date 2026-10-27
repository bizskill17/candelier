<?php
function migrate_operations(): void {
 $version='20261027_drawings_samples_crm_v1';if(db_value('SELECT COUNT(*) FROM app_migrations WHERE version=?',[$version]))return;
 $lock='operations_'.substr(hash('sha256',(string)db_value('SELECT DATABASE()')),0,20);if(!db_value('SELECT GET_LOCK(?,30)',[$lock]))throw new ApiError('Application update in progress.',503);
 try{if(db_value('SELECT COUNT(*) FROM app_migrations WHERE version=?',[$version]))return;
 $column=fn($t,$c)=>db_value('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[$t,$c]);
 if(!$column('leads','source_id')){db()->exec('ALTER TABLE leads ADD source_id INT UNSIGNED NULL, ADD CONSTRAINT fk_lead_source FOREIGN KEY(source_id) REFERENCES lead_sources(id)');db()->exec('UPDATE leads l JOIN contacts c ON c.id=l.contact_id SET l.source_id=c.source_id');}
 // Preserve the CRM projection, with the Lead owning its enquiry source independently of the Contact.
 db()->exec("CREATE OR REPLACE VIEW crm_lead_current AS SELECT l.*,l.enquiry_date AS lead_date,l.contact_id AS customer_id,
            c.name AS display_name,c.mobile AS display_phone,c.address AS display_address,c.city AS customer_city,c.city,c.email,c.company_name AS contact_person,c.alternate_mobile AS contact_mobile,c.state_id,
            s.name AS source_name,st.name AS state_name,u.name AS created_by_name,
            COALESCE(f.lead_status,'Open') AS status,COALESCE(f.lead_temperature,'Warm') AS temperature,
            f.next_followup_at,DATE(f.next_followup_at) AS next_followup_date,TIME(f.next_followup_at) AS next_followup_time,
            f.further_followup_required,
            (SELECT COUNT(*) FROM followups h WHERE h.lead_id=l.id AND h.entry_type='Follow-up') AS followup_count,
            (SELECT MIN(o.id) FROM orders o WHERE o.lead_id=l.id) AS order_id,
            (SELECT o.order_no FROM orders o WHERE o.lead_id=l.id ORDER BY o.id LIMIT 1) AS order_no
            FROM leads l JOIN contacts c ON c.id=l.contact_id LEFT JOIN lead_sources s ON s.id=l.source_id LEFT JOIN states st ON st.id=c.state_id LEFT JOIN users u ON u.id=l.created_by
            LEFT JOIN followups f ON f.id=(SELECT x.id FROM followups x WHERE x.lead_id=l.id ORDER BY x.activity_at DESC,x.id DESC LIMIT 1)");
 if(!$column('material_receipt_items','inventory_type'))db()->exec("ALTER TABLE material_receipt_items ADD inventory_type VARCHAR(10) NOT NULL DEFAULT 'Normal', ADD project_name VARCHAR(150) NULL, ADD order_by_id INT UNSIGNED NULL, ADD CONSTRAINT fk_receipt_item_order_by FOREIGN KEY(order_by_id) REFERENCES users(id)");
 db()->exec("CREATE TABLE IF NOT EXISTS sample_moves(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,move_date DATE NOT NULL,variant_id INT UNSIGNED NOT NULL,quantity DECIMAL(15,3) NOT NULL,ref_type VARCHAR(30) NOT NULL,ref_id INT NOT NULL,ref_no VARCHAR(40) NOT NULL,created_at DATETIME NOT NULL,KEY sample_variant(variant_id),KEY sample_ref(ref_type,ref_id),FOREIGN KEY(variant_id) REFERENCES material_variants(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
 db()->exec("CREATE TABLE IF NOT EXISTS sample_issues(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,issue_no VARCHAR(40) UNIQUE NOT NULL,request_key VARCHAR(64) UNIQUE NOT NULL,issue_date DATE NOT NULL,order_item_id INT UNSIGNED NOT NULL,variant_id INT UNSIGNED NOT NULL,quantity DECIMAL(15,3) NOT NULL,fulfills_boq TINYINT NOT NULL DEFAULT 0,issued_by INT UNSIGNED NOT NULL,notes TEXT NULL,created_at DATETIME NOT NULL,FOREIGN KEY(order_item_id) REFERENCES order_items(id),FOREIGN KEY(variant_id) REFERENCES material_variants(id),FOREIGN KEY(issued_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
 db()->exec("CREATE TABLE IF NOT EXISTS sample_legacy_review(variant_id INT UNSIGNED PRIMARY KEY,received_qty DECIMAL(15,3) NOT NULL,resolved_at DATETIME NULL,remaining_qty DECIMAL(15,3) NULL,resolved_by INT UNSIGNED NULL,FOREIGN KEY(variant_id) REFERENCES material_variants(id)) ENGINE=InnoDB");
 $dataVersion=$version.'_data';if(!db_value('SELECT COUNT(*) FROM app_migrations WHERE version=?',[$dataVersion])){
 db()->beginTransaction();try{
 foreach(db_all("SELECT x.variant_id,SUM(x.quantity) AS qty FROM material_receipt_items x JOIN material_receipts h ON h.id=x.receipt_id WHERE h.receipt_type='Sample' GROUP BY x.variant_id") as $r){
  $v=(int)$r['variant_id'];$ambiguous=db_value('SELECT COUNT(*) FROM stock_moves WHERE variant_id=? AND quantity<0',[$v])||db_value('SELECT COUNT(*) FROM bookings WHERE variant_id=?',[$v]);
  if($ambiguous){db()->prepare('INSERT IGNORE INTO sample_legacy_review(variant_id,received_qty) VALUES(?,?)')->execute([$v,$r['qty']]);continue;}
  separate_legacy_samples($v,(float)$r['qty']);
 }
 db()->prepare('INSERT INTO app_migrations(version,applied_at) VALUES(?,?)')->execute([$dataVersion,now()]);db()->commit();
 }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}}
 db()->exec("CREATE OR REPLACE VIEW crm_enquiry_current AS SELECT e.*,u.name AS assigned_name,fu.name AS followup_by_name,f.recorded_by AS followup_by_id,f.enquiry_decision,f.next_followup_at,f.remarks AS last_remarks,f.activity_at AS last_followup_at,(SELECT COUNT(*) FROM followups h WHERE h.enquiry_id=e.id) AS followup_count,CASE WHEN e.lead_id IS NOT NULL THEN 'Lead Created' WHEN e.contact_id IS NOT NULL THEN 'Contact Added' WHEN f.enquiry_decision='Archive' THEN 'Archived' WHEN f.id IS NULL THEN 'New' ELSE 'Follow up Later' END COLLATE utf8mb4_unicode_ci AS inbox_status FROM enquiries e LEFT JOIN users u ON u.id=e.assigned_to LEFT JOIN followups f ON f.id=(SELECT x.id FROM followups x WHERE x.enquiry_id=e.id ORDER BY x.activity_at DESC,x.id DESC LIMIT 1) LEFT JOIN users fu ON fu.id=f.recorded_by");
 db()->prepare('INSERT INTO app_migrations(version,applied_at) VALUES(?,?)')->execute([$version,now()]);
 }finally{db_value('SELECT RELEASE_LOCK(?)',[$lock]);}
}
function separate_legacy_samples(int $vid,float $remaining): void {
 $rows=db_all("SELECT x.receipt_id,x.quantity,h.receipt_no,h.receipt_date FROM material_receipt_items x JOIN material_receipts h ON h.id=x.receipt_id WHERE x.variant_id=? AND h.receipt_type='Sample' AND x.inventory_type='Normal'",[$vid]);$total=0;
 foreach($rows as $r){$total+=(float)$r['quantity'];sample_post_line('receipt',(int)$r['receipt_id'],$r['receipt_no'],$r['receipt_date'],$vid,(float)$r['quantity']);db()->prepare("DELETE FROM stock_moves WHERE ref_type='receipt' AND ref_id=? AND variant_id=?")->execute([$r['receipt_id'],$vid]);}
 db()->prepare("UPDATE material_receipt_items x JOIN material_receipts h ON h.id=x.receipt_id SET x.inventory_type='Sample' WHERE x.variant_id=? AND h.receipt_type='Sample'")->execute([$vid]);
 $used=round($total-$remaining,3);if($used>0){stock_post('sample_legacy',$vid,'REV-'.$vid,date('Y-m-d'),[[$vid,$used]]);sample_post_line('legacy_used',$vid,'REV-'.$vid,date('Y-m-d'),$vid,-$used);}
}
