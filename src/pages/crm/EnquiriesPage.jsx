import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {CircleCheck,Eye} from 'lucide-react';
import {enquiriesApi} from '../../api/client';
import {useAuth} from '../../auth/AuthContext';
import {useToast} from '../../components/Toast';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import {Field,Choice,HistoryTable,PriorityButtons,useCrmLookups,fmtAt,indiaNow} from './CrmShared';
import {inputCls,theadCls,tableWrap} from '../../components/table';
const viewColors={'added-today':'border-teal-200 bg-teal-50 text-teal-900',pending:'border-blue-200 bg-blue-50 text-blue-800',new:'border-purple-200 bg-purple-50 text-purple-900',today:'border-amber-200 bg-amber-50 text-amber-900',overdue:'border-red-200 bg-red-50 text-red-900',upcoming:'border-cyan-200 bg-cyan-50 text-cyan-900',converted:'border-green-200 bg-green-50 text-green-900',archived:'border-slate-200 bg-slate-100 text-slate-800',all:'border-indigo-200 bg-indigo-50 text-indigo-900'};
const views=[['added-today','Added Today'],['pending','Pending'],['new','New'],['today','Due Today'],['overdue','Overdue'],['upcoming','Upcoming'],['converted','Qualified'],['archived','Archived'],['all','All Enquiries']];
const details=[['project_type','Project Type'],['approximate_customization__chandelier_budget','Budget'],['project_timeline','Project Timeline'],['how_many_customized_chandeliers_do_you_require?','Chandelier Quantity'],['campaign_name','Campaign'],['adset_name','Ad Set'],['ad_name','Ad'],['form_name','Form'],['platform','Platform'],['lead_status','Source Lead Status']];
// Columns are wide enough to read; long text wraps onto more lines instead of being cut off.
// Values from the ads form ("within_1_month", "₹50,000_to_₹1_lakh") are shown with spaces.
const tidy = v => (v == null || v === '' ? '' : String(v).replace(/_/g, ' ').replace(/\s+/g, ' ').trim());
const enquiryColumns = [
  { label: 'Received', width: 92, value: e => fmtAt(e.enquiry_at || e.created_at), date: true },
  { label: 'Name', width: 140, value: e => e.name, strong: true },
  { label: 'Mobile', width: 112, value: e => e.mobile, nowrap: true },
  { label: 'Email', width: 200, value: e => e.email, breakAll: true },
  { label: 'City', width: 100, value: e => e.city },
  { label: 'Source', width: 90, value: e => e.source_name },
  { label: 'Campaign', width: 150, value: e => tidy(e.source_data?.campaign_name) },
  { label: 'Project Type', width: 110, value: e => tidy(e.source_data?.project_type) },
  { label: 'Budget', width: 140, value: e => tidy(e.source_data?.approximate_customization__chandelier_budget) },
  { label: 'Timeline', width: 120, value: e => tidy(e.source_data?.project_timeline) },
  { label: 'Qty', width: 60, value: e => tidy(e.source_data?.['how_many_customized_chandeliers_do_you_require?']) },
  { label: 'Follow-up By', width: 100, value: e => e.followup_by_name },
  { label: 'Status', width: 80, value: e => e.inbox_status },
  { label: 'Next Follow-up', width: 96, value: e => fmtAt(e.next_followup_at), date: true },
];
const enquiryCell = 'border border-blue-200 px-2.5 py-2 align-top';
const enquiryHeader = 'border border-blue-400 px-2 py-2 text-left font-semibold';

export default function EnquiriesPage(){
 const {canCreateSales}=useAuth();
 const [result,setResult]=useState(null),[view,setView]=useState('pending'),[search,setSearch]=useState(''),[q,setQ]=useState(''),[source,setSource]=useState(''),[city,setCity]=useState(''),[assigned,setAssigned]=useState(''),[page,setPage]=useState(1),[error,setError]=useState(''),[selected,setSelected]=useState(null),[loadingDetail,setLoadingDetail]=useState(false),[qualify,setQualify]=useState(false),[filters,setFilters]=useState({cities:[],sources:[]});
 const look=useCrmLookups();const request=useRef(0);
 useEffect(()=>{const t=setTimeout(()=>{setQ(search);setPage(1);},300);return()=>clearTimeout(t);},[search]);
 const load=useCallback(async()=>{const seq=++request.current;setError('');try{const r=await enquiriesApi.list({view,q,source_name:source,city,followup_by_id:assigned,page});if(seq===request.current)setResult(r);}catch(e){if(seq===request.current)setError(e.message);}},[view,q,source,city,assigned,page]);
 useEffect(()=>{load();return()=>{request.current++;};},[load]);
 useEffect(()=>{enquiriesApi.filters().then(r=>setFilters(r.data)).catch(()=>{});},[]);
 const open=async (id,update=false)=>{setLoadingDetail(true);setError('');try{const r=await enquiriesApi.get(id);setSelected(r.data);setQualify(update&&!r.data.contact_id&&!r.data.lead_id);}catch(e){setError(e.message);}finally{setLoadingDetail(false);}};
 const filter=setter=>value=>{setter(value);setPage(1);};
 return <div className="mx-auto max-w-[96rem] space-y-2.5"><nav aria-label="Enquiry views" className="flex flex-wrap gap-1.5">{views.map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>{setView(key);setPage(1);}} className={`inline-flex min-h-8 items-center rounded-md border px-2 py-1 text-xs font-semibold shadow-sm transition ${viewColors[key]} ${view===key?'ring-2 ring-brand-600 ring-offset-1':'hover:brightness-95'}`}>{label} <span className="ml-1 inline-flex min-w-6 justify-center rounded-full bg-white/80 px-1.5 text-xs tabular-nums">{result?.view_counts?.[key]??'…'}</span></button>)}</nav>
 <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input aria-label="Search enquiries" placeholder="Search name, mobile, campaign…" value={search} onChange={e=>setSearch(e.target.value)} className={inputCls()}/><Choice label="Enquiry source filter" value={source} onChange={filter(setSource)} values={[{value:'',label:'All sources'},...filters.sources.map(x=>({value:x,label:x}))]}/><Choice label="Enquiry city filter" value={city} onChange={filter(setCity)} values={[{value:'',label:'All cities'},...filters.cities.map(x=>({value:x,label:x}))]}/><Choice label="Follow-up By filter" value={assigned} onChange={filter(setAssigned)} values={[{value:'',label:'All team members'},...look.users.filter(u=>['Admin','Sales'].includes(u.role)).map(u=>({value:u.id,label:u.name}))]}/></div>
 {error&&<p role="alert" className="text-red-600">{error}</p>}{loadingDetail&&<p role="status">Opening enquiry…</p>}
 {result ? <>
   <p className="text-xs text-gray-600">{result.total} enquiries</p>
   <div className={tableWrap}>
     <div className="overflow-x-auto">
       <table className="w-full min-w-[1670px] table-fixed text-[13px] leading-5 text-gray-800">
         <colgroup>
           {enquiryColumns.map(column => <col key={column.label} style={{ width: column.width }} />)}
           <col style={{ width: 80 }} />
         </colgroup>
         <thead className={`${theadCls} text-[10px] leading-3`}>
           <tr>
             {enquiryColumns.map(column => <th key={column.label} scope="col" className={enquiryHeader}>{column.label}</th>)}
             <th scope="col" className={`${enquiryHeader} sticky right-0 bg-gray-200 text-gray-800`}>Action</th>
           </tr>
         </thead>
         <tbody>
           {!result.data.length && <tr><td colSpan={enquiryColumns.length + 1} className={enquiryCell}>No enquiries in this view.</td></tr>}
           {result.data.map(enquiry => (
             <tr key={enquiry.id} className="group hover:bg-blue-50/50">
               {enquiryColumns.map(column => {
                 const value = column.value(enquiry) || '—';
                 return (
                   <td key={column.label} className={enquiryCell} title={value}>
                     <span className={column.date ? 'block whitespace-pre-line tabular-nums' : `block whitespace-normal ${column.nowrap ? 'whitespace-nowrap tabular-nums' : column.breakAll ? 'break-all' : 'break-words'} ${column.strong ? 'font-medium text-gray-900' : ''}`}>
                       {column.date ? value.replace(' ', '\n') : value}
                     </span>
                   </td>
                 );
               })}
               <td className={`${enquiryCell} sticky right-0 bg-gray-100 group-hover:bg-gray-200`}>
                 <div className="flex items-center gap-1">
                   {canCreateSales&&<button aria-label={`Update enquiry ${enquiry.id}`} title={enquiry.contact_id||enquiry.lead_id?'Already qualified: view it':'Update: record follow-up'} onClick={() => open(enquiry.id, true)} className="rounded-md p-1.5 text-brand-700 hover:bg-brand-50"><CircleCheck size={17}/></button>}
                   <button aria-label={`View enquiry ${enquiry.id}`} title="View enquiry" onClick={() => open(enquiry.id)} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"><Eye size={16}/></button>
                 </div>
               </td>
             </tr>
           ))}
         </tbody>
       </table>
     </div>
     <Pagination {...result} setPage={setPage}/>
   </div>
 </> : <p>Loading enquiries…</p>}
 {selected&&!qualify&&<Modal open wide="xl" title={`Enquiry · ${selected.name}`} onClose={()=>setSelected(null)} footer={<><button onClick={()=>setSelected(null)} className="btn-dismiss px-4 py-2">Close</button>{canCreateSales&&!selected.contact_id&&!selected.lead_id&&<button onClick={()=>setQualify(true)} className="rounded-lg bg-brand-600 px-4 py-2 text-white">Record Follow-up</button>}{selected.contact_id&&<Link to={selected.lead_id?`/leads/all`:`/contacts/${selected.contact_id}`} className="rounded-lg bg-brand-600 px-4 py-2 text-white">Open {selected.lead_id?'Leads':'Contact'}</Link>}</>}>
 <div className="mb-5 grid gap-3 sm:grid-cols-2">{[['Name',selected.name],['Mobile',selected.mobile],['Email',selected.email],['City',selected.city],['Source',selected.source_name],['Enquiry ID',selected.external_id],['Received',fmtAt(selected.enquiry_at)],['Status',selected.inbox_status],...details.map(([k,l])=>[l,selected.source_data?.[k]])].map(([label,value])=><div key={label}><p className="text-xs text-gray-500">{label}</p><p className="whitespace-pre-wrap font-medium">{value||'—'}</p></div>)}</div>
 {!selected.contact_id&&selected.matches?.length>0&&<p className="mb-3 rounded-lg bg-amber-50 p-3">Existing contact match: {selected.matches.map(m=>m.name).join(', ')}. Qualification will use an existing Contact.</p>}{selected.repeat_enquiries?.length>0&&<p className="mb-4 text-amber-800">{selected.repeat_enquiries.length} other enquiries have the same mobile or email.</p>}<h2 className="mb-2 font-semibold">Follow-up History</h2><HistoryTable rows={selected.history}/></Modal>}
 {selected&&qualify&&<EnquiryFollowup enquiry={selected} onClose={()=>{setSelected(null);setQualify(false);}} onSaved={()=>{
   setSelected(null);
   setQualify(false);
   if (view === 'pending' && page === 1) load();
   else {
     setView('pending');
     setPage(1);
   }
 }}/>}
 </div>;
}
function EnquiryFollowup({enquiry:e,onClose,onSaved}){
 const look=useCrmLookups();const {user}=useAuth();const toast=useToast();const [f,setF]=useState({request_key:crypto.randomUUID(),decision:'Follow up Later',method:'Call',remarks:'',next_followup_at:'',temperature:'',requirement:details.slice(0,4).map(([k,l])=>e.source_data?.[k]?`${l}: ${e.source_data[k]}`:'').filter(Boolean).join('\n'),project_name:'',contact_id:e.matches?.length===1?e.matches[0].id:'',contact:{name:e.name||'',mobile:e.mobile||'',email:e.email||'',city:e.city||'',category_id:''}}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(k,v)=>setF(x=>({...x,[k]:v}));const setContact=(k,v)=>setF(x=>({...x,contact:{...x.contact,[k]:v}}));const converting=['Create Lead','Keep as Contact'].includes(f.decision);const hasMatches=e.matches?.length>0;
 const save=async()=>{if(busy)return;setBusy(true);setError('');try{const r=await enquiriesApi.followup(e.id,f);toast(r.message);onSaved();}catch(err){setError(err.message);}finally{setBusy(false);}};
 return <Modal open wide="xl" title={`Follow-up · ${e.name}`} onClose={()=>!busy&&onClose()} footer={<><button disabled={busy} onClick={onClose} className="btn-dismiss px-4 py-2">Cancel</button><button disabled={busy} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-white disabled:opacity-50">{busy?'Saving…':'Save Follow-up'}</button></>}>
 {error&&<p role="alert" className="mb-3 text-red-600">{error}</p>}<fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><Field label="Decision" required><Choice label="Enquiry decision" value={f.decision} onChange={v=>set('decision',v)} values={['Follow up Later','Create Lead','Keep as Contact','Archive']}/></Field><Field label="Method" required><Choice label="Enquiry follow-up method" value={f.method} onChange={v=>set('method',v)} values={['Call','WhatsApp','Email','Meeting','Other']}/></Field>
<Field label="Follow-up By"><input aria-label="Follow-up By" readOnly value={user?.name||''} className={inputCls()}/></Field>
 {converting&&hasMatches&&<Field label="Matching Contact" required><Choice label="Matching Contact" value={f.contact_id} onChange={v=>set('contact_id',v)} values={[{value:'',label:'Select matching Contact'},...e.matches.map(c=>({value:c.id,label:`${c.name} · ${c.mobile||c.email}`}))]}/></Field>}
 {converting&&!hasMatches&&<><p className="font-medium sm:col-span-2">New Contact details</p>{[['name','Contact Name'],['mobile','Mobile'],['email','Email'],['city','City']].map(([k,l])=><Field key={k} label={l} required={k!=='email'}><input aria-label={`Qualified ${l}`} type={k==='email'?'email':'text'} value={f.contact[k]} onChange={ev=>setContact(k,ev.target.value)} className={inputCls()}/></Field>)}<Field label="Contact Category" required><Choice label="Qualified Contact Category" value={f.contact.category_id} onChange={v=>setContact('category_id',v)} values={[{value:'',label:'Select category'},...look.categories.filter(c=>Number(c.is_active)).map(c=>({value:c.id,label:c.name}))]}/></Field></>}
 {f.decision==='Create Lead'&&<><Field label="Priority" required className="sm:col-span-2"><PriorityButtons value={f.temperature} onChange={v=>set('temperature',v)}/></Field><Field label="Requirement" required className="sm:col-span-2"><textarea aria-label="Enquiry lead requirement" rows={4} value={f.requirement} onChange={ev=>set('requirement',ev.target.value)} className={inputCls()}/></Field></>}
 <Field label={f.decision==='Archive'?'Archive Reason':'Discussion Notes'} required className="sm:col-span-2"><textarea aria-label="Enquiry discussion notes" rows={3} maxLength={10000} value={f.remarks} onChange={ev=>set('remarks',ev.target.value)} className={inputCls()}/></Field>
 {['Follow up Later','Create Lead'].includes(f.decision)&&<Field label="Next Follow-up" required><input aria-label="Enquiry next follow-up" type="datetime-local" min={indiaNow().slice(0,16)} value={f.next_followup_at} onChange={ev=>set('next_followup_at',ev.target.value)} className={inputCls()}/></Field>}
 </fieldset></Modal>;
}
