import { useState } from 'react';
import { drawingApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DrawingSlot } from '../../components/Drawing';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';

export default function DrawingAction({ item, orderNo = item.order_no, onSaved, disabled = false }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(null);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canEdit = !item.drawing_file || isAdmin;
  const target = [orderNo && `Order ${orderNo}`, `Item #${item.line_no}`].filter(Boolean).join(' · ');
  const canSave = canEdit && path && path !== item.drawing_file && !uploading && !saving;

  function openDrawing() {
    setPath(item.drawing_file || '');
    setName(item.drawing_name || '');
    setError('');
    setStep('preview');
  }

  async function save() {
    if (step !== 'confirm' || !canSave) return;
    setSaving(true);
    setError('');
    try {
      await drawingApi.save(item.id, { drawing_file: path, drawing_name: name });
      toast('Drawing saved');
      setStep(null);
      onSaved?.();
    } catch (e) {
      setError(e.message);
      setStep('preview');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" disabled={disabled} onClick={openDrawing} className="rounded border px-2 py-1 text-xs text-brand-700">
        {item.drawing_file ? 'View Drawing' : 'Upload Drawing'}
      </button>
      {step === 'preview' && (
        <Modal open wide={path ? 'xl' : true} title={`Drawing · ${target}`}
          onClose={() => { if (!uploading) setStep(null); }}
          footer={<>
            <button type="button" disabled={uploading} onClick={() => setStep(null)} className="btn-dismiss px-3 py-2">Close</button>
            {canEdit && <button type="button" disabled={!canSave} onClick={() => setStep('confirm')}
              className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-40">Save Drawing</button>}
          </>}>
          <DrawingSlot path={path} name={name} disabled={!canEdit} preview onBusyChange={setUploading}
            onChange={(filePath, fileName) => { setPath(filePath); setName(fileName); setError(''); }} />
          {error && <p role="alert" className="mt-3 text-red-600">{error}</p>}
        </Modal>
      )}
      {step === 'confirm' && (
        <Modal open title="Save this drawing?" onClose={() => { if (!saving) setStep('preview'); }}
          footer={<>
            <button type="button" disabled={saving} onClick={() => setStep('preview')} className="btn-dismiss px-3 py-2">Cancel</button>
            <button type="button" disabled={saving} onClick={save} className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-40">
              {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
          </>}>
          <p>Are you sure you want to attach <strong>{name || 'this drawing'}</strong> to <strong>{target}</strong>?</p>
        </Modal>
      )}
    </>
  );
}
