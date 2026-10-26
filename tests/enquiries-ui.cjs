const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let role='Sales',saved;
 const enquiry={id:1,name:'New Enquiry',mobile:'919876543210',email:'enquiry@example.com',city:'Guwahati',source_name:'Instagram',source_data:{campaign_name:'Festival',project_type:'Hotel'},inbox_status:'New',matches:[],history:[],repeat_enquiries:[]};
 await page.route('**/api/index.php?**',async route=>{const url=new URL(route.request().url()),r=url.searchParams.get('r');let payload={data:[]};
 if(r==='auth/me')payload={user:{id:1,name:'Sales User',role},needs_setup:false};
 if(r==='users-list')payload={data:[{id:1,name:'Sales User',role:'Sales',is_active:1}]};
 if(r==='lookup/client_categories')payload={data:[{id:1,name:'Architect',is_active:1}]};
 if(r==='enquiries/filters')payload={data:{sources:['Instagram'],cities:['Guwahati']}};
 if(r==='enquiries'){const p=Number(url.searchParams.get('page')||1);payload={data:p===1?Array.from({length:20},(_,i)=>({...enquiry,id:i+1,name:i?'Person '+i:'New Enquiry'})):[{...enquiry,id:21}],total:21,pages:2,page:p};}
 if(r==='enquiries/1')payload={data:enquiry};
 if(r==='enquiries/1/followups'){saved=route.request().postDataJSON();payload={data:{...enquiry,inbox_status:'Follow up Later',history:[{id:1,enquiry_id:1,enquiry_decision:saved.decision,remarks:saved.remarks}]},message:'Follow-up saved.'};}
 if(r==='enquiries/settings')payload={data:{spreadsheet_id:'configured-sheet',tab_name:'Form Responses 1',configured:false,is_enabled:0}};
 if(r==='enquiries/sync-history')payload={data:[],total:0,pages:1,page:1};
 await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});});
 await page.goto('http://127.0.0.1:5173/enquiries');await page.getByText('21 enquiries',{exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),20);await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByRole('button',{name:'Open enquiry 21',exact:true}).waitFor();await page.getByRole('button',{name:'Previous page',exact:true}).click();await page.getByRole('button',{name:'Open enquiry 1',exact:true}).click();await page.getByRole('button',{name:'Record Follow-up',exact:true}).click();await page.getByLabel('Enquiry discussion notes',{exact:true}).fill('Discuss project next week');await page.getByLabel('Enquiry next follow-up',{exact:true}).fill('2099-01-01T12:00');await page.getByRole('button',{name:'Save Follow-up',exact:true}).click();await page.getByRole('dialog',{name:'Enquiry · New Enquiry',exact:true}).waitFor();assert.equal(saved.decision,'Follow up Later');assert(saved.request_key);await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.goto('http://127.0.0.1:5173/enquiry-settings');await page.getByRole('alert').getByText('You do not have access to this section.').waitFor();
 role='Admin';await page.goto('http://127.0.0.1:5173/enquiry-settings');await page.getByRole('button',{name:'Download Connection Script',exact:true}).waitFor();await page.getByText('No sync received yet. Complete the Google Sheet setup to begin.',{exact:true}).waitFor();
 role='Store';await page.goto('http://127.0.0.1:5173/enquiries');await page.getByRole('alert').getByText('You do not have access to this section.').waitFor();assert.deepEqual(errors,[]);await browser.close();console.log('Enquiry browser checks passed: Inbox pagination, follow-up and role restrictions.');
})().catch(e=>{console.error(e);process.exit(1);});
