<?php
// Booking verification uses its own material and orders in the isolated CI database.
$_GET=[];$_SESSION['uid']=$crmActor;
material_bulk(['rows'=>[['category'=>db_value('SELECT name FROM material_categories WHERE id='.$category),'material_code'=>'BOOK-CHECK-001','name'=>'Booking verification material','unit'=>'Pcs']]]);
$bookMaterial=(int)db_value("SELECT id FROM materials WHERE material_code='BOOK-CHECK-001'");$bookVariant=variant_resolve($bookMaterial,[]);
doc_save(doc_def('material-in'),null,['receipt_date'=>date('Y-m-d'),'supplier_id'=>$supplier,'receipt_type'=>'Purchase','challan_no'=>'BOOKING-TEST','lines'=>[['material_id'=>$bookMaterial,'quantity'=>10]]]);
$bookItems=[];
foreach(['A','B','C']as$letter){$o=order_save(null,['assigned_salesperson_id'=>$salesUser,'customer_id'=>$customer,'project_name'=>'Booking '.$letter,'order_date'=>date('Y-m-d'),'delivery_date'=>date('Y-m-d'),'items'=>[['area'=>'Booking '.$letter]]])['data'];$bookItems[$letter]=(int)$o['items'][0]['id'];$bookOrders[$letter]=(int)$o['id'];test_drawing($bookItems[$letter]);boq_save($bookItems[$letter],['status'=>'Final','lines'=>[['category_id'=>$category,'material_id'=>$bookMaterial,'qty_required'=>8]]]);}
$stats=fn($i)=>variant_stats([$bookVariant],$i)[$bookVariant];
$ledger=db_all('SELECT * FROM stock_moves WHERE variant_id=:v ORDER BY id',['v'=>$bookVariant]);
boq_book($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>3]);
check($stats($bookItems['A'])['in_stock']===10.0&&$stats($bookItems['A'])['booked_item']===3.0&&$stats($bookItems['A'])['available']===7.0,'Booking reserves stock without reducing physical stock');
$_SESSION['uid']=$storeUser;boq_book($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>2]);
check($stats($bookItems['A'])['booked_item']===5.0&&$stats($bookItems['A'])['available']===5.0,'Store can add a reservation and availability updates');
check((int)db_value('SELECT booked_by FROM bookings WHERE order_item_id=:i ORDER BY id DESC LIMIT 1',['i'=>$bookItems['A']])===$storeUser,'Booking records the authenticated Store user');
reject(fn()=>boq_release($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>1]),'Store cannot release a saved reservation');
foreach([6,0,-1,'bad']as$q)reject(fn()=>boq_book($bookItems['B'],['variant_id'=>$bookVariant,'quantity'=>$q]),'Invalid or overavailable booking rejected: '.$q);
reject(fn()=>boq_book($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>4]),'Booking cannot exceed remaining BOQ requirement');
reject(fn()=>boq_book($bookItems['A'],['variant_id'=>variant_resolve($wire,[]),'quantity'=>1]),'Material outside BOQ cannot be booked');
check($ledger===db_all('SELECT * FROM stock_moves WHERE variant_id=:v ORDER BY id',['v'=>$bookVariant]),'Bookings and rejected requests leave the stock ledger untouched');
$_SESSION['uid']=$salesUser;reject(fn()=>boq_book($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>1]),'Sales cannot book even their assigned BOQ');
$_SESSION['uid']=$storeUser;
$issueFor=fn($i,$q)=>doc_save(doc_def('material-issue'),null,['issue_date'=>date('Y-m-d'),'order_item_id'=>$i,'issued_to'=>'Booking check','lines'=>[['material_id'=>$bookMaterial,'quantity'=>$q]]]);
reject(fn()=>$issueFor($bookItems['B'],6),'Other Orders cannot issue stock reserved for this BOQ');
$issueFor($bookItems['A'],2);
check($stats($bookItems['A'])['in_stock']===8.0&&$stats($bookItems['A'])['booked_item']===3.0&&$stats($bookItems['A'])['available']===5.0,'Issuing reserved stock reduces physical and outstanding reservation together');
$issueFor($bookItems['B'],1);boq_book($bookItems['B'],['variant_id'=>$bookVariant,'quantity'=>3]);
check($stats($bookItems['B'])['booked_item']===3.0&&$stats($bookItems['B'])['in_stock']===7.0&&$stats($bookItems['B'])['available']===1.0,'Booking after an unreserved issue still reserves the full entered quantity');
$_SESSION['uid']=$crmActor;boq_release($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>1]);
check($stats($bookItems['A'])['booked_item']===2.0&&$stats($bookItems['A'])['available']===2.0,'Partial release restores free availability');
reject(fn()=>boq_release($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>3]),'Release cannot exceed outstanding reservation');
boq_release($bookItems['A'],['variant_id'=>$bookVariant]);boq_release($bookItems['B'],['variant_id'=>$bookVariant]);
check($stats($bookItems['A'])['booked_all']===0.0&&$stats($bookItems['A'])['available']===7.0,'Full release makes all unissued stock available');
boq_book($bookItems['B'],['variant_id'=>$bookVariant,'quantity'=>7]);order_set_status($bookOrders['B'],['status'=>'Cancelled']);
check($stats($bookItems['B'])['booked_all']===0.0&&$stats($bookItems['B'])['available']===7.0,'Cancelling an Order stops its reservations holding stock');
reject(fn()=>boq_book($bookItems['B'],['variant_id'=>$bookVariant,'quantity'=>1]),'Cancelled Order cannot book stock');
order_set_status($bookOrders['B'],['status'=>'Reopen']);
check($stats($bookItems['B'])['booked_item']===7.0,'Reopening restores the Order reservation');
dispatch_save($bookItems['B'],['dispatch_date'=>date('Y-m-d')]);
check($stats($bookItems['B'])['booked_all']===0.0,'Dispatched items no longer hold reserved stock');
reject(fn()=>boq_book($bookItems['B'],['variant_id'=>$bookVariant,'quantity'=>1]),'Dispatched item cannot book stock');
dispatch_delete($bookItems['B']);boq_release($bookItems['B'],['variant_id'=>$bookVariant]);
boq_save($bookItems['C'],['status'=>'Draft','lines'=>[['category_id'=>$category,'material_id'=>$bookMaterial,'qty_required'=>8]]]);
reject(fn()=>boq_book($bookItems['C'],['variant_id'=>$bookVariant,'quantity'=>1]),'Draft BOQ cannot reserve stock');

// Start competing requests while the variant row is held. This forces them to wait
// after any pre-lock reads, reproducing stale-snapshot races deterministically.
function booking_race(array $requests,int $variant): array {
    $hold=new PDO(getenv('TEST_DB_DSN'),'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $hold->beginTransaction();$hold->query('SELECT id FROM material_variants WHERE id='.(int)$variant.' FOR UPDATE');
    $workers=[];
    try {
        foreach($requests as[$action,$item,$qty,$actor]){
            $pipes=[];$proc=proc_open([PHP_BINARY,__DIR__.'/booking-worker.php',$action,(string)$item,(string)$variant,(string)$qty,(string)$actor],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
            if(!is_resource($proc))throw new RuntimeException('Cannot start booking worker');
            fclose($pipes[0]);stream_set_blocking($pipes[1],false);stream_set_blocking($pipes[2],false);$workers[]=['proc'=>$proc,'out'=>$pipes[1],'err'=>$pipes[2],'ready'=>false,'prefix'=>''];
        }
        $deadline=microtime(true)+8;$blocked=false;
        while(microtime(true)<$deadline){
            foreach($workers as&$w){if(!$w['ready']){$w['prefix'].=stream_get_contents($w['out']);$w['ready']=str_contains($w['prefix'],"READY\n");}}unset($w);
            $waits=(int)db_value("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND DB=DATABASE() AND INFO LIKE '%FOR UPDATE%'");
            if(count(array_filter($workers,fn($w)=>$w['ready']))===count($workers)&&$waits>=count($workers)){$blocked=true;break;}
            usleep(25000);
        }
        if(!$blocked){$diagnostics=[];foreach($workers as$w)$diagnostics[]=['ready'=>$w['ready'],'output'=>$w['prefix'].stream_get_contents($w['out']),'error'=>stream_get_contents($w['err']),'status'=>proc_get_status($w['proc'])];$diagnostics[]=['queries'=>db_all('SELECT ID,DB,STATE,INFO FROM information_schema.PROCESSLIST WHERE DB=DATABASE()')];throw new RuntimeException('Competing booking requests did not reach their locks: '.json_encode($diagnostics));}
        $hold->commit();$results=[];
        foreach($workers as$w){stream_set_blocking($w['out'],true);$output=$w['prefix'].stream_get_contents($w['out']);$err=stream_get_contents($w['err']);fclose($w['out']);fclose($w['err']);$code=proc_close($w['proc']);if($code!==0)throw new RuntimeException('Booking worker failed: '.$err);$results[]=json_decode(substr($output,strpos($output,"READY\n")+6),true,512,JSON_THROW_ON_ERROR);}
        return $results;
    } finally {if($hold->inTransaction())$hold->rollBack();foreach($workers as$w)if(is_resource($w['proc'])){proc_terminate($w['proc']);proc_close($w['proc']);}}
}
$race=booking_race([['book',$bookItems['A'],6,$storeUser],['book',$bookItems['B'],6,$storeUser]],$bookVariant);
check(count(array_filter($race,fn($r)=>$r['ok']))===1,'Simultaneous bookings cannot overreserve the same stock');
check($stats($bookItems['A'])['available']>=0,'Available stock stays nonnegative after competing bookings');
foreach(['A','B']as$k)if($stats($bookItems[$k])['booked_item']>0)boq_release($bookItems[$k],['variant_id'=>$bookVariant]);
boq_book($bookItems['A'],['variant_id'=>$bookVariant,'quantity'=>6]);
$race=booking_race([['release',$bookItems['A'],4,$crmActor],['release',$bookItems['A'],4,$crmActor]],$bookVariant);
check(count(array_filter($race,fn($r)=>$r['ok']))===1&&$stats($bookItems['A'])['booked_item']===2.0,'Simultaneous releases cannot release the same reservation twice');
boq_release($bookItems['A'],['variant_id'=>$bookVariant]);
$race=booking_race([['book',$bookItems['A'],5,$storeUser],['issue',$bookItems['B'],5,$storeUser]],$bookVariant);
check(count(array_filter($race,fn($r)=>$r['ok']))===1,'Simultaneous booking and issue respect each other after lock waits');
check($stats($bookItems['A'])['available']>=0&&$stats($bookItems['A'])['in_stock']>=0,'Competing issue/book requests preserve stock and reservation balances');
