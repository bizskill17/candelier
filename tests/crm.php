<?php
check((int)db_value('SELECT customer_id FROM orders WHERE id='.$order)===$customer,'CRM migration preserves Order Contact ID');
check((int)db_value('SELECT lead_id FROM orders WHERE id='.$order)===$legacyLead,'CRM migration preserves originating Lead link');
check(db_value("SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers'")==='VIEW','Customers compatibility uses Contacts, not another people table');
check(lead_find($legacyLead)['temperature']==='Cold'&&lead_find($legacyLead)['status']==='Open','Legacy Lead current state survives migration');
check((int)lead_find($legacyLead)['followup_count']===1,'System migration events do not count as follow-up attempts');
check(str_ends_with(lead_find($legacyLead)['next_followup_at'],'14:30:00'),'Legacy schedule preserved');
foreach(['contacts','leads']as$table)check((int)db_value("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:t AND COLUMN_NAME IN ('status','temperature','next_followup_date','next_followup_at','closure_remarks','closed_date')",['t'=>$table])===0,"$table has no duplicated lifecycle state");
$pdo->exec("INSERT INTO client_categories (code,name,is_active) VALUES ('CC-CONTACT-TEST','Contact test category',1)");
$contactCategory=(int)$pdo->lastInsertId();
$contactRequired=['category_id'=>$contactCategory,'city'=>'Guwahati'];
$c=contact_save(null,$contactRequired+['name'=>'CRM integration contact','mobile'=>'9876501234','email'=>'crm-test@example.test'])['data'];$cid=(int)$c['id'];
reject(fn()=>contact_save(null,$contactRequired+['name'=>'Duplicate','mobile'=>'+98 7650-1234']),'Duplicate normalised mobile rejected');
reject(fn()=>contact_save(null,$contactRequired+['name'=>'Duplicate','mobile'=>'9876501243','email'=>'CRM-TEST@example.test']),'Duplicate email rejected');
$count=(int)db_value('SELECT COUNT(*) FROM contacts');
reject(fn()=>contact_bulk(['rows'=>[$contactRequired+['name'=>'Rollback contact','mobile'=>'9876501235'],['name'=>'Bad category','mobile'=>'9876501236','category'=>'Does not exist']]]),'Contact bulk upload rolls back all rows');
check((int)db_value('SELECT COUNT(*) FROM contacts')===$count,'Bulk failure leaves no partial contacts');
$l=lead_save(null,['contact_id'=>$cid,'enquiry_date'=>date('Y-m-d'),'requirement'=>'Cold requirement','initial_temperature'=>'Cold'])['data'];$lid=$l['id'];
check((int)contact_find($cid)['followup_count']===0,'Lead creation leaves Contact Never Followed Up');
$_GET=['view'=>'never'];check(in_array($cid,array_map('intval',array_column(contact_list()['data'],'id')),true),'Never Followed Up view includes contacts with only system events');
$_GET=['tab'=>'missing'];check(in_array($lid,array_map('intval',array_column(followups_due()['data'],'id')),true),'New Lead without next schedule appears in Next Date Missing');
$base=['activity_at'=>now(),'method'=>'Call','outcome'=>'Connected','further_followup_required'=>true,'next_followup_at'=>date('Y-m-d').' 23:59:59'];
crm_followup_save($base+['lead_id'=>$lid,'lead_temperature'=>'Cold','lead_status'=>'Open']);
$_GET=['tab'=>'today'];check(in_array($lid,array_map('intval',array_column(followups_due()['data'],'id')),true),'Cold Leads are included in due follow-ups');
check(contact_find($cid)['next_followup_at']===null,'Lead schedule does not overwrite general Contact schedule');
$created=crm_followup_save($base+['contact_id'=>$cid,'requirement_received'=>true,'requirement'=>'Second requirement','project_name'=>'Project B','request_key'=>'crm-integration-requirement','recorded_by'=>999999]);
check((int)db_value('SELECT recorded_by FROM followups WHERE id='.(int)$created['data']['id'])===$crmActor,'Actor is authenticated staff, not caller-supplied identity');
$replayed=crm_followup_save($base+['contact_id'=>$cid,'requirement_received'=>true,'requirement'=>'Second requirement','request_key'=>'crm-integration-requirement']);
check($created['data']['id']===$replayed['data']['id'],'Retried requirement request does not duplicate Follow-up or Lead');
check((int)contact_find($cid)['followup_count']===2,'Contact timeline counts actual Contact and Lead attempts only');
check((int)db_value('SELECT contact_id FROM leads WHERE id='.(int)$created['data']['generated_lead_id'])===$cid,'Requirement Received creates a Lead for the same Contact');
$count=(int)db_value('SELECT COUNT(*) FROM followups');
reject(fn()=>crm_followup_save($base+['contact_id'=>$cid,'requirement_received'=>true,'requirement'=>'']),'Invalid requirement rejects the whole follow-up');
check((int)db_value('SELECT COUNT(*) FROM followups')===$count,'Atomic requirement failure leaves history unchanged');
crm_followup_save(['lead_id'=>$lid,'entry_type'=>'Status Update','activity_at'=>now(),'lead_status'=>'Success','lead_temperature'=>'Warm','remarks'=>'Won requirement']);
check(lead_find($lid)['status']==='Success'&&lead_find($lid)['temperature']==='Warm','Latest history determines Lead status and temperature');
check((int)lead_find($lid)['followup_count']===1,'Status-only updates do not count as actual attempts');
check((int)contact_find($cid)['order_count']===0,'Successful Lead alone does not create a Customer');
$placed=order_save(null,['assigned_salesperson_id'=>$salesUser,'customer_id'=>$cid,'lead_id'=>$lid,'order_date'=>date('Y-m-d'),'delivery_date'=>date('Y-m-d'),'items'=>[['area'=>'CRM test room']]])['data'];
check((int)contact_find($cid)['order_count']===1,'Placing Order makes the same Contact a Customer');
reject(fn()=>order_save((int)$placed['id'],['assigned_salesperson_id'=>$salesUser,'customer_id'=>$customer,'order_date'=>date('Y-m-d'),'delivery_date'=>date('Y-m-d'),'items'=>[['id'=>$placed['items'][0]['id'],'area'=>'CRM test room']]]),'Linked Order cannot be moved to a different Contact');
check((int)db_value('SELECT contact_id FROM leads WHERE id='.$lid)===$cid,'Order creation does not duplicate Contact');
order_delete((int)$placed['id']);
check((int)contact_find($cid)['order_count']===0,'Customer view follows current non-cancelled Orders');
$_GET=[];

foreach(['mobile'=>'Enter the mobile number.','category_id'=>'Select a category.','city'=>'Select a city.']as$field=>$message){
    $input=$contactRequired+['name'=>'Required field check','mobile'=>'9876501240'];$input[$field]='';
    try{contact_save(null,$input);throw new RuntimeException('Expected required contact field rejection');}
    catch(ApiError$e){check(($e->fields[$field]??null)===$message,"Contact $field has a clear field-level validation message");}
}
try{contact_save(null,['name'=>'Missing several fields']);throw new RuntimeException('Expected multiple errors');}
catch(ApiError$e){check(isset($e->fields['mobile'],$e->fields['category_id'],$e->fields['city']),'Contact validation returns all missing required fields together');}
try{contact_save(null,$contactRequired+['name'=>'Invalid email','mobile'=>'9876501241','email'=>'invalid']);throw new RuntimeException('Expected invalid email');}
catch(ApiError$e){check(isset($e->fields['email']),'Contact email validation attaches error to Email');}
try{contact_save(null,$contactRequired+['name'=>'Invalid mobile','mobile'=>'12345']);throw new RuntimeException('Expected invalid mobile');}
catch(ApiError$e){check(isset($e->fields['mobile']),'Contact rejects malformed mobile numbers');}
// Fields removed from the form remain preserved on pre-existing records.
$pdo->prepare("UPDATE contacts SET source_details='Legacy source note',alternate_mobile='9876501242' WHERE id=:id")->execute(['id'=>$cid]);
contact_save($cid,$contactRequired+['name'=>'CRM integration contact','mobile'=>'9876501234','email'=>'crm-test@example.test']);
check(db_value('SELECT source_details FROM contacts WHERE id='.$cid)==='Legacy source note'&&db_value('SELECT alternate_mobile FROM contacts WHERE id='.$cid)==='9876501242','Editing contact preserves removed legacy fields');


// Updated Today uses IST day bounds and latest saved contact order.
$pdo->exec("UPDATE contacts SET updated_at=DATE_SUB(CURRENT_DATE(),INTERVAL 2 DAY)");
$todayContact=contact_save(null,$contactRequired+['name'=>'Updated today new','mobile'=>'9876501250'])['data'];
$_GET=['view'=>'updated-today'];
check(array_map('intval',array_column(contact_list()['data'],'id'))===[(int)$todayContact['id']],'New contact appears in Updated Today and older records are excluded');
$pdo->prepare('UPDATE contacts SET updated_at=:t WHERE id=:i')->execute(['t'=>date('Y-m-d').' 00:00:00','i'=>$todayContact['id']]);
contact_save($cid,$contactRequired+['name'=>'Updated today edited','mobile'=>'9876501234','email'=>'crm-test@example.test']);
$updated=contact_list()['data'];
check((int)$updated[0]['id']===$cid&&(int)$updated[1]['id']===(int)$todayContact['id'],'Edited contact is first in Updated Today');
$_GET=['view'=>'updated-today','city'=>'Not matching'];check(contact_list()['total']===0,'Updated Today supports normal contact filters');
$_GET=['view'=>'updated-today','q'=>'Updated today edited'];check(contact_list()['total']===1,'Updated Today supports contact search');
$_GET=[];


$_GET=['from'=>date('Y-m-d'),'to'=>date('Y-m-d')];
$logs=followup_logs();
$expected=(int)db_value("SELECT COUNT(*) FROM followups WHERE entry_type='Follow-up' AND activity_at>=:start AND activity_at<=:end",['start'=>date('Y-m-d').' 00:00:00','end'=>date('Y-m-d').' 23:59:59']);
check($logs['followup_total']===$expected&&array_sum(array_column($logs['person_counts'],'count'))===$expected,'Follow-up person totals count actual attempts across the selected dates');
$_GET['recorded_by']=$crmActor;$own=followup_logs();
check(count(array_filter($own['person_counts'],fn($p)=>$p['recorded_by']!==$crmActor))===0,'Person counts respect Recorded By filter');
$_GET=['entry_type'=>'Lead Created'];check(followup_logs()['followup_total']===0,'System Lead Created entries do not count as follow-up attempts');
$_GET=[];

// Simplified follow-up decisions capture activity automatically and need no Outcome.
$simpleContact=contact_save(null,$contactRequired+['name'=>'Decision test','mobile'=>'9876519988'])['data']['id'];
reject(fn()=>crm_followup_save(['contact_id'=>$simpleContact,'followup_status'=>'Follow Up Again','method'=>'Call']),'Follow Up Again requires next date');
reject(fn()=>crm_followup_save(['contact_id'=>$simpleContact,'followup_status'=>'Lead Received','method'=>'Call','next_followup_at'=>'2099-01-01 12:00:00']),'Lead Received requires requirement');
$simple=crm_followup_save(['contact_id'=>$simpleContact,'followup_status'=>'Lead Received','method'=>'Call','requirement'=>'Decision requirement','next_followup_at'=>'2099-01-01 12:00:00']);
$event=db_one('SELECT * FROM followups WHERE id=:id',['id'=>$simple['data']['id']]);
check($event['outcome']===null&&substr($event['activity_at'],0,10)===date('Y-m-d'),'Simplified follow-up records automatic activity without invented outcome');
check((bool)$simple['data']['generated_lead_id']&&(bool)$event['further_followup_required'],'Lead Received creates lead and schedules follow-up');
crm_followup_save(['contact_id'=>$simpleContact,'followup_status'=>'No Further Follow-up','method'=>'Call','next_followup_at'=>'2099-01-01 12:00:00','requirement_received'=>true]);
check(!(bool)contact_find($simpleContact)['further_followup_required']&&contact_find($simpleContact)['next_followup_at']===null,'No Further Follow-up clears stale schedule and requirement flags');
