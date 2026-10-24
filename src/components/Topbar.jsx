import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, LogOut, KeyRound, X } from 'lucide-react';
import { menu } from '../config/menu';
import { useAuth } from '../auth/AuthContext';
import { authApi } from '../api/client';
import { useToast } from './Toast';
import { inputCls } from './table';

export default function Topbar({ onOpenMobile }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const menuRef = useRef(null);

  const all = menu.flatMap((g) => g.items.map((i) => ({ ...i, heading: g.heading })));
  const current =
    all.find((i) => i.path !== '/' && pathname.startsWith(i.path)) ||
    all.find((i) => i.path === pathname) ||
    (pathname.startsWith('/orders') ? { heading: 'Orders', label: 'Order' }
      : pathname.startsWith('/boq') ? { heading: 'Orders', label: 'Order Item BOQ' }
        : pathname.startsWith('/leads') ? { heading: 'CRM', label: 'Lead' } : null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const initials = (user?.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:px-6">
      <button onClick={onOpenMobile} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Open menu">
        <Menu size={20} />
      </button>

      <div className="min-w-0 flex-1">
        {current?.heading && <div className="text-xs text-gray-500">{current.heading}</div>}
        <h1 className="truncate text-base font-semibold text-gray-900">{current?.label || 'Dashboard'}</h1>
      </div>

      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-gray-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{initials}</div>
          <div className="hidden text-left text-sm sm:block">
            <div className="font-medium text-gray-900">{user?.name}</div>
            <div className="text-xs text-gray-500">{user?.role}</div>
          </div>
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">Signed in as <span className="font-medium text-gray-900">{user?.username}</span></div>
            <button role="menuitem" onClick={() => { setMenuOpen(false); setPwOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
              <KeyRound size={15} /> Change password
            </button>
            <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </header>
  );
}

function ChangePassword({ onClose }) {
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
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </div>
  );
}
