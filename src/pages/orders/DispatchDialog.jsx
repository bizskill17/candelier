import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { DrawingViewer } from '../../components/Drawing';
import { api, ordersApi, itemsApi } from '../../api/client';
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
  const { user } = useAuth();
  const d = item.dispatch;
  const [form, setForm] = useState({
    dispatch_by: d?.dispatch_by || user?.name || '', dispatch_document: d?.dispatch_document || '', dispatch_document_name: d?.dispatch_document_name || '',
    dispatch_date: d?.dispatch_date || today(), transporter_id: d?.transporter_id || '', vehicle_no: d?.vehicle_no || '', docket_no: d?.docket_no || '', remarks: d?.remarks || '',
  });
  const [transporters, setTransporters] = useState(null);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [viewDocument, setViewDocument] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTransporter, setNewTransporter] = useState({ name: '', phone: '' });
  const [transporterError, setTransporterError] = useState('');
  const [addingBusy, setAddingBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.lookup('transporters').then((r) => setTransporters(r.data)).catch(() => setTransporters([])); }, []);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const addTransporter = async () => {
    setAddingBusy(true); setTransporterError('');
    try {
      const r = await api.create('transporters', newTransporter);
      setTransporters((prev) => [...(prev || []), r.data]);
      set('transporter_id', r.data.id); setAdding(false); setNewTransporter({ name: '', phone: '' }); toast(r.message);
    } catch (e) { setTransporterError(e.fields?.name || e.fields?.phone || e.message); }
    finally { setAddingBusy(false); }
  };
  const uploadDocument = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setErrors((prev) => ({ ...prev, dispatch_document: 'Use a document under 25 MB.' })); return; }
    setUploading(true); setErrors((prev) => ({ ...prev, dispatch_document: undefined }));
    try {
      const r = await itemsApi.upload(file, 'drawing');
      setForm((prev) => ({ ...prev, dispatch_document: r.data.path, dispatch_document_name: r.data.name || file.name }));
    } catch (e) { setErrors((prev) => ({ ...prev, dispatch_document: e.message })); }
    finally { setUploading(false); }
  };
  const save = async () => {
    if (uploading || addingBusy || busy) return;
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
    <Modal open wide title="Dispatch Form" onClose={onClose}
      footer={<>
        {d && <button onClick={undo} disabled={busy || uploading || addingBusy} className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Undo dispatch</button>}
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
        <button onClick={save} disabled={busy || uploading || addingBusy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : d ? 'Save' : 'Dispatch'}</button>
      </>}>
      <div className="mb-4 space-y-1 rounded-lg bg-gray-50 p-3">
        <p className="text-sm"><span className="font-medium">Client Name:</span> {item.customer_name || '—'}</p>
        <p className="break-words text-xs text-gray-500">{d?.dispatch_no && `${d.dispatch_no} · `}{label}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="dp-date" className="mb-1 block text-sm font-medium text-gray-700">Dispatch Date <span className="text-red-500">*</span></label>
          <DateInput id="dp-date" max={today()} value={form.dispatch_date} onChange={(v) => set('dispatch_date', v)} error={errors.dispatch_date} />
          {errors.dispatch_date && <p className="mt-1 text-xs text-red-600">{errors.dispatch_date}</p>}
        </div>
        <div>
          <label htmlFor="dp-transporter" className="mb-1 block text-sm font-medium text-gray-700">Transporter</label>
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><SearchSelect id="dp-transporter" options={[{ value: '', label: 'None' }, ...(transporters || []).filter((t) => t.is_active || String(t.id) === String(form.transporter_id)).map((t) => ({ value: t.id, label: t.name }))]}
            value={form.transporter_id} onChange={(v) => set('transporter_id', v)} disabled={!transporters || busy || addingBusy} placeholder="Select transporter" /></div>
          <button type="button" aria-label="Add transporter" title="Add transporter" onClick={() => setAdding((v) => !v)} disabled={busy || addingBusy} className="rounded-lg border border-gray-300 p-2.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button></div>
          {adding && <div className="mt-2 space-y-2 rounded-lg border border-gray-200 p-2">
            <label className="block text-xs font-medium">Transporter Name<input aria-label="New transporter name" value={newTransporter.name} onChange={(e) => setNewTransporter((v) => ({ ...v, name: e.target.value }))} className={inputCls(false)} /></label>
            <label className="block text-xs font-medium">Phone<input aria-label="New transporter phone" value={newTransporter.phone} onChange={(e) => setNewTransporter((v) => ({ ...v, phone: e.target.value }))} className={inputCls(false)} /></label>
            {transporterError && <p role="alert" className="text-xs text-red-600">{transporterError}</p>}
            <div className="flex gap-2"><button type="button" disabled={addingBusy} onClick={addTransporter} className="rounded bg-brand-600 px-2 py-1 text-xs text-white">{addingBusy ? 'Saving…' : 'Save Transporter'}</button><button type="button" disabled={addingBusy} onClick={() => setAdding(false)} className="text-xs text-gray-600">Cancel add</button></div>
          </div>}
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
          <label htmlFor="dp-by" className="mb-1 block text-sm font-medium text-gray-700">Dispatch By</label>
          <input id="dp-by" maxLength={100} value={form.dispatch_by} onChange={(e) => set('dispatch_by', e.target.value)} className={inputCls(errors.dispatch_by)} />
          {errors.dispatch_by && <p className="mt-1 text-xs text-red-600">{errors.dispatch_by}</p>}
        </div>
        <div className="col-span-2">
          <label htmlFor="dp-document" className="mb-1 block text-sm font-medium text-gray-700">Dispatch Document</label>
          {form.dispatch_document && <div className="mb-2 flex items-center justify-between gap-2"><button type="button" onClick={() => setViewDocument(true)} className="truncate text-brand-600 underline">{form.dispatch_document_name || 'View document'}</button><button type="button" disabled={busy || uploading} onClick={() => setForm((prev) => ({ ...prev, dispatch_document: '', dispatch_document_name: '' }))} className="text-xs text-red-600">Remove document</button></div>}
          <input id="dp-document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={uploadDocument} className="block w-full text-sm" />
          <p className="mt-1 text-xs text-gray-500">{uploading ? 'Uploading…' : 'PDF, JPG, PNG or WEBP · up to 25 MB'}</p>
          {errors.dispatch_document && <p className="mt-1 text-xs text-red-600">{errors.dispatch_document}</p>}
        </div>
        <div className="col-span-2">
          <label htmlFor="dp-remarks" className="mb-1 block text-sm font-medium text-gray-700">Remarks</label>
          <textarea id="dp-remarks" rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls(errors.remarks)} />
        </div>
      </div>
      {viewDocument && <DrawingViewer path={form.dispatch_document} name={form.dispatch_document_name} title="Dispatch Document" onClose={() => setViewDocument(false)} />}
    </Modal>
  );
}
