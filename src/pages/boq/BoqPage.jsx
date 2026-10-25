import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Copy, Printer, Plus, Trash2, Lock, Unlock, PackageMinus, RefreshCw } from 'lucide-react';
import { boqApi, materialsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import SearchSelect from '../../components/SearchSelect';
import Modal from '../../components/Modal';
import { inputCls } from '../../components/table';
import { fmtDate, fmtQty, round3, Badge } from '../../lib/util';
import { PhotoThumb } from '../../components/Photo';
import { DrawingLink } from '../../components/Drawing';

let seq = 0;
const row = (r) => ({ key: ++seq, material_id: r.material_id || '', category_id: r.category_id || '', values: { ...(r.values || {}) }, qty: r.qty_required ?? '', extra: !!r.extra });

// BOQ of one order item: the plan. Only specification + Qty Required are saved;
// the stock columns are worked out live every time.
export default function BoqPage() {
  const { pathname } = useLocation();
  const itemId = Number(pathname.replace(/^\/boq\/?/, '').split('/')[0]) || 0;
  return itemId ? <BoqEditor key={itemId} itemId={itemId} /> : null;
}

function BoqEditor({ itemId }) {
  const navigate = useNavigate();
  const toast = useToast();
  const cat = useCatalog();
  const { canEdit, canCreateSales, canCreateStock } = useAuth();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [savedSnap, setSavedSnap] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [sources, setSources] = useState(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [booking, setBooking] = useState(null); // { mode: 'book'|'release', row, variant }
  const asked = useRef(false);

  const buildRows = useCallback((lines, extra) => {
    const rs = (lines || []).map((l) => row({ ...l, category_id: l.category_id || cat.material(l.material_id)?.category_id || '' }));
    return rs.length ? rs : [row({})];
  }, [cat.materials]);
  const snap = (rs) => JSON.stringify(rs.map((r) => [r.category_id, r.material_id, String(r.qty)]));

  const load = useCallback(() => {
    setLoadError('');
    boqApi.get(itemId).then((r) => setData(r.data)).catch((e) => setLoadError(e.message));
  }, [itemId]);
  useEffect(load, [load]);

  // Build rows once both the BOQ and the catalogue are in
  useEffect(() => {
    if (!data || !cat.loaded || rows.length) return;
    const rs = buildRows(data.lines, data.extra);
    setRows(rs);
    setStats(data.stats || {});
    setSavedSnap(snap(rs));
  }, [data, cat.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offer to copy an earlier BOQ when this one is still empty
  useEffect(() => {
    if (!data || asked.current) return;
    boqApi.sources(itemId).then((r) => {
      setSources(r.data);
      if (!asked.current && canEdit && !data.closed && data.boq_status === 'Pending' && !data.lines.length && r.data.length) setCopyOpen(true);
      asked.current = true;
    }).catch(() => setSources([]));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch live figures for specifications not yet known
  const variantOf = (r) => cat.findVariant(r.material_id, r.values);
  const missing = rows.map(variantOf).filter((v) => v && !stats[v.id]).map((v) => v.id);
  const missingKey = [...new Set(missing)].sort().join(',');
  useEffect(() => {
    if (!missingKey) return undefined;
    const t = setTimeout(() => {
      materialsApi.stats(missingKey.split(','), itemId).then((r) => setStats((s) => ({ ...s, ...r.data }))).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [missingKey, itemId]);

  const dirty = rows.length > 0 && snap(rows) !== savedSnap;
  const showStockDetails = data?.boq_status === 'Final' && !dirty;
  const readOnly = !(canEdit || (canCreateSales && data && data.boq_status!=='Final' && !data.closed)) || (data && data.order_status === 'Cancelled');
  const setRow = (key, patch) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setErrors({}); };
  const addRow = () => setRows((rs) => [...rs, row({})]);
  const removeRow = (idx) => setRows((rs) => rs.length > 1 ? rs.filter((_, i) => i !== idx) : [row({})]);

  const applyCopy = async (srcId) => {
    try {
      const r = await boqApi.get(srcId);
      const keepExtra = rows.filter((x) => x.extra);
      const rs = buildRows(r.data.lines, []).concat(keepExtra);
      setRows(rs);
      toast(`Copied ${r.data.lines.length} materials from ${r.data.label}. Check them and save.`);
    } catch (e) { toast(e.message, 'error'); }
    setCopyOpen(false);
    setCopyFrom('');
  };

  const save = async (status) => {
    setSaving(true);
    setFormError('');
    const send = rows.filter((r) => !r.extra);
    try {
      const r = await boqApi.save(itemId, send.map((x) => ({ material_id: x.material_id, category_id: x.category_id, values: {}, qty_required: x.qty })), status);
      toast(r.message);
      await cat.refresh();
      setData(r.data);
      const rs = buildRows(r.data.lines, r.data.extra);
      setRows(rs);
      setStats(r.data.stats || {});
      setSavedSnap(snap(rs));
    } catch (e) {
      // Map server line numbers (only sent rows) back to row keys
      const f = {};
      Object.entries(e.fields || {}).forEach(([k, v]) => {
        const m = k.match(/^lines\.(\d+)\.(.+)$/);
        if (m && send[Number(m[1])]) f[`${send[Number(m[1])].key}.${m[2]}`] = v; else f[k] = v;
      });
      setErrors(f);
      setFormError(e.message);
    } finally { setSaving(false); }
  };

  const afterBooking = (d) => { setStats(d.stats || {}); setData((x) => ({ ...x, ...d, lines: x.lines })); setBooking(null); };

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button onClick={load} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button>
      </div>
    );
  }
  if (!data || !rows.length) return <div className="mx-auto max-w-7xl space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>;

  const th = 'border border-blue-400 px-2 py-2 text-left text-[11px] font-semibold leading-tight';
  const td = 'border border-blue-200 px-2 py-2 align-top';
  const num = `${td} text-right tabular-nums`;
  const label = data.label;
  const srcOptions = (sources || []).map((s) => ({ value: s.id, label: `${s.order_no} #${s.line_no} · ${s.customer_name}${s.item_title && s.item_title !== 'No details' ? ` (${s.item_title})` : ''}` }));
  const counted = new Set();

  return (
    <div className="boq-print-root mx-auto max-w-7xl space-y-4 pb-24">

      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-semibold">Bill of Quantities</h1>
        <p className="text-sm text-gray-600">Printed {fmtDate(new Date().toLocaleDateString('en-CA'))}</p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 text-sm sm:flex-row print:flex-row print:p-3">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
            <Info label="Order No.">{data.order_no} · #{data.line_no}</Info>
            <Info label="Customer">{data.customer_name}</Info>
            <Info label="Project">{data.project_name || '—'}</Info>
            <Info label="Delivery Date">{data.delivery_date ? fmtDate(data.delivery_date) : '—'}</Info>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div><div className="text-xs text-gray-500">Area</div><div className="mt-0.5 font-semibold text-gray-900">{data.area || '—'}</div></div>
              <div className="min-w-0 flex-1"><div className="text-xs text-gray-500">Order Item</div><div className="mt-0.5 text-sm">{data.details?.length ? <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">{data.details.map((detail, index) => <span key={index} className="inline-flex max-w-full items-baseline gap-2">{index > 0 && <span aria-hidden="true" className="text-gray-400">|</span>}<span className="min-w-0 break-words"><span className="font-semibold text-gray-900">{detail.name}:</span> <span className="text-gray-700">{detail.value}</span></span></span>)}</div> : '—'}</div></div>
            </div>
            {data.drawing_file && <p className="mt-2 hidden text-gray-700 print:block"><span className="text-xs text-gray-500">Drawing: </span>{data.drawing_name || 'attached'}</p>}
            {data.remarks && <p className="mt-2 text-gray-700"><span className="text-xs text-gray-500">Remarks: </span>{data.remarks}</p>}
          </div>
        </div>
        {(data.component_image || data.reference_image) && (
          <div className="flex shrink-0 gap-3">
            {data.component_image && <figure className="text-center"><PhotoThumb path={data.component_image} title="Component picture" className="h-32 w-32" /><figcaption className="mt-1 text-xs text-gray-500">Component</figcaption></figure>}
            {data.reference_image && <figure className="text-center"><PhotoThumb path={data.reference_image} title="Reference image" className="h-32 w-32" /><figcaption className="mt-1 text-xs text-gray-500">Reference</figcaption></figure>}
          </div>
        )}
      </section>

      {data.boq_status === 'Draft' && <p className="print:hidden rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Draft BOQ. Finalise the BOQ before issuing materials.</p>}
      {formError && <div className="print:hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

      <div className="print:hidden flex flex-wrap items-center gap-2">
        {!readOnly && <button onClick={() => setCopyOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><Copy size={15} /> Copy from earlier BOQ</button>}
        {canCreateStock && !data.closed && data.boq_status === 'Final' && !dirty && data.lines.length > 0 && <button onClick={() => navigate(`/material-issue/new/item/${itemId}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><PackageMinus size={15} /> Issue Material</button>}
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><Printer size={15} /> Print / PDF</button>
        {data.drawing_file && <span className="min-w-0 max-w-xs"><DrawingLink path={data.drawing_file} name={data.drawing_name} title={label} /></span>}
        <span className="flex-1" />
      </div>

      <section className="boq-screen-table overflow-hidden rounded-xl border border-blue-300 bg-white">
        <div className="overflow-x-auto"><table className={`w-full ${showStockDetails ? 'min-w-[1100px]' : 'min-w-[760px]'} border-collapse text-sm`}>
          <thead className="bg-brand-600 text-xs uppercase text-white"><tr>
            {['#', 'Material Category', 'Material', 'Photo', 'Quantity', 'Unit', 'In Stock', ...(showStockDetails ? ['Booked (All)', 'Available', 'Booked (Item)', 'Remaining to Book', 'Consumed'] : []), 'Action'].map((t, i) => <th key={t} className={`${th} ${i > 5 ? 'print:hidden' : ''}`}>{t}</th>)}
          </tr></thead><tbody>
            {rows.map((r, idx) => {
              const m = cat.material(r.material_id);
              const v = variantOf(r);
              const st = v ? stats[v.id] : null;
              const required = Math.max(0, round3(Number(r.qty || 0) - (st?.booked_item || 0) - (st?.consumed || 0)));
              const categoryId = r.category_id || m?.category_id || '';
              const categories = cat.categories.filter((c) => Number(c.is_active) || String(c.id) === String(categoryId));
              const mats = cat.materials.filter((m) => String(m.category_id) === String(categoryId) && (m.is_active || String(m.id) === String(r.material_id)));
              return <tr key={r.key}>
                <td className={td}>{idx + 1}</td>
                <td className={`${td} min-w-40`}>{readOnly ? cat.categories.find((c) => String(c.id) === String(categoryId))?.name : <SearchSelect id={`boq-${idx}-category`} options={categories.map((c) => ({ value: c.id, label: c.name }))} value={categoryId} onChange={(value) => setRow(r.key, { category_id: value, material_id: '', values: {} })} placeholder="Select category" error={errors[`${r.key}.category_id`]} />}{errors[`${r.key}.category_id`] && <p className="text-xs text-red-600">{errors[`${r.key}.category_id`]}</p>}</td>
                <td className={`${td} min-w-48`}>{readOnly ? [m?.material_code, m?.name].filter(Boolean).join(' · ') : <SearchSelect id={`boq-${idx}-material`} options={mats.map((m) => ({ value: m.id, label: [m.material_code, m.name].filter(Boolean).join(' · ') }))} value={r.material_id} onChange={(value) => setRow(r.key, { category_id: categoryId, material_id: value, values: {} })} disabled={!categoryId} placeholder="Select material" error={errors[`${r.key}.material_id`]} />}{errors[`${r.key}.material_id`] && <p className="text-xs text-red-600">{errors[`${r.key}.material_id`]}</p>}</td>
                <td className={`${td} w-24`}>{m?.photo_path ? <PhotoThumb path={m.photo_path} title={m.name} className="h-16 w-16"/> : <span className="text-xs text-gray-400">{m ? 'Photo pending' : '—'}</span>}</td>
                <td className={`${td} w-28`}>{readOnly ? fmtQty(r.qty) : <input aria-label={`Quantity, row ${idx + 1}`} type="number" min="0" step="0.001" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} className={`${inputCls(errors[`${r.key}.qty_required`])} text-right`} />}{errors[`${r.key}.qty_required`] && <p className="text-xs text-red-600">{errors[`${r.key}.qty_required`]}</p>}</td>
                <td className={td}>{m?.unit || '—'}</td>
                {[st?.in_stock, ...(showStockDetails ? [st?.booked_all, st?.available, st?.booked_item, r.material_id ? required : null, st?.consumed] : [])].map((n, i) => <td key={i} className={`${num} print:hidden`}>{n == null ? '—' : fmtQty(n)}</td>)}
                <td className={`${td} print:hidden`}><div className="flex items-center gap-1">
                  {!readOnly && <button onClick={() => removeRow(idx)} title="Remove row" aria-label={`Remove row ${idx + 1}`} className="p-1 text-red-500"><Trash2 size={15} /></button>}
                  {showStockDetails && canCreateStock && !data.closed && v && st && <>
                    {data.boq_status === 'Final' && !dirty && required > 0 && <button disabled={st.available <= 0} onClick={() => setBooking({ mode: 'book', row: r, variant: v, st, required })} className="rounded bg-brand-600 px-2 py-1 text-xs text-white disabled:opacity-40">Book</button>}
                    {canEdit && st.booked_item > 0 && <button onClick={() => setBooking({ mode: 'release', row: r, variant: v, st, required })} title="Release booked stock" className="p-1 text-gray-500"><Unlock size={14} /></button>}
                  </>}
                </div></td>
              </tr>;
            })}
          </tbody></table></div>
          {!readOnly && <div className="print:hidden border-t border-blue-200 px-4 py-3"><button onClick={addRow} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"><Plus size={15} /> Add Row</button></div>}
      </section>

      {/* A separate static print table avoids clipped horizontal scrolling and interactive selects. */}
      <section className="boq-print-table hidden">
        <table className="w-full border-collapse text-xs">
          <thead><tr>
            <th>#</th><th>Material Category</th><th>Material</th><th>Photo</th><th className="text-right">Quantity</th><th>Unit</th>
          </tr></thead>
          <tbody>
            {rows.map((r, idx) => {
              const m = cat.material(r.material_id);
              return <tr key={r.key}>
                <td>{idx + 1}</td>
                <td>{cat.categories.find(c => String(c.id) === String(r.category_id || m?.category_id))?.name || '—'}</td>
                <td>{[m?.material_code, m?.name].filter(Boolean).join(' · ') || '—'}</td>
                <td>{m?.photo_path ? <PhotoThumb path={m.photo_path} title={m.name} className="h-12 w-12" /> : '—'}</td>
                <td className="text-right">{fmtQty(r.qty)}</td>
                <td>{m?.unit || '—'}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </section>

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          <button onClick={() => navigate('/pending-boq')} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Back</button>
          <span className="flex-1" />
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button onClick={() => save('Draft')} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-60">{saving ? 'Saving…' : 'Save as Draft'}</button>
          <button onClick={() => save('Final')} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save as Final'}</button>
        </div>
      )}

      <Modal open={copyOpen} wide title="Copy from an earlier BOQ?" onClose={() => setCopyOpen(false)}
        footer={<>
          <button onClick={() => setCopyOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">{data.lines.length ? 'Cancel' : 'Start blank'}</button>
          <button onClick={() => applyCopy(copyFrom)} disabled={!copyFrom} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">Copy</button>
        </>}>
        <SearchSelect id="boq-copy-from" options={srcOptions} value={copyFrom} onChange={setCopyFrom} disabled={!sources} placeholder={sources ? (sources.length ? 'Search order no., customer or item…' : 'No earlier BOQs yet') : 'Loading…'} />
      </Modal>

      {booking && <BookDialog itemId={itemId} booking={booking} onClose={() => setBooking(null)} onDone={afterBooking} />}
    </div>
  );
}

function BookDialog({ itemId, booking, onClose, onDone }) {
  const toast = useToast();
  const cat = useCatalog();
  const { mode, variant, st, required } = booking;
  const m = cat.material(variant.material_id);
  const suggested = mode === 'book' ? Math.max(0, Math.min(st.available, Math.max(0, required || 0)) || st.available) : st.booked_item;
  const [qty, setQty] = useState(String(round3(suggested)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight=useRef(false);
  const go = async () => {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const r = mode === 'book' ? await boqApi.book(itemId, variant.id, qty) : await boqApi.release(itemId, variant.id, qty);
      toast(r.message);
      onDone(r.data);
    } catch (e) { setError(e.fields?.quantity || e.message); } finally { inFlight.current=false;setBusy(false); }
  };
  return (
    <Modal open title={mode === 'book' ? 'Book stock' : 'Release booked stock'} onClose={() => !inFlight.current && onClose()}
      footer={<>
        <button disabled={busy} onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
        <button onClick={go} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : mode === 'book' ? 'Book' : 'Release'}</button>
      </>}>
      <p className="font-medium text-gray-900">{m?.name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 text-sm">
        <dt className="text-gray-500">In stock</dt><dd className="text-right tabular-nums">{fmtQty(st.in_stock)} {m?.unit}</dd>
        <dt className="text-gray-500">Available to book</dt><dd className="text-right font-medium tabular-nums">{fmtQty(st.available)}</dd>
        <dt className="text-gray-500">Booked for this item</dt><dd className="text-right tabular-nums">{fmtQty(st.booked_item)}</dd>
        {mode === 'book' && <><dt className="text-gray-500">Still required</dt><dd className="text-right tabular-nums">{fmtQty(Math.max(0, required || 0))}</dd></>}
      </dl>
      <label htmlFor="book-qty" className="mb-1 mt-4 block text-sm font-medium text-gray-700">{mode === 'book' ? 'Quantity to book' : 'Quantity to release'}</label>
      <input id="book-qty" disabled={busy} autoFocus type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') {e.preventDefault();go();} }} className={`${inputCls(error)} text-right tabular-nums`} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </Modal>
  );
}

const Dash = () => <span className="text-gray-300">—</span>;
function Info({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 break-words font-medium text-gray-900">{children}</div>
    </div>
  );
}
