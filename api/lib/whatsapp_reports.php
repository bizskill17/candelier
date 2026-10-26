<?php
// Reconcile by provider identifiers; recipient report search mirrors Red Lava's own report UI.
function wa_reconcile_recipient(array $m): bool {
 $phone=(string)db_value('SELECT phone_id FROM whatsapp_campaigns WHERE id=?',[$m['campaign_id']]);
 $r=wa_http('POST','report/messageSentReport',['pagination'=>['current'=>1,'pageSize'=>50],'order'=>[['fieldName'=>'creationTime','dir'=>'desc']],'search'=>[['fieldName'=>'to','value'=>[$m['recipient']]]]],$phone);
 if($r['code']>=300||!empty($r['data']['error']))throw new ApiError(wa_error_message($r),502);
 $rows=$r['data']['results']??$r['data']['data']['results']??null;if(!is_array($rows))throw new ApiError('Red Lava report list returned an unexpected format.',502);
 $found=false;
 foreach($rows as $report){if(!is_array($report))continue;$to=wa_phone((string)($report['to']??$report['message']['to']??''));if($to!==$m['recipient'])continue;$provider=(string)($report['id']??'');$wa=(string)($report['waId']??$report['waMessageId']??'');$user=(string)($report['userMessageId']??'');$status=strtolower((string)($report['lastStatus']??''));if($provider===''||!in_array($status,['accepted','sent','delivered','read','failed','deleted','captured'],true))continue;
 $created=wa_timestamp($report['creationTime']??null);if(!$created)continue;
 $matches=db_all('SELECT wm.* FROM whatsapp_messages wm JOIN whatsapp_campaigns wc ON wc.id=wm.campaign_id WHERE wm.recipient=? AND wc.phone_id=? AND (wm.provider_id=? OR (?<>\'\' AND wm.wa_id=?) OR (?<>\'\' AND wm.user_message_id=? AND (wm.provider_id IS NULL OR wm.provider_id=\'\')))',[$to,$phone,$provider,$wa,$wa,$user,$user]);
 if(!$matches){
  // Distinct retry attempts remain distinct history records. They are never queued for sending.
  $template=(string)($report['message']['template']['name']??'Red Lava message');$language=$report['message']['template']['language']['code']??'';if(!is_string($language))$language='';$request='report-sync-'.hash('sha256',$phone.'|'.$provider);
  db()->prepare("INSERT IGNORE INTO whatsapp_campaigns(request_key,name,template_name,language,phone_id,created_by,created_at) VALUES(?,?,?,?,?,0,?)")->execute([$request,'Red Lava report sync',mb_substr($template,0,120),mb_substr($language,0,20),$phone,$created]);$campaign=(int)db_value('SELECT id FROM whatsapp_campaigns WHERE request_key=?',[$request]);
  $payload=['__report_only'=>true,'__provider_created_at'=>$created];
  db()->prepare("INSERT IGNORE INTO whatsapp_messages(campaign_id,contact_id,contact_name,recipient,status,user_message_id,provider_id,wa_id,status_times,payload,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")->execute([$campaign,$m['contact_id'],$m['contact_name'],$to,$status,$user?:null,$provider,$wa?:null,'{}',json_encode($payload),now()]);
  $matches=db_all('SELECT * FROM whatsapp_messages WHERE campaign_id=? AND recipient=?',[$campaign,$to]);
 }
 foreach($matches as $match){$payload=json_decode($match['payload'],true)?:[];$payload['__provider_created_at']=$created;db()->prepare('UPDATE whatsapp_messages SET payload=? WHERE id=?')->execute([json_encode($payload),$match['id']]);wa_apply((int)$match['id'],['code'=>200,'data'=>$report],true);db()->prepare('UPDATE whatsapp_messages SET last_checked_at=?,check_error=NULL WHERE id=?')->execute([now(),$match['id']]);if((int)$match['id']===(int)$m['id'])$found=true;}
 }
 return $found;
}
