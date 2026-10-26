<?php
const ENQUIRY_FIELDS=['id','created_time','ad_id','ad_name','adset_id','adset_name','campaign_id','campaign_name','form_id','form_name','is_organic','platform','project_type','approximate_customization__chandelier_budget','project_timeline','how_many_customized_chandeliers_do_you_require?','full_name','email','phone_number','city','lead_status'];
function enquiry_mobile($value): ?string {$n=preg_replace('/\D/','',(string)$value);if(strlen($n)===10)$n='91'.$n;return preg_match('/^[1-9][0-9]{7,14}$/',$n)?$n:null;}
function enquiry_sync_auth(string $token): void {
 $s=db_one('SELECT * FROM enquiry_integration WHERE id=1');if(!$s||!$s['is_enabled']||strlen($token)!==64||!hash_equals((string)$s['token_hash'],hash('sha256',$token)))throw new ApiError('Invalid or disabled sheet connection.',401);
}
function enquiry_sync(array $in): array {
 $s=db_one('SELECT * FROM enquiry_integration WHERE id=1');
 if(($in['spreadsheet_id']??'')!==$s['spreadsheet_id']||($in['tab_name']??'')!==$s['tab_name'])throw new ApiError('This connection is restricted to the configured spreadsheet and tab.',403);
 $key=(string)($in['request_key']??'');if(!preg_match('/^[a-zA-Z0-9-]{10,80}$/',$key))throw new ApiError('Invalid sync request key.',422);
 $rows=$in['rows']??null;if(!is_array($rows)||count($rows)>100)throw new ApiError('Send up to 100 enquiries per batch.',422);
 $lock='enquiry_ingest_'.substr(hash('sha256',(string)db_value('SELECT DATABASE()')),0,20);if(!db_value('SELECT GET_LOCK(?,5)',[$lock]))throw new ApiError('Another sync is running. Retry this batch.',503);
 try{
 $prior=db_one('SELECT * FROM enquiry_sync_runs WHERE request_key=?',[$key]);if($prior)return ['added'=>(int)$prior['added'],'updated'=>(int)$prior['updated'],'unchanged'=>(int)$prior['unchanged'],'errors'=>json_decode($prior['errors_json'],true),'replayed'=>true];
 $counts=['added'=>0,'updated'=>0,'unchanged'=>0];$errors=[];$pdo=db();$pdo->beginTransaction();
 try{foreach($rows as $i=>$raw){$rowNo=is_array($raw)?(int)($raw['_row']??($i+2)):$i+2;try{
 if(!is_array($raw))throw new ApiError('Invalid row.',422);$data=[];
 foreach(ENQUIRY_FIELDS as $f){$v=$raw[$f]??'';if(!is_scalar($v)&&$v!==null)throw new ApiError('Fields must contain plain values.',422);$data[$f]=trim((string)$v);if(mb_strlen($data[$f])>4000)throw new ApiError('A source field exceeds 4000 characters.',422);}
 $external=$data['id'];if($external===''||mb_strlen($external)>150)throw new ApiError('Missing or invalid enquiry id.',422);
 $name=crm_text($data['full_name'],150);$email=crm_text($data['email'],150);$city=crm_text($data['city'],100);$mobile=enquiry_mobile($data['phone_number']);
 if(!$name)throw new ApiError('Missing full_name.',422);if(!$mobile&&!$email)throw new ApiError('Provide a valid phone number or email.',422);if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))throw new ApiError('Invalid email address.',422);
 $at=null;if($data['created_time']!==''){try{$at=(new DateTimeImmutable($data['created_time']))->setTimezone(new DateTimeZone('Asia/Kolkata'))->format('Y-m-d H:i:s');}catch(Throwable $e){throw new ApiError('Invalid created_time.',422);}}
 $source=match(strtolower($data['platform'])){'fb','facebook'=>'Facebook','ig','instagram'=>'Instagram',default=>'Google Sheets'};
 $json=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$hash=hash('sha256',$json);$old=db_one('SELECT id,source_hash FROM enquiries WHERE BINARY external_id=BINARY ?',[$external]);
 if($old&&$old['source_hash']===$hash){$counts['unchanged']++;continue;}
 $values=[$json,$hash,$name,$mobile,$email,$city,$source,$at,now()];
 if($old){$pdo->prepare('UPDATE enquiries SET source_data=?,source_hash=?,name=?,mobile=?,email=?,city=?,source_name=?,enquiry_at=?,updated_at=? WHERE id=?')->execute([...$values,$old['id']]);$counts['updated']++;}
 else{$pdo->prepare('INSERT INTO enquiries(source_data,source_hash,name,mobile,email,city,source_name,enquiry_at,updated_at,external_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute([...$values,$external,now()]);$counts['added']++;}
 }catch(ApiError $e){$errors[]=['row'=>$rowNo,'message'=>$e->getMessage()];}}
 $pdo->prepare('INSERT INTO enquiry_sync_runs(request_key,received_at,added,updated,unchanged,errors_json,status) VALUES(?,?,?,?,?,?,?)')->execute([$key,now(),$counts['added'],$counts['updated'],$counts['unchanged'],json_encode($errors),$errors?'Partial':'Success']);
 $pdo->prepare('UPDATE enquiry_integration SET last_received_at=?,last_success_at=CASE WHEN ?=0 THEN ? ELSE last_success_at END,full_sync_requested=0 WHERE id=1')->execute([now(),count($errors),now()]);$pdo->commit();
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 return $counts+['errors'=>$errors];
 }finally{db_value('SELECT RELEASE_LOCK(?)',[$lock]);}
}
function enquiry_matches(array $e): array {
 // Match normalised phone first; email is secondary. Conflicting identities need a human decision.
 $phone=[];$email=[];if($e['mobile'])$phone=db_all("SELECT id,name,mobile,email,is_active FROM contacts WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(mobile,' ',''),'-',''),'+',''),'(',''),')','') IN (?,?)",[$e['mobile'],strlen($e['mobile'])===12&&str_starts_with($e['mobile'],'91')?substr($e['mobile'],2):$e['mobile']]);
 if($e['email'])$email=db_all('SELECT id,name,mobile,email,is_active FROM contacts WHERE LOWER(email)=LOWER(?)',[$e['email']]);
 $all=[];foreach([...$phone,...$email] as $c)$all[(int)$c['id']]=$c;return array_values($all);
}
function enquiry_find(int $id): array {
 $e=db_one('SELECT * FROM crm_enquiry_current WHERE id=?',[$id]);if(!$e)throw new ApiError('Enquiry not found.',404);$e['source_data']=json_decode($e['source_data'],true);unset($e['source_hash']);
 $e['matches']=enquiry_matches($e);$e['repeat_enquiries']=db_all('SELECT id,name,external_id,enquiry_at FROM enquiries WHERE id<>? AND ((? IS NOT NULL AND BINARY mobile=BINARY ?) OR (? IS NOT NULL AND LOWER(email)=LOWER(?))) ORDER BY id DESC LIMIT 20',[$id,$e['mobile'],$e['mobile'],$e['email'],$e['email']]);
 $e['history']=db_all('SELECT f.*,u.name AS recorded_by_name,l.lead_no FROM followups f LEFT JOIN users u ON u.id=f.recorded_by LEFT JOIN leads l ON l.id=f.lead_id WHERE f.enquiry_id=? ORDER BY f.activity_at DESC,f.id DESC',[$id]);return $e;
}
function enquiry_list(): array {
 $w=[];$p=[];$view=$_GET['view']??'pending';$open="e.contact_id IS NULL AND e.lead_id IS NULL AND BINARY e.inbox_status<>BINARY 'Archived'";
 $filters=['pending'=>$open,'new'=>"$open AND BINARY e.inbox_status=BINARY 'New'",'today'=>"$open AND DATE(e.next_followup_at)=CURRENT_DATE()",'overdue'=>"$open AND DATE(e.next_followup_at)<CURRENT_DATE()",'upcoming'=>"$open AND DATE(e.next_followup_at)>CURRENT_DATE()",'converted'=>'e.contact_id IS NOT NULL','archived'=>"BINARY e.inbox_status=BINARY 'Archived'",'all'=>'1=1'];
 $w[]=$filters[$view]??$filters['pending'];
 foreach(['source_name','city','assigned_to']as$k)if(($_GET[$k]??'')!==''){$w[]="e.$k=:$k";$p[$k]=$_GET[$k];}
 crm_where_search($w,$p,['e.name','e.mobile','e.email','e.city','e.external_id','e.source_data']);
 $result=crm_page('SELECT e.* FROM crm_enquiry_current e WHERE '.implode(' AND ',$w).' ORDER BY e.created_at DESC,e.id DESC',$p);
 foreach($result['data'] as &$r){$r['source_data']=json_decode($r['source_data'],true);unset($r['source_hash']);}return $result;
}
function enquiry_followup(int $id,array $in): array {
 require_roles(['Admin','Sales']);$decision=$in['decision']??'';if(!in_array($decision,['Create Lead','Keep as Contact','Follow up Later','Archive'],true))throw new ApiError('Choose a qualification decision.',422);
 $key=crm_text($in['request_key']??'',64);if(!$key)throw new ApiError('Missing request key.',422);
 $qualificationLock='enquiry_qualify_'.substr(hash('sha256',(string)db_value('SELECT DATABASE()')),0,20);if(!db_value('SELECT GET_LOCK(?,10)',[$qualificationLock]))throw new ApiError('Another qualification is running. Please retry.',503);
 $pdo=db();try{$pdo->beginTransaction();try{
 $e=db_one('SELECT * FROM enquiries WHERE id=? FOR UPDATE',[$id]);if(!$e)throw new ApiError('Enquiry not found.',404);
 $prior=db_one('SELECT id,enquiry_id FROM followups WHERE request_key=?',[$key]);if($prior){if((int)$prior['enquiry_id']!==$id)throw new ApiError('Request key already used.',409);$pdo->commit();return ['data'=>enquiry_find($id),'message'=>'Follow-up already saved.'];}
 if($e['contact_id']||$e['lead_id'])throw new ApiError('This enquiry has been qualified. Continue from the linked Contact or Lead.',409);
 $last=db_one('SELECT enquiry_decision FROM followups WHERE enquiry_id=? ORDER BY activity_at DESC,id DESC LIMIT 1',[$id]);if(($last['enquiry_decision']??'')==='Archive'&&app_role()!=='Admin')throw new ApiError('Only Admin can reopen an archived enquiry.',403);
 $method=$in['method']??'Call';if(!in_array($method,['Call','WhatsApp','Email','Meeting','Other'],true))throw new ApiError('Choose a follow-up method.',422);
 $remarks=crm_text($in['remarks']??'',10000);if(!$remarks)throw new ApiError('Enter discussion notes or the archive reason.',422);
 $next=crm_datetime($in['next_followup_at']??'');if(in_array($decision,['Follow up Later','Create Lead'],true)&&(!$next||$next<now()))throw new ApiError('Enter a future next follow-up date and time.',422);
 if(!in_array($decision,['Follow up Later','Create Lead'],true))$next=null;
 $cid=null;$lid=null;$temp=null;
 if(in_array($decision,['Create Lead','Keep as Contact'],true)){
  $matches=enquiry_matches($e);$selected=(int)($in['contact_id']??0);
  if($matches){if(!$selected&&count($matches)===1)$selected=(int)$matches[0]['id'];if(!$selected||!in_array($selected,array_map('intval',array_column($matches,'id')),true))throw new ApiError('Choose the matching Contact to resolve the duplicate.',422);$cid=$selected;if(!db_value('SELECT is_active FROM contacts WHERE id=?',[$cid]))throw new ApiError('Ask Admin to reactivate this Contact before qualification.',422);}
  elseif($selected)throw new ApiError('The selected Contact does not match this enquiry.',422);
  else{
   $source=(int)db_value('SELECT id FROM lead_sources WHERE name=?',[$e['source_name']]);if(!$source){$pdo->prepare('INSERT INTO lead_sources(code,name,is_active) VALUES(?,?,1)')->execute([next_doc_no('lead_sources','SRC','code'),$e['source_name']]);$source=(int)$pdo->lastInsertId();}
   $data=json_decode($e['source_data'],true);$c=$in['contact']??[];
   $cid=(int)contact_save(null,['name'=>$c['name']??$e['name'],'mobile'=>$c['mobile']??$e['mobile'],'email'=>$c['email']??$e['email'],'city'=>$c['city']??$e['city'],'category_id'=>$c['category_id']??0,'source_id'=>$source,'source_details'=>mb_substr($data['campaign_name']??'',0,150)])['data']['id'];
  }
  if($decision==='Create Lead'){$temp=$in['temperature']??'';if(!in_array($temp,CRM_TEMPERATURES,true))throw new ApiError('Select Hot, Warm or Cold.',422);$lid=(int)lead_save(null,['contact_id'=>$cid,'enquiry_date'=>($e['enquiry_at']&&substr($e['enquiry_at'],0,10)<=date('Y-m-d')?substr($e['enquiry_at'],0,10):date('Y-m-d')),'project_name'=>$in['project_name']??'','requirement'=>$in['requirement']??'','initial_temperature'=>$temp])['data']['id'];}
  $pdo->prepare('UPDATE enquiries SET contact_id=?,lead_id=? WHERE id=?')->execute([$cid,$lid,$id]);
  // Keep the same history rows, now visible from the qualified Contact/Lead as well.
  $pdo->prepare('UPDATE followups SET contact_id=?,lead_id=? WHERE enquiry_id=?')->execute([$lid?null:$cid,$lid,$id]);
 }
 $assigned=$in['assigned_to']??null;if($assigned!==null&&$assigned!==''){
  $assigned=(int)$assigned;if(!db_value("SELECT COUNT(*) FROM users WHERE id=? AND is_active=1 AND role IN ('Admin','Sales')",[$assigned]))throw new ApiError('Choose an active Sales or Admin user.',422);
  if($e['assigned_to']&&$assigned!==(int)$e['assigned_to'])require_admin();$pdo->prepare('UPDATE enquiries SET assigned_to=? WHERE id=?')->execute([$assigned,$id]);
 }
 crm_insert_followup(['request_key'=>$key,'enquiry_id'=>$id,'enquiry_decision'=>$decision,'contact_id'=>$lid?null:$cid,'lead_id'=>$lid,'activity_at'=>now(),'method'=>$method,'remarks'=>$remarks,'lead_status'=>$lid?'Open':null,'lead_temperature'=>$temp,'further_followup_required'=>$next?1:0,'next_followup_at'=>$next]);
 $pdo->commit();return ['data'=>enquiry_find($id),'message'=>$decision==='Create Lead'?'Follow-up saved and Lead created.':($decision==='Keep as Contact'?'Follow-up saved and Contact linked.':'Follow-up saved.')];
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }finally{db_value('SELECT RELEASE_LOCK(?)',[$qualificationLock]);}
}
function enquiries_route(string $method,array $parts): void {
 require_roles(['Admin','Sales']);$first=$parts[0]??'';
 if($first==='filters'&&$method==='GET'){json_out(['data'=>['cities'=>array_column(db_all("SELECT DISTINCT city FROM enquiries WHERE city IS NOT NULL ORDER BY city"),'city'),'sources'=>array_column(db_all('SELECT DISTINCT source_name FROM enquiries ORDER BY source_name'),'source_name')]]);return;}
 if($first==='settings'){
 require_admin();header('Cache-Control: no-store');
 if($method==='GET'){json_out(['data'=>db_one('SELECT spreadsheet_id,tab_name,is_enabled,last_received_at,last_success_at,full_sync_requested,token_hash IS NOT NULL AS configured FROM enquiry_integration WHERE id=1')]);return;}
 if($method==='PUT'){$in=request_body();$sheet=trim((string)($in['spreadsheet_id']??''));$tab=crm_text($in['tab_name']??'',150);if(!preg_match('/^[a-zA-Z0-9_-]{20,150}$/',$sheet)||!$tab)throw new ApiError('Enter a valid spreadsheet ID and tab.',422);$old=db_one('SELECT * FROM enquiry_integration WHERE id=1');if($old['spreadsheet_id']!==$sheet||$old['tab_name']!==$tab)throw new ApiError('This Inbox is linked to the original sheet. Use a separate integration for another sheet.',409);db()->prepare('UPDATE enquiry_integration SET is_enabled=? WHERE id=1')->execute([!empty($in['is_enabled'])?1:0]);json_out(['message'=>'Connection settings saved.']);return;}
 }
 if($first==='connection-script'&&$method==='POST'){
 require_admin();$token=bin2hex(random_bytes(32));db()->prepare('UPDATE enquiry_integration SET token_hash=?,is_enabled=1 WHERE id=1')->execute([hash('sha256',$token)]);$s=db_one('SELECT * FROM enquiry_integration WHERE id=1');
 $script=file_get_contents(__DIR__.'/../integrations/CandelierSync.gs');$script=str_replace(['__SHEET_ID__','__TAB_NAME__','__TOKEN__'],[$s['spreadsheet_id'],str_replace(["\\","'"],["\\\\","\\'"],$s['tab_name']),$token],$script);header('Cache-Control: no-store');json_out(['script'=>$script,'filename'=>'CandelierSync.gs']);return;
 }
 if($first==='request-sync'&&$method==='POST'){require_admin();db()->exec('UPDATE enquiry_integration SET full_sync_requested=1 WHERE id=1');json_out(['message'=>'Full sync requested. The next Google trigger will restart from row 2. For immediate sync, use Candelier → Sync Now in the sheet.']);return;}
 if($first==='sync-history'&&$method==='GET'){ $r=crm_page('SELECT * FROM enquiry_sync_runs ORDER BY id DESC');foreach($r['data']as &$row){$row['errors']=json_decode($row['errors_json'],true);unset($row['errors_json'],$row['request_key']);}json_out($r);return;}
 if($first===''&&$method==='GET'){json_out(enquiry_list());return;}
 if(ctype_digit($first)&&($parts[1]??'')==='followups'&&$method==='POST'){json_out(enquiry_followup((int)$first,request_body()));return;}
 if(ctype_digit($first)&&count($parts)===1&&$method==='GET'){json_out(['data'=>enquiry_find((int)$first)]);return;}
 throw new ApiError('Not found.',404);
}
