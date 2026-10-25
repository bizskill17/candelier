<?php
check(db_value('SELECT material_code FROM materials WHERE id='.$wire)===null,'Material media migration does not invent codes for existing stock');
$base=['name'=>'Media test material','unit'=>'Pcs','category_id'=>$category];
reject(fn()=>material_save(null,$base+['photo_path'=>'uploads/items/2026/10/test.png']),'Manual material creation requires a code');
reject(fn()=>material_save(null,$base+['material_code'=>'MEDIA-001']),'Individual material creation requires a photo');
reject(fn()=>material_save(null,$base+['material_code'=>'MEDIA-001','photo_path'=>'https://example.com/image.jpg']),'External or forged image paths rejected');
reject(fn()=>material_save(null,$base+['material_code'=>'MEDIA-001','photo_path'=>'uploads/items/2026/10/missing.png']),'Missing image files rejected');
$uploadRoot=sys_get_temp_dir().'/candelier_test_material_'.bin2hex(random_bytes(6));
$GLOBALS['CONFIG']['upload_root']=$uploadRoot;
$photo='uploads/items/2026/10/test-material.png';
mkdir($uploadRoot.'/uploads/items/2026/10',0755,true);
file_put_contents($uploadRoot.'/'.$photo,base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4n8AAAAASUVORK5CYII='));
try {
    $m=material_save(null,$base+['material_code'=>'MEDIA-001','photo_path'=>$photo])['data'];
    check($m['material_code']==='MEDIA-001'&&$m['photo_path']===$photo,'Material code and validated photo persist');
    reject(fn()=>material_save(null,['name'=>'Duplicate media code','unit'=>'Pcs','category_id'=>$category,'material_code'=>'media-001','photo_path'=>$photo]),'Duplicate codes rejected regardless of case');
    reject(fn()=>material_save($m['id'],$base+['material_code'=>'MEDIA-001','photo_path'=>'']),'An individual edit cannot remove mandatory photo');
    $bulk=db_one("SELECT * FROM materials WHERE material_code='BULK-001'");
    check($bulk['photo_path']===null,'Bulk material can defer its photo');
    material_save((int)$bulk['id'],array_replace($bulk,['photo_path'=>$photo]));
    check(material_find((int)$bulk['id'])['photo_path']===$photo,'Bulk material photo can be supplied later');
    $catalog=variant_catalog()['data']['materials'];
    $found=array_values(array_filter($catalog,fn($x)=>$x['id']===$m['id']))[0];
    check($found['photo_path']===$photo&&$found['material_code']==='MEDIA-001','BOQ catalogue exposes current photo and material code');
    $before=(int)db_value('SELECT COUNT(*) FROM materials');
    reject(fn()=>material_bulk(['rows'=>[['category'=>'Uncategorised','material_code'=>'DOUBLE-01','name'=>'First unique name','unit'=>'Pcs'],['category'=>'Uncategorised','material_code'=>'double-01','name'=>'Second unique name','unit'=>'Pcs']]]),'Repeated codes within bulk upload rejected');
    check((int)db_value('SELECT COUNT(*) FROM materials')===$before,'Invalid bulk codes import no partial materials');
    reject(fn()=>material_bulk(['rows'=>[['category'=>'Uncategorised','name'=>'No code bulk','unit'=>'Pcs']]]),'Bulk uploads still require manually entered codes');
    // A changed photo/code does not replace the stock identity.
    $beforeLedger=db_all('SELECT id,variant_id,quantity FROM stock_moves ORDER BY id');
    material_save($wire,array_replace(material_find($wire),['material_code'=>'WIRE-001','photo_path'=>$photo]));
    migrate_material_media();
    check($beforeLedger===db_all('SELECT id,variant_id,quantity FROM stock_moves ORDER BY id'),'Adding codes/photos and rerunning migration preserve stock identities and ledger');
    material_delete((int)$m['id']);
} finally {
    unlink($uploadRoot.'/'.$photo);
    rmdir($uploadRoot.'/uploads/items/2026/10');rmdir($uploadRoot.'/uploads/items/2026');rmdir($uploadRoot.'/uploads/items');rmdir($uploadRoot.'/uploads');rmdir($uploadRoot);
    unset($GLOBALS['CONFIG']['upload_root']);
}
