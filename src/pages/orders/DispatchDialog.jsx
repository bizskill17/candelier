import { useEffect, useState } from 'react';
import { api, ordersApi } from '../../api/client';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import SearchSelect from '../../components/SearchSelect';
import DateInput from '../../components/DateInput';
import { inputCls } from '../../components/table';
import { today } from '../../lib/util';

// Dispatch one order item (or edit / undo its dispatch).
//   item: { id, line_no, item_title, dispatch }   label: shown in the title
export default function DispatchDialog({ item, label, onClose, onDone }) {
  const toast = useToast();
  const d = item.dispatch;
  const [form, setForm] = useState({
    dispatch_date: d?.dispatch_date || today(), transporter_id: d?.transporter_id || '', vehicle_no: d?.vehicle_no || '', docket_no: d?.docket_no || '', remarks: d?.remarks || '',
  });
  const [transporters, setTransporters] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.lookup('transporters').then((r) => setTransporters(r.data)).catch(() => setTransporters([])); }, []);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const save = async () => {
    setBusy(true);
    try { const r = await ordersApi.dispatch(item.id, form); toast(r.message); onDone(r.data); }
    catch (e) { setErrors(e.fields || {}); if (!e.fields || !Object.keys(e.fields).length) toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    setBusy(true);
    try { const r = await ordersApi.undoDispatch(item.id); toast(r.message); onDone(r.data); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open wide title={`${d ? `Dispatch ${d.dispatch_no}` : 'Dispatch'} · ${label}`} onClose={onClose}
      footer={<>
        {d && <button onClick={undo} disabled={busy} className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Undo dispatch</button>}
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : d ? 'Save' : 'Dispatch'}</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="dp-date" className="mb-1 block text-sm font-medium text-gray-700">Dispatch Date <span className="text-red-500">*</span></label>
          <DateInput id="dp-date" max={today()} value={form.dispatch_date} onChange={(v) => set('dispatch_date', v)} error={errors.dispatch_date} />
          {errors.dispatch_date && <p className="mt-1 text-xs text-red-600">{errors.dispatch_date}</p>}
        </div>
        <div>
          <label htmlFor="dp-transporter" className="mb-1 block text-sm font-medium text-gray-700">Transporter</label>
          <SearchSelect id="dp-transporter" options={[{ value: '', label: 'None' }, ...(transporters || []).filter((t) => t.is_active || String(t.id) === String(form.transporter_id)).map((t) => ({ value: t.id, label: t.name }))]}
            value={form.transporter_id} onChange={(v) => set('transporter_id', v)} disabled={!transporters} placeholder="Select transporter" />
        </div>
        <div>
          <label htmlFor="dp-vehicle" className="mb-1 block text-sm font-medium text-gray-700">Vehicle No.</label>
          <input id="dp-vehicle" value={form.vehicle_no} onChange={(e) => set('vehicle_no', e.target.value.toUpperCase())} className={inputCls(errors.vehicle_no)} placeholder="AS01AB1234" />
        </div>
        <div>
          <label htmlFor="dp-docket" className="mb-1 block text-sm font-medium text-gray-700">Docket / LR No.</label>
          <input id="dp-docket" value={form.docket_no} onChange={(e) => set('docket_no', e.target.value)} className={inputCls(errors.docket_no)} />
        </div>
        <div className="col-span-2">
          <label htmlFor="dp-remarks" className="mb-1 block text-sm font-medium text-gray-700">Remarks</label>
          <textarea id="dp-remarks" rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls(errors.remarks)} />
        </div>
      </div>
    </Modal>
  );
}
