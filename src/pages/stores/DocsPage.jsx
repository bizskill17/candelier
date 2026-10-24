import MasterForm from '../../components/MasterForm';
import { masters } from '../../config/masters';
import { ItemDetailLines } from '../../lib/items';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { api, docsApi, ordersApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import SearchSelect from '../../components/SearchSelect';
import DateInput from '../../components/DateInput';
import ConfirmDialog from '../../components/ConfirmDialog';
import StockLines, { blankStockLine, toStockLines } from '../../components/StockLines';
import { tableWrap, theadCls, thCls, tdCls, inputCls } from '../../components/table';
import { today, fmtDate, fmtQty, round3, Badge } from '../../lib/util';
import { docConfig } from './docConfig';

// /material-in, /material-issue, /damage           list
// .../new  (/material-issue/new/item/12 for an order item)   new
// .../{id}                                         view / edit
export default function DocsPage({ type }) {
  const { pathname } = useLocation();
  const parts = pathname.replace(new RegExp(`^/${type}/?`), '').split('/').filter(Boolean);
  if (parts[0] === 'new') return <DocForm key={`new-${parts.join('-')}`} type={type} presetItem={parts[1] === 'item' ? Number(parts[2]) : null} />;
  if (/^\d+$/.test(parts[0] || '')) return <DocForm key={parts[0]} type={type} id={Number(parts[0])} />;
  return <DocList type={type} />;
}

const PER_PAGE = 20;

function DocList({ type }) {
  const cfg = docConfig[type];
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplier, setSupplier] = useState('');
  const [rtype, setRtype] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [area, setArea] = useState('');
  const [issueFilters, setIssueFilters] = useState({ customers: [], areas: [] });
  useEffect(() => {
    if (type === 'material-issue') docsApi.issueFilters().then((r) => setIssueFilters(r.data)).catch((e) => setLoadError(e.message));
  }, [type]);
  const areaOptions = [...new Set(issueFilters.areas.filter((a) => !customerId || String(a.customer_id) === String(customerId)).map((a) => a.name))];
  const [suppliers, setSuppliers] = useState([]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState({});

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { if (type === 'material-in') api.lookup('suppliers').then((r) => setSuppliers(r.data)).catch(() => {}); }, [type]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const r = await docsApi.list(type, { q, from, to, party_id: supplier, receipt_type: rtype, customer_id: customerId, area, page, per_page: PER_PAGE });
      setRows(r.data); setTotal(r.total);
    } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }, [type, q, from, to, supplier, rtype, customerId, area, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, from, to, supplier, rtype, customerId, area]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const cols = type === 'material-in' ? 7 : type === 'material-issue' ? 10 : 6;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {type === 'material-in' && <>
          <SearchSelect id="filter-supplier" className="w-full sm:w-56" options={[{ value: '', label: 'All suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} value={supplier} onChange={setSupplier} placeholder="All suppliers" clearable />
          <SearchSelect id="filter-type" className="w-full sm:w-40" options={[{ value: '', label: 'Purchase + Sample' }, { value: 'Purchase', label: 'Purchase' }, { value: 'Sample', label: 'Sample' }]} value={rtype} onChange={setRtype} placeholder="Purchase + Sample" clearable />
        </>}
        {type === 'material-issue' && <>
          <SearchSelect id="filter-issue-customer" aria-label="Customer Name" className="w-full sm:w-56" options={[{ value: '', label: 'All customers' }, ...issueFilters.customers.map((c) => ({ value: c.id, label: c.name }))]} value={customerId} onChange={(v) => { setCustomerId(v); setArea(''); }} placeholder="Customer Name" clearable />
          <SearchSelect id="filter-issue-area" aria-label="Area" className="w-full sm:w-44" options={[{ value: '', label: 'All areas' }, ...areaOptions.map((name) => ({ value: name, label: name }))]} value={area} onChange={setArea} placeholder="Area" clearable />
        </>}
        <DateInput compact aria-label="From date" value={from} onChange={setFrom} className="w-40" />
        <DateInput compact aria-label="To date" min={from} value={to} onChange={setTo} className="w-40" />
        <div className="flex min-w-[240px] flex-1 gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <Search size={16} className="text-gray-400" />
            <input id={`search-${type}`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={cfg.search} className="w-full bg-transparent text-sm focus:outline-none" />
          </label>
          {canEdit && <button onClick={() => navigate(`/${type}/new`)} aria-label={`Add ${cfg.singular}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Plus size={16} /> Add</button>}
        </div>
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className={`w-full ${type === 'material-issue' ? 'min-w-[1300px]' : 'min-w-[820px]'} border-collapse text-sm`}>
            <thead className={theadCls}>
              <tr>
                <th className={`${thCls} w-32`}>{cfg.noLabel}</th>
                <th className={`${thCls} w-28`}>Date</th>
                {type === 'material-in' && <><th className={`${thCls} w-28`}>Type</th><th className={thCls}>Supplier</th><th className={`${thCls} w-40`}>Challan / Invoice</th></>}
                {type === 'material-issue' && <><th className={`${thCls} w-32`}>Order No.</th><th className={`${thCls} min-w-36`}>Customer Name</th><th className={`${thCls} min-w-36`}>Project Name</th><th className={`${thCls} min-w-28`}>Area</th><th className={thCls}>Order Item</th><th className={`${thCls} w-40`}>Issued To</th></>}
                {type === 'damage' && <><th className={thCls}>Reported By</th><th className={thCls}>Notes</th></>}
                <th className={`${thCls} w-24 text-right`}>Lines</th>
                <th className={`${thCls} w-24 text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [1, 2, 3].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {!loading && loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {!loading && !loadError && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>{q || from || to || supplier || rtype || customerId || area ? 'Nothing matches.' : 'No entries yet.'}</td></tr>}
              {rows.map((d) => {
                const isOpen = !!open[d.id];
                return (
                  <Fragment key={d.id}>
                    <tr onClick={() => setOpen((s) => ({ ...s, [d.id]: !s[d.id] }))} aria-expanded={isOpen} className={`cursor-pointer ${isOpen ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                      <td className={`${tdCls} whitespace-nowrap font-mono text-xs font-medium text-gray-900`}><span className="inline-flex items-center gap-1.5">{isOpen ? <ChevronDown size={14} className="text-brand-600" /> : <ChevronRight size={14} className="text-gray-400" />}{d[cfg.no]}</span></td>
                      <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{fmtDate(d[cfg.date])}</td>
                      {type === 'material-in' && <><td className={tdCls}><Badge color={d.receipt_type === 'Sample' ? 'violet' : 'blue'}>{d.receipt_type}</Badge></td><td className={`${tdCls} font-medium text-gray-900`}>{d.supplier_name}</td><td className={tdCls}>{d.challan_no || <span className="text-gray-300">—</span>}</td></>}
                      {type === 'material-issue' && <><td className={`${tdCls} whitespace-nowrap font-mono text-xs`}>{d.order_no || '—'}</td><td className={`${tdCls} break-words`}>{d.customer_name || <span className="text-gray-300">—</span>}</td><td className={`${tdCls} break-words`}>{d.project_name || <span className="text-gray-300">—</span>}</td><td className={`${tdCls} break-words`}>{d.area || <span className="text-gray-300">—</span>}</td><td className={tdCls}><ItemDetailLines details={d.details} empty="—" /></td><td className={tdCls}>{d.issued_to || <span className="text-gray-300">—</span>}</td></>}
                      {type === 'damage' && <><td className={tdCls}>{d.reported_by || <span className="text-gray-300">—</span>}</td><td className={`${tdCls} text-gray-600`}>{d.notes || <span className="text-gray-300">—</span>}</td></>}
                      <td className={`${tdCls} text-right tabular-nums`}>{d.lines.length}</td>
                      <td className={`${tdCls} text-center`}><button onClick={(e) => { e.stopPropagation(); navigate(`/${type}/${d.id}`); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"><Pencil size={13} /> {canEdit ? 'Edit' : 'Open'}</button></td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={cols} className="border border-blue-200 bg-blue-50/40 px-4 py-3">
                        <table className="w-full min-w-[560px] border-collapse bg-white text-sm">
                          <tbody>
                            {d.lines.map((l, i) => (
                              <tr key={l.id}>
                                <td className="w-8 border border-blue-200 px-3 py-1.5 text-gray-500">{i + 1}</td>
                                <td className="border border-blue-200 px-3 py-1.5"><b className="text-gray-900">{l.material_name}</b>{l.spec_text && <span className="text-gray-700"> · {l.spec_text}</span>}</td>
                                <td className="w-32 border border-blue-200 px-3 py-1.5 text-right tabular-nums">{fmtQty(l.quantity)} <span className="text-gray-500">{l.unit}</span></td>
                                {type === 'damage' && <td className="w-28 border border-blue-200 px-3 py-1.5">{l.reason}</td>}
                                <td className="border border-blue-200 px-3 py-1.5 text-gray-500">{l.remarks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > PER_PAGE && (
          <div className="flex items-center justify-between border-t border-blue-200 px-4 py-2.5 text-sm text-gray-600">
            <span className="tabular-nums">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}</span>
            <div className="flex items-center gap-1">
              <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md p-1.5 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="px-2 tabular-nums">Page {page} of {pages}</span>
              <button aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md p-1.5 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const emptyHeader = (type, presetItem) => ({
  receipt_type: 'Purchase', supplier_id: '', challan_no: '', order_item_id: presetItem || '', issued_to: '', reported_by: '', notes: '',
  [docConfig[type].date]: today(),
});

function DocForm({ type, id, presetItem }) {
  const cfg = docConfig[type];
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const cat = useCatalog();
  const { canEdit } = useAuth();
  const readOnly = !canEdit;
  const [doc, setDoc] = useState(null);
  const [header, setHeader] = useState(() => emptyHeader(type, presetItem));
  const [lines, setLines] = useState(() => [blankStockLine(type === 'damage' ? { reason: 'Broken' } : {})]);
  const [suppliers, setSuppliers] = useState(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [users, setUsers] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (type === 'material-issue' || type === 'damage') ordersApi.users().then((r) => setUsers(r.data)).catch((e) => { setUsers([]); toast(e.message, 'error'); });
    if (type === 'material-in') api.lookup('suppliers').then((r) => setSuppliers(r.data)).catch(() => setSuppliers([]));
    if (type === 'material-issue') ordersApi.openItems(presetItem || undefined, true).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPrefill = async (itemId, fill) => {
    if (!itemId) { setPrefill(null); return; }
    try {
      setPrefill(null);
      const r = await docsApi.issuePrefill(itemId, id);
      setPrefill(r.data);
      if (fill) {
        const rows = r.data.lines.map((l) => ({ material_id: l.material_id, values: l.values, quantity: round3(Math.max(0, Math.min(l.pending, l.in_stock))) || '' })).filter((l) => l.quantity);
        setLines(toStockLines(rows));
        if (!rows.length) toast(r.data.lines.length ? 'Everything on the BOQ has been issued already.' : 'No materials remain to issue.', 'error');
      }
    } catch (e) { setPrefill({ blocked: true, lines: [] }); setFormError(e.message); toast(e.message, 'error'); }
  };

  const load = () => {
    setLoadError('');
    docsApi.get(type, id).then((r) => {
      const d = r.data;
      setDoc(d);
      const h = emptyHeader(type);
      Object.keys(h).forEach((k) => { if (d[k] !== undefined && d[k] !== null) h[k] = d[k]; });
      setHeader(h);
      setLines(toStockLines(d.lines.map((l) => ({ material_id: l.material_id, values: l.values, quantity: l.quantity, remarks: l.remarks || '', reason: l.reason }))));
      if (type === 'material-issue') {
        ordersApi.openItems(d.order_item_id, true).then((x) => setItems(x.data)).catch(() => {});
        loadPrefill(d.order_item_id, false);
      }
    }).catch((e) => setLoadError(e.message));
  };
  useEffect(() => { if (isEdit) load(); else if (presetItem && type === 'material-issue') loadPrefill(presetItem, true); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setH = (k, v) => { setHeader((h) => ({ ...h, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };
  const back = () => navigate(`/${type}`);

  const prefBy = useMemo(() => {
    const m = {};
    (prefill?.lines || []).forEach((l) => { m[l.variant_id] = l; });
    return m;
  }, [prefill]);
  const infoColumns = [];
  if (type === 'material-issue' && prefill) {
    const p = (l) => { const v = cat.findVariant(l.material_id, l.values); return v ? prefBy[v.id] : null; };
    infoColumns.push({ label: 'Qty Req.', render: (l) => (p(l) ? fmtQty(p(l).qty_required) : '—') });
    infoColumns.push({ label: 'Consumed', render: (l) => (p(l) ? fmtQty(p(l).consumed) : '—') });
    infoColumns.push({ label: 'Booked', render: (l) => (p(l) ? fmtQty(p(l).booked_item) : '—') });
  }

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setFormError('');
    if (type === 'material-issue' && (!prefill || prefill.blocked)) { setFormError('Finalise the BOQ before issuing materials.'); setSaving(false); return; }
    const body = { ...header, lines: lines.map(({ material_id, values, quantity, remarks, reason }) => ({ material_id, values, quantity, remarks, reason })) };
    try {
      const r = isEdit ? await docsApi.update(type, id, body) : await docsApi.create(type, body);
      toast(r.message);
      cat.refresh();
      back();
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } finally { setSaving(false); }
  };
  const doDelete = async () => {
    try { const r = await docsApi.remove(type, id); toast(r.message); back(); } catch (err) { toast(err.message, 'error'); setConfirmDelete(false); }
  };

  if (isEdit && loadError) {
    return (
      <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <div className="mt-3 flex justify-center gap-4 text-sm font-medium">
          <button onClick={load} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button>
          <button onClick={back} className="text-gray-600 hover:underline">Back to {cfg.title}</button>
        </div>
      </div>
    );
  }
  if (isEdit && !doc) return <div className="mx-auto max-w-5xl space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>;

  return (
    <>
    <form onSubmit={save} noValidate className="mx-auto max-w-6xl space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={back} className="inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft size={16} /> {cfg.title}</button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900">{isEdit ? `${cfg.singular} ${doc[cfg.no]}` : `New ${cfg.singular}`}</h2>
      </div>
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {type === 'material-in' && (
            <>
              <Field label="Type" required>
                <div role="radiogroup" aria-label="Type" className="inline-flex rounded-lg border border-gray-300 p-0.5 text-sm">
                  {['Purchase', 'Sample'].map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={header.receipt_type === t} disabled={readOnly} onClick={() => setH('receipt_type', t)}
                      className={`rounded-md px-4 py-1.5 font-medium ${header.receipt_type === t ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
              </Field>
              <Field label="Supplier" required htmlFor="d-supplier" error={errors.supplier_id}>
                <div className="flex items-stretch gap-2">
                <SearchSelect className="min-w-0 flex-1" id="d-supplier" options={(suppliers || []).filter((s) => s.is_active || String(s.id) === String(header.supplier_id)).map((s) => ({ value: s.id, label: s.name }))} value={header.supplier_id} onChange={(v) => setH('supplier_id', v)} error={errors.supplier_id} disabled={readOnly || !suppliers} placeholder={suppliers ? 'Select supplier' : 'Loading…'} />
                  {!readOnly && <button type="button" onClick={() => setSupplierOpen(true)} title="Add a new supplier" aria-label="Add a new supplier" className="shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button>}
                </div>
              </Field>
              <Field label="Date" required htmlFor="d-date" error={errors[cfg.date]}>
                <DateInput id="d-date" max={today()} value={header[cfg.date]} onChange={(v) => setH(cfg.date, v)} error={errors[cfg.date]} disabled={readOnly} />
              </Field>
              <Field label="Challan / Invoice No." required={header.receipt_type === 'Purchase'} htmlFor="d-challan" error={errors.challan_no}>
                <input id="d-challan" value={header.challan_no} onChange={(e) => setH('challan_no', e.target.value)} disabled={readOnly} className={inputCls(errors.challan_no)} placeholder={header.receipt_type === 'Sample' ? 'Optional for samples' : "Supplier's document no."} />
              </Field>
            </>
          )}
          {type === 'material-issue' && (
            <>
              <Field label="Order Item" required htmlFor="d-item" error={errors.order_item_id} className="sm:col-span-2">
                <SearchSelect id="d-item" panelWidth={680} searchPlaceholder="Search order, customer, project or item…" options={(items || []).map((i) => ({ value: i.id, label: `${i.order_no} · Item #${i.line_no}`, subtitle: [i.customer_name, i.project_name, i.area].filter(Boolean).join(' · '), description: (i.details || []).map((detail) => `${detail.name}: ${detail.value}`).join(' | '), badge: i.boq_status === 'Final' ? 'Final BOQ' : undefined }))}
                  value={header.order_item_id} onChange={(v) => { setH('order_item_id', v); loadPrefill(v, !isEdit); }} error={errors.order_item_id} disabled={readOnly || !items || isEdit} placeholder={items ? 'Select order item' : 'Loading…'} />
              </Field>
              <Field label="Date" required htmlFor="d-date" error={errors[cfg.date]}>
                <DateInput id="d-date" max={today()} value={header[cfg.date]} onChange={(v) => setH(cfg.date, v)} error={errors[cfg.date]} disabled={readOnly} />
              </Field>
              <Field label="Issued To" htmlFor="d-issued" error={errors.issued_to}>
                <SearchSelect id="d-issued"
                  options={[
                    ...(users || []).filter((u) => u.is_active || u.name === header.issued_to).map((u) => ({ value: u.name, label: u.name })),
                    ...(header.issued_to && users && !users.some((u) => u.name === header.issued_to) ? [{ value: header.issued_to, label: header.issued_to }] : []),
                  ]}
                  value={header.issued_to} onChange={(v) => setH('issued_to', v)}
                  disabled={readOnly || !users} error={errors.issued_to}
                  placeholder={users ? 'Select user' : 'Loading…'} />
              </Field>
            </>
          )}
          {type === 'damage' && (
            <>
              <Field label="Date" required htmlFor="d-date" error={errors[cfg.date]}>
                <DateInput id="d-date" max={today()} value={header[cfg.date]} onChange={(v) => setH(cfg.date, v)} error={errors[cfg.date]} disabled={readOnly} />
              </Field>
              <Field label="Reported By" htmlFor="d-reported" error={errors.reported_by}>
                <SearchSelect id="d-reported"
                  options={[
                    ...(users || []).filter((u) => u.is_active || u.name === header.reported_by).map((u) => ({ value: u.name, label: u.name })),
                    ...(header.reported_by && users && !users.some((u) => u.name === header.reported_by) ? [{ value: header.reported_by, label: header.reported_by }] : []),
                  ]}
                  value={header.reported_by} onChange={(v) => setH('reported_by', v)}
                  disabled={readOnly || !users} error={errors.reported_by}
                  placeholder={users ? 'Select user' : 'Loading…'} />
              </Field>
            </>
          )}
          <Field label="Notes" htmlFor="d-notes" error={errors.notes} className={type === 'damage' ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-4'}>
            <textarea id="d-notes" rows={1} value={header.notes} onChange={(e) => setH('notes', e.target.value)} disabled={readOnly} className={inputCls(errors.notes)} />
          </Field>
        </div>
        {prefill?.item && <p className="mt-3 text-sm text-gray-600">{prefill.item.customer_name} · <b className="text-gray-900">{prefill.item.item_title}</b></p>}
      </section>

      <StockLines lines={lines} onChange={(ls) => { setLines(ls); if (Object.keys(errors).some((k) => k.startsWith('lines'))) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('lines')))); }}
        errors={errors} readOnly={readOnly} infoColumns={infoColumns} showReason={type === 'damage'} orderItemId={type === 'material-issue' ? header.order_item_id || undefined : undefined}
        allowedMaterialIds={type === 'material-issue' ? (prefill?.lines || []).map((l) => l.material_id) : undefined} />

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          {isEdit && <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={15} /> Delete</button>}
          <div className="flex-1" />
          <button type="button" onClick={back} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
          <button type="submit" disabled={saving || (type === 'material-issue' && (!prefill || prefill.blocked))} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : isEdit ? 'Save Changes' : `Save ${cfg.singular}`}</button>
        </div>
      )}
      <ConfirmDialog open={confirmDelete} title={`Delete ${cfg.singular.toLowerCase()}?`} message={isEdit ? `${doc[cfg.no]} will be removed and its stock movements reversed.` : ''} onConfirm={doDelete} onCancel={() => setConfirmDelete(false)} />
    </form>
    {supplierOpen && !readOnly && <MasterForm entity="suppliers" def={masters.suppliers}
      onClose={() => setSupplierOpen(false)}
      onSaved={(supplier) => {
        setSuppliers((list) => [...(list || []).filter((s) => String(s.id) !== String(supplier.id)), supplier].sort((a, b) => a.name.localeCompare(b.name)));
        setH('supplier_id', supplier.id);
      }} />}
    </>
  );
}

function Field({ label, htmlFor, required, error, help, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
    </div>
  );
}
