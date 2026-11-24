import { useState } from 'react';
import { X } from 'lucide-react';
import { authApi } from '../api/client';
import { useToast } from './Toast';
import { inputCls } from './table';

export default function ChangePassword({ onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', new: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (form.new !== form.confirm) { setErrors({ confirm: 'The two passwords do not match.' }); return; }
    setBusy(true);
    try {
      const r = await authApi.changePassword({ current: form.current, new: form.new });
      toast(r.message);
      onClose();
    } catch (err) {
      setErrors(err.fields || { current: err.message });
    } finally {
      setBusy(false);
    }
  };
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={save} noValidate className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Change password</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {[['current', 'Current password', 'current-password'], ['new', 'New password', 'new-password'], ['confirm', 'Repeat new password', 'new-password']].map(([k, label, ac]) => (
            <div key={k}>
              <label htmlFor={`pw-${k}`} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <input id={`pw-${k}`} type="password" autoComplete={ac} value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputCls(errors[k])} />
              {errors[k] && <p className="mt-1 text-xs text-red-600">{errors[k]}</p>}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-dismiss px-3 py-2">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </div>
  );
}
