import Pagination, { usePagination } from '../../components/Pagination';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Search, Upload, Download, Trash2 } from 'lucide-react';
import { materialsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import MaterialPhoto from '../../components/MaterialPhoto';
import { PhotoThumb } from '../../components/Photo';
import Toggle from '../../components/Toggle';
import SearchSelect from '../../components/SearchSelect';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { tableWrap, theadCls, thCls, tdCls, inputCls } from '../../components/table';
import { parseMaterialCsv } from '../../lib/materialCsv';

const UNITS = ['Nos', 'Pcs', 'Set', 'Pair', 'Mtr', 'Ft', 'Kg', 'g', 'Box', 'Roll', 'Coil', 'Ltr'];
export default function MaterialsPage() {
  const { canEdit, canCreateStock } = useAuth();
  const toast = useToast();
  const cat = useCatalog();
  const file = useRef(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [upload, setUpload] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setError(''); materialsApi.list().then((r) => setRows(r.data)).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  const refresh = () => { load(); cat.refresh(); };
  const toggle = async (m) => { try { const r = await materialsApi.setStatus(m.id, !m.is_active); toast(r.message); refresh(); } catch (e) { toast(e.message, 'error'); } };
  const template = () => {
    const blob = new Blob(['\uFEFFMaterial Code,Material Category,Material Name,Unit\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'materials-template.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const readUpload = async (e) => {
    const selected = e.target.files?.[0]; e.target.value = '';
    if (!selected) return;
    if (selected.size > 1024 * 1024) { toast('Use a CSV file up to 1 MB.', 'error'); return; }
    try { const data = parseMaterialCsv(await selected.text()); setUpload({ rows: data, errors: {} }); } catch (err) { toast(err.message, 'error'); }
  };
  const importRows = async () => {
    setBusy(true);
    try { const r = await materialsApi.bulk(upload.rows); toast(r.message); setUpload(null); refresh(); }
    catch (e) { setUpload((u) => ({ ...u, errors: e.fields || { Import: e.message } })); }
    finally { setBusy(false); }
  };
  const q = search.trim().toLowerCase();
  const list = (rows || []).filter((m) => `${m.material_code || ''} ${m.name} ${m.category_name} ${m.unit}`.toLowerCase().includes(q));
  const pagination = usePagination(list, q);
  return <div className="mx-auto max-w-6xl space-y-4">
    <div className="flex flex-wrap gap-2">
      <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border bg-white px-3 py-2"><Search size={16} /><input aria-label="Search materials" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, material or category…" className="w-full text-sm outline-none" /></label>
      {canCreateStock && <><button onClick={template} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm"><Download size={15} /> Template</button><button onClick={() => file.current.click()} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm"><Upload size={15} /> Bulk Upload</button><input ref={file} type="file" accept=".csv,text/csv" hidden onChange={readUpload} /><button onClick={() => setEditing({})} className="flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white"><Plus size={16} /> Add</button></>}
    </div>
    <div className={tableWrap}><div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-sm"><thead className={theadCls}><tr>{['Material Code', 'Photo', 'Material Category', 'Material', 'Unit', 'Status', 'Action'].map((t) => <th key={t} className={thCls}>{t}</th>)}</tr></thead><tbody>
      {error && <tr><td colSpan={7} className={`${tdCls} text-red-600`}>{error} <button onClick={load}>Retry</button></td></tr>}
      {!rows && !error && <tr><td colSpan={7} className={tdCls}>Loading…</td></tr>}
      {rows && !list.length && <tr><td colSpan={7} className={`${tdCls} py-10 text-center text-gray-500`}>No materials found.</td></tr>}
      {pagination.rows.map((m) => <tr key={m.id}><td className={tdCls}>{m.material_code || <span className="text-xs text-amber-700">Code required</span>}</td><td className={tdCls}>{m.photo_path ? <PhotoThumb path={m.photo_path} title={m.name}/> : <span className="text-xs text-amber-700">Photo pending</span>}</td><td className={tdCls}>{m.category_name}</td><td className={`${tdCls} font-medium`}>{m.name}</td><td className={tdCls}>{m.unit}</td><td className={tdCls}><Toggle checked={m.is_active} onChange={() => toggle(m)} disabled={!canEdit} label={m.is_active ? 'Active' : 'Inactive'} /></td><td className={tdCls}><button onClick={() => setEditing(m)} className="inline-flex items-center gap-1 text-brand-600"><Pencil size={14} /> {canEdit ? 'Edit' : 'Open'}</button></td></tr>)}
    </tbody></table></div><Pagination {...pagination} /></div>
    {editing && <MaterialForm material={editing} readOnly={editing.id ? !canEdit : !canCreateStock} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    {upload && <Modal open wide title="Import Materials" onClose={() => !busy && setUpload(null)} footer={<><button disabled={busy} onClick={() => setUpload(null)} className="px-3 py-2">Cancel</button><button disabled={busy} onClick={importRows} className="rounded-lg bg-brand-600 px-4 py-2 text-white">{busy ? 'Importing…' : `Import ${upload.rows.length} materials`}</button></>}>
      <p className="mb-3 text-sm text-gray-600">Create the categories first. Unit must be one of: {UNITS.join(', ')}. Up to 500 rows per upload. Every row requires a unique Material Code. Photos can be added later by editing the material.</p>
      {Object.entries(upload.errors).map(([row, message]) => <p key={row} className="text-sm text-red-600">{row}: {message}</p>)}
      <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Row</th><th>Material Code</th><th>Material Category</th><th>Material Name</th><th>Unit</th></tr></thead><tbody>{upload.rows.map((r, i) => <tr key={i}><td className={tdCls}>{i + 2}</td><td className={tdCls}>{r.material_code}</td><td className={tdCls}>{r.category}</td><td className={tdCls}>{r.name}</td><td className={tdCls}>{r.unit}</td></tr>)}</tbody></table></div>
    </Modal>}
  </div>;
}
export function MaterialForm({ material, readOnly, onClose, onSaved }) {
  const cat = useCatalog(); const toast = useToast();
  const [f, setF] = useState({ material_code: material.material_code || '', photo_path: material.photo_path || '', name: material.name || '', category_id: material.category_id || '', unit: material.unit || 'Pcs' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const save = async () => { if (photoBusy || busy) return; const required = {}; if (!f.material_code.trim()) required.material_code = 'Enter the material code.'; if (!f.photo_path) required.photo_path = 'Upload or take a material photo.'; if (Object.keys(required).length) { setErrors(required); return; } setBusy(true); try { const r = material.id ? await materialsApi.update(material.id, f) : await materialsApi.create(f); toast(r.message); onSaved(r.data); } catch (e) { setErrors(e.fields || {}); toast(e.message, 'error'); } finally { setBusy(false); } };
  const remove = async () => { try { await materialsApi.remove(material.id); onSaved(); } catch (e) { toast(e.message, 'error'); setConfirm(false); } };
  return <Modal open title={material.id ? 'Edit Material' : 'New Material'} onClose={() => !busy && !photoBusy && onClose()} footer={<>{material.id && !readOnly && <button onClick={() => setConfirm(true)} className="mr-auto text-red-600"><Trash2 size={16} /></button>}<button disabled={busy || photoBusy} onClick={onClose} className="px-3 py-2">Cancel</button>{!readOnly && <button onClick={save} disabled={busy || photoBusy} className="rounded-lg bg-brand-600 px-4 py-2 text-white">{busy ? 'Saving…' : 'Save'}</button>}</>}>
    <div className="space-y-4">
      <div><label htmlFor="m-code" className="mb-1 block text-sm">Material Code <span className="text-red-500">*</span></label><input id="m-code" maxLength={50} value={f.material_code} onChange={e => setF({ ...f, material_code: e.target.value })} disabled={readOnly || busy} className={inputCls(errors.material_code)}/>{errors.material_code && <p className="text-xs text-red-600">{errors.material_code}</p>}</div>
      <div><label htmlFor="m-category" className="mb-1 block text-sm">Material Category <span className="text-red-500">*</span></label><SearchSelect id="m-category" options={cat.categories.filter((c) => Number(c.is_active) || String(c.id) === String(f.category_id)).map((c) => ({ value: c.id, label: c.name }))} value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} disabled={readOnly || !cat.loaded} error={errors.category_id} placeholder="Select material category" />{errors.category_id && <p className="text-xs text-red-600">{errors.category_id}</p>}</div>
      <div><label htmlFor="m-name" className="mb-1 block text-sm">Material Name <span className="text-red-500">*</span></label><input id="m-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={readOnly} className={inputCls(errors.name)} />{errors.name && <p className="text-xs text-red-600">{errors.name}</p>}</div>
      <div><label htmlFor="m-unit" className="mb-1 block text-sm">Unit <span className="text-red-500">*</span></label><SearchSelect id="m-unit" options={UNITS.map((u) => ({ value: u, label: u }))} value={f.unit} onChange={(v) => setF({ ...f, unit: v })} disabled={readOnly} error={errors.unit} />{errors.unit && <p className="text-xs text-red-600">{errors.unit}</p>}</div>
      <div><div className="mb-1 text-sm">Material Photo <span className="text-red-500">*</span></div><MaterialPhoto value={f.photo_path} onChange={photo_path => {setF(x => ({...x, photo_path}));setErrors(x => ({...x, photo_path: null}));}} disabled={readOnly || busy} error={errors.photo_path} onBusyChange={setPhotoBusy}/></div>
    </div><ConfirmDialog open={confirm} title="Delete material?" message="Materials in use can only be deactivated." onConfirm={remove} onCancel={() => setConfirm(false)} />
  </Modal>;
}
