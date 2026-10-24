import { useEffect, useState } from 'react';
import { crmApi, ordersApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import SearchSelect from '../../components/SearchSelect';
import DateInput from '../../components/DateInput';
import { inputCls } from '../../components/table';
import { today, addDays } from '../../lib/util';

const STATUSES = ['Follow Up Again', 'Success', 'Fail'];
const STATUS_STYLE = {
  'Follow Up Again': 'border-amber-400 bg-amber-50 text-amber-800',
  Success: 'border-green-500 bg-green-50 text-green-800',
  Fail: 'border-gray-400 bg-gray-100 text-gray-800',
};

// Follow Up form for one lead.
//   lead: { id, lead_no, display_name }   onDone(lead) after saving
export default function FollowUpDialog({ lead, onClose, onDone }) {
  const toast = useToast();
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [f, setF] = useState({ followup_date: today(), status: '', next_date: '', next_time: '', followup_by: user?.id || '', remarks: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { ordersApi.users().then((r) => setUsers(r.data)).catch(() => setUsers([])); }, []);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f };
      if (body.status !== 'Follow Up Again') { body.next_date = ''; body.next_time = ''; }
      const r = await crmApi.followUp(lead.id, body);
      toast(r.message);
      onDone(r.data);
    } catch (e) {
      setErrors(e.fields || {});
      if (!e.fields || !Object.keys(e.fields).length) toast(e.message, 'error');
    } finally { setSaving(false); }
  };

  const userOpts = (users || []).filter((u) => u.is_active || String(u.id) === String(f.followup_by)).map((u) => ({ value: u.id, label: u.name }));
  const lbl = 'mb-1 block text-sm font-medium text-gray-700';
  return (
    <Modal open wide title={`Follow Up · ${lead.lead_no} · ${lead.display_name}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
        <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="fu-date" className={lbl}>Follow Up Date <span className="text-red-500">*</span></label>
            <DateInput id="fu-date" max={today()} value={f.followup_date} onChange={(v) => set('followup_date', v)} error={errors.followup_date} />
            {errors.followup_date && <p className="mt-1 text-xs text-red-600">{errors.followup_date}</p>}
          </div>
          <div>
            <label htmlFor="fu-by" className={lbl}>Follow Up By <span className="text-red-500">*</span></label>
            <SearchSelect id="fu-by" options={userOpts} value={f.followup_by} onChange={(v) => set('followup_by', v)} error={errors.followup_by} disabled={!users} placeholder={users ? 'Select user' : 'Loading…'} />
            {errors.followup_by && <p className="mt-1 text-xs text-red-600">{errors.followup_by}</p>}
          </div>
        </div>
        <div>
          <div className={lbl}>Status <span className="text-red-500">*</span></div>
          <div role="radiogroup" aria-label="Status" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {STATUSES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={f.status === s} onClick={() => set('status', s)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${f.status === s ? STATUS_STYLE[s] : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>{s}</button>
            ))}
          </div>
          {errors.status && <p className="mt-1 text-xs text-red-600">{errors.status}</p>}
        </div>
        {f.status === 'Follow Up Again' && (
          <div className="grid grid-cols-1 gap-3 rounded-lg bg-amber-50/60 p-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fu-next" className={lbl}>Next Follow Up Date <span className="text-red-500">*</span></label>
              <DateInput id="fu-next" min={f.followup_date || today()} value={f.next_date} onChange={(v) => set('next_date', v)} error={errors.next_date} />
              {errors.next_date && <p className="mt-1 text-xs text-red-600">{errors.next_date}</p>}
              <div className="mt-1.5 flex gap-1.5">
                {[['Tomorrow', 1], ['3 days', 3], ['1 week', 7]].map(([l, n]) => (
                  <button key={l} type="button" onClick={() => set('next_date', addDays(today(), n))} className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50">{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="fu-time" className={lbl}>Time <span className="font-normal text-gray-400">(optional)</span></label>
              <input id="fu-time" type="time" value={f.next_time} onChange={(e) => set('next_time', e.target.value)} className={inputCls(errors.next_time)} />
              {errors.next_time && <p className="mt-1 text-xs text-red-600">{errors.next_time}</p>}
            </div>
          </div>
        )}
        {f.status === 'Fail' && <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">The lead will be closed as Fail and no longer come up for follow-up.</p>}
        <div>
          <label htmlFor="fu-remarks" className={lbl}>Remarks</label>
          <textarea id="fu-remarks" rows={3} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls(errors.remarks)} placeholder="What was discussed" />
          {errors.remarks && <p className="mt-1 text-xs text-red-600">{errors.remarks}</p>}
        </div>
      </div>
    </Modal>
  );
}
