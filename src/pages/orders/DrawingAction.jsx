import {useState} from 'react';
import {drawingApi} from '../../api/client';
import {useAuth} from '../../auth/AuthContext';
import {DrawingSlot} from '../../components/Drawing';
import Modal from '../../components/Modal';
export default function DrawingAction({item,onSaved,disabled=false}){
 const {isAdmin}=useAuth();const [open,setOpen]=useState(false),[path,setPath]=useState(item.drawing_file||''),[name,setName]=useState(item.drawing_name||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{setBusy(true);setError('');try{await drawingApi.save(item.id,{drawing_file:path,drawing_name:name});setOpen(false);onSaved?.();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <><button type="button" disabled={disabled} onClick={()=>{setPath(item.drawing_file||'');setName(item.drawing_name||'');setOpen(true);}} className="rounded border px-2 py-1 text-xs text-brand-700">{item.drawing_file?'View Drawing':'Upload Drawing'}</button>{open&&<Modal open title={`Drawing · Item #${item.line_no}`} onClose={()=>!busy&&setOpen(false)} footer={<><button disabled={busy} onClick={()=>setOpen(false)} className="px-3 py-2">Close</button>{(!item.drawing_file||isAdmin)&&<button disabled={busy||!path||path===item.drawing_file} onClick={save} className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-40">{busy?'Saving…':'Save Drawing'}</button>}</>}><DrawingSlot path={path} name={name} onChange={(p,n)=>{setPath(p);setName(n);}} disabled={busy||(Boolean(item.drawing_file)&&!isAdmin)}/>{error&&<p role="alert" className="mt-3 text-red-600">{error}</p>}</Modal>}</>;
}
