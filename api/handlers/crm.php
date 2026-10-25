<?php
// Contacts are people; Leads are requirements; all lifecycle/schedule state lives in followups.
const CRM_OUTCOMES=['Connected','No Answer','Busy','Not Reachable','Not Interested','Invalid Number'];
const LEAD_STATUSES=['Open','Success','Fail'];
const CRM_TEMPERATURES=['Hot','Warm','Cold'];
const LEAD_SELECT='SELECT l.* FROM crm_lead_current l';
function crm_text($v,int $max=500): ?string { $v=trim((string)($v??'')); if(mb_strlen($v)>$max)throw new ApiError("Keep text under $max characters.",422); return $v===''?null:$v; }
function crm_page(string $sql,array $params=[]): array {
    $total=(int)db_value("SELECT COUNT(*) FROM ($sql) page_rows",$params);
    $pages=max(1,(int)ceil($total/20));$page=min($pages,max(1,(int)($_GET['page']??1)));$offset=($page-1)*20;
    return ['data'=>db_all($sql." LIMIT 20 OFFSET $offset",$params),'total'=>$total,'page'=>$page,'pages'=>$pages,'per_page'=>20];
}
function crm_where_search(array &$where,array &$params,array $cols): void {
    $q=trim((string)($_GET['q']??''));if($q==='')return;$or=[];
    foreach($cols as $i=>$c){$or[]="$c LIKE :q$i";$params["q$i"]="%$q%";}$where[]='('.implode(' OR ',$or).')';
}
function contacts_route(string $method,array $parts): void {
    if(($parts[0]??'')==='bulk'&&$method==='POST'){json_out(contact_bulk(request_body()),201);return;}
    $id=isset($parts[0])?(int)$parts[0]:null;
    if($id===null){if($method==='GET'){json_out(contact_list());return;}if($method==='POST'){json_out(contact_save(null,request_body()),201);return;}}
    else {if($method==='GET'){json_out(['data'=>contact_find($id)]);return;}if($method==='PUT'){json_out(contact_save($id,request_body()));return;}}
    throw new ApiError('Not found.',404);
}
function contact_list(): array {
    $w=[];$p=[];$view=$_GET['view']??'all';
    $open='c.further_followup_required=1';
    $today="DATE(c.next_followup_at)=CURRENT_DATE()";
    $filters=['never'=>'c.followup_count=0','today'=>"$open AND $today",'upcoming'=>"$open AND DATE(c.next_followup_at)>CURRENT_DATE()",'overdue'=>"$open AND DATE(c.next_followup_at)<CURRENT_DATE()",'missing'=>"c.followup_count>0 AND c.next_followup_at IS NULL AND (c.further_followup_required=1 OR c.further_followup_required IS NULL)",'closed'=>'c.further_followup_required=0','customers'=>"EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.status<>'Cancelled' AND ".order_visibility_sql().')'];
    if(isset($filters[$view]))$w[]=$filters[$view];
    foreach(['category_id','source_id']as$k)if(!empty($_GET[$k])){$w[]="c.$k=:$k";$p[$k]=(int)$_GET[$k];}
    if(trim((string)($_GET['city']??''))!==''){$w[]='c.city=:city';$p['city']=trim($_GET['city']);}
    if(($_GET['active']??'')!==''){$w[]='c.is_active=:active';$p['active']=(int)$_GET['active'];}
    crm_where_search($w,$p,['c.name','c.company_name','c.mobile','c.email','c.city','c.source_details']);
    $result=crm_page('SELECT c.* FROM crm_contact_current c'.($w?' WHERE '.implode(' AND ',$w):'').' ORDER BY c.name,c.id',$p);
    $result['data']=array_map('crm_visible_contact',$result['data']);return $result;
}
function contact_find(int $id): array {
    $c=db_one('SELECT * FROM crm_contact_current WHERE id=:id',['id'=>$id]);if(!$c)throw new ApiError('Contact not found.',404);
    $c=crm_visible_contact($c);$c['history']=crm_history($id,null);$c['leads']=array_map('crm_visible_lead',db_all(LEAD_SELECT.' WHERE l.contact_id=:id ORDER BY l.id DESC',['id'=>$id]));
    if(app_role()==='Store'){$c['history']=[];$c['leads']=[];}
    $c['orders']=db_all('SELECT id,order_no,order_date,status FROM orders WHERE customer_id=:id AND '.order_visibility_sql('orders').' ORDER BY order_date DESC,id DESC',['id'=>$id]);return $c;
}
function contact_save(?int $id,array $in): array {
    if($id)require_admin();else require_roles(['Admin','Sales']);
    $old=$id?db_one('SELECT * FROM contacts WHERE id=:id',['id'=>$id]):null;if($id&&!$old)throw new ApiError('Contact not found.',404);
    $h=[];foreach(['name'=>150,'company_name'=>150,'email'=>150,'city'=>100,'address'=>2000,'source_details'=>150]as$k=>$max)$h[$k]=crm_text($in[$k]??'', $max);
    if(!$h['name'])throw new ApiError('Enter the contact name.',422,['name'=>'Required.']);
    foreach(['mobile'=>'phone','alternate_mobile'=>'contact_mobile']as$k=>$alias){$raw=trim((string)($in[$k]??$in[$alias]??''));$h[$k]=preg_replace('/[^0-9]/','',$raw)?:null;if($h[$k]&&!preg_match('/^\d{10,15}$/',$h[$k]))throw new ApiError('Enter a valid mobile number.',422,[$k=>'Use 10 to 15 digits.']);}
    if(!$h['mobile']&&!$h['email']&&!$old)throw new ApiError('Enter a mobile number or email.',422);
    if($h['email']&&!filter_var($h['email'],FILTER_VALIDATE_EMAIL))throw new ApiError('Enter a valid email.',422,['email'=>'Invalid email.']);
    foreach(['category_id'=>'client_categories','source_id'=>'lead_sources','state_id'=>'states']as$k=>$table){$h[$k]=(int)($in[$k]??0)?:null;if($h[$k]&&!db_value("SELECT COUNT(*) FROM $table WHERE id=:id",['id'=>$h[$k]]))throw new ApiError('Choose a valid '.str_replace('_id','',$k).'.',422);}
    $h['is_active']=isset($in['is_active'])?(int)(bool)$in['is_active']:($old['is_active']??1);
    if($h['mobile']&&(!$old||$h['mobile']!==$old['mobile'])&&db_value("SELECT COUNT(*) FROM contacts WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(mobile,' ',''),'-',''),'+',''),'(',''),')','')=:m AND id<>:id",['m'=>$h['mobile'],'id'=>$id??0]))throw new ApiError('A contact with this mobile already exists. Use the existing contact.',422,['mobile'=>'Duplicate mobile.']);
    if($h['email']&&(!$old||strcasecmp($h['email'],$old['email']??'')!==0)&&db_value('SELECT COUNT(*) FROM contacts WHERE email=:e AND id<>:id',['e'=>$h['email'],'id'=>$id??0]))throw new ApiError('A contact with this email already exists. Use the existing contact.',422,['email'=>'Duplicate email.']);
    $h['updated_at']=now();
    if(!$id){$h['contact_no']=next_doc_no('contacts','CON','contact_no');$h['created_by']=current_user()['id']??null;$h['created_at']=now();$cols=array_keys($h);db()->prepare('INSERT INTO contacts('.implode(',',$cols).') VALUES(:'.implode(',:',$cols).')')->execute($h);$id=(int)db()->lastInsertId();}
    else {$set=implode(',',array_map(fn($k)=>"$k=:$k",array_keys($h)));db()->prepare("UPDATE contacts SET $set WHERE id=:id")->execute($h+['id'=>$id]);}
    return ['data'=>contact_find($id),'message'=>'Contact saved.'];
}
function contact_bulk(array $in): array {
    $rows=$in['rows']??[];if(!is_array($rows)||!$rows||count($rows)>1000)throw new ApiError('Upload between 1 and 1000 contacts.',422);
    $pdo=db();$pdo->beginTransaction();$errors=[];$added=0;
    try{foreach($rows as$i=>$row){try{
        if(!is_array($row))throw new ApiError('Invalid row.',422);
        foreach(['category'=>'client_categories','source'=>'lead_sources','state'=>'states']as$k=>$table){if(trim((string)($row[$k]??''))!==''){$found=db_value("SELECT id FROM $table WHERE name=:n",['n'=>trim($row[$k])]);if(!$found)throw new ApiError("Unknown $k: ".$row[$k],422);$row[$k.'_id']=(int)$found;}}
        contact_save(null,$row);$added++;
    }catch(ApiError $e){$errors['Row '.($i+2)]=$e->getMessage();}}
    if($errors)throw new ApiError('No contacts imported. Fix the indicated rows.',422,$errors);$pdo->commit();}
    catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}return ['message'=>"$added contacts imported.",'added'=>$added];
}
function leads_route(string $method,array $parts): void {
    $id=isset($parts[0])?(int)$parts[0]:null;$sub=$parts[1]??null;
    if($id===null){if($method==='GET'){json_out(lead_list());return;}if($method==='POST'){json_out(lead_save(null,request_body()),201);return;}}
    elseif($sub==='customer'&&$method==='POST'){json_out(lead_customer($id));return;}
    elseif($sub==='followups'&&$method==='POST'){json_out(crm_followup_save(request_body()+['lead_id'=>$id]),201);return;}
    elseif($sub===null){if($method==='GET'){json_out(['data'=>lead_find($id)]);return;}if($method==='PUT'){json_out(lead_save($id,request_body()));return;}if($method==='DELETE'){json_out(lead_delete($id));return;}}
    throw new ApiError('Not found.',404);
}
function lead_list(): array {
    $w=[];$p=[];foreach(['status'=>LEAD_STATUSES,'temperature'=>CRM_TEMPERATURES]as$k=>$values)if(in_array($_GET[$k]??'',$values,true)){$w[]="l.$k=:$k";$p[$k]=$_GET[$k];}
    foreach(['contact_id','source_id']as$k)if(!empty($_GET[$k])){$w[]="l.$k=:$k";$p[$k]=(int)$_GET[$k];}
    crm_where_search($w,$p,['l.lead_no','l.display_name','l.display_phone','l.project_name','l.requirement']);
    $result=crm_page(LEAD_SELECT.($w?' WHERE '.implode(' AND ',$w):'').' ORDER BY l.enquiry_date DESC,l.id DESC',$p);$result['data']=array_map('crm_visible_lead',$result['data']);return $result;
}
function lead_find(int $id): array {
    $l=db_one(LEAD_SELECT.' WHERE l.id=:id',['id'=>$id]);if(!$l)throw new ApiError('Lead not found.',404);
    $l=crm_visible_lead($l);$l['id']=(int)$l['id'];$l['contact_id']=(int)$l['contact_id'];$l['customer_id']=(int)$l['contact_id'];
    $l['followups']=crm_history(null,$id);$l['orders']=db_all('SELECT id,order_no,order_date,status FROM orders WHERE lead_id=:id AND '.order_visibility_sql('orders').' ORDER BY id DESC',['id'=>$id]);return $l;
}
function lead_save(?int $id,array $in): array {
    if($id)require_admin();else require_roles(['Admin','Sales']);
    $old=$id?lead_find($id):null;$h=['contact_id'=>(int)($in['contact_id']??0),'enquiry_date'=>trim((string)($in['enquiry_date']??$in['lead_date']??'')),'project_name'=>crm_text($in['project_name']??'',150),'requirement'=>crm_text($in['requirement']??'',10000)];
    if(!db_value('SELECT COUNT(*) FROM contacts WHERE id=:id AND is_active=1',['id'=>$h['contact_id']])&&(!$old||$old['contact_id']!==$h['contact_id']))throw new ApiError('Choose an active Contact.',422);
    if(!$h['requirement'])throw new ApiError('Enter the requirement.',422);
    if(!valid_date($h['enquiry_date'])||$h['enquiry_date']>date('Y-m-d'))throw new ApiError('Enter a valid enquiry date.',422);
    if($old&&$old['contact_id']!==$h['contact_id'])throw new ApiError('The Contact of an existing Lead cannot be changed.',409);
    $temp=$in['initial_temperature']??'Warm';if(!in_array($temp,CRM_TEMPERATURES,true))throw new ApiError('Choose Hot, Warm or Cold.',422);
    $pdo=db();$own=!$pdo->inTransaction();if($own)$pdo->beginTransaction();
    try{$h['updated_at']=now();
        if(!$id){$h['lead_no']=next_doc_no('leads','LD','lead_no');$h['created_by']=current_user()['id']??null;$h['created_at']=now();$cols=array_keys($h);$pdo->prepare('INSERT INTO leads('.implode(',',$cols).') VALUES(:'.implode(',:',$cols).')')->execute($h);$id=(int)$pdo->lastInsertId();
            crm_insert_followup(['lead_id'=>$id,'entry_type'=>'Lead Created','activity_at'=>now(),'lead_status'=>'Open','lead_temperature'=>$temp,'further_followup_required'=>1]);
        }else{$set=implode(',',array_map(fn($k)=>"$k=:$k",array_keys($h)));$pdo->prepare("UPDATE leads SET $set WHERE id=:id")->execute($h+['id'=>$id]);}
        if($own)$pdo->commit();
    }catch(Throwable $e){if($own&&$pdo->inTransaction())$pdo->rollBack();throw $e;}return ['data'=>lead_find($id),'message'=>'Lead saved.'];
}
function lead_delete(int $id): array {
    require_admin();
    lead_find($id);if(db_value("SELECT COUNT(*) FROM followups WHERE (lead_id=:l AND entry_type<>'Lead Created') OR generated_lead_id=:g",['l'=>$id,'g'=>$id])||db_value('SELECT COUNT(*) FROM orders WHERE lead_id=:l',['l'=>$id]))throw new ApiError('This Lead has history or Orders. Close it through a follow-up.',409);
    $pdo=db();$pdo->beginTransaction();try{$pdo->prepare('DELETE FROM followups WHERE lead_id=:l')->execute(['l'=>$id]);$pdo->prepare('DELETE FROM leads WHERE id=:l')->execute(['l'=>$id]);$pdo->commit();}catch(Throwable$e){$pdo->rollBack();throw$e;}return ['message'=>'Lead deleted.'];
}
function lead_customer(int $id): array {$l=lead_find($id);$c=contact_find($l['contact_id']);return ['data'=>['lead'=>$l,'customer'=>['id'=>$c['id'],'name'=>$c['name'],'address'=>$c['address']]]];}
function crm_insert_followup(array $f): int {
    $f+=['request_key'=>null,'contact_id'=>null,'lead_id'=>null,'entry_type'=>'Follow-up','method'=>null,'outcome'=>null,'remarks'=>null,'lead_status'=>null,'lead_temperature'=>null,'further_followup_required'=>0,'next_followup_at'=>null,'generated_lead_id'=>null,'recorded_by'=>current_user()['id']??null,'created_at'=>now()];
    $keys=['request_key','contact_id','lead_id','entry_type','activity_at','method','outcome','remarks','lead_status','lead_temperature','further_followup_required','next_followup_at','generated_lead_id','recorded_by','created_at'];$f=array_intersect_key($f,array_flip($keys));
    db()->prepare('INSERT INTO followups('.implode(',',$keys).') VALUES(:'.implode(',:',$keys).')')->execute($f);return(int)db()->lastInsertId();
}
function crm_datetime($v): ?string {$v=trim(str_replace('T',' ',(string)($v??'')));if($v==='')return null;if(strlen($v)===16)$v.=':00';$d=DateTime::createFromFormat('!Y-m-d H:i:s',$v);return $d&&$d->format('Y-m-d H:i:s')===$v?$v:null;}
function crm_followup_save(array $in): array {
    require_roles(['Admin','Sales']);
    $cid=(int)($in['contact_id']??0);$lid=(int)($in['lead_id']??0);if((bool)$cid===(bool)$lid)throw new ApiError('Link either a Contact or a Lead.',422);
    $pdo=db();$pdo->beginTransaction();
    try{
        $target=$lid?'leads':'contacts';$id=$lid?:$cid;if(!db_one("SELECT id FROM $target WHERE id=:id FOR UPDATE",['id'=>$id]))throw new ApiError('Record not found.',404);
        $key=crm_text($in['request_key']??'',64);
        if($key){$prior=db_one('SELECT id,contact_id,lead_id,generated_lead_id FROM followups WHERE request_key=:k',['k'=>$key]);if($prior){if((int)$prior['contact_id']!==$cid||(int)$prior['lead_id']!==$lid)throw new ApiError('This request key was already used.',409);$pdo->commit();return ['data'=>['id'=>(int)$prior['id'],'generated_lead_id'=>$prior['generated_lead_id']],'message'=>'History already saved.'];}}
        $lead=$lid?lead_find($lid):null;
        if($lead&&$lead['status']!=='Open'&&app_role()!=='Admin')throw new ApiError('This Lead is closed.',409);
        $type=$in['entry_type']??'Follow-up';if(!in_array($type,['Follow-up','Status Update'],true))throw new ApiError('Invalid entry type.',422);
        $at=crm_datetime($in['activity_at']??'');if(!$at||$at>now())throw new ApiError('Enter an activity date/time up to now.',422);
        $latest=db_value("SELECT MAX(activity_at) FROM followups WHERE ".($lid?'lead_id':'contact_id')."=:id",['id'=>$id]);if($latest&&$at<$latest)throw new ApiError('Use a date/time on or after the latest history entry.',422);
        $outcome=$in['outcome']??null;$method=$in['method']??null;
        if($type==='Follow-up'&&(!in_array($outcome,CRM_OUTCOMES,true)||!in_array($method,['Call','WhatsApp','Email','Meeting','Other'],true)))throw new ApiError('Choose the method and outcome.',422);
        if($type==='Status Update'&&!$lid)require_admin();
        $status=$lead?($in['lead_status']??$lead['status']):null;$temp=$lead?($in['lead_temperature']??$lead['temperature']):null;
        if($lead&&(!in_array($status,LEAD_STATUSES,true)||!in_array($temp,CRM_TEMPERATURES,true)))throw new ApiError('Choose a valid Lead status and temperature.',422);
        $required=filter_var($in['further_followup_required']??false,FILTER_VALIDATE_BOOLEAN);if($lead&&$status!=='Open')$required=false;
        $next=$required?crm_datetime($in['next_followup_at']??''):null;if($required&&(!$next||$next<$at))throw new ApiError('Enter the next follow-up date/time on or after this activity.',422);
        $generated=null;
        if(!empty($in['requirement_received'])){
            if($lid||$type!=='Follow-up')throw new ApiError('Create a requirement from a Contact follow-up.',422);
            $generated=lead_save(null,['contact_id'=>$cid,'enquiry_date'=>substr($at,0,10),'project_name'=>$in['project_name']??'','requirement'=>$in['requirement']??'','initial_temperature'=>$in['lead_temperature']??'Warm'])['data']['id'];
        }
        $fid=crm_insert_followup(['request_key'=>$key,'contact_id'=>$cid?:null,'lead_id'=>$lid?:null,'entry_type'=>$type,'activity_at'=>$at,'method'=>$type==='Follow-up'?$method:null,'outcome'=>$type==='Follow-up'?$outcome:null,'remarks'=>crm_text($in['remarks']??'',10000),'lead_status'=>$status,'lead_temperature'=>$temp,'further_followup_required'=>$required?1:0,'next_followup_at'=>$next,'generated_lead_id'=>$generated]);
        $pdo->commit();
    }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    return ['data'=>['id'=>$fid,'generated_lead_id'=>$generated],'message'=>$generated?'Follow-up saved and Lead created.':'History saved.'];
}
function crm_history(?int $cid,?int $lid): array {
    $where=$lid?'f.lead_id=:id':'(f.contact_id=:id1 OR l.contact_id=:id2)';$p=$lid?['id'=>$lid]:['id1'=>$cid,'id2'=>$cid];
    return db_all("SELECT f.*,l.lead_no,gen.lead_no AS generated_lead_no,u.name AS recorded_by_name FROM followups f LEFT JOIN leads l ON l.id=f.lead_id LEFT JOIN leads gen ON gen.id=f.generated_lead_id LEFT JOIN users u ON u.id=f.recorded_by WHERE $where ORDER BY f.activity_at DESC,f.id DESC",$p);
}
function crm_followups_route(string $method,array $parts): void {if($method==='POST'&&!$parts){json_out(crm_followup_save(request_body()),201);return;}if($method==='GET'&&!$parts){json_out(followup_logs());return;}throw new ApiError('Not found.',404);}
function followup_logs(): array {
    $w=[];$p=[];
    foreach(['recorded_by','lead_id','contact_id']as$k)if(!empty($_GET[$k])){$w[]=$k==='contact_id'?'c.id=:contact_id':"f.$k=:$k";$p[$k]=(int)$_GET[$k];}
    foreach(['entry_type','outcome']as$k)if(!empty($_GET[$k])){$w[]="f.$k=:$k";$p[$k]=$_GET[$k];}
    if(valid_date($_GET['from']??'')){$w[]='f.activity_at>=:from';$p['from']=$_GET['from'].' 00:00:00';}
    if(valid_date($_GET['to']??'')){$w[]='f.activity_at<=:to';$p['to']=$_GET['to'].' 23:59:59';}
    crm_where_search($w,$p,['c.name','c.mobile','l.lead_no','l.requirement','f.remarks']);
    return crm_page('SELECT f.*,c.name AS contact_name,l.lead_no,u.name AS recorded_by_name FROM followups f LEFT JOIN leads l ON l.id=f.lead_id JOIN contacts c ON c.id=COALESCE(f.contact_id,l.contact_id) LEFT JOIN users u ON u.id=f.recorded_by'.($w?' WHERE '.implode(' AND ',$w):'').' ORDER BY f.activity_at DESC,f.id DESC',$p);
}
function followups_due(): array {
    $w=["l.status='Open'","l.further_followup_required=1"];$p=[];$tab=$_GET['tab']??'today';
    $conditions=['today'=>'DATE(l.next_followup_at)=CURRENT_DATE()','overdue'=>'DATE(l.next_followup_at)<CURRENT_DATE()','upcoming'=>'DATE(l.next_followup_at)>CURRENT_DATE()','missing'=>'l.next_followup_at IS NULL'];if(isset($conditions[$tab]))$w[]=$conditions[$tab];
    if(in_array($_GET['temperature']??'',CRM_TEMPERATURES,true)){$w[]='l.temperature=:temp';$p['temp']=$_GET['temperature'];}
    crm_where_search($w,$p,['l.lead_no','l.display_name','l.requirement']);
    $result=crm_page(LEAD_SELECT.' WHERE '.implode(' AND ',$w).' ORDER BY l.next_followup_at IS NULL,l.next_followup_at,l.id',$p);$result['data']=array_map('crm_visible_lead',$result['data']);return $result;
}

// Shared CRM does not expose another salesperson's linked Order details.
function crm_visible_contact(array $c): array {
    if(app_role()==='Sales')$c['order_count']=(int)db_value("SELECT COUNT(*) FROM orders o WHERE o.customer_id=:c AND o.status<>'Cancelled' AND ".order_visibility_sql(),['c'=>$c['id']]);
    return $c;
}
function crm_visible_lead(array $l): array {
    if(app_role()==='Sales'){
        $order=db_one('SELECT o.id,o.order_no FROM orders o WHERE o.lead_id=:l AND '.order_visibility_sql().' ORDER BY o.id LIMIT 1',['l'=>$l['id']]);
        $l['order_id']=$order?(int)$order['id']:null;$l['order_no']=$order['order_no']??null;
    }return $l;
}
