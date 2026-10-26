<?php
require $root.'/api/handlers/whatsapp.php';migrate_whatsapp();
$_SESSION['uid']=$crmActor;
wa_save_settings(['api_key'=>'isolated-test-key','phone_id'=>'123456789']);
check(!str_contains(json_encode(wa_settings()),'isolated-test-key'),'WhatsApp settings never expose API key');
check(db_value('SELECT api_key FROM whatsapp_settings WHERE id=1')!=='isolated-test-key','WhatsApp API key encrypted at rest');
check(wa_decrypt(db_value('SELECT api_key FROM whatsapp_settings WHERE id=1'))==='isolated-test-key','Encrypted API key can be recovered by server');
$_SESSION['uid']=$salesUser;reject(fn()=>wa_save_settings(['api_key'=>'bad']),'Sales cannot change WhatsApp credentials');
$_SESSION['uid']=$storeUser;reject(fn()=>authorize_request('GET','whatsapp',['campaigns']),'Store cannot access WhatsApp');
$_SESSION['uid']=$salesUser;authorize_request('POST','whatsapp',['campaigns']);
check(wa_phone('98765 43210')==='919876543210'&&wa_phone('bad')==='','WhatsApp normalizes Indian numbers and rejects invalid numbers');
$waIds=[];foreach([['WA One','9876543210'],['WA Duplicate','919876543210'],['WA Two','9876543211'],['WA Bad','bad']] as [$name,$mobile]){
 db()->prepare("INSERT INTO contacts(contact_no,name,mobile,is_active,created_at,updated_at) VALUES(?,?,?,1,?,?)")->execute(['WA-'.count($waIds),$name,$mobile,now(),now()]);$waIds[]=(int)db()->lastInsertId();
}
$b=['request_key'=>'wa-isolated-campaign-1','name'=>'Test campaign','template_name'=>'welcome','language'=>'en','variables'=>['Hello {{name}}'],'contact_ids'=>$waIds];
$c=wa_create($b)['data'];$cid=(int)$c['id'];check($c['recipients']===2&&$c['skipped']===2,'Campaign deduplicates numbers and excludes invalid contacts');check((int)wa_create($b)['data']['id']===$cid,'Campaign creation retry does not duplicate recipients');
$m=db_all('SELECT * FROM whatsapp_messages WHERE campaign_id=? ORDER BY id',[$cid]);check(json_decode($m[0]['payload'],true)['templateVariables']===['Hello WA One'],'Template variables use contact name in the specified order');
$calls=0;$GLOBALS['WA_TEST_TRANSPORT']=function($method,$path,$body)use(&$calls){$calls++;return ['code'=>200,'data'=>['id'=>'provider-'.$calls,'userMessageId'=>'msg-'.$calls,'waMessageId'=>'wa-'.$calls]];};
wa_process($cid);check(db_value('SELECT status FROM whatsapp_messages WHERE id=?',[$m[0]['id']])==='accepted','Successful send is accepted, not delivered');
$GLOBALS['WA_TEST_TRANSPORT']=fn()=>['code'=>200,'data'=>['error'=>['title'=>'Insufficient Balance','message'=>'Recharge wallet']]];wa_process($cid);check(db_value('SELECT status FROM whatsapp_messages WHERE id=?',[$m[1]['id']])==='failed','HTTP 200 error is stored as failed');
wa_process($cid);check($calls===1,'Processed recipients are never sent again on resume');
wa_apply((int)$m[0]['id'],['code'=>200,'data'=>['lastStatus'=>'read','statusTime'=>['sent'=>'1755600000','delivered'=>'1755600001','read'=>'1755600002'],'statuses'=>[['status'=>'read','timestamp'=>'1755600002']]]],true);
$r=db_one('SELECT * FROM whatsapp_messages WHERE id=?',[$m[0]['id']]);$t=json_decode($r['status_times'],true);check($r['status']==='read'&&isset($t['sent'],$t['delivered'],$t['read'],$t['accepted']),'Reports preserve each status timestamp');
check(wa_timestamp(1755600000000)===wa_timestamp('1755600000'),'Status timestamps support milliseconds and seconds');
$b['request_key']='wa-isolated-campaign-2';$b['contact_ids']=[$waIds[0]];$cid2=(int)wa_create($b)['data']['id'];
$GLOBALS['WA_TEST_TRANSPORT']=function(){throw new RuntimeException('simulated timeout');};wa_process($cid2);check(db_value('SELECT status FROM whatsapp_messages WHERE campaign_id=?',[$cid2])==='unknown','Uncertain send is marked unknown');wa_process($cid2);check((int)db_value('SELECT COUNT(*) FROM whatsapp_messages WHERE campaign_id=?',[$cid2])===1,'Uncertain message never returns to the send queue');
unset($GLOBALS['WA_TEST_TRANSPORT']);$_SESSION['uid']=$crmActor;

check(str_contains(wa_error_message(['code'=>400,'data'=>['title'=>'Invalid template','detail'=>'Language does not match']]),'Language does not match'),'WhatsApp top-level provider failure details retained');
check(str_contains(wa_error_message(['code'=>400,'data'=>['error'=>['code'=>132000,'errorData'=>['details'=>'Variable count mismatch']]]]),'Variable count mismatch'),'WhatsApp nested errorData details and error codes retained');
check(str_contains(wa_error_message(['code'=>401,'data'=>['error'=>'Invalid API key']]),'HTTP 401'),'WhatsApp authentication failures include HTTP status');
check(str_contains(wa_error_message(['code'=>422,'data'=>['errors'=>['templateName'=>['Template is required']]]]),'Template is required'),'WhatsApp validation error fields retained');
check(!str_contains(wa_error_message(['code'=>401,'data'=>['message'=>'Rejected isolated-test-key']]),'isolated-test-key'),'Provider errors redact the configured API key');
