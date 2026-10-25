// Browser contract checks complement the real MariaDB integration tests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let role='Sales';let saved;let savedContact;let queried=[];let leadQueries=[];
 const contacts=Array.from({length:21},(_,i)=>({id:i+1,name:`Contact ${String(i+1).padStart(2,'0')}`,contact_no:`CON-${i+1}`,mobile:`98765${String(i).padStart(5,'0')}`,city:'Guwahati',is_active:1,followup_count:0,order_count:0}));
 const lead={id:1,lead_no:'LD-001',contact_id:1,display_name:contacts[0].name,display_phone:contacts[0].mobile,enquiry_date:'2026-10-25',project_name:'Hotel',requirement:'Chandeliers',status:'Open',temperature:'Cold',followups:[{id:1,entry_type:'Lead Created',activity_at:'2026-10-25 10:00:00',created_at:'2026-10-25 10:00:00',lead_status:'Open',lead_temperature:'Cold'}],orders:[]};
 await page.route('**/api/index.php?**',async route=>{
  const u=new URL(route.request().url());const r=u.searchParams.get('r');const method=route.request().method();let payload={data:[]};let status=200;
  if(r==='auth/me')payload={user:{id:1,name:'Test staff',role,username:'staff'},needs_setup:false};
  if(r==='lookup/contacts'||r==='lookup/customers')payload={data:contacts};
  if(r==='lookup/client_categories')payload={data:[{id:1,name:'Residential',is_active:1}]};
  if(r==='lookup/states')payload={data:[{id:1,name:'Assam',is_active:1}]};
  if(r==='users-list')payload={data:[{id:1,name:'Test staff'}]};
  if(r==='contacts'){queried.push(Object.fromEntries(u.searchParams));const p=Number(u.searchParams.get('page')||1);payload={data:contacts.slice((p-1)*20,p*20),page:p,pages:2,total:21};}
  if(r==='contacts'&&method==='POST'){savedContact=route.request().postDataJSON();if(savedContact.email==='taken@example.com'){status=422;payload={error:'Please correct the highlighted fields.',fields:{email:'A contact with this email address already exists. Use the existing contact.'}};}else payload={data:{id:22,...savedContact},message:'Contact saved.'};}
  if(r==='contacts/1')payload={data:{...contacts[0],history:lead.followups,leads:[lead],orders:[]}};
  if(r==='contacts/1'&&method==='PUT'){savedContact=route.request().postDataJSON();payload={data:{...contacts[0],...savedContact},message:'Contact saved.'};}
  if(r==='crm-followups'&&method==='POST'){saved=route.request().postDataJSON();payload={data:{id:2,generated_lead_id:2},message:'Follow-up saved and Lead created.'};}
  if(r==='crm-followups'&&method==='GET')payload={person_counts:[{recorded_by:1,name:'Test staff',count:3}],followup_total:3,data:[{...lead.followups[0],contact_name:'Contact 01',lead_no:'LD-001',recorded_by_name:'Test staff'}],page:1,pages:1,total:1};
  if(r==='leads/1')payload={data:lead};
  if(r==='leads'&&method==='GET')leadQueries.push(Object.fromEntries(u.searchParams));
  if(r==='leads'||r==='follow-ups')payload={data:[lead],page:1,pages:1,total:1};
  if(r==='leads'&&method==='POST'){saved=route.request().postDataJSON();payload={data:lead,message:'Lead saved.'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('http://127.0.0.1:5173/contacts');await page.getByText('21 contacts',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Add Contact',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Add Contact',exact:true});
 assert.equal(await dialog.getByText('Source Details',{exact:true}).count(),0);
 assert.equal(await dialog.getByText('Alternate Mobile',{exact:true}).count(),0);
 await dialog.getByRole('button',{name:'Save Contact',exact:true}).click();
 for(const message of ['Enter the contact name.','Enter the mobile number.','Select a category.','Select a city.'])await dialog.getByText(message,{exact:true}).waitFor();
 assert.equal(savedContact,undefined);
 await dialog.getByRole('textbox',{name:'name',exact:true}).fill('New contact');
 await dialog.getByRole('textbox',{name:'mobile',exact:true}).fill('123');
 await dialog.getByRole('button',{name:'Save Contact',exact:true}).click();
 await dialog.getByText('Enter a valid mobile number using 10 to 15 digits.',{exact:true}).waitFor();
 await dialog.getByRole('textbox',{name:'mobile',exact:true}).fill('9876501234');
 await dialog.getByRole('button',{name:'Category',exact:true}).click();await page.getByRole('option',{name:'Residential',exact:true}).click();
 await dialog.getByRole('button',{name:'City',exact:true}).click();await page.getByRole('textbox',{name:'Search options',exact:true}).fill('Guw');await page.getByRole('option',{name:'Guwahati',exact:true}).click();
 await dialog.getByRole('button',{name:'Add City',exact:true}).click();await dialog.getByRole('textbox',{name:'New city name',exact:true}).fill('Shillong');await dialog.getByRole('button',{name:'Use City',exact:true}).click();
 await dialog.getByRole('button',{name:'City',exact:true}).getByText('Shillong',{exact:true}).waitFor();
 const locationFields=await dialog.locator('textarea[aria-label="Address"],button[aria-label="City"],button[aria-label="State"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert.deepEqual(locationFields,['Address','City','State']);
 await dialog.getByRole('textbox',{name:'email',exact:true}).fill('taken@example.com');await dialog.getByRole('button',{name:'Save Contact',exact:true}).click();
 await dialog.getByText('A contact with this email address already exists. Use the existing contact.',{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('textbox',{name:'email',exact:true}).getAttribute('aria-invalid'),'true');
 await dialog.getByRole('textbox',{name:'email',exact:true}).fill('new@example.com');await dialog.getByRole('button',{name:'Save Contact',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.waitForURL('**/contacts/updated-today');await page.getByRole('heading',{name:'Updated Today',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('a[href="/contacts/updated-today"][class*="bg-brand-50"]'));
 assert(queried.some(q=>q.view==='updated-today'&&q.page==='1'&&!q.q&&!q.city));
 assert.equal(savedContact.category_id,1);assert.equal(savedContact.city,'Shillong');assert.equal(savedContact.mobile,'9876501234');assert.equal(savedContact.source_details,undefined);assert.equal(savedContact.alternate_mobile,undefined);
 assert.equal(await page.locator('tbody tr').count(),20);await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText('Contact 21',{exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),1);
 await page.goto('http://127.0.0.1:5173/contacts/never');await page.getByText('21 contacts',{exact:true}).waitFor();assert(queried.some(q=>q.view==='never'));
 await page.getByRole('button',{name:'Follow up Contact 01',exact:true}).click();const followupDialog=page.getByRole('dialog');
 for(const label of ['Entry Type','Activity Date / Time','Outcome','Further Follow-up Required'])assert.equal(await followupDialog.getByText(label,{exact:true}).count(),0);
 assert.equal(await page.getByLabel('New Lead Requirement',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Follow-up Status',exact:true}).click();await page.getByRole('option',{name:'Lead Received',exact:true}).click();assert.equal(await page.getByLabel('New Lead Project',{exact:true}).count(),0);assert.equal(await followupDialog.getByLabel('Follow-up Remarks',{exact:true}).count(),0);await page.getByRole('group',{name:'Priority',exact:true}).getByRole('button',{name:'Hot',exact:true}).click();await page.getByLabel('New Lead Requirement',{exact:true}).fill('Chandeliers');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Select the next follow-up date and time.',{exact:true}).waitFor();await page.getByLabel('Next Follow-up Date',{exact:true}).fill('2099-01-01');await page.getByRole('button',{name:'Save',exact:true}).click();assert.equal(saved,undefined);await page.getByLabel('Next Follow-up Time',{exact:true}).fill('12:00');const fieldOrder=await followupDialog.locator('textarea[aria-label="New Lead Requirement"],input[aria-label="Next Follow-up Date"],input[aria-label="Next Follow-up Time"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert.deepEqual(fieldOrder,['New Lead Requirement','Next Follow-up Date','Next Follow-up Time']);await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Follow-up saved and Lead created.',{exact:true}).waitFor();
 assert.equal(saved.lead_temperature,'Hot');assert.equal(saved.next_followup_at,'2099-01-01T12:00');assert.equal(saved.contact_id,1);assert.equal(saved.followup_status,'Lead Received');assert.equal(saved.activity_at,undefined);assert.equal(saved.outcome,undefined);assert.equal(saved.further_followup_required,true);assert.equal(saved.requirement_received,true);assert.equal(saved.requirement,'Chandeliers');assert(saved.request_key);assert.equal(saved.recorded_by,undefined);
 await page.goto('http://127.0.0.1:5173/leads/new/contact/1');await page.getByRole('button',{name:'Save',exact:true}).waitFor();await page.getByRole('button',{name:'Lead Contact',exact:true}).getByText('Contact 01 · 9876500000 · Guwahati',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Lead Status',exact:true}).count(),0);assert.equal(await page.getByLabel('Project Name',{exact:true}).count(),0);await page.getByRole('group',{name:'Priority',exact:true}).getByRole('button',{name:'Cold',exact:true}).click();await page.getByLabel('Requirement',{exact:true}).fill('New requirement');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/leads/all');await page.getByRole('button',{name:'View follow-up history LD-001',exact:true}).waitFor();assert.equal(saved.contact_id,1);assert.equal(saved.customer_type,undefined);assert.equal(saved.initial_temperature,'Cold');
 await page.getByRole('button',{name:'Follow up LD-001',exact:true}).click();assert.equal(await page.getByRole('group',{name:'Priority',exact:true}).getByRole('button',{name:'Cold',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('dialog').getByText(/Temperature/).count(),0);await page.getByLabel('Follow-up Remarks',{exact:true}).fill('Call back after reviewing the quotation');await page.getByLabel('Next Follow-up Date',{exact:true}).waitFor();await page.getByRole('button',{name:'Follow-up Status',exact:true}).click();await page.getByRole('option',{name:'No Further Follow-up',exact:true}).click();assert.equal(await page.getByLabel('Next Follow-up Date',{exact:true}).count(),0);await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(saved.remarks,'Call back after reviewing the quotation');
 await page.goto('http://127.0.0.1:5173/leads/all');await page.getByRole('button',{name:'View follow-up history LD-001',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Edit LD-001',exact:true}).count(),0);await page.getByRole('button',{name:'Follow up LD-001',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'View follow-up history LD-001',exact:true}).click();const historyDialog=page.getByRole('dialog',{name:'Follow-up History · LD-001',exact:true});await historyDialog.getByRole('columnheader',{name:'Activity',exact:true}).waitFor();await historyDialog.getByText('Lead Created',{exact:true}).waitFor();assert.equal(await historyDialog.getByText('Chandeliers',{exact:true}).count(),0);assert.equal(await historyDialog.getByRole('button',{name:'Follow Up',exact:true}).count(),0);assert(new URL(page.url()).pathname==='/leads/all');await historyDialog.getByRole('button',{name:'Close',exact:true}).click();
 for(const [key,label]of [['updated-today','Updated Today'],['today','Due Today'],['upcoming','Upcoming'],['overdue','Overdue'],['missing','Next Date Missing'],['success','Success'],['fail','Fail'],['all','All Leads']]){await page.getByRole('navigation',{name:'Lead views',exact:true}).getByRole('link',{name:label,exact:true}).click();await page.waitForURL(`**/leads/${key}`);await page.getByRole('button',{name:'View follow-up history LD-001',exact:true}).waitFor();assert(leadQueries.some(q=>q.view===key&&q.page==='1'));}
 await page.goto('http://127.0.0.1:5173/followup-logs');await page.getByRole('region',{name:'Follow-ups by person',exact:true}).waitFor();assert.match(await page.getByRole('region',{name:'Follow-ups by person',exact:true}).innerText(),/Test staff/);const istToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());assert.equal(await page.getByLabel('From date',{exact:true}).inputValue(),istToday);assert.equal(await page.getByLabel('To date',{exact:true}).inputValue(),istToday);await page.getByRole('columnheader',{name:'Contact',exact:true}).waitFor();await page.locator('tbody').getByText('Contact 01',{exact:true}).waitFor();
 role='Admin';await page.goto('http://127.0.0.1:5173/leads/all');await page.getByRole('button',{name:'Edit LD-001',exact:true}).click();const leadEdit=page.getByRole('dialog',{name:'Edit Lead · LD-001',exact:true});await leadEdit.getByRole('textbox',{name:'Requirement',exact:true}).waitFor();assert.equal(await leadEdit.getByRole('textbox',{name:'Requirement',exact:true}).inputValue(),'Chandeliers');await leadEdit.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.goto('http://127.0.0.1:5173/contacts/1');await page.getByRole('button',{name:'Edit Contact',exact:true}).click();
 const editDialog=page.getByRole('dialog',{name:'Edit Contact',exact:true});
 await editDialog.getByRole('button',{name:'Category',exact:true}).click();await page.getByRole('option',{name:'Residential',exact:true}).click();
 await editDialog.getByRole('textbox',{name:'name',exact:true}).fill('Edited contact');
 await editDialog.getByRole('button',{name:'Save Contact',exact:true}).click();await editDialog.waitFor({state:'hidden'});await page.waitForURL('**/contacts/updated-today');assert.equal(savedContact.name,'Edited contact');
 role='Store';await page.goto('http://127.0.0.1:5173/contacts');await page.getByText('21 contacts',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Add Contact',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Follow up Contact 01',exact:true}).count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('CRM browser checks passed: pagination, shared follow-ups, Requirement Received, canonical Lead form, log targets and Viewer permissions.');
})().catch(e=>{console.error(e);process.exit(1);});
