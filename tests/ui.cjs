const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const categories=[{id:1,name:'Crystal',is_active:1},{id:2,name:'Metal',is_active:1}];
const materials=[{id:1,name:'Prism',category_id:1,unit:'Pcs',sort_order:1,is_active:true,fields:[]},{id:2,name:'Plate',category_id:2,unit:'Pcs',sort_order:2,is_active:true,fields:[]}];
let item={id:1,order_id:1,order_no:'ORD-0001',line_no:1,customer_name:'Preview Customer',project_name:'Living Room',area:'Living',details:[],boq_status:'Pending',order_status:'Open',lines:[],extra:[],stats:{},closed:false};
let saves=[];
await page.route('**/api/index.php?**',async route=>{
 const url=new URL(route.request().url());const r=url.searchParams.get('r');let payload={data:[]};
 if(r==='auth/me')payload={user:{id:1,name:'Preview Admin',username:'preview',role:'Admin'},needs_setup:false};
 if(r==='variants/catalog')payload={data:{materials,variants:[{id:1,material_id:1,spec_key:'',spec_text:'',values:{}}],categories}};
 if(r==='boq/sources')payload={data:[]};
 if(r==='boq/1'){
  if(route.request().method()==='PUT'){const body=route.request().postDataJSON();saves.push(body);item={...item,boq_status:body.status,lines:body.lines};payload={data:item,message:'Saved'};}
  else payload={data:item};
 }
 if(r==='variants/stats')payload={data:{1:{in_stock:10,booked_all:0,available:10,booked_item:0,consumed:0}}};
 if(r==='materials')payload={data:materials.map(m=>({...m,category_name:categories.find(c=>c.id===m.category_id).name}))};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
});
await page.goto('http://127.0.0.1:5173/boq/1');
await page.getByRole('button',{name:'Save as Draft',exact:true}).waitFor();
assert.equal(await page.locator('[id$="-category"]').count(),1);
assert.equal(await page.locator('#boq-0-material').isDisabled(),true);
await page.locator('#boq-0-category').click();await page.getByRole('option',{name:'Crystal',exact:true}).click();
await page.getByRole('button',{name:'Save as Draft',exact:true}).click();
await page.getByText('Draft BOQ. Finalise the BOQ before issuing materials.').waitFor();
assert.equal(saves[0].status,'Draft');assert.equal(saves[0].lines[0].material_id,'');
assert.equal(await page.getByRole('button',{name:'Issue Material',exact:true}).count(),0);
await page.locator('#boq-0-material').click();assert.equal(await page.getByRole('option',{name:'Plate',exact:true}).count(),0);await page.getByRole('option',{name:'Prism',exact:true}).click();
await page.getByRole('spinbutton',{name:'Quantity, row 1',exact:true}).fill('5');
await page.getByRole('button',{name:'Save as Final',exact:true}).click();await page.getByRole('button',{name:'Issue Material',exact:true}).waitFor();
assert.equal(saves.at(-1).status,'Final');
await page.getByRole('button',{name:'Add Row',exact:true}).click();assert.equal(await page.locator('[id$="-category"]').count(),2);
await page.locator('#boq-0-category').click();await page.getByRole('option',{name:'Metal',exact:true}).click();assert.match(await page.locator('#boq-0-material').innerText(),/Select material/);
await page.screenshot({path:'/tmp/candelier-boq-preview.png',fullPage:true});
await page.goto('http://127.0.0.1:5173/materials');await page.getByRole('button',{name:'Add',exact:true}).click();await page.locator('#m-category').waitFor();assert.equal(await page.getByText('Specification fields',{exact:true}).count(),0);
await page.screenshot({path:'/tmp/candelier-material-preview.png',fullPage:true});
assert.deepEqual(errors,[]);console.log('Browser checks passed: empty BOQ row, category filtering, Draft/Final controls, new rows and category reset, mandatory material category.');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
