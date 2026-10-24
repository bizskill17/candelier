import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { docsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import StockLines, { toStockLines } from '../../components/StockLines';
import { today } from '../../lib/util';

// Opening stock: what is on hand when you start. One list, saved together.
export default function OpeningStock() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const cat = useCatalog();
  const [lines, setLines] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const fill = (rows) => setLines(toStockLines(rows.map((r) => ({ id: r.id, entry_date: r.entry_date, material_id: r.material_id, values: r.values, quantity: r.quantity, remarks: r.remarks || '' })), { entry_date: today() }));
  const load = () => { setLoadError(''); docsApi.opening().then((r) => fill(r.data)).catch((e) => setLoadError(e.message)); };
  useEffect(load, []);

  const save = async () => {
    setSaving(true); setFormError('');
    try {
      const r = await docsApi.saveOpening(lines.map(({ id, entry_date, material_id, values, quantity, remarks }) => ({ id, entry_date, material_id, values, quantity, remarks })));
      toast(r.message);
      setErrors({});
      fill(r.data);
      cat.refresh();
    } catch (e) { setErrors(e.fields || {}); setFormError(e.message); } finally { setSaving(false); }
  };

  if (loadError) return <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white p-10 text-center"><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></div>;
  if (!lines) return <div className="mx-auto max-w-6xl h-40 animate-pulse rounded-xl bg-gray-100" />;
  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24">
      <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Enter the stock you have on hand before you start: pick the material, click Specification to fill its values (just like the BOQ), and enter the quantity. Use one line per specification.
      </p>
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
      <StockLines title="Opening Stock" lines={lines} onChange={(ls) => { setLines(ls); setErrors({}); }} errors={errors} readOnly={!canEdit} showDate />
      {canEdit && (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          <button onClick={load} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Undo changes</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save Opening Stock'}</button>
        </div>
      )}
    </div>
  );
}
