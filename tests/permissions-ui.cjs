const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let role='Sales',boqStatus='Draft',production='In Progress',sent=null;
 const users=[{id:1,name:'Admin User',role:'Admin',is_active:true},{id:2,name:'Sales User',role:'Sales',is_active:true},{id:3,name:'Store User',role:'Store',is_active:true}];
 const contact={id:1,name:'Shared Contact',is_active:true,mobile:'9876500000',followup_count:0,order_count:1};
 const item=()=>({id:11,order_id:11,order_no:'ORD-0011',line_no:1,customer_name:'Shared Contact',customer_id:1,project_name:'Assigned Project',area:'Living',values:{},details:[],item_title:'Chandelier',label:'ORD-0011 item 1',boq_status:boqStatus,production_status:production,remarks:'Saved remarks',dispatch:null,dispatch_id:null,order_status:'Open',closed:false,lines:[{material_id:1,category_id:1,qty_required:3}],extra:[],stats:{}});
 await page.route('**/api/index.php?**',async route=>{
  const req=route.request(),u=new URL(req.url()),r=u.searchParams.get('r');let payload={data:[]};
  if(r==='auth/me')payload={user:{id:role==='Sales'?2:role==='Store'?3:1,name:`${role} User`,username:'test',role},needs_setup:false};
  if(r==='variants/catalog')payload={data:{categories:[{id:1,name:'Metal',is_active:1}],materials:[{id:1,name:'Rod',unit:'Pcs',category_id:1,is_active:true,fields:[]}],variants:[{id:1,material_id:1,spec_key:'',spec_text:'',values:{}}]}};
  if(r==='contacts')payload={data:[contact],total:1,page:1,pages:1};
  if(r==='lookup/contacts'||r==='lookup/customers')payload={data:[contact]};
  if(r==='users-list')payload={data:users};
  if(r==='orders/11')payload={data:{id:11,order_no:'ORD-0011',customer_id:1,customer_name:'Shared Contact',project_name:'Assigned Project',assigned_salesperson_id:2,assigned_salesperson_name:'Sales User',order_date:'2026-10-25',delivery_date:'2026-10-30',order_by_id:2,status:'Open',item_count:1,dispatched_count:0,items:[item()]}};
  if(r==='boq/11')payload={data:item()};
  if(r==='production/filters')payload={data:{customers:[contact],areas:[{customer_id:1,name:'Living'}]}};
  if(r==='production')payload={data:[item()],total:1,page:1,pages:1};
  if(r==='production/bulk'){sent=req.postDataJSON();production='Complete';payload={updated:1,message:'Item completed.'};}
  if(r==='order-items')payload={data:[{...item(),boq_status:'Final',issue_status:'Partially Issued'}]};
  if(r==='variants/stats')payload={data:{1:{in_stock:8,booked_all:0,available:8,booked_item:0,consumed:0}}};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('http://127.0.0.1:5173/contacts');await page.getByRole('button',{name:'Follow up Shared Contact',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Edit Shared Contact',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Follow up Shared Contact',exact:true}).count(),1);
 await page.goto('http://127.0.0.1:5173/orders/11');await page.getByLabel('Name of Project',{exact:true}).waitFor();assert.equal(await page.getByLabel('Name of Project',{exact:true}).isEnabled(),false);assert.equal(await page.getByRole('button',{name:'Save Changes',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Cancel order',exact:true}).count(),0);
 await page.goto('http://127.0.0.1:5173/boq/11');await page.getByRole('button',{name:'Save as Draft',exact:true}).waitFor();assert(await page.getByRole('spinbutton',{name:'Quantity, row 1',exact:true}).isEnabled());
 boqStatus='Final';await page.reload();await page.getByRole('columnheader',{name:'Quantity',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save as Draft',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Issue Material',exact:true}).count(),0);
 await page.goto('http://127.0.0.1:5173/material-issue/new');await page.getByText('You do not have access to this section.',{exact:true}).waitFor();
 role='Store';await page.goto('http://127.0.0.1:5173/production-in-progress');await page.getByRole('combobox',{name:'Production Status for ORD-0011 item 1',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Remarks for ORD-0011 item 1',exact:true}).count(),0);
 await page.getByRole('combobox',{name:'Production Status for ORD-0011 item 1',exact:true}).selectOption('Complete');await page.getByRole('button',{name:'Update',exact:true}).click();await page.getByText('Item completed.',{exact:true}).waitFor();assert.equal(sent.changes[0].status,'Complete');assert.equal(sent.changes[0].remarks,undefined);
 await page.goto('http://127.0.0.1:5173/ready-to-dispatch');await page.getByRole('button',{name:'Dispatch',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Move Back to In Progress',exact:true}).count(),0);
 await page.goto('http://127.0.0.1:5173/pending-material-issue');await page.getByRole('columnheader',{name:'Issue Status',exact:true}).waitFor();await page.getByText('Partially Issued',{exact:true}).waitFor();await page.getByRole('button',{name:'Issue Material',exact:true}).waitFor();
 role='Admin';await page.goto('http://127.0.0.1:5173/orders/11');await page.getByLabel('Name of Project',{exact:true}).waitFor();assert(await page.getByLabel('Name of Project',{exact:true}).isEnabled());assert(await page.getByLabel('Assigned Salesperson').isEnabled());await page.getByRole('button',{name:'Save Changes',exact:true}).waitFor();
 assert.deepEqual(errors,[]);await browser.close();console.log('Role UI checks passed: shared Sales CRM, Admin-only corrections, Draft/Final permissions, Store completion/dispatch and pending issue view.');
})().catch(e=>{console.error(e);process.exit(1);});
