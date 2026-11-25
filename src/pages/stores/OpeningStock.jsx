import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
import { docsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import StockLines, { toStockLines } from '../../components/StockLines';
import { today } from '../../lib/util';
import Modal from '../../components/Modal';
import { thCls, tdCls } from '../../components/table';
import { openingStockCsvHeader, parseOpeningStockCsv } from '../../lib/openingStockCsv';


// Opening stock: what is on hand when you start. One list, saved together.
export default function OpeningStock() {
  const { canEdit, canCreateStock } = useAuth();
  const toast = useToast();
  const cat = useCatalog();
  const [savedRows,setSavedRows]=useState([]);
  const [lines, setLines] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [reading, setReading] = useState(false);
  const inputRef = useRef(null);

  const fill = (rows) => {setSavedRows(rows.length?toStockLines(rows):[]);setLines(toStockLines((canEdit?rows:[]).map((r) => ({ id: r.id, entry_date: r.entry_date, material_id: r.material_id, values: r.values, quantity: r.quantity, remarks: r.remarks || '' })), { entry_date: today() }));};
  const load = () => { setLoadError(''); docsApi.opening().then((r) => fill(r.data)).catch((e) => setLoadError(e.message)); };
  useEffect(load, []);

  const save = async () => {
    setSaving(true); setFormError('');
    try {
      const r = await (canEdit?docsApi.saveOpening:docsApi.addOpening)(lines.map(({ id, entry_date, material_id, values, quantity, remarks }) => ({ id, entry_date, material_id, values, quantity, remarks })));
      toast(r.message);
      setErrors({});
      fill(r.data);
      cat.refresh();
    } catch (e) { setErrors(e.fields || {}); setFormError(e.message); } finally { setSaving(false); }
  };

  function downloadTemplate() {
    const blob = new Blob(['\uFEFF', openingStockCsvHeader, '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'opening-stock-template.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReading(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Use a CSV file up to 2 MB.');
      setPreview(parseOpeningStockCsv(await file.text(), today()));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setReading(false);
    }
  }

  const materialsByCode = new Map(cat.materials.filter(material => material.is_active && material.material_code)
    .map(material => [material.material_code.toLowerCase(), material]));
  const existingIds = new Set([...(canEdit ? [] : savedRows), ...(lines || [])].map(row => String(row.material_id)));
  const fileIds = new Set();
  const importRows = (preview || []).map(row => {
    const material = materialsByCode.get(row.code.toLowerCase());
    const reasons = [...row.errors];
    if (!material && row.code) reasons.push('Material code not found or inactive.');
    if (material) {
      const id = String(material.id);
      if (existingIds.has(id)) reasons.push('This material already has an opening stock row.');
      else if (fileIds.has(id)) reasons.push('This material appears more than once in the CSV.');
      fileIds.add(id);
    }
    return { ...row, material, reasons };
  });
  const canAddRows = importRows.length > 0 && importRows.every(row => !row.reasons.length);

  function addRows() {
    if (!canAddRows) return;
    const rows = importRows.map(row => ({
      entry_date: row.entryDate, material_id: row.material.id, quantity: row.quantity, remarks: row.remarks,
    }));
    setLines(current => [...current.filter(row => row.id || row.material_id || row.quantity || row.remarks?.trim()), ...toStockLines(rows)]);
    setErrors({});
    setFormError('');
    setPreview(null);
  }

  if (loadError) return <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white p-10 text-center"><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></div>;
  if (!lines) return <div className="mx-auto max-w-6xl h-40 animate-pulse rounded-xl bg-gray-100" />;
  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24">
      {canCreateStock && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><Download size={16} /> CSV Template</button>
          <button type="button" disabled={!cat.loaded || saving || reading} onClick={() => inputRef.current.click()}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-brand-700 disabled:opacity-50"><Upload size={16} /> Bulk Upload</button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={readUpload} />
        </div>
      )}
      {preview && (
        <Modal open wide="xl" title="Bulk Upload Opening Stock" onClose={() => setPreview(null)} footer={<>
          <button type="button" onClick={() => setPreview(null)} className="btn-dismiss px-3 py-2">Cancel</button>
          <button type="button" disabled={!canAddRows} onClick={addRows} className="rounded-lg bg-brand-600 px-4 py-2 text-white disabled:opacity-50">Add to Opening Stock</button>
        </>}>
          <p className="mb-3">Review the rows, then click Add to Opening Stock. Use Save Opening Stock to post them.</p>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr>{['Row', 'Date', 'Material Code', 'Material', 'Quantity', 'Remarks', 'Reason'].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
              <tbody>{importRows.map(row => <tr key={row.rowNumber}>
                {[row.rowNumber, row.date, row.code, row.material?.name, row.quantity, row.remarks].map((value, i) => <td key={i} className={tdCls}>{value || '—'}</td>)}
                <td className={`${tdCls} ${row.reasons.length ? 'text-red-700' : 'text-green-700'}`}>{row.reasons.join(' ') || 'Ready'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </Modal>
      )}
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
      {!canEdit&&savedRows.length>0&&<StockLines title="Saved Opening Stock" lines={savedRows} readOnly showDate/>}
      <StockLines title={canEdit?"Opening Stock":"Add Opening Stock"} lines={lines} onChange={(ls) => { setLines(ls); setErrors({}); }} errors={errors} readOnly={!canCreateStock} showDate />
      {canCreateStock && (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          <button onClick={load} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Undo changes</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save Opening Stock'}</button>
        </div>
      )}
    </div>
  );
}
