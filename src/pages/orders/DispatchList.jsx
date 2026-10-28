import Pagination, { usePagination } from '../../components/Pagination';
import { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { ordersApi } from '../../api/client';
import DateInput from '../../components/DateInput';
import DispatchDialog from './DispatchDialog';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { fmtDate } from '../../lib/util';
import { DrawingViewer } from '../../components/Drawing';

// Every dispatched order item.
export default function DispatchList() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const r = await ordersApi.dispatches({ q, from, to }); setRows(r.data); } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }, [q, from, to]);
  useEffect(() => { load(); }, [load]);
  const pagination = usePagination(rows, JSON.stringify([q, from, to]));
  const cols = canEdit ? 13 : 12;
  const removeDispatch = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      const r = await ordersApi.undoDispatch(deleting.order_item_id);
      toast(r.message); setDeleting(null); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap gap-2">
        <DateInput compact aria-label="From date" value={from} onChange={setFrom} className="w-40" />
        <DateInput compact aria-label="To date" min={from} value={to} onChange={setTo} className="w-40" />
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <Search size={16} className="text-gray-400" />
          <input id="search-dispatches" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dispatch no., order no., customer, docket, vehicle…" className="w-full bg-transparent text-sm focus:outline-none" />
        </label>
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={`${thCls} w-28`}>Dispatch No.</th>
                <th className={`${thCls} w-28`}>Date</th>
                <th className={`${thCls} w-36`}>Order No.</th>
                <th className={`${thCls} w-20`}>Item No.</th>
                <th className={thCls}>Customer Name</th>
                <th className={thCls}>Project Name</th>
                <th className={thCls}>Order Item</th>
                <th className={thCls}>Transporter</th>
                <th className={`${thCls} w-28`}>Vehicle No.</th>
                <th className={`${thCls} w-32`}>Docket / LR No.</th>
                <th className={`${thCls} w-36`}>Dispatch Document</th>
                <th className={`${thCls} w-28`}>LR Copy</th>
                {canEdit && <th className={`${thCls} w-24 text-center`}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [1, 2, 3].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {!loading && loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {!loading && !loadError && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>{q || from || to ? 'No dispatches match.' : 'Nothing dispatched yet. Dispatch an item from its order.'}</td></tr>}
              {pagination.rows.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className={`${tdCls} font-mono text-xs font-medium text-gray-900`}>{d.dispatch_no}</td>
                  <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{fmtDate(d.dispatch_date)}</td>
                  <td className={`${tdCls} whitespace-nowrap font-mono text-xs`}>{d.order_no}</td>
                  <td className={`${tdCls} tabular-nums`}>{d.line_no}</td>
                  <td className={tdCls}>{d.customer_name}</td>
                  <td className={tdCls}>{d.project_name || <span className="text-gray-300">—</span>}</td>
                  <td className={`${tdCls} font-medium text-gray-900`}>{d.item_title}{d.item_remarks && <div className="text-xs font-normal italic text-gray-500">{d.item_remarks}</div>}</td>
                  <td className={tdCls}>{d.transporter_name || <span className="text-gray-300">—</span>}</td>
                  <td className={`${tdCls} font-mono text-xs`}>{d.vehicle_no || <span className="text-gray-300">—</span>}</td>
                  <td className={tdCls}>{d.docket_no || <span className="text-gray-300">—</span>}</td>
                  <td className={tdCls}>{d.dispatch_document ? <button type="button" onClick={() => setViewing({ path: d.dispatch_document, name: d.dispatch_document_name, title: 'Dispatch Document' })} className="text-brand-600 underline">View document</button> : <span className="text-gray-300">—</span>}</td>
                  <td className={tdCls}>{d.dispatch_lr_copy ? <button type="button" onClick={() => setViewing({ path: d.dispatch_lr_copy, name: d.dispatch_lr_copy_name, title: 'LR Copy' })} className="text-brand-600 underline">View LR Copy</button> : <span className="text-gray-300">—</span>}</td>
                  {canEdit && <td className={tdCls}><div className="flex items-center justify-center gap-1">
                    <button type="button" title="Edit dispatch" aria-label={`Edit dispatch ${d.dispatch_no}`} disabled={busy} onClick={() => setEditing(d)} className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50"><Pencil size={16} /></button>
                    <button type="button" title="Delete dispatch" aria-label={`Delete dispatch ${d.dispatch_no}`} disabled={busy} onClick={() => setDeleting(d)} className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={16} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </div>
      {editing && <DispatchDialog item={{ ...editing, id: editing.order_item_id, dispatch: editing }} label={`${editing.order_no} · #${editing.line_no} ${editing.item_title || ''}`} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      <ConfirmDialog open={Boolean(deleting)} title="Delete dispatch?" message={deleting ? `${deleting.dispatch_no} will be removed. The order item will return to its previous production status.` : ''} confirmLabel={busy ? 'Deleting…' : 'Delete'} onConfirm={removeDispatch} onCancel={() => { if (!busy) setDeleting(null); }} />
      {viewing && <DrawingViewer path={viewing.path} name={viewing.name} title={viewing.title} onClose={() => setViewing(null)} />}
    </div>
  );
}
