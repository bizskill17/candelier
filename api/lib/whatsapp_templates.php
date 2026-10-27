<?php
function wa_template_rows(array $body): array {
 foreach(['results','data','list','content','templates','items','rows','records','result','payload','response'] as $key){if(isset($body[$key])&&is_array($body[$key])){if(array_is_list($body[$key]))return $body[$key];$nested=wa_template_rows($body[$key]);if($nested)return $nested;}}
 return array_is_list($body)?$body:[];
}
function wa_template_total(array $body): ?int {
 foreach([['total'],['totalCount'],['totalRecords'],['data','total'],['data','totalCount'],['pagination','total'],['data','pagination','total'],['result','total']] as $path){$v=$body;foreach($path as $k){$v=is_array($v)?($v[$k]??null):null;}if(is_numeric($v))return (int)$v;}
 return null;
}
// One Red Lava template record → dropdown entry, or null when it is not an approved, usable template.
function wa_template_parse($t): ?array {
 if(!is_array($t))return null;$t=is_array($t['template']??null)?$t['template']:$t;
 $name=trim((string)($t['name']??$t['templateName']??$t['template_name']??$t['elementName']??''));
 $language=$t['language']??$t['languageCode']??$t['language_code']??$t['lang']??'';if(is_array($language))$language=$language['code']??'';
 if(!$name||!is_string($language)||!preg_match('/^[a-zA-Z_-]{2,20}$/',$language))return null;
 $status=strtoupper((string)($t['status']??$t['templateStatus']??$t['template_status']??''));if($status!==''&&$status!=='APPROVED')return null;
 $header='none';$text='';foreach(($t['components']??[]) as $c){if(!is_array($c))continue;if(strtoupper((string)($c['type']??''))==='HEADER'){$format=strtoupper((string)($c['format']??''));if(in_array($format,['IMAGE','VIDEO','DOCUMENT'],true))$header=strtolower($format);}if(strtoupper((string)($c['type']??''))==='BODY')$text=(string)($c['text']??'');}
 $previous=db_one('SELECT m.payload FROM whatsapp_messages m JOIN whatsapp_campaigns c ON c.id=m.campaign_id WHERE c.template_name=? AND c.language=? AND c.request_key NOT LIKE \'report-sync-%\' ORDER BY m.id DESC LIMIT 1',[$name,$language]);$payload=$previous?json_decode($previous['payload'],true):[];$image='';$prefix='https://candelier.bizskilledu.com/';if(!empty($payload['fileUrl'])&&str_starts_with($payload['fileUrl'],$prefix)){$p=clean_image_path(substr($payload['fileUrl'],strlen($prefix)));if($p&&is_file(upload_root().'/'.$p))$image=$p;}
 if($header==='none'&&!array_key_exists('components',$t)&&$image)$header='image';if($header!=='image')$image='';
 return ['name'=>$name,'language'=>$language,'header'=>$header,'body'=>$text,'image_path'=>$image,'status'=>$status];
}
// Every approved template in one response. The server walks Red Lava's pages itself and stops at the real end:
// a short page, the reported total, a repeated page (pagination ignored) or about 40 seconds.
function wa_templates(int $page=1): array {
 if($page>1)return ['data'=>[],'page'=>$page,'has_more'=>false];
 $out=[];$seen=[];$received=0;$fields=[];$started=microtime(true);
 for($p=1;$p<=30;$p++){
  $r=wa_http('POST','/api/v1/messageTemplate/getTemplates',['pagination'=>['current'=>$p,'pageSize'=>10],'order'=>[['fieldName'=>'creationTime','dir'=>'desc']],'search'=>[]],null,55);
  if($r['code']>=300||!empty($r['data']['error']))throw new ApiError(wa_error_message($r),502);
  $rows=wa_template_rows($r['data']);$signature=hash('sha256',json_encode($rows));if(isset($seen[$signature]))break;$seen[$signature]=true;
  $received+=count($rows);if(!$fields&&$rows&&is_array($rows[0]))$fields=array_slice(array_keys(is_array($rows[0]['template']??null)?$rows[0]['template']:$rows[0]),0,12);
  foreach($rows as $t){$parsed=wa_template_parse($t);if($parsed)$out[$parsed['name'].'|'.$parsed['language']]=$parsed;}
  $total=wa_template_total($r['data']);
  if(count($rows)<10||($total!==null&&$p*10>=$total)||microtime(true)-$started>60)break;
 }
 $result=['data'=>array_values($out),'page'=>1,'has_more'=>false,'received'=>$received];
 if(!$out)$result['notice']=$received?"Red Lava sent $received template record(s), but none could be read as an approved template. Fields received: ".implode(', ',$fields).'.':'Red Lava returned no templates for this WhatsApp number.';
 return $result;
}
