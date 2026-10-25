import { useEffect, useState } from 'react';
import { api, contactsApi, historyApi, ordersApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
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
export function Field({label, children, required, className}) { return <div className={className}><label className="mb-1 block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}</label>{children}</div>; }
export function Choice({label, value, onChange, values, disabled, error}) {return <SearchSelect aria-label={label} value={value} onChange={onChange} options={values.map(v=>typeof v==='string'?{value:v,label:v}:v)} disabled={disabled} error={error} />;}
export function useCrmLookups() {
 const [data,setData]=useState({contacts:[],categories:[],sources:[],states:[],users:[]});
 useEffect(()=>{let live=true;Promise.allSettled([api.lookup('contacts'),api.lookup('client_categories'),api.lookup('lead_sources'),api.lookup('states'),ordersApi.users()]).then(results=>{if(live)setData(Object.fromEntries(['contacts','categories','sources','states','users'].map((key,i)=>[key,results[i].status==='fulfilled'?results[i].value.data:[]])));}).catch(()=>{});return()=>{live=false;};},[]);
 return data;
}
export function ContactForm({contact={}, onClose, onSaved}) {
 const {isAdmin}=useAuth();const look=useCrmLookups();const [master,setMaster]=useState(null);const [extra,setExtra]=useState({});
 const [f,setF]=useState({name:'',company_name:'',mobile:'',email:'',category_id:'',source_id:'',city:'',state_id:'',address:'',is_active:1,...contact});
 const [error,setError]=useState('');const [errors,setErrors]=useState({});const [busy,setBusy]=useState(false);const toast=useToast();
 const [addingCity,setAddingCity]=useState(false);const [newCity,setNewCity]=useState('');const [addedCities,setAddedCities]=useState([]);const [cityError,setCityError]=useState('');
 const set=(k,v)=>{setF(x=>({...x,[k]:v}));setErrors(x=>({...x,[k]:undefined}));setError('');};
 const cityNames=[...new Set([...look.contacts.map(c=>c.city),f.city,...addedCities].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const addCity=()=>{const name=newCity.trim().replace(/\s+/g,' ');if(!name){setCityError('Enter a city name.');return;}if(name.length>100){setCityError('City must be 100 characters or fewer.');return;}const city=cityNames.find(c=>c.toLowerCase()===name.toLowerCase())||name;setAddedCities(x=>[...x,city]);set('city',city);setAddingCity(false);setNewCity('');setCityError('');};
 const save=async()=>{
  const validation={};if(!f.name?.trim())validation.name='Enter the contact name.';
  const digits=String(f.mobile||'').replace(/[^0-9]/g,'');if(!digits)validation.mobile='Enter the mobile number.';else if(!/^[+0-9\s().-]+$/.test(f.mobile)||digits.length<10||digits.length>15)validation.mobile='Enter a valid mobile number using 10 to 15 digits.';
  if(!f.category_id)validation.category_id='Select a category.';if(!f.city?.trim())validation.city='Select a city.';
  if(Object.keys(validation).length){setErrors(validation);setError('Please correct the highlighted fields.');return;}
  setBusy(true);setError('');setErrors({});
  const body=Object.fromEntries(['name','company_name','mobile','email','category_id','source_id','address','city','state_id','is_active'].map(k=>[k,f[k]]));
  try{const r=await contactsApi.save(contact.id,body);toast(r.message);onSaved(r.data);onClose();}catch(e){setErrors(e.fields||{});setError(e.message);}finally{setBusy(false);}
 };
 const err=k=>errors[k]&&<p className="mt-1 text-xs text-red-600">{errors[k]}</p>;
 return <><Modal open wide="xl" title={contact.id?'Edit Contact':'Add Contact'} onClose={()=>!busy&&onClose()} footer={<><button disabled={busy} onClick={onClose} className="px-3 py-2">Cancel</button><button disabled={busy} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-white">{busy?'Saving…':'Save Contact'}</button></>}>
  {error&&<p role="alert" className="mb-3 text-red-600">{error}</p>}<div className="grid gap-4 sm:grid-cols-2">
  {['name','company_name','mobile','email'].map(k=><Field key={k} label={{name:'Contact Name',company_name:'Company Name',mobile:'Mobile',email:'Email'}[k]} required={k==='name'||k==='mobile'}><input aria-label={k} aria-required={k==='name'||k==='mobile'} aria-invalid={Boolean(errors[k])} type={k==='mobile'?'tel':k==='email'?'email':'text'} value={f[k]||''} disabled={busy} onChange={e=>set(k,e.target.value)} className={inputCls(errors[k])} />{err(k)}</Field>)}
  {[['category_id','Category',look.categories],['source_id','Source',look.sources]].map(([k,l,opts])=><Field key={k} label={l} required={k==='category_id'}><div className="flex gap-2"><div className="min-w-0 flex-1"><Choice label={l} value={f[k]||''} onChange={v=>set(k,v)} error={errors[k]} disabled={busy} values={[{value:'',label:`Select ${l.toLowerCase()}`},...(extra[k]?[...opts.filter(x=>String(x.id)!==String(extra[k].id)),extra[k]]:opts).filter(x=>Number(x.is_active)||String(x.id)===String(f[k])).map(x=>({value:x.id,label:x.name}))]} /></div>{isAdmin&&<button type="button" disabled={busy} aria-label={`Add ${l}`} onClick={()=>setMaster({key:k,entity:k==='category_id'?'client_categories':'lead_sources'})} className="rounded-lg border px-3">+</button>}</div>{err(k)}</Field>)}
  <Field label="Status"><Choice label="Contact Status" value={String(f.is_active)} disabled={busy} onChange={v=>set('is_active',Number(v))} values={[{value:'1',label:'Active'},{value:'0',label:'Inactive'}]} /></Field>
  <Field label="Address" className="sm:col-span-2"><textarea aria-label="Address" maxLength={2000} value={f.address||''} disabled={busy} onChange={e=>set('address',e.target.value)} className={inputCls(errors.address)} />{err('address')}</Field>
  <Field label="City" required><div className="flex gap-2"><div className="min-w-0 flex-1"><Choice label="City" value={f.city||''} onChange={v=>set('city',v)} error={errors.city} disabled={busy} values={[{value:'',label:'Select city'},...cityNames.map(name=>({value:name,label:name}))]} /></div><button type="button" disabled={busy} aria-label="Add City" onClick={()=>setAddingCity(x=>!x)} className="rounded-lg border px-3">+</button></div>{addingCity&&<div className="mt-2 space-y-2 rounded-lg border p-2"><input aria-label="New city name" value={newCity} onChange={e=>{setNewCity(e.target.value);setCityError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCity();}}} className={inputCls(cityError)} placeholder="City name" />{cityError&&<p className="text-xs text-red-600">{cityError}</p>}<button type="button" onClick={addCity} className="rounded bg-brand-600 px-3 py-1 text-sm text-white">Use City</button></div>}{err('city')}</Field>
  <Field label="State"><Choice label="State" value={f.state_id||''} onChange={v=>set('state_id',v)} error={errors.state_id} disabled={busy} values={[{value:'',label:'Select state'},...look.states.filter(x=>Number(x.is_active)||String(x.id)===String(f.state_id)).map(x=>({value:x.id,label:x.name}))]} />{err('state_id')}</Field>
  </div>
 </Modal>{master&&<MasterForm entity={master.entity} def={masters[master.entity]} onClose={()=>setMaster(null)} onSaved={row=>{setExtra(x=>({...x,[master.key]:row}));set(master.key,row.id);}}/>}</>;
}
export function FollowupForm({contact, lead, onClose, onSaved}) {
 const {isAdmin}=useAuth();
 const [f,setF]=useState({request_key:crypto.randomUUID(),activity_at:indiaNow(),entry_type:'Follow-up',method:'Call',outcome:'Connected',remarks:'',further_followup_required:true,next_followup_at:'',lead_status:lead?.status||'Open',lead_temperature:lead?.temperature||'Warm',requirement_received:false,project_name:'',requirement:''});
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const toast=useToast();const set=(k,v)=>setF(x=>({...x,[k]:v}));
 const save=async()=>{setBusy(true);setError('');try{const r=await historyApi.save({...f,...(lead?{lead_id:lead.id}:{contact_id:contact.id})});toast(r.message);onSaved(r.data);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Modal open wide="xl" title={`Follow-up · ${lead?lead.lead_no:contact.name}`} onClose={()=>!busy&&onClose()} footer={<><button disabled={busy} onClick={onClose} className="px-3 py-2">Cancel</button><button disabled={busy} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-white">{busy?'Saving…':'Save Follow-up'}</button></>}>
 {error&&<p role="alert" className="mb-3 text-red-600">{error}</p>}<div className="grid gap-4 sm:grid-cols-2">
 {(lead||isAdmin)&&<Field label="Entry Type"><Choice label="Entry Type" value={f.entry_type} onChange={v=>set('entry_type',v)} values={['Follow-up','Status Update']} /></Field>}
 <Field label="Activity Date / Time" required><input aria-label="Activity Date / Time" type="datetime-local" step="1" value={f.activity_at} max={indiaNow()} onChange={e=>set('activity_at',e.target.value)} className={inputCls()} /></Field>
 {f.entry_type==='Follow-up'&&<><Field label="Method" required><Choice label="Method" value={f.method} onChange={v=>set('method',v)} values={['Call','WhatsApp','Email','Meeting','Other']} /></Field><Field label="Outcome" required><Choice label="Outcome" value={f.outcome} onChange={v=>set('outcome',v)} values={outcomes} /></Field></>}
 {lead&&<><Field label="Lead Status"><Choice label="Lead Status" value={f.lead_status} onChange={v=>setF(x=>({...x,lead_status:v,further_followup_required:v==='Open'}))} values={['Open','Success','Fail']} /></Field><Field label="Lead Temperature"><Choice label="Lead Temperature" value={f.lead_temperature} onChange={v=>set('lead_temperature',v)} values={temperatures} /></Field></>}
 {(!lead||f.lead_status==='Open')&&<><Field label="Further Follow-up Required"><Choice label="Further Follow-up Required" value={f.further_followup_required?'Yes':'No'} onChange={v=>set('further_followup_required',v==='Yes')} values={['Yes','No']} /></Field>{f.further_followup_required&&<Field label="Next Follow-up Date / Time" required><input aria-label="Next Follow-up Date / Time" type="datetime-local" step="1" value={f.next_followup_at} min={f.activity_at} onChange={e=>set('next_followup_at',e.target.value)} className={inputCls()} /></Field>}</>}
 <Field label="Remarks"><textarea aria-label="Follow-up Remarks" rows={3} value={f.remarks} onChange={e=>set('remarks',e.target.value)} className={inputCls()} /></Field>
 {!lead&&f.entry_type==='Follow-up'&&<div><label className="flex items-center gap-2"><input type="checkbox" checked={f.requirement_received} onChange={e=>set('requirement_received',e.target.checked)} />Requirement Received</label></div>}
 {!lead&&f.requirement_received&&<><Field label="Project Name"><input aria-label="New Lead Project" value={f.project_name} onChange={e=>set('project_name',e.target.value)} className={inputCls()} /></Field><Field label="Requirement" required><textarea aria-label="New Lead Requirement" value={f.requirement} onChange={e=>set('requirement',e.target.value)} className={inputCls()} /></Field><Field label="Initial Lead Temperature"><Choice label="Initial Lead Temperature" value={f.lead_temperature} onChange={v=>set('lead_temperature',v)} values={temperatures} /></Field></>}
 </div><p className="mt-3 text-xs text-gray-500">Recorded By and entry time are captured automatically. All times are Indian time.</p>
 </Modal>;
}
export function HistoryTable({rows=[],showContact=false}) { const pagination=usePagination(rows);return <div className={tableWrap}><div className="overflow-auto"><table className="w-full min-w-[1000px] text-sm"><thead className={theadCls}><tr>{['Activity','Entry Type',...(showContact?['Contact']:[]),'Lead','Method / Outcome','Lead Status / Temperature','Remarks','Further Follow-up','Next Follow-up','Recorded By','Entry Timestamp'].map(x=><th key={x} className={thCls}>{x}</th>)}</tr></thead><tbody>{!rows.length&&<tr><td colSpan={showContact?11:10} className={tdCls}>No history yet.</td></tr>}{pagination.rows.map(r=><tr key={r.id}>{[fmtAt(r.activity_at),r.entry_type,...(showContact?[r.contact_name||'—']:[]),r.lead_no||r.generated_lead_no||'General Contact', [r.method,r.outcome].filter(Boolean).join(' · ')||'—',[r.lead_status,r.lead_temperature].filter(Boolean).join(' · ')||'—',r.remarks||'—',Number(r.further_followup_required)?'Yes':'No',fmtAt(r.next_followup_at),r.recorded_by_name||'Legacy import',fmtAt(r.created_at)].map((v,i)=><td key={i} className={`${tdCls} whitespace-pre-wrap`}>{v}</td>)}</tr>)}</tbody></table></div><Pagination {...pagination} /></div>;}
