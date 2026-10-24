import Pagination, { usePagination } from '../../components/Pagination';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, ClipboardList, AlertTriangle } from 'lucide-react';
import { ordersApi } from '../../api/client';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { fmtDate, today } from '../../lib/util';
import { ItemDetailLines } from '../../lib/items';

// Order items whose BOQ is not made yet (open orders, not dispatched), earliest delivery first.
export default function PendingBoq() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(() => {
    setLoadError('');
    ordersApi.pendingBoq(q).then((r) => setRows(r.data)).catch((e) => setLoadError(e.message));
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const pagination = usePagination((rows || []), q);
  const th = `${thCls} whitespace-nowrap !px-3 !py-2.5`;
  const td = `${tdCls} !px-3 !py-2`;
  const DASH = <span className="text-gray-300">—</span>;
  const cols = 10;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <Search size={16} className="text-gray-400" />
          <input id="search-pending-boq" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order no., customer, project, area, item…" className="w-full bg-transparent text-sm focus:outline-none" />
        </label>
        {rows && <span className="text-sm text-gray-500">{rows.length} {rows.length === 1 ? 'item' : 'items'} awaiting Final BOQ</span>}
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Order No.</th>
                <th className={th}>Item</th>
                <th className={th}>Order Date</th>
                <th className={th}>Customer</th>
                <th className={th}>Project</th>
                <th className={th}>Area</th>
                <th className={th}>Order Item</th>
                <th className={th}>Remarks</th>
                <th className={th}>Delivery Date</th>
                <th className={`${th} text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {!rows && !loadError && [1, 2, 3].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>{q ? 'No items match.' : 'Every order item has a Final BOQ.'}</td></tr>}
              {pagination.rows.map((it) => {
                const late = it.delivery_date && it.delivery_date < today();
                return (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className={`${td} whitespace-nowrap font-mono text-xs font-medium`}><button onClick={() => navigate(`/orders/${it.order_id}`)} className="text-brand-600 hover:underline">{it.order_no}</button></td>
                    <td className={`${td} tabular-nums text-gray-600`}>#{it.line_no}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(it.order_date)}</td>
                    <td className={`${td} min-w-[9rem] font-medium text-gray-900`}>{it.customer_name}</td>
                    <td className={`${td} min-w-[8rem]`}>{it.project_name || DASH}</td>
                    <td className={`${td} min-w-[7rem]`}>{it.area || DASH}</td>
                    <td className={`${td} min-w-[14rem]`}><ItemDetailLines details={it.details} empty={DASH} /></td>
                    <td className={`${td} min-w-[10rem] text-gray-700`}>{it.remarks || DASH}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{it.delivery_date ? <span className={late ? 'inline-flex items-center gap-1 font-medium text-red-600' : ''}>{late && <AlertTriangle size={12} />}{fmtDate(it.delivery_date)}</span> : DASH}</td>
                    <td className={`${td} text-center`}>
                      <button onClick={() => navigate(`/boq/${it.id}`)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"><ClipboardList size={13} /> {it.boq_status === 'Draft' ? 'Continue Draft' : 'Make BOQ'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </div>
    </div>
  );
}
