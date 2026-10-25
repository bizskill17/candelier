import { useEffect, useState } from 'react';
import { api, contactsApi, historyApi, ordersApi } from '../../api/client';
import MasterForm from '../../components/MasterForm';
import { masters } from '../../config/masters';
import Modal from '../../components/Modal';
import SearchSelect from '../../components/SearchSelect';
import { inputCls, tdCls, thCls, theadCls, tableWrap } from '../../components/table';
import Pagination, { usePagination } from '../../components/Pagination';
import { useToast } from '../../components/Toast';
export const outcomes = ['Connected', 'No Answer', 'Busy', 'Not Reachable', 'Not Interested', 'Invalid Number'];
export const temperatures = ['Hot', 'Warm', 'Cold'];
export function indiaNow() {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
export const fmtAt = (v) => v ? `${v.slice(0,10).split('-').reverse().join('/')} ${v.slice(11,19)}` : '—';
export function Field({label, children, required}) { return <div><label className="mb-1 block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}</label>{children}</div>; }
export function Choice({label, value, onChange, values, disabled}) {return <SearchSelect aria-label={label} value={value} onChange={onChange} options={values.map(v=>typeof v==='string'?{value:v,label:v}:v)} disabled={disabled} />;}
export function useCrmLookups() {
 const [data,setData]=useState({contacts:[],categories:[],sources:[],states:[],users:[]});
 useEffect(()=>{let live=true;Promise.allSettled([api.lookup('contacts'),api.lookup('client_categories'),api.lookup('lead_sources'),api.lookup('states'),ordersApi.users()]).then(results=>{if(live)setData(Object.fromEntries(['contacts','categories','sources','states','users'].map((key,i)=>[key,results[i].status==='fulfilled'?results[i].value.data:[]])));}).catch(()=>{});return()=>{live=false;};},[]);
 return data;
}
export function ContactForm({contact={}, onClose, onSaved}) {
 const look=useCrmLookups();const [master,setMaster]=useState(null);const [extra,setExtra]=useState({});const [f,setF]=useState({name:'',company_name:'',mobile:'',alternate_mobile:'',email:'',category_id:'',source_id:'',source_details:'',city:'',state_id:'',address:'',is_active:1,...contact});
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const toast=useToast();
 const set=(k,v)=>setF(x=>({...x,[k]:v}));
 const save=async()=>{setBusy(true);setError('');try{const r=await contactsApi.save(contact.id,f);toast(r.message);onSaved(r.data);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <><Modal open wide="xl" title={contact.id?'Edit Contact':'Add Contact'} onClose={()=>!busy&&onClose()} footer={<><button disabled={busy} onClick={onClose} className="px-3 py-2">Cancel</button><button disabled={busy} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-white">{busy?'Saving…':'Save Contact'}</button></>}>
  {error&&<p role="alert" className="mb-3 text-red-600">{error}</p>}<div className="grid gap-4 sm:grid-cols-2">
  {['name','company_name','mobile','alternate_mobile','email','city','source_details'].map(k=><Field key={k} label={{name:'Contact Name',company_name:'Company Name',mobile:'Mobile',alternate_mobile:'Alternate Mobile',email:'Email',city:'City',source_details:'Source Details'}[k]} required={k==='name'}><input aria-label={k} value={f[k]||''} onChange={e=>set(k,e.target.value)} className={inputCls()} /></Field>)}
  {[['category_id','Category',look.categories],['source_id','Source',look.sources],['state_id','State',look.states]].map(([k,l,opts])=><Field key={k} label={l}><div className="flex gap-2"><div className="min-w-0 flex-1"><Choice label={l} value={f[k]||''} onChange={v=>set(k,v)} values={[{value:'',label:'None'},...(extra[k]?[...opts.filter(x=>String(x.id)!==String(extra[k].id)),extra[k]]:opts).filter(x=>Number(x.is_active)||String(x.id)===String(f[k])).map(x=>({value:x.id,label:x.name}))]} /></div>{k!=='state_id'&&<button type="button" aria-label={`Add ${l}`} onClick={()=>setMaster({key:k,entity:k==='category_id'?'client_categories':'lead_sources'})} className="rounded-lg border px-3">+</button>}</div></Field>)}
  <Field label="Address"><textarea aria-label="Address" value={f.address||''} onChange={e=>set('address',e.target.value)} className={inputCls()} /></Field>
  <Field label="Status"><Choice label="Contact Status" value={String(f.is_active)} onChange={v=>set('is_active',Number(v))} values={[{value:'1',label:'Active'},{value:'0',label:'Inactive'}]} /></Field>
  </div><p className="mt-3 text-xs text-gray-500">Provide a mobile number or email. Source and category names are maintained in Masters.</p>
 </Modal>{master&&<MasterForm entity={master.entity} def={masters[master.entity]} onClose={()=>setMaster(null)} onSaved={row=>{setExtra(x=>({...x,[master.key]:row}));set(master.key,row.id);}}/>}</>;
}
export function FollowupForm({contact, lead, onClose, onSaved}) {
 const [f,setF]=useState({request_key:crypto.randomUUID(),activity_at:indiaNow(),entry_type:'Follow-up',method:'Call',outcome:'Connected',remarks:'',further_followup_required:true,next_followup_at:'',lead_status:lead?.status||'Open',lead_temperature:lead?.temperature||'Warm',requirement_received:false,project_name:'',requirement:''});
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const toast=useToast();const set=(k,v)=>setF(x=>({...x,[k]:v}));
 const save=async()=>{setBusy(true);setError('');try{const r=await historyApi.save({...f,...(lead?{lead_id:lead.id}:{contact_id:contact.id})});toast(r.message);onSaved(r.data);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Modal open wide="xl" title={`Follow-up · ${lead?lead.lead_no:contact.name}`} onClose={()=>!busy&&onClose()} footer={<><button disabled={busy} onClick={onClose} className="px-3 py-2">Cancel</button><button disabled={busy} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-white">{busy?'Saving…':'Save Follow-up'}</button></>}>
 {error&&<p role="alert" className="mb-3 text-red-600">{error}</p>}<div className="grid gap-4 sm:grid-cols-2">
 {lead&&<Field label="Entry Type"><Choice label="Entry Type" value={f.entry_type} onChange={v=>set('entry_type',v)} values={['Follow-up','Status Update']} /></Field>}
 <Field label="Activity Date / Time" required><input aria-label="Activity Date / Time" type="datetime-local" step="1" value={f.activity_at} max={indiaNow()} onChange={e=>set('activity_at',e.target.value)} className={inputCls()} /></Field>
 {f.entry_type==='Follow-up'&&<><Field label="Method" required><Choice label="Method" value={f.method} onChange={v=>set('method',v)} values={['Call','WhatsApp','Email','Meeting','Other']} /></Field><Field label="Outcome" required><Choice label="Outcome" value={f.outcome} onChange={v=>set('outcome',v)} values={outcomes} /></Field></>}
 {lead&&<><Field label="Lead Status"><Choice label="Lead Status" value={f.lead_status} onChange={v=>setF(x=>({...x,lead_status:v,further_followup_required:v==='Open'}))} values={['Open','Success','Fail']} /></Field><Field label="Lead Temperature"><Choice label="Lead Temperature" value={f.lead_temperature} onChange={v=>set('lead_temperature',v)} values={temperatures} /></Field></>}
 {(!lead||f.lead_status==='Open')&&<><Field label="Further Follow-up Required"><Choice label="Further Follow-up Required" value={f.further_followup_required?'Yes':'No'} onChange={v=>set('further_followup_required',v==='Yes')} values={['Yes','No']} /></Field>{f.further_followup_required&&<Field label="Next Follow-up Date / Time" required><input aria-label="Next Follow-up Date / Time" type="datetime-local" step="1" value={f.next_followup_at} min={f.activity_at} onChange={e=>set('next_followup_at',e.target.value)} className={inputCls()} /></Field>}</>}
 <Field label="Remarks"><textarea aria-label="Follow-up Remarks" rows={3} value={f.remarks} onChange={e=>set('remarks',e.target.value)} className={inputCls()} /></Field>
 {!lead&&<div><label className="flex items-center gap-2"><input type="checkbox" checked={f.requirement_received} onChange={e=>set('requirement_received',e.target.checked)} />Requirement Received</label></div>}
 {!lead&&f.requirement_received&&<><Field label="Project Name"><input aria-label="New Lead Project" value={f.project_name} onChange={e=>set('project_name',e.target.value)} className={inputCls()} /></Field><Field label="Requirement" required><textarea aria-label="New Lead Requirement" value={f.requirement} onChange={e=>set('requirement',e.target.value)} className={inputCls()} /></Field><Field label="Initial Lead Temperature"><Choice label="Initial Lead Temperature" value={f.lead_temperature} onChange={v=>set('lead_temperature',v)} values={temperatures} /></Field></>}
 </div><p className="mt-3 text-xs text-gray-500">Recorded By and entry time are captured automatically. All times are Indian time.</p>
 </Modal>;
}
export function HistoryTable({rows=[],showContact=false}) { const pagination=usePagination(rows);return <div className={tableWrap}><div className="overflow-auto"><table className="w-full min-w-[1000px] text-sm"><thead className={theadCls}><tr>{['Activity','Entry Type',...(showContact?['Contact']:[]),'Lead','Method / Outcome','Lead Status / Temperature','Remarks','Further Follow-up','Next Follow-up','Recorded By','Entry Timestamp'].map(x=><th key={x} className={thCls}>{x}</th>)}</tr></thead><tbody>{!rows.length&&<tr><td colSpan={showContact?11:10} className={tdCls}>No history yet.</td></tr>}{pagination.rows.map(r=><tr key={r.id}>{[fmtAt(r.activity_at),r.entry_type,...(showContact?[r.contact_name||'—']:[]),r.lead_no||r.generated_lead_no||'General Contact', [r.method,r.outcome].filter(Boolean).join(' · ')||'—',[r.lead_status,r.lead_temperature].filter(Boolean).join(' · ')||'—',r.remarks||'—',Number(r.further_followup_required)?'Yes':'No',fmtAt(r.next_followup_at),r.recorded_by_name||'Legacy import',fmtAt(r.created_at)].map((v,i)=><td key={i} className={`${tdCls} whitespace-pre-wrap`}>{v}</td>)}</tr>)}</tbody></table></div><Pagination {...pagination} /></div>;}
