<?php
function wa_tracking_migrate(): void {
 $version='20261026_whatsapp_failed_contacts';if(db_value('SELECT COUNT(*) FROM app_migrations WHERE version=?',[$version]))return;
 $lock='wa_tracking_'.substr(hash('sha256',(string)db_value('SELECT DATABASE()')),0,20);if(!db_value('SELECT GET_LOCK(?,20)',[$lock]))throw new ApiError('WhatsApp update in progress.',503);
 try{if(db_value('SELECT COUNT(*) FROM app_migrations WHERE version=?',[$version]))return;
 foreach(['last_checked_at'=>'DATETIME NULL','check_error'=>'TEXT NULL','failed_at'=>'DATETIME NULL','success_at'=>'DATETIME NULL'] as $col=>$type)if(!db_value('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['whatsapp_messages',$col]))db()->exec("ALTER TABLE whatsapp_messages ADD $col $type");
 if(!db_value("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='whatsapp_settings' AND COLUMN_NAME='refresh_minutes'"))db()->exec('ALTER TABLE whatsapp_settings ADD refresh_minutes INT NOT NULL DEFAULT 60');
 db()->exec("UPDATE whatsapp_messages SET failed_at=COALESCE(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(status_times,'$.failed')),'%Y-%m-%d %H:%i:%s'),updated_at) WHERE status='failed' AND failed_at IS NULL");
 db()->exec("UPDATE whatsapp_messages SET success_at=COALESCE(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(status_times,'$.read')),'%Y-%m-%d %H:%i:%s'),STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(status_times,'$.delivered')),'%Y-%m-%d %H:%i:%s'),updated_at) WHERE status IN ('delivered','read') AND success_at IS NULL");
 db()->prepare('INSERT IGNORE INTO app_migrations(version,applied_at) VALUES(?,?)')->execute([$version,now()]);
 }finally{db_value('SELECT RELEASE_LOCK(?)',[$lock]);}
}
function wa_check_message(array $m): void {
 if(!$m['user_message_id'])throw new ApiError('No tracking ID for this older message. Check Red Lava directly.',422);
 try{$r=wa_http('GET','report/userMessageId/'.rawurlencode($m['user_message_id']),null,(string)db_value('SELECT phone_id FROM whatsapp_campaigns WHERE id=?',[$m['campaign_id']]));if($r['code']>=300)throw new ApiError(wa_error_message($r),502);if(empty($r['data']['lastStatus']))throw new ApiError('Red Lava did not return a message status.',502);
 wa_apply((int)$m['id'],$r,true);db()->prepare('UPDATE whatsapp_messages SET last_checked_at=?,check_error=NULL WHERE id=?')->execute([now(),$m['id']]);
 }catch(Throwable $e){db()->prepare('UPDATE whatsapp_messages SET last_checked_at=?,check_error=? WHERE id=?')->execute([now(),mb_substr($e->getMessage(),0,4000),$m['id']]);throw $e;}
}
function wa_sync_batch(bool $force=false,int $after=0): array {
 $lock='wa_sync_'.substr(hash('sha256',(string)db_value('SELECT DATABASE()')),0,20);if(!db_value('SELECT GET_LOCK(?,0)',[$lock]))return ['busy'=>true,'remaining'=>1,'checked'=>0,'cursor'=>$after];
 try{$minutes=(int)(db_value('SELECT refresh_minutes FROM whatsapp_settings WHERE id=1')?:60);$cutoff=date('Y-m-d H:i:s',time()-$minutes*60);
 $where="user_message_id IS NOT NULL AND user_message_id<>'' AND status NOT IN ('pending','read','deleted')";$args=[];
 if($force){$where.=' AND id>?';$args[]=$after;}else{$where.=' AND (last_checked_at IS NULL OR last_checked_at<?)';$args[]=$cutoff;}
 $rows=db_all('SELECT * FROM whatsapp_messages WHERE '.$where.' ORDER BY '.($force?'id':'COALESCE(last_checked_at,\'1970-01-01\'),id').' LIMIT 5',$args);$errors=0;$cursor=$after;
 foreach($rows as $m){$cursor=max($cursor,(int)$m['id']);try{wa_check_message($m);}catch(Throwable $e){$errors++;}}
 if($force){$remaining=(int)db_value("SELECT COUNT(*) FROM whatsapp_messages WHERE user_message_id IS NOT NULL AND user_message_id<>'' AND status NOT IN ('pending','read','deleted') AND id>?",[$cursor]);}else $remaining=(int)db_value('SELECT COUNT(*) FROM whatsapp_messages WHERE '.$where,$args);
 return ['checked'=>count($rows),'errors'=>$errors,'remaining'=>$remaining,'cursor'=>$cursor,'refresh_minutes'=>$minutes];
 }finally{db_value('SELECT RELEASE_LOCK(?)',[$lock]);}
}
function wa_failed_contacts(): array {
 $where="m.status='failed' AND NOT EXISTS(SELECT 1 FROM whatsapp_messages newer WHERE newer.contact_id=m.contact_id AND newer.status='failed' AND (newer.failed_at>m.failed_at OR (newer.failed_at=m.failed_at AND newer.id>m.id))) AND NOT EXISTS(SELECT 1 FROM whatsapp_messages success WHERE success.contact_id=m.contact_id AND success.status IN ('delivered','read') AND success.success_at>=m.failed_at)";
 $args=[];$q=trim((string)($_GET['q']??''));if($q!==''){$where.=' AND (ct.name LIKE ? OR m.recipient LIKE ? OR c.name LIKE ?)';$args=array_fill(0,3,'%'.$q.'%');}
 $from=' FROM whatsapp_messages m JOIN contacts ct ON ct.id=m.contact_id JOIN whatsapp_campaigns c ON c.id=m.campaign_id WHERE '.$where;
 $total=(int)db_value('SELECT COUNT(*)'.$from,$args);$page=max(1,(int)($_GET['page']??1));$page=min($page,max(1,(int)ceil($total/20)));$offset=($page-1)*20;
 $rows=db_all("SELECT ct.id,ct.name,ct.mobile,ct.company_name,ct.is_active,m.id AS message_id,m.recipient,m.failed_at,m.error_text,m.last_checked_at,m.check_error,m.user_message_id,c.name AS campaign_name,c.template_name,(SELECT COUNT(*) FROM whatsapp_messages f WHERE f.contact_id=m.contact_id AND f.failed_at IS NOT NULL) AS failure_count,(SELECT later.status FROM whatsapp_messages later WHERE later.contact_id=m.contact_id ORDER BY later.id DESC LIMIT 1) AS latest_attempt_status".$from." ORDER BY m.failed_at DESC,m.id DESC LIMIT 20 OFFSET $offset",$args);
 $minutes=(int)(db_value('SELECT refresh_minutes FROM whatsapp_settings WHERE id=1')?:60);$cutoff=date('Y-m-d H:i:s',time()-$minutes*60);
 foreach($rows as &$r){$r['verification']=!$r['user_message_id']?'Tracking unavailable':($r['check_error']?'Check failed':(!$r['last_checked_at']||$r['last_checked_at']<$cutoff?'Needs refresh':'Checked'));$r['tracking_note']='Tracks messages known to this application; separate-ID Red Lava retries are not yet discoverable.';}
 return ['data'=>$rows,'total'=>$total,'page'=>$page,'pages'=>max(1,(int)ceil($total/20)),'refresh_minutes'=>$minutes];
}
