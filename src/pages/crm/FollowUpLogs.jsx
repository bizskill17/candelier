import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { crmApi, ordersApi } from '../../api/client';
import SearchSelect from '../../components/SearchSelect';
import DateInput from '../../components/DateInput';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { fmtDate, fmtTime, Badge } from '../../lib/util';

const PER_PAGE = 20;
const ROW_BG = { Success: 'bg-green-100', Fail: 'bg-red-100' };
const STATUS_COLOR = { 'Follow Up Again': 'amber', Success: 'green', Fail: 'red' };

// Every follow-up entered, newest first.
export default function FollowUpLogs() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [by, setBy] = useState('');
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { ordersApi.users().then((r) => setUsers(r.data)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await crmApi.logs({ from, to, status, followup_by: by, q, page, per_page: PER_PAGE });
      setRows(r.data);
      setTotal(r.total);
    } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }, [from, to, status, by, q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [from, to, status, by, q]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const th = `${thCls} whitespace-nowrap !px-3 !py-2.5`;
  const td = `${tdCls} !px-3 !py-2`;
  const DASH = <span className="text-gray-300">—</span>;
  const cols = 15;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40"><DateInput small aria-label="From date" value={from} onChange={setFrom} /></div>
        <span className="text-sm text-gray-500">to</span>
        <div className="w-40"><DateInput small aria-label="To date" min={from || undefined} value={to} onChange={setTo} /></div>
        <SearchSelect compact id="filter-log-status" className="w-full sm:w-44" options={[{ value: '', label: 'All statuses' }, ...['Follow Up Again', 'Success', 'Fail'].map((s) => ({ value: s, label: s }))]} value={status} onChange={setStatus} placeholder="All statuses" clearable />
        <SearchSelect compact id="filter-log-by" className="w-full sm:w-44" options={[{ value: '', label: 'Everyone' }, ...users.map((u) => ({ value: u.id, label: u.name }))]} value={by} onChange={setBy} placeholder="Follow up by" clearable />
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <Search size={16} className="text-gray-400" />
          <input id="search-logs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lead no., name, phone, remarks…" className="w-full bg-transparent text-sm focus:outline-none" />
        </label>
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1800px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Follow Up Date</th>
                <th className={th}>Lead No.</th>
                <th className={th}>Customer</th>
                <th className={th}>Phone</th>
                <th className={th}>City</th>
                <th className={th}>State</th>
                <th className={th}>Contact Person</th>
                <th className={th}>Contact Mobile</th>
                <th className={th}>Source</th>
                <th className={th}>Requirement</th>
                <th className={th}>Status</th>
                <th className={th}>Next Follow Up</th>
                <th className={th}>Follow Up By</th>
                <th className={th}>Follow Up Remarks</th>
                <th className={`${th} text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [1, 2, 3].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {!loading && loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {!loading && !loadError && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>{q || from || to || status || by ? 'No follow-ups match.' : 'No follow-ups yet.'}</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className={`${ROW_BG[r.status] || 'bg-white'} ${loading ? 'opacity-60' : ''}`}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(r.followup_date)}</td>
                  <td className={`${td} whitespace-nowrap font-mono text-xs font-medium text-gray-900`}>{r.lead_no}</td>
                  <td className={`${td} min-w-[9rem] font-medium text-gray-900`}>{r.display_name}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{r.display_phone || DASH}</td>
                  <td className={td}>{r.city || DASH}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.state_name || DASH}</td>
                  <td className={`${td} min-w-[7rem]`}>{r.contact_person || DASH}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{r.contact_mobile || DASH}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.source_name || DASH}</td>
                  <td className={`${td} min-w-[10rem] text-gray-700`}>{r.requirement || DASH}</td>
                  <td className={`${td} whitespace-nowrap`}><Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge></td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{r.next_date ? `${fmtDate(r.next_date)}${r.next_time ? ` · ${fmtTime(r.next_time)}` : ''}` : DASH}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.followup_by_name || DASH}</td>
                  <td className={`${td} min-w-[12rem] text-gray-700`}>{r.remarks || DASH}</td>
                  <td className={`${td} text-center`}>
                    <button onClick={() => navigate(`/leads/${r.lead_id}`)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"><Pencil size={13} /> Open lead</button>
                  </td>
                </tr>
              ))}
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
