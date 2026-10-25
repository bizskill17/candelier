const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({permissions:['camera'],viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{
  window.__cameraStreams=[];
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.__cameraStreams.push(stream);return stream;};
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const category={id:1,name:'Crystal',is_active:1};let materials=[];let writes=[];let uploads=0;
 const photo=`uploads/items/2026/10/material-test`;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4n8AAAAASUVORK5CYII=','base64');
 await page.route('**/uploads/items/**',r=>r.fulfill({status:200,contentType:'image/png',body:png}));
 await page.route('**/api/index.php?**',async route=>{
  const url=new URL(route.request().url());const r=url.searchParams.get('r');const method=route.request().method();let payload={data:[]};
  if(r==='auth/me')payload={user:{id:1,name:'Material staff',username:'staff',role:'Admin'},needs_setup:false};
  if(r==='variants/catalog')payload={data:{categories:[category],materials,variants:materials.map(m=>({id:m.id,material_id:m.id,spec_key:'',spec_text:'',values:{}}))}};
  if(r==='materials'&&method==='GET')payload={data:materials};
  if((r==='materials'&&method==='POST')||(r?.startsWith('materials/')&&method==='PUT')){
   const body=route.request().postDataJSON();writes.push(body);const id=r==='materials'?materials.length+1:Number(r.split('/')[1]);const m={...body,id,category_name:'Crystal',is_active:true,fields:[]};materials=[...materials.filter(x=>x.id!==id),m];payload={data:m,message:'Material saved.'};
  }
  if(r==='uploads'){uploads++;assert.match(route.request().headers()['content-type'],/multipart\/form-data/);payload={data:{path:`${photo}-${uploads}.png`},message:'Photo uploaded.'};}
  if(r==='boq/1')payload={data:{id:1,order_id:1,order_no:'ORD-1',line_no:1,customer_name:'Customer',project_name:'Project',area:'Living',details:[],boq_status:'Draft',order_status:'Open',lines:[{material_id:1,category_id:1,qty_required:2}],extra:[],stats:{},closed:false}};
  if(r==='variants/stats')payload={data:{1:{in_stock:10,booked_all:0,available:10,booked_item:0,consumed:0}}};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('http://127.0.0.1:5173/materials');await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Enter the material code.',{exact:true}).waitFor();await page.getByText('Upload or take a material photo.',{exact:true}).waitFor();assert.equal(writes.length,0);
 await page.locator('#m-code').fill('CRY-001');await page.locator('#m-name').fill('Prism');await page.locator('#m-category').click();await page.getByRole('option',{name:'Crystal',exact:true}).click();
 await page.getByLabel('Upload material photo',{exact:true}).setInputFiles({name:'prism.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Replace Photo',exact:true}).waitFor();
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('tbody').getByText('CRY-001',{exact:true}).waitFor();assert.equal(writes[0].material_code,'CRY-001');assert.equal(writes[0].photo_path,`${photo}-1.png`);
 await page.locator('tbody').getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Take Photo',exact:true}).click();await page.getByRole('button',{name:'Capture Photo',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);
 await page.getByRole('button',{name:'Cancel Camera',exact:true}).click();assert.equal(uploads,1);assert(await page.evaluate(()=>window.__cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.getByRole('button',{name:'Take Photo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);await page.getByRole('button',{name:'Capture Photo',exact:true}).click();await page.waitForFunction(p=>document.querySelector('img[alt="Material photo"]')?.src.endsWith(p),`${photo}-2.png`);
 assert(await page.evaluate(()=>window.__cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(writes.at(-1).photo_path,`${photo}-2.png`);
 await page.locator('tbody').getByRole('button',{name:'Edit',exact:true}).click();await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});await page.getByRole('button',{name:'Take Photo',exact:true}).click();await page.getByText(/Camera access was denied/).waitFor();await page.getByRole('button',{name:'Cancel Camera',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.goto('http://127.0.0.1:5173/boq/1');await page.locator('#boq-0-material').getByText('CRY-001 · Prism',{exact:true}).waitFor();await page.locator('tbody img[alt="Prism"]').waitFor();await page.getByRole('columnheader',{name:'Photo',exact:true}).waitFor();
 await page.emulateMedia({media:'print'});assert(await page.getByRole('columnheader',{name:'Photo',exact:true}).isVisible());assert(await page.locator('tbody img[alt="Prism"]').isVisible());await page.emulateMedia({media:'screen'});
 assert.deepEqual(errors,[]);await browser.close();console.log('Material media UI checks passed: mandatory code/photo, upload, webcam capture, camera cleanup, permission denial, persistence and BOQ/print photos.');
})().catch(e=>{console.error(e);process.exit(1);});
