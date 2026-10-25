import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, AlertTriangle, Pencil, ClipboardList, Truck } from 'lucide-react';
import { api, ordersApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import SearchSelect from '../../components/SearchSelect';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { fmtDate, today, OrderStatus, ItemStage, ORDER_STATUSES } from '../../lib/util';
import DispatchDialog from './DispatchDialog';
import { ItemText, ItemPhotos } from '../../lib/items';

const PER_PAGE = 20;
const subTh = 'border border-blue-200 bg-blue-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-blue-900';
const subTd = 'border border-blue-200 px-3 py-2 align-top';

// Items of one order, shown under its row.
function OrderItems({ id, onChanged }) {
  const navigate = useNavigate();
  const { canEdit, canCreateSales, canCreateStock } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [dispatching, setDispatching] = useState(null);
  useEffect(() => { ordersApi.get(id).then((r) => setOrder(r.data)).catch((e) => setError(e.message)); }, [id]);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!order) return <div className="h-10 animate-pulse rounded bg-gray-100" />;
  const cancelled = order.status === 'Cancelled';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse bg-white text-sm">
        <thead>
          <tr>
            <th className={`${subTh} w-10`}>#</th>
            <th className={subTh}>Order Item</th>
            <th className={`${subTh} w-44`}>Photos / Drawing</th>
            <th className={`${subTh} w-32`}>Stage</th>
            <th className={`${subTh} w-48 text-center`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => {
            return (
            <tr key={it.id} >
              <td className={`${subTd} text-gray-500`}>{it.line_no}</td>
              <td className={subTd}><ItemText item={it} /></td>
              <td className={subTd}><ItemPhotos item={it} className="h-11 w-11" /></td>
              <td className={subTd}>
                <ItemStage stage={it.stage} />
                {it.dispatch && <div className="mt-1 text-xs text-gray-500">{it.dispatch.dispatch_no} · {fmtDate(it.dispatch.dispatch_date)}</div>}
              </td>
              <td className={`${subTd} text-center`}>
                <div className="inline-flex gap-1.5">
                  <button onClick={() => navigate(`/boq/${it.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"><ClipboardList size={13} /> BOQ · {it.boq_status}</button>
                  {canCreateStock && (canEdit || (!it.dispatch&&it.production_status==='Complete')) && !cancelled && (
                    <button onClick={() => setDispatching(it)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${it.dispatch ? 'text-brand-600 hover:bg-brand-50' : 'bg-brand-600 text-white hover:bg-brand-700'}`}><Truck size={13} /> {it.dispatch ? 'Dispatched' : 'Dispatch'}</button>
                  )}
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {dispatching && (
        <DispatchDialog item={{ ...dispatching, customer_name: order.customer_name }} label={`${order.order_no} · #${dispatching.line_no} ${dispatching.item_title}`} onClose={() => setDispatching(null)}
          onDone={(o) => { setDispatching(null); setOrder(o); onChanged(); }} />
      )}
    </div>
  );
}

export default function OrderList() {
  const { canEdit, canCreateSales, canCreateStock } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState({});

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { api.lookup('customers').then((r) => setCustomers(r.data)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await ordersApi.list({ q, status, customer_id: customerId, page, per_page: PER_PAGE });
      setRows(r.data);
      setTotal(r.total);
    } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }, [q, status, customerId, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, status, customerId]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const cols = 8;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchSelect id="filter-orders-customer" className="w-full sm:w-64" options={[{ value: '', label: 'All customers' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} value={customerId} onChange={setCustomerId} placeholder="All customers" clearable />
        <SearchSelect id="filter-orders-status" className="w-full sm:w-52" options={[{ value: '', label: 'All statuses' }, { value: 'open', label: 'Not fully dispatched' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: s }))]} value={status} onChange={setStatus} placeholder="All statuses" clearable />
        <div className="flex min-w-[240px] flex-1 gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <Search size={16} className="text-gray-400" />
            <input id="search-orders" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order no., customer, project, area…" className="w-full bg-transparent text-sm focus:outline-none" />
          </label>
          {canCreateSales && <button onClick={() => navigate('/orders/new')} aria-label="Add Order" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Plus size={16} /> Add</button>}
        </div>
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={`${thCls} w-32`}>Order No.</th>
                <th className={`${thCls} w-28`}>Date</th>
                <th className={thCls}>Customer / Project</th><th className={thCls}>Assigned Salesperson</th>
                <th className={`${thCls} w-20 text-right`}>Items</th>
                <th className={`${thCls} w-24 text-right`}>BOQ Final</th>
                <th className={`${thCls} w-28`}>Delivery Date</th>
                <th className={`${thCls} w-40`}>Status</th>
                <th className={`${thCls} w-24 text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {!loading && loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {!loading && !loadError && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>{q || status || customerId ? 'No orders match.' : 'No orders yet.'}</td></tr>}
              {rows.map((o) => {
                const isOpen = open[o.id] ?? false;
                const late = o.delivery_date && o.delivery_date < today() && !['Dispatched', 'Cancelled'].includes(o.status);
                return (
                  <Fragment key={o.id}>
                    <tr onClick={() => setOpen((s) => ({ ...s, [o.id]: !isOpen }))} aria-expanded={isOpen} className={`cursor-pointer ${isOpen ? 'bg-blue-50/60' : 'hover:bg-gray-50'} ${loading ? 'opacity-60' : ''}`}>
                      <td className={`${tdCls} whitespace-nowrap font-mono text-xs font-medium text-gray-900`}>
                        <span className="inline-flex items-center gap-1.5">{isOpen ? <ChevronDown size={14} className="text-brand-600" /> : <ChevronRight size={14} className="text-gray-400" />}{o.order_no}</span>
                      </td>
                      <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{fmtDate(o.order_date)}</td>
                      <td className={tdCls}><div className="font-medium text-gray-900">{o.customer_name}</div><div className="text-xs text-gray-500">{[o.project_name, o.customer_city].filter(Boolean).join(' · ')}</div></td><td className={tdCls}>{o.assigned_salesperson_name||<span className="text-amber-700">Unassigned</span>}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{o.item_count}</td>
                      <td className={`${tdCls} text-right tabular-nums ${o.boq_count < o.item_count ? 'text-amber-700' : 'text-green-700'}`}>{o.boq_count} / {o.item_count}</td>
                      <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{o.delivery_date ? <span className={late ? 'inline-flex items-center gap-1 font-medium text-red-600' : ''}>{late && <AlertTriangle size={13} />}{fmtDate(o.delivery_date)}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className={tdCls}><OrderStatus status={o.status} />{o.status === 'Partly Dispatched' && <div className="mt-1 text-xs text-gray-500">{o.dispatched_count} of {o.item_count} dispatched</div>}</td>
                      <td className={`${tdCls} text-center`}>
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"><Pencil size={13} /> {canEdit ? 'Edit' : 'Open'}</button>
                      </td>
                    </tr>
                    {isOpen && <tr><td colSpan={cols} className="border border-blue-200 bg-blue-50/40 px-4 py-3"><OrderItems id={o.id} onChanged={load} /></td></tr>}
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
