import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, RefreshCw, Pencil, ClipboardList, Truck, AlertTriangle } from 'lucide-react';
import { api, ordersApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import SearchSelect from '../../components/SearchSelect';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { fmtDate, today, ItemStage, ORDER_STATUSES } from '../../lib/util';
import DispatchDialog from './DispatchDialog';
import { PhotoThumb } from '../../components/Photo';
import { ItemText } from '../../lib/items';
import { FileDown } from 'lucide-react';
import { useCatalog } from '../../lib/catalog';
import { downloadSavedBoqPdf } from '../boq/BoqPage';

const PER_PAGE = 20;

// One row represents one order item; parent/order details repeat for easy searching and export.
export default function OrderList() {
  const { canEdit, canCreateSales, canCreateStock } = useAuth();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const [pdfError, setPdfError] = useState('');
  const downloadPdf = async (id) => { setPdfError(''); try { await downloadSavedBoqPdf(id, catalog); } catch (e) { setPdfError(e.message); } };
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [dispatching, setDispatching] = useState(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    api.lookup('customers').then(r => setCustomers(r.data || [])).catch(() => {});
    ordersApi.users().then(r => setUsers(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { setPage(1); }, [q, status, customerId]);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      // Fetch all matching orders in batches so that item-level pagination is accurate,
      // rather than paginating order headers before expanding their items.
      const first = await ordersApi.list({ status, customer_id: customerId, page: 1, per_page: 100 });
      const batchCount = Math.ceil((first.total || 0) / 100);
      const batches = batchCount > 1 ? await Promise.all(Array.from({ length: batchCount - 1 }, (_, n) =>
        ordersApi.list({ status, customer_id: customerId, page: n + 2, per_page: 100 })
      )) : [];
      const headers = [first, ...batches].flatMap(r => r.data || []);
      const details = await Promise.all(headers.map(o => ordersApi.get(o.id).then(r => r.data)));
      const expanded = details.flatMap(o => (o.items || []).map(it => ({ ...it, order: o })));
      const term = q.trim().toLocaleLowerCase();
      const filtered = term ? expanded.filter(({ order: o, ...it }) =>
        [o.order_no, o.customer_name, o.project_name, o.order_by_name, it.area, it.item_title,
          it.remarks, ...Object.values(it.values || {})].some(v => String(v ?? '').toLocaleLowerCase().includes(term))
      ) : expanded;
      setRows(filtered);
      setTotal(filtered.length);
    } catch (e) { setLoadError(e.message); }
    finally { setLoading(false); }
  }, [q, status, customerId, revision]);
  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const visibleRows = rows.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const columns = 13;
  const orderByName = (o) => o.order_by_name || users.find(u => String(u.id) === String(o.order_by_id))?.name || '—';

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {pdfError && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">BOQ PDF: {pdfError}</div>}
      <div className="flex flex-wrap gap-2">
        <SearchSelect id="filter-orders-customer" className="w-full sm:w-64" options={[{ value: '', label: 'All customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={customerId} onChange={setCustomerId} placeholder="All customers" clearable />
        <SearchSelect id="filter-orders-status" className="w-full sm:w-52" options={[{ value: '', label: 'All statuses' }, { value: 'open', label: 'Not fully dispatched' }, ...ORDER_STATUSES.map(s => ({ value: s, label: s }))]} value={status} onChange={setStatus} placeholder="All statuses" clearable />
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500">
          <Search size={16} className="text-gray-400" />
          <input id="search-orders" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order no., customer, project, area, item..." className="w-full bg-transparent text-sm focus:outline-none" />
        </label>
        {canCreateSales && <button onClick={() => navigate('/orders/new')} aria-label="Add Order" className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"><Plus size={16} /> Add</button>}
      </div>
      <div className="text-right text-xs text-gray-500">{loading ? 'Loading items…' : `${total} order item${total === 1 ? '' : 's'}`}</div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                {['Order No.', 'Item', 'Order Date', 'Customer', 'Project', 'Area', 'Order Item', 'Reference Image', 'Remarks', 'Order By', 'Delivery Date', 'Stage', 'Action'].map(label =>
                  <th key={label} className={thCls}>{label}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={columns} className={tdCls}>Loading order items…</td></tr>}
              {!loading && loadError && <tr><td colSpan={columns} className={`${tdCls} py-8 text-center text-red-600`}>{loadError} <button onClick={() => setRevision(n => n + 1)} className="ml-2 inline-flex items-center gap-1 text-brand-600"><RefreshCw size={14}/> Retry</button></td></tr>}
              {!loading && !loadError && visibleRows.length === 0 && <tr><td colSpan={columns} className={`${tdCls} py-10 text-center text-gray-500`}>No order items found.</td></tr>}
              {!loading && !loadError && visibleRows.map(it => {
                const o = it.order;
                const late = o.delivery_date && o.delivery_date < today() && !['Dispatched', 'Cancelled'].includes(o.status);
                return <tr key={it.id} className="hover:bg-blue-50/40">
                  <td className={`${tdCls} whitespace-nowrap`}><button onClick={() => navigate(`/orders/${o.id}`)} className="font-mono text-xs font-medium text-brand-600 hover:underline">{o.order_no}</button></td>
                  <td className={tdCls}>#{it.line_no}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(o.order_date)}</td>
                  <td className={tdCls}>{o.customer_name || '—'}</td>
                  <td className={tdCls}>{o.project_name || '—'}</td>
                  <td className={tdCls}>{it.area || '—'}</td>
                  <td className={`${tdCls} min-w-[215px]`}><ItemText item={it}/></td>
                  <td className={tdCls}>{it.reference_image ? <PhotoThumb path={it.reference_image} title={`Reference Image — ${o.order_no} item ${it.line_no}`} /> : <span className="text-gray-300">—</span>}</td>
                  <td className={`${tdCls} min-w-[120px] whitespace-pre-wrap`}>{it.remarks || '—'}</td>
                  <td className={tdCls}>{orderByName(o)}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{late && <AlertTriangle size={13} className="mr-1 inline text-red-600"/>}{fmtDate(o.delivery_date)}</td>
                  <td className={tdCls}><ItemStage stage={it.stage}/></td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => navigate(`/orders/${o.id}`)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-brand-600"><Pencil size={12}/>{canEdit ? 'Edit' : 'Open'}</button>
                      {['Draft', 'Final'].includes(it.boq_status) && <button type="button" title="Download BOQ PDF" aria-label={`Download BOQ PDF for item ${it.line_no}`} onClick={() => downloadPdf(it.id)} className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-blue-50"><FileDown size={14}/> PDF</button>}
                      <button onClick={() => navigate(`/boq/${it.id}`)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><ClipboardList size={12}/>BOQ · {it.boq_status}</button>
                      {canCreateStock && (canEdit || (!it.dispatch && it.production_status === 'Complete')) && o.status !== 'Cancelled' && <button onClick={() => setDispatching(it)} className="inline-flex items-center gap-1 rounded bg-brand-600 px-2 py-1 text-xs text-white"><Truck size={12}/>{it.dispatch ? 'Dispatched' : 'Dispatch'}</button>}
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {total > PER_PAGE && <div className="flex items-center justify-between border-t border-blue-200 px-4 py-2.5 text-sm text-gray-600">
          <span>{(currentPage - 1) * PER_PAGE + 1}–{Math.min(currentPage * PER_PAGE, total)} of {total} items</span>
          <div className="flex items-center gap-2">
            <button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)} className="disabled:opacity-30"><ChevronLeft size={16}/></button>
            <span>Page {currentPage} of {pages}</span>
            <button aria-label="Next page" disabled={currentPage >= pages} onClick={() => setPage(p => p + 1)} className="disabled:opacity-30"><ChevronRight size={16}/></button>
          </div>
        </div>}
      </div>
      {dispatching && <DispatchDialog item={{ ...dispatching, customer_name: dispatching.order.customer_name }}
        label={`${dispatching.order.order_no} · #${dispatching.line_no} ${dispatching.item_title || ''}`}
        onClose={() => setDispatching(null)}
        onDone={() => { setDispatching(null); setRevision(n => n + 1); }}/>}
    </div>
  );
}
