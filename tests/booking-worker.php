<?php
// Isolated CI worker; never accepts production configuration.
$dsn=getenv('TEST_DB_DSN');if(!$dsn||!str_contains($dsn,'candelier_test'))throw new RuntimeException('Isolated test DB required.');
$GLOBALS['CONFIG']=['db'=>['dsn'=>$dsn,'user'=>'root','password'=>'']];date_default_timezone_set('Asia/Kolkata');
$root=dirname(__DIR__);
foreach(['lib/http','lib/db','lib/stock','lib/permissions','entities','handlers/auth','handlers/items','handlers/materials','handlers/orders','handlers/boq','handlers/stores']as$f)require "$root/api/$f.php";
session_begin();$_SESSION['uid']=(int)$argv[5];
echo "READY\n";flush();
try {
    [$action,$item,$variant,$qty]=array_slice($argv,1,4);$item=(int)$item;$variant=(int)$variant;
    if($action==='book')boq_book($item,['variant_id'=>$variant,'quantity'=>$qty]);
    elseif($action==='release')boq_release($item,['variant_id'=>$variant,'quantity'=>$qty]);
    elseif($action==='issue')doc_save(doc_def('material-issue'),null,['issue_date'=>date('Y-m-d'),'order_item_id'=>$item,'issued_to'=>'Concurrency test','lines'=>[['material_id'=>(int)db_value('SELECT material_id FROM material_variants WHERE id=:v',['v'=>$variant]),'quantity'=>$qty]]]);
    else throw new RuntimeException('Unknown test action');
    echo json_encode(['ok'=>true]);
} catch(ApiError $e){echo json_encode(['ok'=>false,'status'=>$e->status,'message'=>$e->getMessage()]);}
