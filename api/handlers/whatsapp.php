<?php
function migrate_whatsapp(): void {
 db()->exec("CREATE TABLE IF NOT EXISTS whatsapp_settings(id INT PRIMARY KEY,api_key TEXT NOT NULL,phone_id VARCHAR(80) NOT NULL DEFAULT '') ENGINE=InnoDB");
 db()->exec("CREATE TABLE IF NOT EXISTS whatsapp_campaigns(id INT AUTO_INCREMENT PRIMARY KEY,request_key VARCHAR(80) UNIQUE NOT NULL,name VARCHAR(120) NOT NULL,template_name VARCHAR(120) NOT NULL,language VARCHAR(20) NOT NULL,phone_id VARCHAR(80) NOT NULL,created_by INT NOT NULL,created_at DATETIME NOT NULL) ENGINE=InnoDB");
 db()->exec("CREATE TABLE IF NOT EXISTS whatsapp_messages(id INT AUTO_INCREMENT PRIMARY KEY,campaign_id INT NOT NULL,contact_id INT NOT NULL,contact_name VARCHAR(200) NOT NULL,recipient VARCHAR(30) NOT NULL,status VARCHAR(30) NOT NULL,user_message_id VARCHAR(255) NULL,provider_id VARCHAR(255) NULL,wa_id VARCHAR(255) NULL,status_times LONGTEXT NOT NULL,error_text TEXT NULL,payload LONGTEXT NOT NULL,updated_at DATETIME NOT NULL,UNIQUE KEY recipient(campaign_id,recipient),KEY campaign_status(campaign_id,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
function wa_secret(): string {return hash('sha256',json_encode($GLOBALS['CONFIG']['db']).'|redlava-v1',true);}
function wa_encrypt(string $s): string {$iv=random_bytes(12);$tag='';$c=openssl_encrypt($s,'aes-256-gcm',wa_secret(),OPENSSL_RAW_DATA,$iv,$tag);if($c===false)throw new ApiError('Encryption unavailable.',500);return base64_encode($iv.$tag.$c);}
function wa_decrypt(string $s): string {$v=base64_decode($s,true);$out=$v===false?false:openssl_decrypt(substr($v,28),'aes-256-gcm',wa_secret(),OPENSSL_RAW_DATA,substr($v,0,12),substr($v,12,16));if($out===false)throw new ApiError('Re-enter the API key in Settings.',422);return $out;}
function wa_settings(): array {$s=db_one('SELECT * FROM whatsapp_settings WHERE id=1');return ['configured'=>!empty($s['api_key']),'phone_id'=>$s['phone_id']??''];}
function wa_save_settings(array $b): array {
 require_admin();$old=db_one('SELECT * FROM whatsapp_settings WHERE id=1');$key=trim((string)($b['api_key']??''));$phone=trim((string)($b['phone_id']??''));
 if(strlen($key)>1000||preg_match('/[\r\n]/',$key)||($phone!==''&&!preg_match('/^\d{1,80}$/',$phone)))throw new ApiError('Invalid API key or Phone ID.',422);
 $enc=$key!==''?wa_encrypt($key):($old['api_key']??'');if($enc==='')throw new ApiError('API key is required.',422);
 db()->prepare('INSERT INTO whatsapp_settings VALUES(1,?,?) ON DUPLICATE KEY UPDATE api_key=VALUES(api_key),phone_id=VALUES(phone_id)')->execute([$enc,$phone]);return ['data'=>wa_settings(),'message'=>'Red Lava settings saved.'];
}
function wa_phone(string $raw): string {$n=preg_replace('/\D/','',$raw);if(strlen($n)===10)$n='91'.$n;return preg_match('/^[1-9]\d{7,14}$/',$n)?$n:'';}
function wa_create(array $b): array {
 if(!wa_settings()['configured'])throw new ApiError('Ask Admin to configure Red Lava first.',422);
 $key=(string)($b['request_key']??'');if(!preg_match('/^[a-zA-Z0-9-]{10,80}$/',$key))throw new ApiError('Invalid request key.',422);
 $old=db_one('SELECT id FROM whatsapp_campaigns WHERE request_key=?',[$key]);if($old)return ['data'=>$old];
 $name=trim((string)($b['name']??''));$template=trim((string)($b['template_name']??''));$lang=trim((string)($b['language']??''));$vars=$b['variables']??[];$ids=array_unique(array_map('intval',$b['contact_ids']??[]));
 if($name===''||strlen($name)>120||!preg_match('/^[a-zA-Z0-9_]{1,120}$/',$template)||!preg_match('/^[a-zA-Z_-]{2,20}$/',$lang)||!is_array($vars)||count($vars)>30||!$ids||count($ids)>1000)throw new ApiError('Enter campaign name, template, language and select up to 1,000 contacts.',422);
 foreach($vars as $v)if(!is_string($v)||mb_strlen($v)>2000)throw new ApiError('Invalid template variable.',422);
 $contacts=db_all('SELECT id,name,company_name,mobile,is_active FROM contacts WHERE id IN ('.implode(',',array_fill(0,count($ids),'?')).')',array_values($ids));$recipients=[];$skipped=count($ids)-count($contacts);
 foreach($contacts as $c){$n=wa_phone((string)$c['mobile']);if(!$n||!$c['is_active']||isset($recipients[$n])){$skipped++;continue;}$recipients[$n]=$c;}if(!$recipients)throw new ApiError('No active contacts with valid mobile numbers selected.',422);
 db()->beginTransaction();try{db()->prepare('INSERT INTO whatsapp_campaigns(request_key,name,template_name,language,phone_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)')->execute([$key,$name,$template,$lang,wa_settings()['phone_id'],current_user()['id'],now()]);$id=(int)db()->lastInsertId();
 foreach($recipients as $n=>$c){$values=array_map(fn($v)=>str_replace(['{{name}}','{{company}}'],[$c['name'],$c['company_name']??''],$v),$vars);$payload=['templateName'=>$template,'language'=>$lang,'to'=>(string)$n,'templateVariables'=>$values];db()->prepare("INSERT INTO whatsapp_messages(campaign_id,contact_id,contact_name,recipient,status,status_times,payload,updated_at) VALUES(?,?,?,?,'pending',?,?,?)")->execute([$id,$c['id'],$c['name'],(string)$n,json_encode(['pending'=>now()]),json_encode($payload),now()]);}db()->commit();return ['data'=>['id'=>$id,'recipients'=>count($recipients),'skipped'=>$skipped]];}catch(Throwable $e){db()->rollBack();throw $e;}
}
function wa_http(string $method,string $path,?array $body=null,?string $phone=null): array {
 if(isset($GLOBALS['WA_TEST_TRANSPORT'])&&str_contains(getenv('TEST_DB_DSN')?:'','candelier_test'))return ($GLOBALS['WA_TEST_TRANSPORT'])($method,$path,$body);
 $s=db_one('SELECT * FROM whatsapp_settings WHERE id=1');if(!$s)throw new ApiError('Configure Red Lava first.',422);if(!function_exists('curl_init'))throw new ApiError('PHP cURL is required.',503);
 $headers=['Accept: application/json','Content-Type: application/json','x-api-key: '.wa_decrypt($s['api_key'])];$phone=$phone??$s['phone_id'];if($phone!=='')$headers[]='x-phone-id: '.$phone;
 $ch=curl_init('https://wa.redlava.in/api/v1/whatsapp/'.$path);curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>25,CURLOPT_FOLLOWLOCATION=>false]);if($body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($body));$raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$err=curl_errno($ch);curl_close($ch);if($err||$raw===false)throw new ApiError('Provider response uncertain.',502);$data=json_decode($raw,true);if(!is_array($data))throw new ApiError('Unreadable provider response.',502);return ['code'=>$code,'data'=>$data];
}
function wa_timestamp($v): ?string {if(!is_scalar($v)||$v==='')return null;if(is_numeric($v)){$n=(float)$v;if($n>100000000000)$n/=1000;return $n>0?date('Y-m-d H:i:s',(int)$n):null;}$t=strtotime((string)$v);return $t===false?null:date('Y-m-d H:i:s',$t);}
function wa_error_message(array $response): string {
 $d=$response['data'];$e=$d['error']??null;$parts=[];
 $append=function($v)use(&$parts){if(is_scalar($v)&&trim((string)$v)!=='')$parts[]=trim((string)$v);};
 if(is_array($e)){
  foreach(['title','message','details','description'] as $k)$append($e[$k]??null);
  if(is_array($e['errorData']??null))$append($e['errorData']['details']??null);
  if(is_array($e['error_data']??null))$append($e['error_data']['details']??null);
  if(isset($e['code']))$append('Provider code: '.(string)$e['code']);
  if(isset($e['errorSubcode']))$append('Subcode: '.(string)$e['errorSubcode']);
 }else $append($e);
 foreach(['title','detail','message','description','error_description'] as $k)$append($d[$k]??null);
 if(is_array($d['errors']??null)){foreach($d['errors'] as $v){if(is_array($v)){foreach($v as $message){if(is_array($message))foreach($message as $text)$append($text);else $append($message);}}else $append($v);}}
 $text=implode(' | ',array_unique($parts));
 // Never echo credentials that may have been reflected in a provider error.
 $settings=db_one('SELECT api_key FROM whatsapp_settings WHERE id=1');
 if($settings){try{$key=wa_decrypt($settings['api_key']);if($key!=='')$text=str_replace($key,'[redacted]',$text);}catch(Throwable $ignored){}}
 $text=preg_replace('/(Bearer\s+)[^\s,;]+/i','$1[redacted]',$text);
 return mb_substr('HTTP '.(int)$response['code'].' — '.($text!==''?$text:'Provider rejected the request without an error description. Check the request in Red Lava.'),0,4000);
}
function wa_apply(int $id,array $r,bool $report=false): void {
 $d=$r['data'];$old=db_one('SELECT * FROM whatsapp_messages WHERE id=?',[$id]);$times=json_decode($old['status_times'],true)?:[];$error=$d['error']??null;
 if(!$report&&$r['code']<300&&!$error&&empty($d['id'])&&empty($d['userMessageId'])&&empty($d['waMessageId']))throw new ApiError('No message ID returned.',502);
 if($error||$r['code']>=300){$status='failed';$text=wa_error_message($r);}else{$status=$report?strtolower((string)($d['lastStatus']??$old['status'])):'accepted';$text=null;}
 if(!in_array($status,['pending','accepted','sent','delivered','read','failed','deleted','captured'],true))$status=$old['status'];
 if(!$report)$times[$status]=now();foreach(($d['statusTime']??[]) as $s=>$t){$parsed=wa_timestamp($t);if($parsed)$times[$s]=$parsed;}foreach(($d['statuses']??[]) as $e){$parsed=wa_timestamp($e['timestamp']??null);if($parsed&&isset($e['status']))$times[strtolower($e['status'])]=$parsed;}
 db()->prepare('UPDATE whatsapp_messages SET status=?,user_message_id=COALESCE(?,user_message_id),provider_id=COALESCE(?,provider_id),wa_id=COALESCE(?,wa_id),status_times=?,error_text=?,updated_at=? WHERE id=?')->execute([$status,$d['userMessageId']??null,$d['id']??null,$d['waMessageId']??$d['waId']??null,json_encode($times),$text,now(),$id]);
}
function wa_process(int $campaign): array {
 $row=db_one("SELECT id FROM whatsapp_messages WHERE campaign_id=? AND status='pending' ORDER BY id LIMIT 1",[$campaign]);if(!$row)return ['remaining'=>0];
 // Validate configuration before claiming; uncertain sends never return to pending automatically.
 $s=db_one('SELECT * FROM whatsapp_settings WHERE id=1');if(!$s)throw new ApiError('Configure Red Lava first.',422);wa_decrypt($s['api_key']);
 $claim=db()->prepare("UPDATE whatsapp_messages SET status='sending',updated_at=? WHERE id=? AND status='pending'");$claim->execute([now(),$row['id']]);if(!$claim->rowCount())return ['remaining'=>1];$m=db_one('SELECT * FROM whatsapp_messages WHERE id=?',[$row['id']]);
 try{wa_apply((int)$m['id'],wa_http('POST','sendMessage',json_decode($m['payload'],true),(string)db_value('SELECT phone_id FROM whatsapp_campaigns WHERE id=?',[$campaign])));}catch(Throwable $e){db()->prepare("UPDATE whatsapp_messages SET status='unknown',error_text=?,updated_at=? WHERE id=?")->execute(['Result uncertain. Check Red Lava before resending.',now(),$m['id']]);}
 return ['remaining'=>(int)db_value("SELECT COUNT(*) FROM whatsapp_messages WHERE campaign_id=? AND status='pending'",[$campaign])];
}
function whatsapp_route(string $method,array $parts): void {
 require_roles(['Admin','Sales']);$first=$parts[0]??'';
 if($method==='GET'&&$first==='contact'){ $contact=(int)($parts[1]??0);$page=max(1,(int)($_GET['page']??1));$total=(int)db_value('SELECT COUNT(*) FROM whatsapp_messages WHERE contact_id=?',[$contact]);$offset=($page-1)*20;$rows=db_all('SELECT m.id,m.status,m.status_times,m.error_text,m.updated_at,c.name AS campaign_name FROM whatsapp_messages m JOIN whatsapp_campaigns c ON c.id=m.campaign_id WHERE m.contact_id=? ORDER BY m.id DESC LIMIT 20 OFFSET '.$offset,[$contact]);foreach($rows as &$r)$r['status_times']=json_decode($r['status_times'],true);json_out(['data'=>$rows,'total'=>$total,'page'=>$page,'pages'=>max(1,(int)ceil($total/20))]);return;}
 if($first==='settings'){require_admin();if($method==='GET')json_out(['data'=>wa_settings()]);elseif($method==='PUT')json_out(wa_save_settings(request_body()));else throw new ApiError('Not found.',404);return;}
 if($first==='campaigns'&&count($parts)===1){if($method==='GET'){json_out(['data'=>db_all('SELECT c.*,(SELECT COUNT(*) FROM whatsapp_messages m WHERE m.campaign_id=c.id) AS recipients FROM whatsapp_campaigns c ORDER BY c.id DESC LIMIT 1000')]);return;}if($method==='POST'){json_out(wa_create(request_body()),201);return;}}
 $id=(int)($parts[1]??0);if($first!=='campaigns'||!db_value('SELECT id FROM whatsapp_campaigns WHERE id=?',[$id]))throw new ApiError('Campaign not found.',404);
 if($method==='POST'&&($parts[2]??'')==='process'){json_out(wa_process($id));return;}
 if($method==='POST'&&($parts[2]??'')==='refresh'){$m=db_one('SELECT * FROM whatsapp_messages WHERE campaign_id=? AND id=?',[$id,(int)(request_body()['message_id']??0)]);if(!$m||!$m['user_message_id'])throw new ApiError('No report ID. Check this message in Red Lava.',422);$r=wa_http('GET','report/userMessageId/'.rawurlencode($m['user_message_id']),null,(string)db_value('SELECT phone_id FROM whatsapp_campaigns WHERE id=?',[$id]));if($r['code']>=300)throw new ApiError('Could not retrieve report from Red Lava.',502);wa_apply((int)$m['id'],$r,true);json_out(['message'=>'Status refreshed.']);return;}
 if($method==='GET'&&count($parts)===2){$status=(string)($_GET['status']??'');$page=max(1,(int)($_GET['page']??1));$args=[$id];$where='campaign_id=?';if($status!==''){$where.=' AND status=?';$args[]=$status;}$total=(int)db_value('SELECT COUNT(*) FROM whatsapp_messages WHERE '.$where,$args);$offset=($page-1)*20;$rows=db_all('SELECT id,contact_id,contact_name,recipient,status,status_times,error_text,updated_at,user_message_id FROM whatsapp_messages WHERE '.$where." ORDER BY id LIMIT 20 OFFSET $offset",$args);foreach($rows as &$r)$r['status_times']=json_decode($r['status_times'],true);json_out(['data'=>$rows,'total'=>$total,'page'=>$page,'pages'=>max(1,(int)ceil($total/20)),'counts'=>db_all('SELECT status,COUNT(*) AS count FROM whatsapp_messages WHERE campaign_id=? GROUP BY status',[$id])]);return;}throw new ApiError('Not found.',404);
}
