import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Trash2, PhoneCall, FilePlus2, ExternalLink, Undo2, Plus } from 'lucide-react';
import { api, crmApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import SearchSelect from '../../components/SearchSelect';
import DateInput from '../../components/DateInput';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import { inputCls, tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { today, fmtDate, fmtTime, LeadTemp, LeadStatus, Badge } from '../../lib/util';
import FollowUpDialog from './FollowUpDialog';

const blank = () => ({ lead_date: today(), customer_type: 'New', customer_id: '', name: '', phone: '', email: '', address: '', city: '', state_id: '', contact_person: '', contact_mobile: '', source_id: '', requirement: '', temperature: 'Hot', remarks: '' });
const fromLead = (l) => ({ lead_date: l.lead_date, customer_type: l.customer_type, customer_id: l.customer_type === 'Existing' ? l.customer_id : '', name: l.name || '', phone: l.phone || '', email: l.email || '', address: l.address || '', city: l.city || '', state_id: l.state_id || '', contact_person: l.contact_person || '', contact_mobile: l.contact_mobile || '', source_id: l.source_id || '', requirement: l.requirement || '', temperature: l.temperature, remarks: l.remarks || '' });

// Add Lead (no id) or one lead with its follow-ups (id).
export default function LeadForm({ id }) {
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { canEdit } = useAuth();
  const [lead, setLead] = useState(null);
  const [f, setF] = useState(blank);
  const [saved, setSaved] = useState('');
  const [customers, setCustomers] = useState(null);
  const [sources, setSources] = useState(null);
  const [states, setStates] = useState(null);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [quick, setQuick] = useState(null); // { entity, name, error }

  useEffect(() => {
    api.lookup('customers').then((r) => setCustomers(r.data)).catch(() => setCustomers([]));
    api.lookup('lead_sources').then((r) => setSources(r.data)).catch(() => setSources([]));
    api.lookup('states').then((r) => setStates(r.data)).catch(() => setStates([]));
  }, []);
  const fill = (l) => { setLead(l); const x = fromLead(l); setF(x); setSaved(JSON.stringify(x)); };
  const load = () => { setLoadError(''); crmApi.get(id).then((r) => fill(r.data)).catch((e) => setLoadError(e.message)); };
  useEffect(() => { if (isEdit) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const existingSourceId = (sources || []).find((s) => s.name.toLowerCase() === 'existing customer')?.id;
  const setType = (t) => {
    set('customer_type', t);
    if (t === 'Existing' && !f.source_id && existingSourceId) set('source_id', existingSourceId);
    if (t === 'New' && String(f.source_id) === String(existingSourceId)) set('source_id', '');
  };
  const dirty = isEdit && saved !== JSON.stringify(f);
  const pickCustomer = (v) => {
    set('customer_id', v);
    const c = (customers || []).find((x) => String(x.id) === String(v));
    // Fill the lead's contact details from the customer record (only empty boxes; they can be changed for this lead).
    if (c) {
      const fillIn = { city: c.city, state_id: c.state_id ? Number(c.state_id) : '', email: c.email, contact_person: c.contact_person, contact_mobile: c.contact_mobile };
      Object.entries(fillIn).forEach(([k, v]) => { if (v && !f[k]) set(k, v); });
    }
  };
  const QUICK = {
    lead_sources: { title: 'Add Lead Source', label: 'Source name', placeholder: 'e.g. YouTube Ads', field: 'source_id', setList: setSources },
    states: { title: 'Add State', label: 'State name', placeholder: 'e.g. Assam', field: 'state_id', setList: setStates },
  };
  const quickAdd = async () => {
    const q = QUICK[quick.entity];
    try {
      const r = await api.create(quick.entity, { name: quick.name });
      const list = await api.lookup(quick.entity);
      q.setList(list.data);
      set(q.field, r.data.id);
      toast(r.message);
      setQuick(null);
    } catch (e) { setQuick((x) => ({ ...x, error: e.fields?.name || e.message })); }
  };

  const save = async (e) => {
    e?.preventDefault();
    const requiredErrors = {};
    if (!f.state_id) requiredErrors.state_id = 'Choose a state.';
    if (!f.source_id) requiredErrors.source_id = 'Choose a source.';
    if (Object.keys(requiredErrors).length) { setErrors(requiredErrors); return; }
    setSaving(true);
    try {
      const r = isEdit ? await crmApi.update(id, f) : await crmApi.create(f);
      toast(r.message);
      if (isEdit) fill(r.data); else navigate('/follow-ups');
      setErrors({});
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields || !Object.keys(err.fields).length) toast(err.message, 'error');
    } finally { setSaving(false); }
  };
  const undo = async (fid) => {
    try { const r = await crmApi.undoFollowUp(id, fid); toast(r.message); fill(r.data); } catch (e) { toast(e.message, 'error'); }
    setConfirm(null);
  };
  const del = async () => {
    try { const r = await crmApi.remove(id); toast(r.message); navigate('/leads/all'); } catch (e) { toast(e.message, 'error'); setConfirm(null); }
  };

  if (isEdit && loadError) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button>
      </div>
    );
  }
  if (isEdit && !lead) return <div className="mx-auto max-w-4xl space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>;

  const locked = !canEdit;
  const cust = (customers || []).find((c) => String(c.id) === String(f.customer_id));
  const custOpts = (customers || []).filter((c) => c.is_active || String(c.id) === String(f.customer_id)).map((c) => ({ value: c.id, label: c.name, hint: c.city || c.phone || '' }));
  const stateOpts = (states || []).filter((x) => x.is_active || String(x.id) === String(f.state_id)).map((x) => ({ value: x.id, label: x.name }));
  const plus = (entity, title) => !locked && <button type="button" onClick={() => setQuick({ entity, name: '', error: '' })} title={title} aria-label={title} className="shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button>;
  const srcOpts = (sources || []).filter((s) => s.is_active || String(s.id) === String(f.source_id)).map((s) => ({ value: s.id, label: s.name }));
  const lbl = 'mb-0.5 block text-xs font-medium text-gray-600';
  const ci = (e) => inputCls(e).replace('px-3 py-2', 'px-2.5 py-1.5');
  const digits = (v) => v.replace(/\D/g, '').slice(0, 10);
  const err = (k) => errors[k] && <p className="mt-1 text-xs text-red-600">{errors[k]}</p>;
  const overdue = lead?.due && lead.next_followup_date < today();
  const latestId = lead?.followups?.[0]?.id;

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      {isEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => navigate('/leads/all')} className="inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft size={16} /> Leads</button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900">Lead {lead.lead_no} · {lead.display_name}</h2>
          <LeadTemp t={lead.temperature} />
          <LeadStatus status={lead.status} />
        </div>
      )}

      {isEdit && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm">
          {lead.status === 'Open' && lead.temperature === 'Hot' && lead.next_followup_date && (
            <span className={overdue ? 'font-medium text-red-600' : 'text-gray-700'}>
              Next follow-up: <b>{fmtDate(lead.next_followup_date)}{lead.next_followup_time ? ` · ${fmtTime(lead.next_followup_time)}` : ''}</b>{overdue && ' (overdue)'}
            </span>
          )}
          {lead.status === 'Open' && lead.temperature === 'Cold' && <span className="text-gray-500">Cold lead: not due for follow-up. Mark it Hot to follow up.</span>}
          {lead.status === 'Success' && (lead.order_id
            ? <span className="text-gray-700">Order <button onClick={() => navigate(`/orders/${lead.order_id}`)} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">{lead.order_no} <ExternalLink size={12} /></button> made from this lead.</span>
            : <span className="text-green-700">Success. Create the order now.</span>)}
          {lead.status === 'Fail' && <span className="text-gray-500">This lead was marked Fail.</span>}
          <span className="flex-1" />
          {canEdit && lead.status === 'Open' && (
            <button onClick={() => setFollowUp(true)} disabled={dirty} title={dirty ? 'Save your changes first' : undefined} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"><PhoneCall size={15} /> Follow Up</button>
          )}
          {canEdit && lead.status === 'Success' && !lead.order_id && (
            <button onClick={() => navigate(`/orders/new/lead/${lead.id}`)} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"><FilePlus2 size={15} /> Create Order</button>
          )}
        </section>
      )}

      <form onSubmit={save} noValidate className="space-y-4">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-3">
            <div>
              <label htmlFor="ld-date" className={lbl}>Lead Date <span className="text-red-500">*</span></label>
              <DateInput small id="ld-date" max={today()} value={f.lead_date} onChange={(v) => set('lead_date', v)} error={errors.lead_date} disabled={locked} />
              {err('lead_date')}
            </div>
            <div>
              <div className={lbl}>Customer <span className="text-red-500">*</span></div>
              <div role="radiogroup" aria-label="Customer" className="inline-flex rounded-lg border border-gray-300 p-0.5">
                {['New', 'Existing'].map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={f.customer_type === t} disabled={locked || (isEdit && lead.order_id)} onClick={() => setType(t)}
                    className={`rounded-md px-3 py-1 text-sm font-medium ${f.customer_type === t ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>{t}</button>
                ))}
              </div>
              {err('customer_type')}
            </div>
            <div>
              <div className={lbl}>Lead Type <span className="text-red-500">*</span></div>
              <div role="radiogroup" aria-label="Lead Type" className="inline-flex rounded-lg border border-gray-300 p-0.5">
                {['Hot', 'Cold'].map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={f.temperature === t} disabled={locked} onClick={() => set('temperature', t)}
                    className={`rounded-md px-3 py-1 text-sm font-medium ${f.temperature === t ? (t === 'Hot' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white') : 'text-gray-700 hover:bg-gray-50'}`}>{t}</button>
                ))}
              </div>
              {err('temperature')}
            </div>

            {f.customer_type === 'Existing' ? (
              <>
                <div className="sm:col-span-2">
                  <label htmlFor="ld-customer" className={lbl}>Customer <span className="text-red-500">*</span></label>
                  <SearchSelect compact id="ld-customer" options={custOpts} value={f.customer_id} onChange={pickCustomer} error={errors.customer_id} disabled={locked || !customers || (isEdit && lead.order_id)} placeholder={customers ? 'Search customer' : 'Loading…'} />
                  {err('customer_id')}
                </div>
                <div className="min-w-0 text-sm">
                  <div className={lbl}>Phone / Address</div>
                  <div className="truncate py-1.5 text-gray-700" title={cust ? [cust.phone, cust.address || cust.city].filter(Boolean).join(' · ') : ''}>{cust ? [cust.phone, cust.address || cust.city].filter(Boolean).join(' · ') || '—' : <span className="text-gray-400">After choosing the customer</span>}</div>
                </div>
              </>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <label htmlFor="ld-name" className={lbl}>Name <span className="text-red-500">*</span></label>
                  <input id="ld-name" disabled={locked} value={f.name} onChange={(e) => set('name', e.target.value)} className={ci(errors.name)} placeholder="Client name" />
                  {err('name')}
                </div>
                <div>
                  <label htmlFor="ld-phone" className={lbl}>Phone</label>
                  <input id="ld-phone" type="tel" inputMode="numeric" maxLength={10} disabled={locked} value={f.phone} onChange={(e) => set('phone', digits(e.target.value))} className={ci(errors.phone)} placeholder="10-digit mobile" />
                  {err('phone')}
                </div>
              </>
            )}

            <div>
              <label htmlFor="ld-email" className={lbl}>Email</label>
              <input id="ld-email" type="email" disabled={locked} value={f.email} onChange={(e) => set('email', e.target.value.trim())} className={ci(errors.email)} placeholder="name@example.com" />
              {err('email')}
            </div>
            {f.customer_type === 'New' ? (
              <div>
                <label htmlFor="ld-address" className={lbl}>Address</label>
                <input id="ld-address" disabled={locked} value={f.address} onChange={(e) => set('address', e.target.value)} className={ci(errors.address)} />
                {err('address')}
              </div>
            ) : null}
            <div>
              <label htmlFor="ld-city" className={lbl}>City</label>
              <input id="ld-city" disabled={locked} value={f.city} onChange={(e) => set('city', e.target.value)} className={ci(errors.city)} />
              {err('city')}
            </div>
            <div>
              <label htmlFor="ld-state" className={lbl}>State <span className="text-red-500">*</span></label>
              <div className="flex gap-1.5">
                <SearchSelect compact id="ld-state" className="min-w-0 flex-1" options={stateOpts} value={f.state_id} onChange={(v) => set('state_id', v)} disabled={locked || !states} placeholder="Select state" error={errors.state_id} clearable />
                {plus('states', 'Add a new state')}
              </div>
              {err('state_id')}
            </div>
            <div>
              <label htmlFor="ld-cp" className={lbl}>Contact Person</label>
              <input id="ld-cp" disabled={locked} value={f.contact_person} onChange={(e) => set('contact_person', e.target.value)} className={ci(errors.contact_person)} />
              {err('contact_person')}
            </div>
            <div>
              <label htmlFor="ld-cm" className={lbl}>Contact Person Mobile</label>
              <input id="ld-cm" type="tel" inputMode="numeric" maxLength={10} disabled={locked} value={f.contact_mobile} onChange={(e) => set('contact_mobile', digits(e.target.value))} className={ci(errors.contact_mobile)} placeholder="10-digit mobile" />
              {err('contact_mobile')}
            </div>
            <div>
              <label htmlFor="ld-source" className={lbl}>Source <span className="text-red-500">*</span></label>
              <div className="flex gap-1.5">
                <SearchSelect compact id="ld-source" className="min-w-0 flex-1" options={srcOpts} value={f.source_id} onChange={(v) => set('source_id', v)} disabled={locked || !sources} placeholder="Select source" error={errors.source_id} clearable />
                {plus('lead_sources', 'Add a new source')}
              </div>
              {err('source_id')}
            </div>
            <div className={f.customer_type === 'New' ? 'sm:col-span-2' : 'sm:col-span-3'}>
              <label htmlFor="ld-req" className={lbl}>Requirement <span className="text-red-500">*</span></label>
              <input id="ld-req" disabled={locked} value={f.requirement} onChange={(e) => set('requirement', e.target.value)} className={ci(errors.requirement)} />
              {err('requirement')}
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="ld-remarks" className={lbl}>Remarks</label>
              <textarea id="ld-remarks" rows={1} disabled={locked} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} className={ci(errors.remarks)} />
              {err('remarks')}
            </div>
          </div>
          {quick && (
            <Modal open title={QUICK[quick.entity].title} onClose={() => setQuick(null)}
              footer={<>
                <button type="button" onClick={() => setQuick(null)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
                <button type="button" onClick={quickAdd} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add</button>
              </>}>
              <label htmlFor="quick-name" className={lbl}>{QUICK[quick.entity].label}</label>
              <input id="quick-name" autoFocus value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value, error: '' })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } }} className={inputCls(quick.error)} placeholder={QUICK[quick.entity].placeholder} />
              {quick.error && <p className="mt-1 text-xs text-red-600">{quick.error}</p>}
            </Modal>
          )}

        </section>

        {canEdit && (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
            {isEdit && lead.followup_count === 0 && !lead.order_id && <button type="button" onClick={() => setConfirm('delete')} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={15} /> Delete</button>}
            <div className="flex-1" />
            {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
            <button type="button" onClick={() => (isEdit ? navigate('/leads/all') : setF(blank()))} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">{isEdit ? 'Back' : 'Clear'}</button>
            <button type="submit" disabled={saving || (isEdit && !dirty)} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Lead'}</button>
          </div>
        )}
      </form>

      {isEdit && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Follow-ups <span className="font-normal text-gray-500">· {lead.followups.length}</span></h3>
          <div className={tableWrap}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className={theadCls}>
                  <tr>
                    <th className={`${thCls} w-28`}>Date</th>
                    <th className={`${thCls} w-40`}>Status</th>
                    <th className={`${thCls} w-36`}>Next Follow Up</th>
                    <th className={`${thCls} w-36`}>Follow Up By</th>
                    <th className={thCls}>Remarks</th>
                    {canEdit && <th className={`${thCls} w-20 text-center`}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {lead.followups.length === 0 && <tr><td colSpan={6} className={`${tdCls} py-8 text-center text-gray-500`}>No follow-ups yet.</td></tr>}
                  {lead.followups.map((x) => (
                    <tr key={x.id}>
                      <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{fmtDate(x.followup_date)}</td>
                      <td className={tdCls}><Badge color={x.status === 'Success' ? 'green' : x.status === 'Fail' ? 'red' : 'amber'}>{x.status}</Badge></td>
                      <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{x.next_date ? `${fmtDate(x.next_date)}${x.next_time ? ` · ${fmtTime(x.next_time)}` : ''}` : <span className="text-gray-300">—</span>}</td>
                      <td className={tdCls}>{x.followup_by_name || '—'}</td>
                      <td className={`${tdCls} text-gray-700`}>{x.remarks || <span className="text-gray-300">—</span>}</td>
                      {canEdit && <td className={`${tdCls} text-center`}>{x.id === latestId && !lead.order_id && <button onClick={() => setConfirm(x.id)} title="Remove this follow-up" aria-label="Remove latest follow-up" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Undo2 size={15} /></button>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {followUp && <FollowUpDialog lead={lead} onClose={() => setFollowUp(false)} onDone={(l) => { setFollowUp(false); fill(l); }} />}
      <ConfirmDialog open={confirm === 'delete'} title="Delete this lead?" message={isEdit ? `${lead.lead_no} will be removed.` : ''} onConfirm={del} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={typeof confirm === 'number'} title="Remove the latest follow-up?" message="The lead goes back to how it was before this follow-up." confirmLabel="Remove" onConfirm={() => undo(confirm)} onCancel={() => setConfirm(null)} />
    </div>
  );
}
