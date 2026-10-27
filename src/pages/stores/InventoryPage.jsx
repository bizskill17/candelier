import Pagination, { usePagination } from '../../components/Pagination';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Printer, History } from 'lucide-react';
import { inventoryApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useCatalog } from '../../lib/catalog';
import SearchSelect from '../../components/SearchSelect';
import DateInput from '../../components/DateInput';
import Modal from '../../components/Modal';
import { tableWrap, theadCls, inputCls } from '../../components/table';
import { today, fmtDate, fmtQty } from '../../lib/util';

const th = 'border border-blue-400 px-2.5 py-2.5 text-left font-semibold';
const td = 'border border-blue-200 px-2.5 py-2 align-top';
const num = `${td} text-right tabular-nums`;

// Stock per material + specification, worked out from every movement.
export default function InventoryPage() {
  const cat = useCatalog();
  const { canEdit, canCreateStock } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const r = await inventoryApi.list({ material_id: materialId, only: 'instock', q }); setRows((r.data || []).filter(item => Number(item.in_stock) > 0)); setSummary(r.summary); } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }, [materialId, q]);
  useEffect(() => { load(); }, [load]);

  const materialCategory = (materialId) => cat.materials.find(m => String(m.id) === String(materialId))?.category_id;
  const categoryName = (materialId) => cat.categories.find(c => String(c.id) === String(materialCategory(materialId)))?.name || '—';
  const filteredRows = categoryId ? rows.filter(r => String(materialCategory(r.material_id)) === String(categoryId)) : rows;
  const pagination = usePagination(filteredRows, JSON.stringify([materialId, categoryId, q]));
  const groups = [];
  pagination.rows.forEach((r) => {
    const g = groups.find((x) => x.material_id === r.material_id);
    if (g) g.rows.push(r); else groups.push({ material_id: r.material_id, name: r.material_name, rows: [r] });
  });
  const cols = 12;

  return (
    <div className="mx-auto max-w-[90rem] space-y-4">
      <div className="print:hidden flex flex-wrap gap-2">
        <SearchSelect id="filter-category" className="w-full sm:w-52" options={[{ value: '', label: 'All categories' }, ...cat.categories.map(c => ({ value: c.id, label: c.name }))]} value={categoryId} onChange={v => { setCategoryId(v); setMaterialId(''); }} placeholder="All categories" clearable />
        <SearchSelect id="filter-material" className="w-full sm:w-52" options={[{ value: '', label: 'All materials' }, ...cat.materials.filter(m => !categoryId || String(m.category_id) === String(categoryId)).map((m) => ({ value: m.id, label: m.name }))]} value={materialId} onChange={setMaterialId} placeholder="All materials" clearable />
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <Search size={16} className="text-gray-400" />
          <input id="search-inventory" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials…" className="w-full bg-transparent text-sm focus:outline-none" />
        </label>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"><Printer size={15} /> Print / PDF</button>
      </div>
      <div className="print:hidden text-sm text-gray-600"><b className="text-gray-900">{filteredRows.length}</b> materials in stock</div>
      <div className="hidden print:block"><h1 className="text-xl font-semibold">Inventory</h1><p className="text-sm text-gray-600">As on {fmtDate(today())}</p></div>

      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 1040 }}>
            <thead className={theadCls}>
              <tr>
                <th className={`${th} w-40`}>Material Category</th>
                <th className={th}>Material</th>
                <th className={`${th} w-12`}>Unit</th>
                <th className={`${th} w-20 text-right`}>Opening</th>
                <th className={`${th} w-[5.25rem] text-right`}>Purchased</th>
                <th className={`${th} w-20 text-right`}>Samples</th>
                <th className={`${th} w-20 text-right`}>Issued</th>
                <th className={`${th} w-20 text-right`}>Damaged</th>
                <th className={`${th} w-20 text-right`}>In Stock</th>
                <th className={`${th} w-20 text-right`}>Blocked</th>
                <th className={`${th} w-24 text-right`}>Available to Block</th>
                <th className={`${th} print:hidden w-20 text-center`}>History</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [1, 2, 3].map((i) => <tr key={i}><td colSpan={cols} className={td}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {!loading && loadError && <tr><td colSpan={cols} className={`${td} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {!loading && !loadError && filteredRows.length === 0 && <tr><td colSpan={cols} className={`${td} py-14 text-center text-gray-500`}>{q || materialId || categoryId ? 'No in-stock materials match.' : 'No materials currently have positive stock.'}</td></tr>}
              {groups.map((g) => (
                <Fragment key={g.material_id}>

                  {g.rows.map((r) => (
                    <tr key={r.id} className={loading ? 'opacity-60' : ''}>
                      <td className={td}>{categoryName(r.material_id)}</td>
                      <td className={`${td} pl-5`}>{r.material_name}</td>
                      <td className={td}>{r.unit}</td>
                      <td className={num}>{fmtQty(r.opening)}</td>
                      <td className={num}>{fmtQty(r.purchased)}</td>
                      <td className={num}>{fmtQty(r.samples)}</td>
                      <td className={num}>{fmtQty(r.issued)}</td>
                      <td className={num}>{fmtQty(r.damaged)}</td>
                      <td className={`${num} font-semibold ${r.in_stock <= 0 ? 'text-gray-400' : 'text-gray-900'}`}>{fmtQty(r.in_stock)}</td>
                      <td className={num}>{r.booked ? fmtQty(r.booked) : '—'}</td>
                      <td className={`${num} font-semibold ${r.available < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtQty(r.available)}</td>
                      <td className={`${td} print:hidden text-center`}><button disabled={!canCreateStock} onClick={() => setDetail(r)} aria-label={`History of ${r.material_name} ${r.spec_text}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"><History size={13} /> Open</button></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </div>
      {detail && <VariantDetail variant={detail} canEdit={canEdit} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  );
}

const REF_LABEL = { opening: 'Opening', receipt: 'Material In', issue: 'Issue', damage: 'Damage', adjustment: 'Adjustment' };
const REF_PATH = { receipt: '/material-in/', issue: '/material-issue/', damage: '/damage/' };

function VariantDetail({ variant, canEdit, onClose, onChanged }) {
  const {canCreateStock}=useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('history');
  const [adj, setAdj] = useState({ adj_date: today(), quantity: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const load = () => inventoryApi.detail(variant.id).then((r) => setD(r.data)).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const adjust = async () => {
    setBusy(true);
    try { const r = await inventoryApi.adjust(variant.id, adj); toast(r.message); setD(r.data); setAdj({ adj_date: today(), quantity: '', notes: '' }); setErrors({}); onChanged(); setTab('history'); }
    catch (e) { setErrors(e.fields || {}); if (!e.fields) toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const tabs = [['history', 'History'], ['bookings', `Blocks${d ? ` (${d.bookings.length})` : ''}`], ...(canEdit ? [['adjust', 'Count Correction']] : [])];

  return (
    <Modal open wide="xl" title={variant.material_name} onClose={onClose} footer={<button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Close</button>}>
      {!d ? <div className="h-32 animate-pulse rounded bg-gray-100" /> : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            {[['In Stock', d.in_stock], ['Blocked', d.booked], ['Available to Block', d.available]].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">{l}</div><div className="text-lg font-semibold tabular-nums text-gray-900">{fmtQty(v)} <span className="text-sm font-normal text-gray-500">{d.unit}</span></div></div>
            ))}
          </div>
          <div role="tablist" className="mb-3 flex gap-1 border-b border-gray-200">
            {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{l}</button>)}
          </div>
          {tab === 'history' && (
            d.history.length === 0 ? <p className="py-6 text-center text-gray-500">No movements yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="border-b border-gray-200 py-2 pr-3">Date</th><th className="border-b border-gray-200 py-2 pr-3">Entry</th><th className="border-b border-gray-200 py-2 pr-3">From / To</th>
                    <th className="border-b border-gray-200 py-2 pr-3 text-right">In</th><th className="border-b border-gray-200 py-2 pr-3 text-right">Out</th><th className="border-b border-gray-200 py-2 text-right">Balance</th>
                  </tr></thead>
                  <tbody>
                    {d.history.map((m, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 pr-3 tabular-nums">{fmtDate(m.move_date)}</td>
                        <td className="py-2 pr-3">{REF_PATH[m.ref_type] ? <button onClick={() => canCreateStock && navigate(REF_PATH[m.ref_type] + m.ref_id)} className="font-mono text-xs text-brand-600 hover:underline">{m.ref_no}</button> : <span className="font-mono text-xs">{m.ref_no}</span>} <span className="text-xs text-gray-500">{REF_LABEL[m.ref_type]}</span></td>
                        <td className="py-2 pr-3 text-gray-600">{m.party}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-green-700">{m.quantity > 0 ? fmtQty(m.quantity) : ''}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-red-600">{m.quantity < 0 ? fmtQty(-m.quantity) : ''}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{fmtQty(m.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {tab === 'bookings' && (
            d.bookings.length === 0 ? <p className="py-6 text-center text-gray-500">Not blocked for any order item.</p> : (
              <table className="w-full border-collapse text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="border-b border-gray-200 py-2 pr-3">Order Item</th><th className="border-b border-gray-200 py-2 pr-3">Customer</th><th className="border-b border-gray-200 py-2 pr-3 text-right">Blocked</th><th className="border-b border-gray-200 py-2 text-right">Consumed</th></tr></thead>
                <tbody>
                  {d.bookings.map((b) => (
                    <tr key={b.order_item_id} className="border-b border-gray-100">
                      <td className="py-2 pr-3"><button onClick={() => canCreateStock && navigate(`/boq/${b.order_item_id}`)} className="text-brand-600 hover:underline">{b.label}</button></td>
                      <td className="py-2 pr-3 text-gray-600">{b.customer_name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(b.booked)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtQty(b.consumed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          {tab === 'adjust' && (
            <div className="space-y-3">
              <p className="text-gray-600">Use after a physical count. Enter + to add or − to remove (e.g. −3). Damage has its own screen.</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label htmlFor="adj-date" className="mb-1 block text-sm font-medium text-gray-700">Date</label><DateInput id="adj-date" max={today()} value={adj.adj_date} onChange={(v) => setAdj({ ...adj, adj_date: v })} error={errors.adj_date} />{errors.adj_date && <p className="mt-1 text-xs text-red-600">{errors.adj_date}</p>}</div>
                <div><label htmlFor="adj-qty" className="mb-1 block text-sm font-medium text-gray-700">Quantity (+/−)</label><input id="adj-qty" type="number" step="any" value={adj.quantity} onChange={(e) => setAdj({ ...adj, quantity: e.target.value })} className={`${inputCls(errors.quantity)} text-right tabular-nums`} />{errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity}</p>}</div>
                <div><label htmlFor="adj-notes" className="mb-1 block text-sm font-medium text-gray-700">Reason</label><input id="adj-notes" value={adj.notes} onChange={(e) => setAdj({ ...adj, notes: e.target.value })} className={inputCls(errors.notes)} placeholder="Physical count" />{errors.notes && <p className="mt-1 text-xs text-red-600">{errors.notes}</p>}</div>
              </div>
              <div className="flex justify-end"><button onClick={adjust} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save Correction'}</button></div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
