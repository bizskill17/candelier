// Browser contract checks complement the real MariaDB integration tests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let role='Staff';let saved;let queried=[];
 const contacts=Array.from({length:21},(_,i)=>({id:i+1,name:`Contact ${String(i+1).padStart(2,'0')}`,contact_no:`CON-${i+1}`,mobile:`98765${String(i).padStart(5,'0')}`,is_active:1,followup_count:0,order_count:0}));
 const lead={id:1,lead_no:'LD-001',contact_id:1,display_name:contacts[0].name,display_phone:contacts[0].mobile,enquiry_date:'2026-10-25',project_name:'Hotel',requirement:'Chandeliers',status:'Open',temperature:'Cold',followups:[{id:1,entry_type:'Lead Created',activity_at:'2026-10-25 10:00:00',created_at:'2026-10-25 10:00:00',lead_status:'Open',lead_temperature:'Cold'}],orders:[]};
 await page.route('**/api/index.php?**',async route=>{
  const u=new URL(route.request().url());const r=u.searchParams.get('r');const method=route.request().method();let payload={data:[]};
  if(r==='auth/me')payload={user:{id:1,name:'Test staff',role,username:'staff'},needs_setup:false};
  if(r==='lookup/contacts'||r==='lookup/customers')payload={data:contacts};
  if(r==='users-list')payload={data:[{id:1,name:'Test staff'}]};
  if(r==='contacts'){queried.push(Object.fromEntries(u.searchParams));const p=Number(u.searchParams.get('page')||1);payload={data:contacts.slice((p-1)*20,p*20),page:p,pages:2,total:21};}
  if(r==='contacts/1')payload={data:{...contacts[0],history:lead.followups,leads:[lead],orders:[]}};
  if(r==='crm-followups'&&method==='POST'){saved=route.request().postDataJSON();payload={data:{id:2,generated_lead_id:2},message:'Follow-up saved and Lead created.'};}
  if(r==='crm-followups'&&method==='GET')payload={data:[{...lead.followups[0],contact_name:'Contact 01',lead_no:'LD-001',recorded_by_name:'Test staff'}],page:1,pages:1,total:1};
  if(r==='leads/1')payload={data:lead};
  if(r==='leads'||r==='follow-ups')payload={data:[lead],page:1,pages:1,total:1};
  if(r==='leads'&&method==='POST'){saved=route.request().postDataJSON();payload={data:lead,message:'Lead saved.'};}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('http://127.0.0.1:5173/contacts');await page.getByText('21 contacts',{exact:true}).waitFor();
 assert.equal(await page.locator('tbody tr').count(),20);await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText('Contact 21',{exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),1);
 await page.goto('http://127.0.0.1:5173/contacts/never');await page.getByText('21 contacts',{exact:true}).waitFor();assert(queried.some(q=>q.view==='never'));
 await page.getByRole('button',{name:'Follow up Contact 01',exact:true}).click();await page.getByLabel('Requirement Received',{exact:true}).check();await page.getByLabel('New Lead Project',{exact:true}).fill('Hotel');await page.getByLabel('New Lead Requirement',{exact:true}).fill('Chandeliers');
 await page.getByRole('combobox',{name:'Further Follow-up Required',exact:true}).click();await page.getByRole('option',{name:'No',exact:true}).click();await page.getByRole('button',{name:'Save Follow-up',exact:true}).click();await page.getByText('Follow-up saved and Lead created.',{exact:true}).waitFor();
 assert.equal(saved.contact_id,1);assert.equal(saved.requirement_received,true);assert.equal(saved.requirement,'Chandeliers');assert(saved.request_key);assert.equal(saved.recorded_by,undefined);
 await page.goto('http://127.0.0.1:5173/leads/new/contact/1');await page.getByRole('button',{name:'Save Lead',exact:true}).waitFor();await page.getByRole('combobox',{name:'Lead Contact',exact:true}).getByText('Contact 01',{exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Lead Status',exact:true}).count(),0);await page.getByLabel('Requirement',{exact:true}).fill('New requirement');await page.getByRole('button',{name:'Save Lead',exact:true}).click();await page.getByRole('button',{name:'Edit Requirement',exact:true}).waitFor();assert.equal(saved.contact_id,1);assert.equal(saved.customer_type,undefined);
 await page.getByRole('button',{name:'Follow Up',exact:true}).click();await page.getByRole('combobox',{name:'Lead Temperature',exact:true}).getByText('Cold',{exact:true}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.goto('http://127.0.0.1:5173/followup-logs');await page.getByRole('columnheader',{name:'Contact',exact:true}).waitFor();await page.locator('tbody').getByText('Contact 01',{exact:true}).waitFor();
 role='Viewer';await page.goto('http://127.0.0.1:5173/contacts');await page.getByText('21 contacts',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Add Contact',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Follow up Contact 01',exact:true}).count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('CRM browser checks passed: pagination, shared follow-ups, Requirement Received, canonical Lead form, log targets and Viewer permissions.');
})().catch(e=>{console.error(e);process.exit(1);});
