import { useEffect, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, RefreshCw } from 'lucide-react';
import { itemsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import Toggle from '../../components/Toggle';
import { inputCls } from '../../components/table';

let seq = 0;
const toRows = (data) => data.map((f) => ({ key: ++seq, id: f.id, name: f.name, is_active: f.is_active, used: f.used }));
const snap = (rows) => JSON.stringify(rows.map(({ id, name, is_active }) => ({ id: id || null, name: name.trim(), is_active })));

// Your own list of fields that describe an order item (like the columns of your quotation).
export default function ItemFieldsPage() {
  const toast = useToast();
  const { canEdit } = useAuth();
  const [rows, setRows] = useState(null);
  const [saved, setSaved] = useState('');
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const fill = (data) => { const r = toRows(data); setRows(r); setSaved(snap(r)); };
  const load = () => { setLoadError(''); itemsApi.fields().then((r) => fill(r.data)).catch((e) => setLoadError(e.message)); };
  useEffect(load, []);

  const set = (i, k, v) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setErrors((e) => ({ ...e, [`fields.${i}.name`]: undefined, fields: undefined })); };
  const move = (i, d) => setRows((rs) => { const a = [...rs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const save = async () => {
    setSaving(true);
    try {
      const r = await itemsApi.saveFields(rows.map(({ id, name, is_active }) => ({ id, name, is_active })));
      toast(r.message);
      setErrors({});
      fill(r.data);
    } catch (e) {
      setErrors(e.fields || {});
      if (!e.fields || !Object.keys(e.fields).length) toast(e.message, 'error');
    } finally { setSaving(false); }
  };

  if (loadError) return <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 text-center"><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></div>;
  if (!rows) return <div className="mx-auto h-60 max-w-2xl animate-pulse rounded-xl bg-gray-100" />;
  const dirty = snap(rows) !== saved;
  const readOnly = !canEdit;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-20">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-0.5 text-xs font-medium text-gray-500">
            <span className="w-6" /><span className="flex-1">Field name</span><span className="w-20 text-center">In use</span><span className="w-14 text-center">Active</span>{!readOnly && <span className="w-[6.5rem]" />}
          </div>
          {rows.map((r, i) => (
            <div key={r.key}>
              <div className="flex items-center gap-1.5">
                <span className="w-6 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
                <input aria-label={`Field ${i + 1}`} value={r.name} onChange={(e) => set(i, 'name', e.target.value)} disabled={readOnly} className={`${inputCls(errors[`fields.${i}.name`])} flex-1`} placeholder="e.g. Glass Colour" />
                <span className="w-20 text-center text-xs tabular-nums text-gray-500">{r.used ? `${r.used} items` : '—'}</span>
                <span className="flex w-14 justify-center"><Toggle checked={r.is_active} onChange={(v) => set(i, 'is_active', v)} disabled={readOnly} label={`${r.name || 'Field'} active`} /></span>
                {!readOnly && <>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={r.used > 0} title={r.used > 0 ? 'In use: switch it off instead' : 'Remove field'} aria-label="Remove field" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"><Trash2 size={15} /></button>
                </>}
              </div>
              {errors[`fields.${i}.name`] && <p className="ml-8 mt-1 text-xs text-red-600">{errors[`fields.${i}.name`]}</p>}
            </div>
          ))}
          {rows.length === 0 && <p className="py-4 text-center text-sm text-gray-500">No fields yet.</p>}
        </div>
        {errors.fields && <p className="mt-2 text-xs text-red-600">{errors.fields}</p>}
        {!readOnly && <button type="button" onClick={() => setRows((rs) => [...rs, { key: ++seq, id: null, name: '', is_active: true, used: 0 }])} className="ml-8 mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"><Plus size={14} /> Add field</button>}
      </section>
      {canEdit && (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          {dirty && <span className="mr-auto text-xs text-amber-700">Unsaved changes</span>}
          {dirty && <button onClick={() => { setErrors({}); load(); }} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Undo changes</button>}
          <button onClick={save} disabled={saving || !dirty} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      )}
    </div>
  );
}
