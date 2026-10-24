import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, PhoneCall, Pencil } from 'lucide-react';
import { crmApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { fmtDate, fmtDay, fmtTime } from '../../lib/util';
import FollowUpDialog from './FollowUpDialog';

const TABS = [['all', 'All'], ['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming']];

// Hot open leads due for follow-up.
export default function FollowUps() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [tab, setTab] = useState('today');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [followUp, setFollowUp] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(() => {
    setLoadError('');
    crmApi.due({ tab, q }).then((r) => setData(r)).catch((e) => setLoadError(e.message));
  }, [tab, q]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.data || [];
  const cols = 15;
  const th = `${thCls} whitespace-nowrap !px-3 !py-2.5`;
  const td = `${tdCls} !px-3 !py-2`;
  const DASH = <span className="text-gray-300">—</span>;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium ${tab === k ? (k === 'overdue' ? 'bg-red-600 text-white' : 'bg-brand-600 text-white') : 'text-gray-700 hover:bg-gray-50'}`}>
              {l}
              {data && <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === k ? 'bg-white/25' : k === 'overdue' && data.counts.overdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{data.counts[k]}</span>}
            </button>
          ))}
        </div>
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <Search size={16} className="text-gray-400" />
          <input id="search-followups" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lead no., name, phone…" className="w-full bg-transparent text-sm focus:outline-none" />
        </label>
      </div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1800px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Follow Up Due Date</th>
                <th className={th}>Lead No.</th>
                <th className={th}>Customer</th>
                <th className={th}>Phone</th>
                <th className={th}>City</th>
                <th className={th}>State</th>
                <th className={th}>Contact Person</th>
                <th className={th}>Contact Mobile</th>
                <th className={th}>Source</th>
                <th className={th}>Requirement</th>
                <th className={th}>Remarks</th>
                <th className={th}>Last Follow Up Date</th>
                <th className={th}>Follow Up By</th>
                <th className={th}>Follow Up Remarks</th>
                <th className={`${th} text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {!data && !loadError && [1, 2, 3].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {data && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>{q ? 'No leads match.' : tab === 'all' ? 'No open leads.' : tab === 'overdue' ? 'Nothing overdue.' : tab === 'today' ? 'No follow-ups due today.' : 'No upcoming follow-ups.'}</td></tr>}
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className={`${td} whitespace-nowrap tabular-nums ${l.due && l.next_followup_date < data.today ? 'font-medium text-red-600' : ''}`}>
                    {l.due ? <>
                      {fmtDay(l.next_followup_date)} {fmtDate(l.next_followup_date)}
                      {l.next_followup_time && <div className="text-xs text-gray-600">{fmtTime(l.next_followup_time)}</div>}
                      {tab === 'all' && l.next_followup_date < data.today && <div className="text-xs">Overdue</div>}
                    </> : <span className="text-xs text-gray-500">Cold · not due</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap font-mono text-xs font-medium text-gray-900`}>{l.lead_no}</td>
                  <td className={`${td} min-w-[9rem] font-medium text-gray-900`}>{l.display_name}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{l.display_phone ? <a href={`tel:${l.display_phone}`} className="text-brand-600 hover:underline">{l.display_phone}</a> : DASH}</td>
                  <td className={td}>{l.customer_city || DASH}</td>
                  <td className={`${td} whitespace-nowrap`}>{l.state_name || DASH}</td>
                  <td className={`${td} min-w-[7rem]`}>{l.contact_person || DASH}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{l.contact_mobile ? <a href={`tel:${l.contact_mobile}`} className="text-brand-600 hover:underline">{l.contact_mobile}</a> : DASH}</td>
                  <td className={`${td} whitespace-nowrap`}>{l.source_name || DASH}</td>
                  <td className={`${td} min-w-[10rem] text-gray-700`}>{l.requirement || DASH}</td>
                  <td className={`${td} min-w-[10rem] text-gray-700`}>{l.remarks || DASH}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{l.last_followup ? fmtDate(l.last_followup.followup_date) : <span className="text-xs text-gray-400">First follow-up</span>}</td>
                  <td className={`${td} whitespace-nowrap`}>{l.last_followup?.followup_by_name || DASH}</td>
                  <td className={`${td} min-w-[10rem] text-gray-700`}>{l.last_followup?.remarks || DASH}</td>
                  <td className={`${td} text-center`}>
                    <div className="inline-flex gap-1 whitespace-nowrap">
                      {canEdit && <button onClick={() => setFollowUp(l)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"><PhoneCall size={13} /> Follow Up</button>}
                      <button onClick={() => navigate(`/leads/${l.id}`)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"><Pencil size={13} /> Open</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {followUp && <FollowUpDialog lead={followUp} onClose={() => setFollowUp(null)} onDone={() => { setFollowUp(null); load(); }} />}
    </div>
  );
}
