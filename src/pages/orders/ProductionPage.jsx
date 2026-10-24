import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Truck, Undo2, Save } from 'lucide-react';
import { productionApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import SearchSelect from '../../components/SearchSelect';
import Pagination from '../../components/Pagination';
import { tableWrap, theadCls, thCls, tdCls, inputCls } from '../../components/table';
import { ItemDetailLines } from '../../lib/items';
import DispatchDialog from './DispatchDialog';

export default function ProductionPage({ status }) {
  const ready = status === 'Complete';
  const { canEdit } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ q: '', customer_id: '', area: '', page: 1 });
  const [result, setResult] = useState(null);
  const [filters, setFilters] = useState({ customers: [], areas: [] });
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState({});
  const pendingCount = Object.keys(pending).length;
  const [dispatch, setDispatch] = useState(null);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery((prev) => prev.q === search.trim() ? prev : { ...prev, q: search.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setFilterError('');
    productionApi.filters(status).then((r) => { if (active) setFilters(r.data); })
      .catch((e) => { if (active) setFilterError(e.message); });
    return () => { active = false; };
  }, [status, revision]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    productionApi.list({ ...query, status }).then((r) => {
      if (requestId.current === id) setResult(r);
    }).catch((e) => {
      if (requestId.current === id) setError(e.message);
    }).finally(() => { if (requestId.current === id) setLoading(false); });
    return () => { requestId.current++; };
  }, [query, status, revision]);

  const stageChange = (item, field, value) => {
    setPending((prev) => {
      const draft = { ...prev[item.id] };
      const original = field === 'status' ? item.production_status : item.remarks || '';
      if (value === original) {
        delete draft[field];
        delete draft[field === 'status' ? 'expected_status' : 'expected_remarks'];
      } else {
        draft[field] = value;
        draft[field === 'status' ? 'expected_status' : 'expected_remarks'] = original;
      }
      const next = { ...prev };
      if ('status' in draft || 'remarks' in draft) next[item.id] = { ...draft, id: item.id };
      else delete next[item.id];
      return next;
    });
  };
  const saveChanges = async () => {
    if (busy || !pendingCount) return;
    setBusy(true);
    try {
      const r = await productionApi.updateMany(Object.values(pending));
      setPending({});
      toast(r.message);
      refresh();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!pendingCount) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);
  const setFilter = (field, value) => setQuery((prev) => ({ ...prev, [field]: value, ...(field === 'customer_id' ? { area: '' } : {}), page: 1 }));
  const setPage = (value) => setQuery((prev) => ({ ...prev, page: typeof value === 'function' ? value(result?.page || 1) : value }));
  const areaNames = [...new Set(filters.areas.filter((a) => !query.customer_id || String(a.customer_id) === String(query.customer_id)).map((a) => a.name))];
  const rows = error || loading ? [] : result?.data || [];
  const filtered = query.q || query.customer_id || query.area;
  const th = `${thCls} !px-3 !py-2.5 whitespace-nowrap`;
  const td = `${tdCls} !px-3 !py-3`;
  const dash = <span className="text-gray-400">—</span>;

  return <div className="mx-auto max-w-screen-2xl space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <label htmlFor="production-customer" className="mb-1 block text-xs font-medium text-gray-600">Customer Name</label>
        <SearchSelect id="production-customer" value={query.customer_id} onChange={(v) => setFilter('customer_id', v)}
          options={[{ value: '', label: 'All customers' }, ...filters.customers.map((c) => ({ value: c.id, label: c.name }))]} />
      </div>
      <div className="min-w-[180px] flex-1">
        <label htmlFor="production-area" className="mb-1 block text-xs font-medium text-gray-600">Area</label>
        <SearchSelect id="production-area" value={query.area} onChange={(v) => setFilter('area', v)}
          options={[{ value: '', label: 'All areas' }, ...areaNames.map((name) => ({ value: name, label: name }))]} />
      </div>
      <label className="flex min-h-[38px] min-w-[240px] flex-[2] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
        <Search size={16} className="text-gray-400" />
        <input aria-label="Search production items" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, customer, project, area, item…" className="w-full bg-transparent text-sm focus:outline-none" />
      </label>
      <button onClick={refresh} disabled={loading || busy} aria-label="Refresh production items" className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"><RefreshCw size={18} /></button>
      {(filtered || search) && <button onClick={() => { setSearch(''); setQuery({ q: '', customer_id: '', area: '', page: 1 }); }} className="rounded-lg px-2 py-2 text-sm text-brand-600 hover:bg-brand-50">Clear filters</button>}
    </div>
    {filterError && <p role="alert" className="text-sm text-red-600">Filters could not load: {filterError} <button onClick={refresh} className="underline">Retry</button></p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-gray-500">{!loading && !error ? `${result?.total || 0} ${result?.total === 1 ? 'item' : 'items'}` : ''}</span>
      {canEdit && <div className="flex items-center gap-3">
        {pendingCount > 0 && <><span role="status" className="text-xs text-amber-700">{pendingCount} {pendingCount === 1 ? 'item has' : 'items have'} unsaved changes</span><button disabled={busy} onClick={() => setPending({})} className="text-sm text-gray-600 hover:underline disabled:opacity-50">Discard changes</button></>}
        <button onClick={saveChanges} disabled={busy || !pendingCount} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"><Save size={16} />{busy ? 'Updating…' : 'Update'}</button>
      </div>}
    </div>
    <div className={tableWrap} aria-busy={loading || busy}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] border-collapse text-sm">
          <thead className={theadCls}><tr>
            {['Order No.', 'Customer Name', 'Project Name', 'Area', 'Order Item', 'Production Status', 'Remarks', ...(ready && canEdit ? ['Action'] : [])].map((heading) => <th key={heading} className={th}>{heading}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={ready && canEdit ? 8 : 7} className={`${td} text-center text-gray-500`}>Loading items…</td></tr>}
            {error && !loading && <tr><td colSpan={ready && canEdit ? 8 : 7} className={`${td} py-10 text-center`}><p role="alert" className="text-red-600">{error}</p><button onClick={refresh} className="mt-2 text-brand-600 underline">Try again</button></td></tr>}
            {!loading && !error && !rows.length && <tr><td colSpan={ready && canEdit ? 8 : 7} className={`${td} !py-12 text-center text-gray-500`}>{filtered ? 'No items match these filters.' : ready ? 'No completed items awaiting dispatch.' : 'No issued items in production.'}</td></tr>}
            {rows.map((it) => <tr key={it.id} className="hover:bg-gray-50">
              <td className={`${td} whitespace-nowrap font-mono text-xs`}><Link to={`/orders/${it.order_id}`} className="text-brand-600 hover:underline">{it.order_no}</Link><span className="mt-1 block text-gray-500">Item #{it.line_no}</span></td>
              <td className={`${td} min-w-[150px] font-medium`}>{it.customer_name}</td>
              <td className={`${td} min-w-[130px]`}>{it.project_name || dash}</td>
              <td className={`${td} min-w-[100px]`}>{it.area || dash}</td>
              <td className={`${td} min-w-[200px]`}><ItemDetailLines details={it.details} empty={it.item_title || dash} /></td>
              <td className={`${td} min-w-[165px]`}>
                {canEdit ? <select aria-label={`Production Status for ${it.order_no} item ${it.line_no}`} value={pending[it.id]?.status ?? it.production_status} disabled={busy || loading} onChange={(e) => stageChange(it, 'status', e.target.value)} className={inputCls(false)}>
                  <option value="In Progress">In Progress</option><option value="Complete">Complete</option>
                </select> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ready ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{it.production_status}</span>}
              </td>
              <td className={`${td} min-w-[200px]`}>
                {canEdit ? <textarea aria-label={`Remarks for ${it.order_no} item ${it.line_no}`} rows={3} maxLength={255} value={pending[it.id]?.remarks ?? it.remarks ?? ''} onChange={(e) => stageChange(it, 'remarks', e.target.value)} disabled={busy} placeholder="Enter remarks…" className={inputCls(false)} /> : <span className="whitespace-pre-wrap">{it.remarks || dash}</span>}
              </td>
              {ready && canEdit && <td className={`${td} min-w-[210px]`}><div className="flex flex-col items-start gap-2">
                <button disabled={busy || loading || pendingCount > 0} title={pendingCount ? "Save changes before dispatch" : "Dispatch"} onClick={() => setDispatch(it)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"><Truck size={14} /> Dispatch</button>
                <button disabled={busy || loading} onClick={() => stageChange(it, 'status', 'In Progress')} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"><Undo2 size={14} /> Move Back to In Progress</button>
              </div></td>}
            </tr>)}
          </tbody>
        </table>
      </div>
      {!error && result && !loading && <Pagination page={result.page} pages={result.pages} total={result.total} setPage={setPage} />}
    </div>
    {dispatch && <DispatchDialog item={dispatch} label={dispatch.label || dispatch.order_no} onClose={() => setDispatch(null)} onDone={() => { setDispatch(null); refresh(); }} />}
  </div>;
}
