import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, RefreshCw, ArrowUp, ArrowDown, Trash2, Search } from 'lucide-react';
import { materialsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import Toggle from '../../components/Toggle';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { tableWrap, theadCls, thCls, tdCls, inputCls } from '../../components/table';

const UNITS = ['Nos', 'Pcs', 'Set', 'Pair', 'Mtr', 'Ft', 'Kg', 'g', 'Box', 'Roll', 'Coil', 'Ltr'];
let fseq = 0;

// Materials and their specification fields. The values themselves are filled in on the BOQ, Material In, etc.
export default function MaterialsPage() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const cat = useCatalog();
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | material

  const load = useCallback(() => {
    setLoadError('');
    materialsApi.list().then((r) => setRows(r.data)).catch((e) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  const toggle = async (m) => {
    try { const r = await materialsApi.setStatus(m.id, !m.is_active); toast(r.message); load(); cat.refresh(); } catch (e) { toast(e.message, 'error'); }
  };
  const q = search.trim().toLowerCase();
  const list = (rows || []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.fields.some((f) => f.name.toLowerCase().includes(q)));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <Search size={16} className="text-gray-400" />
          <input id="search-materials" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials or fields…" className="w-full bg-transparent text-sm focus:outline-none" />
        </label>
        {canEdit && <button onClick={() => setEditing({})} aria-label="Add Material" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Plus size={16} /> Add</button>}
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={`${thCls} w-14 text-center`}>#</th>
                <th className={thCls}>Material</th>
                <th className={`${thCls} w-20`}>Unit</th>
                <th className={thCls}>Specification Fields</th>
                <th className={`${thCls} w-28 text-right`}>Specs Used</th>
                <th className={`${thCls} w-24 text-center`}>Status</th>
                <th className={`${thCls} w-24 text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {!rows && !loadError && [1, 2, 3].map((i) => <tr key={i}><td colSpan={7} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {loadError && <tr><td colSpan={7} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {rows && list.length === 0 && <tr><td colSpan={7} className={`${tdCls} py-12 text-center text-gray-500`}>{q ? 'No materials match.' : 'No materials yet. Add your materials and their specification fields.'}</td></tr>}
              {list.map((m) => (
                <tr key={m.id} className={m.is_active ? '' : 'bg-gray-50 text-gray-500'}>
                  <td className={`${tdCls} text-center tabular-nums text-gray-500`}>{m.sort_order}</td>
                  <td className={`${tdCls} font-medium text-gray-900`}>{m.name}</td>
                  <td className={tdCls}>{m.unit}</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap gap-1.5">
                      {m.fields.length ? m.fields.map((f) => <span key={f.id} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-200">{f.name}</span>) : <span className="text-gray-400">None</span>}
                    </div>
                  </td>
                  <td className={`${tdCls} text-right tabular-nums`}>{m.variant_count}</td>
                  <td className={`${tdCls} text-center`}><Toggle checked={m.is_active} onChange={() => toggle(m)} disabled={!canEdit} label={m.is_active ? 'Active' : 'Inactive'} /></td>
                  <td className={`${tdCls} text-center`}>
                    <button onClick={() => setEditing(m)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"><Pencil size={13} /> {canEdit ? 'Edit' : 'Open'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <MaterialForm material={editing} readOnly={!canEdit} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); cat.refresh(); }} />}
    </div>
  );
}

function MaterialForm({ material, readOnly, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(material.id);
  const [form, setForm] = useState({ name: material.name || '', unit: material.unit || 'Pcs', sort_order: material.sort_order || '' });
  const [fields, setFields] = useState(() => (material.fields?.length ? material.fields.map((f) => ({ key: ++fseq, id: f.id, name: f.name })) : [{ key: ++fseq, name: '' }]));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setF = (i, v) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, name: v } : f)));
  const move = (i, d) => setFields((fs) => { const a = [...fs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, fields: fields.map((f) => ({ id: f.id, name: f.name })) };
      const r = isEdit ? await materialsApi.update(material.id, body) : await materialsApi.create(body);
      toast(r.message);
      onSaved();
    } catch (e) {
      setErrors(e.fields || {});
      if (!e.fields || !Object.keys(e.fields).length) toast(e.message, 'error');
    } finally { setSaving(false); }
  };
  const del = async () => {
    try { const r = await materialsApi.remove(material.id); toast(r.message); onSaved(); } catch (e) { toast(e.message, 'error'); setConfirmDelete(false); }
  };

  return (
    <Modal open wide title={isEdit ? `Material: ${material.name}` : 'New Material'} onClose={onClose}
      footer={<>
        {isEdit && !readOnly && material.variant_count === 0 && <button onClick={() => setConfirmDelete(true)} className="mr-auto inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={14} /> Delete</button>}
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">{readOnly ? 'Close' : 'Cancel'}</button>
        {!readOnly && <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>}
      </>}>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 sm:col-span-2">
          <label htmlFor="m-name" className="mb-1 block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
          <input id="m-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={readOnly} className={inputCls(errors.name)} placeholder="e.g. Crystal" />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="m-unit" className="mb-1 block text-sm font-medium text-gray-700">Unit <span className="text-red-500">*</span></label>
          <select id="m-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={readOnly} className={inputCls(errors.unit)}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="m-order" className="mb-1 block text-sm font-medium text-gray-700">Order on BOQ</label>
          <input id="m-order" type="number" min="0" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} disabled={readOnly} className={inputCls()} placeholder="Auto" />
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 text-sm font-medium text-gray-700">Specification fields</div>
        <p className="mb-2 text-xs text-gray-500">e.g. Shape, Size, Colour, Quality. Values are filled in later; the order here is the order they are joined in.</p>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.key}>
              <div className="flex items-center gap-1.5">
                <span className="w-6 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
                <input aria-label={`Field ${i + 1}`} value={f.name} onChange={(e) => setF(i, e.target.value)} disabled={readOnly} className={inputCls(errors[`fields.${i}.name`])} placeholder="Field name" />
                {!readOnly && <>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} aria-label="Remove field" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                </>}
              </div>
              {errors[`fields.${i}.name`] && <p className="ml-8 mt-1 text-xs text-red-600">{errors[`fields.${i}.name`]}</p>}
            </div>
          ))}
        </div>
        {errors.fields && <p className="mt-2 text-xs text-red-600">{errors.fields}</p>}
        {!readOnly && <button type="button" onClick={() => setFields((fs) => [...fs, { key: ++fseq, name: '' }])} className="ml-8 mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"><Plus size={14} /> Add field</button>}
      </div>
      <ConfirmDialog open={confirmDelete} title="Delete material?" message={`${material.name} will be removed.`} onConfirm={del} onCancel={() => setConfirmDelete(false)} />
    </Modal>
  );
}
