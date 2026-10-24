import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, RefreshCw, Pencil, PhoneCall } from 'lucide-react';
import { api, crmApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import SearchSelect from '../../components/SearchSelect';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { fmtDate, fmtTime, today, LeadTemp } from '../../lib/util';
import FollowUpDialog from './FollowUpDialog';

const PER_PAGE = 25;
// Row colour shows the status: Open white, Success green, Fail red.
const ROW_BG = { Open: 'bg-white hover:bg-gray-50', Success: 'bg-green-100 hover:bg-green-200/70', Fail: 'bg-red-100 hover:bg-red-200/70' };

export default function LeadList() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('Open');
  const [temp, setTemp] = useState('');
  const [type, setType] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sources, setSources] = useState([]);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [followUp, setFollowUp] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { api.lookup('lead_sources').then((r) => setSources(r.data)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await crmApi.list({ q, status, temperature: temp, customer_type: type, source_id: sourceId, page, per_page: PER_PAGE });
      setRows(r.data);
      setTotal(r.total);
    } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }, [q, status, temp, type, sourceId, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, status, temp, type, sourceId]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const cols = 18;
  const th = `${thCls} whitespace-nowrap !px-3 !py-2.5`;
  const td = `${tdCls} !px-3 !py-2`;
  const DASH = <span className="text-gray-300">—</span>;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchSelect id="filter-lead-status" className="w-full sm:w-44" options={[{ value: '', label: 'All statuses' }, ...['Open', 'Success', 'Fail'].map((s) => ({ value: s, label: s }))]} value={status} onChange={setStatus} placeholder="All statuses" clearable />
        <SearchSelect id="filter-lead-temp" className="w-full sm:w-36" options={[{ value: '', label: 'All lead types' }, { value: 'Hot', label: 'Hot' }, { value: 'Cold', label: 'Cold' }]} value={temp} onChange={setTemp} placeholder="All lead types" clearable />
        <SearchSelect id="filter-lead-type" className="w-full sm:w-44" options={[{ value: '', label: 'New & Existing' }, { value: 'New', label: 'New customers' }, { value: 'Existing', label: 'Existing customers' }]} value={type} onChange={setType} placeholder="New & Existing" clearable />
        <SearchSelect id="filter-lead-source" className="w-full sm:w-44" options={[{ value: '', label: 'All sources' }, ...sources.map((s) => ({ value: s.id, label: s.name }))]} value={sourceId} onChange={setSourceId} placeholder="All sources" clearable />
        <div className="flex min-w-[240px] flex-1 gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <Search size={16} className="text-gray-400" />
            <input id="search-leads" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lead no., name, phone, city, contact, requirement…" className="w-full bg-transparent text-sm focus:outline-none" />
          </label>
          {canEdit && <button onClick={() => navigate('/leads/new')} aria-label="Add Lead" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Plus size={16} /> Add</button>}
        </div>
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1800px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Lead No.</th>
                <th className={th}>Date</th>
                <th className={th}>Customer</th>
                <th className={th}>Phone</th>
                <th className={th}>City</th>
                <th className={th}>State</th>
                <th className={th}>Contact Person</th>
                <th className={th}>Contact Mobile</th>
                <th className={th}>Source</th>
                <th className={th}>Requirement</th>
                <th className={th}>Remarks</th>
                <th className={th}>Lead Type</th>
                <th className={th}>Follow Up Date</th>
                <th className={th}>Next Follow Up</th>
                <th className={th}>Follow Up By</th>
                <th className={th}>Follow Up Remarks</th>
                <th className={`${th} text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [1, 2, 3].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {!loading && loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {!loading && !loadError && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>{q || status || temp || type || sourceId ? 'No leads match.' : 'No leads yet.'}</td></tr>}
              {rows.map((l) => {
                const overdue = l.due && l.next_followup_date < today();
                return (
                  <tr key={l.id} className={`${ROW_BG[l.status] || ''} ${loading ? 'opacity-60' : ''}`}>
                    <td className={`${td} whitespace-nowrap font-mono text-xs font-medium text-gray-900`}>{l.lead_no}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(l.lead_date)}</td>
                    <td className={`${td} min-w-[9rem] font-medium text-gray-900`}>{l.display_name}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{l.display_phone || DASH}</td>
                    <td className={td}>{l.customer_city || DASH}</td>
                    <td className={`${td} whitespace-nowrap`}>{l.state_name || DASH}</td>
                    <td className={`${td} min-w-[7rem]`}>{l.contact_person || DASH}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{l.contact_mobile || DASH}</td>
                    <td className={`${td} whitespace-nowrap`}>{l.source_name || DASH}</td>
                    <td className={`${td} min-w-[10rem] text-gray-700`}>{l.requirement || DASH}</td>
                    <td className={`${td} min-w-[10rem] text-gray-700`}>{l.remarks || DASH}</td>
                    <td className={td}><LeadTemp t={l.temperature} /></td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{l.last_followup ? fmtDate(l.last_followup.followup_date) : DASH}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums ${overdue ? 'font-medium text-red-600' : ''}`}>{l.status === 'Open' && l.due ? <>{fmtDate(l.next_followup_date)}{l.next_followup_time ? ` · ${fmtTime(l.next_followup_time)}` : ''}{overdue && <div className="text-xs">Overdue</div>}</> : DASH}</td>
                    <td className={`${td} whitespace-nowrap`}>{l.last_followup?.followup_by_name || DASH}</td>
                    <td className={`${td} min-w-[10rem] text-gray-700`}>{l.last_followup?.remarks || DASH}</td>
                    <td className={`${td} text-center`}>
                      <div className="inline-flex gap-1 whitespace-nowrap">
                        {canEdit && l.status === 'Open' && <button onClick={() => setFollowUp(l)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"><PhoneCall size={13} /> Follow Up</button>}
                        <button onClick={() => navigate(`/leads/${l.id}`)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"><Pencil size={13} /> Open</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 0 && (
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
      {followUp && <FollowUpDialog lead={followUp} onClose={() => setFollowUp(null)} onDone={() => { setFollowUp(null); load(); }} />}
    </div>
  );
}
