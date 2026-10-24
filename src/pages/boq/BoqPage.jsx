import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Copy, Printer, Plus, Trash2, Lock, Unlock, PackageMinus, RefreshCw } from 'lucide-react';
import { boqApi, materialsApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import { SpecCell } from '../../components/Spec';
import SearchSelect from '../../components/SearchSelect';
import Modal from '../../components/Modal';
import { inputCls } from '../../components/table';
import { fmtDate, fmtQty, round3, Badge } from '../../lib/util';
import { PhotoThumb } from '../../components/Photo';
import { ItemDetailLines } from '../../lib/items';
import { DrawingLink } from '../../components/Drawing';

let seq = 0;
const row = (r) => ({ key: ++seq, material_id: r.material_id, values: { ...(r.values || {}) }, qty: r.qty_required ?? '', extra: !!r.extra });

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
  const { canEdit } = useAuth();
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

  // One row per material (all active materials, in master order), then saved extra rows
  const buildRows = useCallback((lines, extra) => {
    const out = [];
    const mats = cat.materials.filter((m) => m.is_active || lines.some((l) => l.material_id === m.id));
    mats.forEach((m) => {
      const mine = lines.filter((l) => l.material_id === m.id);
      if (mine.length) mine.forEach((l) => out.push(row(l)));
      else out.push(row({ material_id: m.id }));
    });
    (extra || []).forEach((e) => out.push(row({ ...e, extra: true })));
    return out;
  }, [cat.materials]);

  const snap = (rs) => JSON.stringify(rs.filter((r) => !r.extra && (r.qty !== '' || cat.hasValues(r.values))).map((r) => [r.material_id, cat.keyOf(r.material_id, r.values), String(r.qty)]));

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
  const readOnly = !canEdit || (data && data.order_status === 'Cancelled');
  const setRow = (key, patch) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setErrors({}); };
  const addRow = (idx) => setRows((rs) => [...rs.slice(0, idx + 1), row({ material_id: rs[idx].material_id }), ...rs.slice(idx + 1)]);
  const removeRow = (idx) => setRows((rs) => {
    const r = rs[idx];
    const sameMat = rs.filter((x) => x.material_id === r.material_id && !x.extra).length;
    return sameMat > 1 ? rs.filter((_, i) => i !== idx) : rs.map((x, i) => (i === idx ? { ...x, values: {}, qty: '' } : x));
  });

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

  const save = async () => {
    setSaving(true);
    setFormError('');
    const send = rows.filter((r) => !r.extra);
    try {
      const r = await boqApi.save(itemId, send.map((x) => ({ material_id: x.material_id, values: x.values, qty_required: x.qty })));
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
    <div className="mx-auto max-w-7xl space-y-4 pb-24">
      <div className="print:hidden flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(`/orders/${data.order_id}`)} className="inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft size={16} /> Order {data.order_no}</button>
        <span className="flex-1" />
        {data.dispatched ? <Badge color="green">Dispatched</Badge> : data.order_status === 'Cancelled' ? <Badge>Order cancelled</Badge> : <Badge color={data.boq_status === 'Saved' ? 'blue' : 'gray'}>BOQ {data.boq_status}</Badge>}
      </div>

      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-semibold">Bill of Quantities</h1>
        <p className="text-sm text-gray-600">Printed {fmtDate(new Date().toLocaleDateString('en-CA'))}</p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 text-sm sm:flex-row print:flex-row print:p-3">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5">
            <Info label="Order No.">{data.order_no} · #{data.line_no}</Info>
            <Info label="Customer">{data.customer_name}</Info>
            <Info label="Project">{data.project_name || '—'}</Info>
            <Info label="Production Date">{data.production_date ? fmtDate(data.production_date) : '—'}</Info>
            <Info label="Delivery Date">{data.delivery_date ? fmtDate(data.delivery_date) : '—'}</Info>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div><div className="text-xs text-gray-500">Area</div><div className="mt-0.5 font-semibold text-gray-900">{data.area || '—'}</div></div>
              <div className="min-w-0 flex-1"><div className="text-xs text-gray-500">Order Item</div><div className="mt-0.5 text-sm"><ItemDetailLines details={data.details} empty="—" /></div></div>
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

      {formError && <div className="print:hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

      <div className="print:hidden flex flex-wrap items-center gap-2">
        {!readOnly && <button onClick={() => setCopyOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><Copy size={15} /> Copy from earlier BOQ</button>}
        {canEdit && !data.closed && data.lines.length > 0 && <button onClick={() => navigate(`/material-issue/new/item/${itemId}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><PackageMinus size={15} /> Issue Material</button>}
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><Printer size={15} /> Print / PDF</button>
        {data.drawing_file && <span className="min-w-0 max-w-xs"><DrawingLink path={data.drawing_file} name={data.drawing_name} title={label} /></span>}
        <span className="flex-1" />
      </div>

      <section className="overflow-hidden rounded-xl border border-blue-300 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 900 }}>
            <thead className="bg-brand-600 text-xs uppercase tracking-wide text-white">
              <tr>
                <th className={`${th} w-9 border-l-0 text-center`}>#</th>
                <th className={th}>Material / Specification</th>
                <th className={`${th} w-[5.5rem] text-right`}>Qty Req.</th>
                <th className={`${th} w-12`}>Unit</th>
                <th className={`${th} print:hidden w-[4.75rem] text-right`}>In Stock</th>
                <th className={`${th} print:hidden w-[4.75rem] text-right`}>Booked (All Orders)</th>
                <th className={`${th} print:hidden w-[4.75rem] text-right`}>Available to Book</th>
                <th className={`${th} print:hidden w-[4.75rem] text-right`}>Booked (This Item)</th>
                <th className={`${th} print:hidden w-[4.75rem] text-right`}>Required</th>
                <th className={`${th} print:hidden w-[4.75rem] text-right`}>Consumed</th>
                <th className={`${th} print:hidden w-28 border-r-0 text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const m = cat.material(r.material_id);
                const v = variantOf(r);
                const st = v ? stats[v.id] : null;
                const qty = r.qty === '' ? 0 : Number(r.qty) || 0;
                const required = st ? round3(qty - st.booked_item - st.consumed) : (r.qty !== '' ? qty : null);
                const filled = cat.hasValues(r.values) || r.qty !== '';
                const dupStock = v && counted.has(v.id);
                if (v) counted.add(v.id);
                return (
                  <tr key={r.key} className={`${!filled ? 'print:hidden' : ''} ${r.extra ? 'bg-amber-50/40' : ''}`}>
                    <td className={`${td} border-l-0 py-3 text-center tabular-nums text-gray-500`}>{idx + 1}</td>
                    <td className={td}>
                      <SpecCell id={`boq-${idx}-spec`} materialId={r.material_id} values={r.values} onChange={(vals) => setRow(r.key, { values: vals })} readOnly={readOnly || r.extra} showMaterial orderItemId={itemId} error={errors[`${r.key}.values`]} />
                      {r.extra && <p className="mt-1 px-1 text-xs text-amber-700">Not on the BOQ (booked or issued to this item)</p>}
                      {errors[`${r.key}.values`] && <p className="mt-1 text-xs text-red-600">{errors[`${r.key}.values`]}</p>}
                      {errors[`${r.key}.material_id`] && <p className="mt-1 text-xs text-red-600">{errors[`${r.key}.material_id`]}</p>}
                    </td>
                    <td className={td}>
                      {readOnly || r.extra ? <span className="block px-1 py-1.5 text-right tabular-nums">{r.extra ? '—' : fmtQty(r.qty)}</span> : (
                        <input id={`boq-${idx}-qty`} aria-label={`Qty required, ${m?.name}`} type="number" min="0" step="any" inputMode="decimal" value={r.qty}
                          onChange={(e) => setRow(r.key, { qty: e.target.value })} className={`${inputCls(errors[`${r.key}.qty_required`])} px-2 text-right tabular-nums`} />
                      )}
                      {errors[`${r.key}.qty_required`] && <p className="mt-1 text-xs text-red-600">{errors[`${r.key}.qty_required`]}</p>}
                    </td>
                    <td className={`${td} py-3 text-gray-700`}>{m?.unit}</td>
                    <td className={`${num} print:hidden py-3`}>{st ? fmtQty(st.in_stock) : v === null && cat.hasValues(r.values) ? <span className="text-xs text-amber-700">New</span> : <Dash />}</td>
                    <td className={`${num} print:hidden py-3`}>{st ? fmtQty(st.booked_all) : <Dash />}</td>
                    <td className={`${num} print:hidden py-3 ${st && st.available < 0 ? 'text-red-600' : ''}`}>{st ? fmtQty(st.available) : <Dash />}</td>
                    <td className={`${num} print:hidden py-3`}>{st ? fmtQty(st.booked_item) : <Dash />}</td>
                    <td className={`${num} print:hidden py-3 ${required > 0 ? 'font-semibold text-amber-700' : required !== null ? 'text-green-700' : ''}`}>{required !== null && filled ? fmtQty(Math.max(0, required)) : <Dash />}</td>
                    <td className={`${num} print:hidden py-3`}>{st ? fmtQty(st.consumed) : <Dash />}</td>
                    <td className={`${td} print:hidden border-r-0 px-1 py-2 text-center`}>
                      <div className="inline-flex flex-wrap items-center justify-center gap-1">
                        {canEdit && !data.closed && v && !dupStock && st && (
                          <>
                            <button onClick={() => setBooking({ mode: 'book', row: r, variant: v, st, required })} disabled={st.available <= 0} title={st.available <= 0 ? 'Nothing available to book' : 'Book stock to this item'}
                              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:bg-gray-300"><Lock size={12} /> Book</button>
                            {st.booked_item > 0 && <button onClick={() => setBooking({ mode: 'release', row: r, variant: v, st, required })} title="Release booked stock" className="rounded-md p-1 text-gray-500 hover:bg-gray-100"><Unlock size={14} /></button>}
                          </>
                        )}
                        {!readOnly && !r.extra && <>
                          <button onClick={() => addRow(idx)} title={`Add another ${m?.name} specification`} aria-label={`Add another ${m?.name}`} className="rounded-md p-1 text-brand-600 hover:bg-brand-50"><Plus size={15} /></button>
                          {filled && <button onClick={() => removeRow(idx)} title="Clear / remove row" aria-label={`Clear row ${idx + 1}`} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="print:hidden border-t border-blue-200 px-5 py-2.5 text-xs text-gray-500">
          Available to Book = In Stock − Booked (All Orders) · Required = Qty Req. − Booked (This Item) − Consumed. Rows left empty are not saved.
        </div>
      </section>

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          <button onClick={() => navigate(`/orders/${data.order_id}`)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Back</button>
          <span className="flex-1" />
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save BOQ'}</button>
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
  const go = async () => {
    setBusy(true);
    try {
      const r = mode === 'book' ? await boqApi.book(itemId, variant.id, qty) : await boqApi.release(itemId, variant.id, qty);
      toast(r.message);
      onDone(r.data);
    } catch (e) { setError(e.fields?.quantity || e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title={mode === 'book' ? 'Book stock' : 'Release booked stock'} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
        <button onClick={go} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : mode === 'book' ? 'Book' : 'Release'}</button>
      </>}>
      <p className="font-medium text-gray-900">{m?.name} · {variant.spec_text}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 text-sm">
        <dt className="text-gray-500">In stock</dt><dd className="text-right tabular-nums">{fmtQty(st.in_stock)} {m?.unit}</dd>
        <dt className="text-gray-500">Available to book</dt><dd className="text-right font-medium tabular-nums">{fmtQty(st.available)}</dd>
        <dt className="text-gray-500">Booked for this item</dt><dd className="text-right tabular-nums">{fmtQty(st.booked_item)}</dd>
        {mode === 'book' && <><dt className="text-gray-500">Still required</dt><dd className="text-right tabular-nums">{fmtQty(Math.max(0, required || 0))}</dd></>}
      </dl>
      <label htmlFor="book-qty" className="mb-1 mt-4 block text-sm font-medium text-gray-700">{mode === 'book' ? 'Quantity to book' : 'Quantity to release'}</label>
      <input id="book-qty" autoFocus type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} className={`${inputCls(error)} text-right tabular-nums`} />
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
