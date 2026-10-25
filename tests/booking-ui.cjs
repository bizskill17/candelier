const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let role='Store',status='Final',booked=0,others=0,closed=false,hold=false,releaseRequest,requests=0;
 const stats=()=>({1:{in_stock:10,booked_all:booked+others,available:10-booked-others,booked_item:booked,consumed:0}});
 const boq=()=>({id:1,order_id:1,order_no:'BOOK-UI',line_no:1,customer_name:'Booking UI customer',project_name:'Booking UI project',area:'Living',details:[],boq_status:status,order_status:'Open',closed,lines:[{material_id:1,category_id:1,qty_required:8}],extra:[],stats:stats()});
 await page.route('**/api/index.php?**',async route=>{
  const req=route.request(),url=new URL(req.url()),r=url.searchParams.get('r');let payload={data:[]},code=200;
  if(r==='auth/me')payload={user:{id:1,name:'Booking User',role},needs_setup:false};
  if(r==='variants/catalog')payload={data:{categories:[{id:1,name:'Metal',is_active:1}],materials:[{id:1,material_code:'BOOK-UI-MAT',name:'Booking UI Material',unit:'Pcs',category_id:1,is_active:true,fields:[]}],variants:[{id:1,material_id:1,spec_key:'',spec_text:'',values:{}}]}};
  if(r==='boq/1')payload={data:boq()};if(r==='variants/stats')payload={data:stats()};
  if(r==='boq/1/book'||r==='boq/1/release'){
   requests++;const q=Number(req.postDataJSON().quantity);const isBook=r.endsWith('/book');
   if(hold)await new Promise(resolve=>{releaseRequest=resolve;});
   if(q<=0||(isBook&&(q>10-booked-others||q>8-booked))||(!isBook&&q>booked)){code=422;payload={error:'Quantity exceeds available stock or remaining requirement.'};}
   else {booked+=isBook?q:-q;payload={data:boq(),message:isBook?'Stock booked.':'Stock released.'};}
  }
  await route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(payload)});
 });
 const cells=async()=>page.locator('tbody tr').first().getByRole('cell').allTextContents();
 await page.goto('http://127.0.0.1:5173/boq/1');await page.getByRole('button',{name:'Book',exact:true}).waitFor();await page.getByRole('button',{name:'Book',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Book stock',exact:true});assert.equal(await dialog.getByLabel('Quantity to book',{exact:true}).inputValue(),'8');await dialog.getByLabel('Quantity to book',{exact:true}).fill('3');await dialog.getByRole('button',{name:'Book',exact:true}).click();await dialog.waitFor({state:'hidden'});
 let row=await cells();assert.equal(row[6],'10');assert.equal(row[8],'7');assert.equal(row[9],'3');assert.equal(row[10],'5');
 await page.getByRole('button',{name:'Book',exact:true}).click();dialog=page.getByRole('dialog',{name:'Book stock',exact:true});await dialog.getByLabel('Quantity to book',{exact:true}).fill('6');await dialog.getByRole('button',{name:'Book',exact:true}).click();await dialog.getByText('Quantity exceeds available stock or remaining requirement.',{exact:true}).waitFor();assert.equal(booked,3);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Book',exact:true}).click();dialog=page.getByRole('dialog',{name:'Book stock',exact:true});await dialog.getByLabel('Quantity to book',{exact:true}).fill('2');hold=true;const before=requests;await dialog.getByLabel('Quantity to book',{exact:true}).press('Enter');await page.getByRole('button',{name:'Saving…',exact:true}).waitFor();await page.keyboard.press('Enter');assert(await dialog.getByRole('button',{name:'Cancel',exact:true}).isDisabled());assert(await dialog.getByLabel('Quantity to book',{exact:true}).isDisabled());
 await page.waitForFunction(()=>document.querySelector('#book-qty')?.disabled);assert.equal(requests,before+1);hold=false;releaseRequest();await dialog.waitFor({state:'hidden'});assert.equal(booked,5);
 await page.reload();await page.getByRole('button',{name:'Book',exact:true}).waitFor();row=await cells();assert.equal(row[9],'5');assert.equal(await page.getByTitle('Release booked stock',{exact:true}).count(),0);
 role='Admin';await page.reload();await page.getByTitle('Release booked stock',{exact:true}).waitFor();await page.getByTitle('Release booked stock',{exact:true}).click();dialog=page.getByRole('dialog',{name:'Release booked stock',exact:true});await dialog.getByLabel('Quantity to release',{exact:true}).fill('1');await dialog.getByRole('button',{name:'Release',exact:true}).click();await dialog.waitFor({state:'hidden'});row=await cells();assert.equal(row[6],'10');assert.equal(row[8],'6');assert.equal(row[9],'4');
 role='Sales';await page.reload();await page.getByRole('columnheader',{name:'Booked (Item)',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Book',exact:true}).count(),0);assert.equal(await page.getByTitle('Release booked stock',{exact:true}).count(),0);
 role='Store';others=6;await page.reload();await page.getByRole('button',{name:'Book',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Book',exact:true}).isDisabled());
 others=0;closed=true;await page.reload();await page.getByRole('columnheader',{name:'Booked (Item)',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Book',exact:true}).count(),0);
 role='Admin';closed=false;status='Draft';await page.reload();await page.getByRole('button',{name:'Save as Final',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Book',exact:true}).count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('Booking UI checks passed: booking, live figures, persistence, failed quantities, duplicate-submit guard, Admin release, Sales restrictions and stock/status controls.');
})().catch(e=>{console.error(e);process.exit(1);});
