import {useState} from 'react';
import {MaterialForm} from '../pages/materials/MaterialsPage';
import MasterForm from './MasterForm';
import {masters} from '../config/masters';
import Modal from './Modal';
import MaterialPhoto from './MaterialPhoto';
import {PhotoThumb} from './Photo';
import {materialPhotoApi} from '../api/client';
import { Plus, Trash2, Copy } from 'lucide-react';
import SearchSelect from './SearchSelect';
import AutoTextarea from './AutoTextarea';
import DateInput from './DateInput';
import { inputCls } from './table';
import { useCatalog } from '../lib/catalog';
import { today } from '../lib/util';

let seq = 0;
export const blankStockLine = (extra = {}) => ({ key: ++seq, material_id: '', values: {}, quantity: '', remarks: '', ...extra });
export const toStockLines = (rows, extra = {}) => (rows?.length ? rows.map((r) => ({ key: ++seq, remarks: '', ...extra, ...r, values: { ...(r.values || {}) } })) : [blankStockLine(extra)]);

export const DAMAGE_REASONS = ['Broken', 'Defective', 'Lost', 'Other'];

// Lines of material + specification + quantity, used by Opening Stock, Material In, Material Issue and Damage.
//   infoColumns: [{ label, render: (line) => node }]  read-only columns before Quantity
export default function StockLines({ title = 'Materials', lines, onChange, errors = {}, readOnly, infoColumns = [], showDate, showReason, orderItemId, emptyHint, allowedMaterialIds, receipt=false, users=[], defaultInventoryType='Normal' }) {
  const cat = useCatalog();
  const [adding,setAdding]=useState(null),[photo,setPhoto]=useState(null),[photoBusy,setPhotoBusy]=useState(false),[photoError,setPhotoError]=useState('');
  const savePhoto=async()=>{setPhotoBusy(true);setPhotoError('');try{await materialPhotoApi(photo.id,photo.path);await cat.refresh();setPhoto(null);}catch(e){setPhotoError(e.message);}finally{setPhotoBusy(false);}};
  const filled = lines.filter((l) => l.material_id).length;
  const setLine = (idx, patch) => onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const extra = () => ({ ...(showDate ? { entry_date: today() } : {}), ...(showReason ? { reason: 'Broken' } : {}) });
  const addAfter = (idx, copy) => {
    const base = copy ? { ...lines[idx], values: { ...lines[idx].values }, quantity: '', id: undefined } : extra();
    onChange([...lines.slice(0, idx + 1), blankStockLine(base), ...lines.slice(idx + 1)]);
  };
  const remove = (idx) => onChange(lines.length === 1 ? [blankStockLine(extra())] : lines.filter((_, i) => i !== idx));
  const eligible = cat.materials.filter((m) => (m.is_active || lines.some((l) => String(l.material_id) === String(m.id))) && (!allowedMaterialIds || allowedMaterialIds.some((id) => String(id) === String(m.id))));

  const th = 'border border-blue-400 px-3 py-2 text-left font-semibold';
  const td = 'border border-blue-200 px-2 py-2 align-top';
  const err = (idx, k) => errors[`lines.${idx}.${k}`];
  const minW = 760 + (receipt?750:0) + infoColumns.length * 90 + (showDate ? 140 : 0) + (showReason ? 120 : 0);

  return (
    <><section className="overflow-hidden rounded-xl border border-blue-300 bg-white">
      <div className="flex items-center justify-between px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">{filled} {filled === 1 ? 'line' : 'lines'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: minW }}>
          <thead className="bg-brand-600 text-xs uppercase tracking-wide text-white">
            <tr>
              <th className={`${th} w-10 border-l-0 text-center`}>#</th>
              {showDate && <th className={`${th} w-36`}>Date</th>}
              <th className={`${th} w-44`}>Material Category</th>
              <th className={th}>Material</th>
              {receipt&&<><th className={`${th} w-32`}>Photo</th><th className={`${th} w-32`}>Inventory</th><th className={`${th} w-48`}>Project Name</th><th className={`${th} w-44`}>Order By</th></>}
              {infoColumns.map((c) => <th key={c.label} className={`${th} w-[5.5rem] text-right`}>{c.label}</th>)}
              <th className={`${th} w-28 text-right`}>Quantity</th>
              <th className={`${th} w-16`}>Unit</th>
              {showReason && <th className={`${th} w-32`}>Reason</th>}
              <th className={`${th} w-[16%]`}>Remarks</th>
              {!readOnly && <th className={`${th} w-24 border-r-0 text-center`}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const m = cat.material(l.material_id);
              const categoryId = l.category_id || m?.category_id || '';
              const categories = cat.categories.filter((c) => (Number(c.is_active) || String(c.id) === String(categoryId)) && (!allowedMaterialIds || eligible.some((m) => String(m.category_id) === String(c.id))));
              const matOptions = eligible.filter((m) => String(m.category_id) === String(categoryId)).map((m) => ({ value: m.id, label: m.name, hint: m.unit }));
              return (
                <tr key={l.key}>
                  <td className={`${td} border-l-0 py-3 text-center tabular-nums text-gray-500`}>{idx + 1}</td>
                  {showDate && (
                    <td className={td}>
                      <DateInput compact aria-label={`Date, line ${idx + 1}`} max={today()} value={l.entry_date || ''} onChange={(v) => setLine(idx, { entry_date: v })} error={err(idx, 'entry_date')} disabled={readOnly} />
                      {err(idx, 'entry_date') && <p className="mt-1 text-xs text-red-600">{err(idx, 'entry_date')}</p>}
                    </td>
                  )}
                  <td className={td}>
                    {receipt&&!readOnly&&<button type="button" aria-label={`Add material category, line ${idx+1}`} onClick={()=>setAdding({type:'category',idx})} className="float-right ml-1 rounded border px-2 py-1 text-brand-600">+</button>}{readOnly ? <span>{cat.categories.find((c) => String(c.id) === String(categoryId))?.name || '—'}</span> : <SearchSelect id={`line-${idx}-category`} options={categories.map((c) => ({ value: c.id, label: c.name }))} value={categoryId} onChange={(v) => setLine(idx, { category_id: v, material_id: '', values: {} })} disabled={!cat.loaded} placeholder="Select category" />}
                  </td>
                  <td className={td}>
                    {receipt&&!readOnly&&<button type="button" aria-label={`Add material, line ${idx+1}`} onClick={()=>setAdding({type:'material',idx,category_id:categoryId})} className="float-right ml-1 rounded border px-2 py-1 text-brand-600">+</button>}{readOnly ? <div className="px-1 py-1.5 font-medium text-gray-900">{m?.name || l.material_name}</div> : <SearchSelect id={`line-${idx}-material`} options={matOptions} value={l.material_id} onChange={(v) => setLine(idx, { category_id: categoryId, material_id: v, values: {} })} error={err(idx, 'material_id')} disabled={!cat.loaded || !categoryId} placeholder="Select material" />}
                    {err(idx, 'material_id') && <p className="mt-1 text-xs text-red-600">{err(idx, 'material_id')}</p>}
                  </td>
                  {receipt&&<><td className={td}>{m?.photo_path&&<PhotoThumb path={m.photo_path} title={m.name}/>} {!readOnly&&m&&<button type="button" aria-label={`Update material photo, line ${idx+1}`} onClick={()=>{setPhotoError('');setPhoto({id:m.id,name:m.name,path:m.photo_path||''});}} className="mt-1 block text-xs text-brand-700">Update Photo</button>}</td><td className={td}><select aria-label={`Inventory type, line ${idx+1}`} disabled={readOnly} value={l.inventory_type||defaultInventoryType} onChange={e=>setLine(idx,{inventory_type:e.target.value})} className={inputCls()}><option>Normal</option><option>Sample</option></select></td><td className={td}><input aria-label={`Project name, line ${idx+1}`} disabled={readOnly} maxLength={150} value={l.project_name||''} onChange={e=>setLine(idx,{project_name:e.target.value})} className={inputCls()}/></td><td className={td}><SearchSelect aria-label={`Order by, line ${idx+1}`} options={users.filter(u=>u.is_active||String(u.id)===String(l.order_by_id)).map(u=>({value:u.id,label:u.name}))} value={l.order_by_id||''} onChange={v=>setLine(idx,{order_by_id:v})} disabled={readOnly} placeholder="Select user" clearable/></td></>}
                  {infoColumns.map((c) => <td key={c.label} className={`${td} px-3 py-3 text-right tabular-nums`}>{c.render(l)}</td>)}
                  <td className={td}>
                    {readOnly ? <span className="block px-1 py-1.5 text-right tabular-nums">{l.quantity}</span> : (
                      <input id={`line-${idx}-qty`} aria-label={`Quantity, line ${idx + 1}`} type="number" min="0" step="any" inputMode="decimal"
                        value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} className={`${inputCls(err(idx, 'quantity'))} text-right tabular-nums`} />
                    )}
                    {err(idx, 'quantity') && <p className="mt-1 text-xs text-red-600">{err(idx, 'quantity')}</p>}
                  </td>
                  <td className={`${td} px-3 py-3 text-gray-700`}>{m?.unit || l.unit || <span className="text-gray-300">—</span>}</td>
                  {showReason && (
                    <td className={td}>
                      {readOnly ? <span className="block px-1 py-1.5">{l.reason}</span> : (
                        <select aria-label={`Reason, line ${idx + 1}`} value={l.reason || 'Broken'} onChange={(e) => setLine(idx, { reason: e.target.value })} className={inputCls(err(idx, 'reason'))}>
                          {DAMAGE_REASONS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      )}
                    </td>
                  )}
                  <td className={td}>
                    {readOnly ? <span className="block whitespace-pre-wrap break-words px-1 py-1.5 text-gray-600">{l.remarks}</span> : (
                      <AutoTextarea aria-label={`Remarks, line ${idx + 1}`} value={l.remarks || ''} onChange={(v) => setLine(idx, { remarks: v })} className={inputCls()} />
                    )}
                  </td>
                  {!readOnly && (
                    <td className={`${td} border-r-0 px-1 py-2.5 text-center`}>
                      <div className="inline-flex gap-0.5">
                        <button type="button" onClick={() => addAfter(idx)} title="Add line below" aria-label={`Add line below line ${idx + 1}`} className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button>
                        <button type="button" onClick={() => addAfter(idx, true)} title="Copy this material to a new line" aria-label={`Copy line ${idx + 1}`} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><Copy size={14} /></button>
                        <button type="button" onClick={() => remove(idx)} title="Remove line" aria-label={`Remove line ${idx + 1}`} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(errors.lines || emptyHint) && (
        <div className="border-t border-blue-200 px-5 py-3 text-sm">
          {errors.lines ? <p className="text-red-600">{errors.lines}</p> : <p className="text-xs text-gray-500">{emptyHint}</p>}
        </div>
      )}
    </section>
    {adding?.type==='category'&&<MasterForm entity="material_categories" def={masters.material_categories} onClose={()=>setAdding(null)} onSaved={async row=>{await cat.refresh();setLine(adding.idx,{category_id:row.id,material_id:'',values:{}});setAdding(null);}}/>}
    {adding?.type==='material'&&<MaterialForm material={{category_id:adding.category_id}} readOnly={false} onClose={()=>setAdding(null)} onSaved={async row=>{await cat.refresh();setLine(adding.idx,{category_id:row.category_id,material_id:row.id,values:{}});setAdding(null);}}/>}
    {photo&&<Modal open title={`Update Material Photo · ${photo.name}`} onClose={()=>!photoBusy&&setPhoto(null)} footer={<><button type="button" disabled={photoBusy} onClick={()=>setPhoto(null)} className="px-3 py-2">Cancel</button><button type="button" disabled={photoBusy||!photo.path} onClick={savePhoto} className="rounded bg-brand-600 px-4 py-2 text-white">{photoBusy?'Saving…':'Update Material Photo'}</button></>}><MaterialPhoto value={photo.path} onChange={path=>setPhoto(x=>({...x,path}))} onBusyChange={setPhotoBusy}/><p className="mt-3 text-sm">This will replace the current photo in the Material master.</p>{photoError&&<p role="alert" className="text-red-600">{photoError}</p>}</Modal>}
    </>
  );
}
