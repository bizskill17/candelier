<?php
function wa_template_rows(array $body): array {
 foreach(['results','data','list','content','templates','items','rows','records'] as $key){if(isset($body[$key])&&is_array($body[$key])){if(array_is_list($body[$key]))return $body[$key];$nested=wa_template_rows($body[$key]);if($nested)return $nested;}}
 return array_is_list($body)?$body:[];
}
function wa_templates(int $page): array {
 $page=max(1,min(100,$page));$r=wa_http('POST','/api/v1/messageTemplate/getTemplates',['pagination'=>['current'=>$page,'pageSize'=>10],'order'=>[['fieldName'=>'creationTime','dir'=>'desc']],'search'=>[]]);if($r['code']>=300||!empty($r['data']['error']))throw new ApiError(wa_error_message($r),502);
 $rows=wa_template_rows($r['data']);$out=[];
 foreach($rows as $t){if(!is_array($t))continue;$t=is_array($t['template']??null)?$t['template']:$t;$name=trim((string)($t['name']??$t['templateName']??''));$language=$t['language']??$t['languageCode']??'';if(is_array($language))$language=$language['code']??'';if(!$name||!is_string($language)||!preg_match('/^[a-zA-Z_-]{2,20}$/',$language))continue;$status=strtoupper((string)($t['status']??$t['templateStatus']??''));if($status!==''&&$status!=='APPROVED')continue;
 $header='none';$text='';foreach(($t['components']??[]) as $c){if(!is_array($c))continue;if(strtoupper((string)($c['type']??''))==='HEADER'){$format=strtoupper((string)($c['format']??''));if(in_array($format,['IMAGE','VIDEO','DOCUMENT'],true))$header=strtolower($format);}if(strtoupper((string)($c['type']??''))==='BODY')$text=(string)($c['text']??'');}
 $previous=db_one('SELECT m.payload FROM whatsapp_messages m JOIN whatsapp_campaigns c ON c.id=m.campaign_id WHERE c.template_name=? AND c.language=? AND c.request_key NOT LIKE \'report-sync-%\' ORDER BY m.id DESC LIMIT 1',[$name,$language]);$payload=$previous?json_decode($previous['payload'],true):[];$image='';$prefix='https://candelier.bizskilledu.com/';if(!empty($payload['fileUrl'])&&str_starts_with($payload['fileUrl'],$prefix)){$p=clean_image_path(substr($payload['fileUrl'],strlen($prefix)));if($p&&is_file(upload_root().'/'.$p))$image=$p;}
 if($header==='none'&&!array_key_exists('components',$t)&&$image)$header='image';if($header!=='image')$image='';$out[]=['name'=>$name,'language'=>$language,'header'=>$header,'body'=>$text,'image_path'=>$image,'status'=>$status];
 }
 $total=$r['data']['total']??$r['data']['data']['total']??null;return ['data'=>$out,'page'=>$page,'has_more'=>($total!==null?$page*10<(int)$total:count($rows)===10)&&$page<100];
}
