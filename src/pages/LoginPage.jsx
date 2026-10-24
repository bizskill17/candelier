import { useState } from 'react';
import { authApi } from '../api/client';

const inputCls = (err) =>
  `w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
    err ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-brand-500 focus:ring-brand-100'
  }`;

export default function LoginPage({ needsSetup, loadError, onRetry, onSignedIn }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    if (needsSetup && form.password !== form.confirm) {
      setErrors({ confirm: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      const r = needsSetup
        ? await authApi.setup({ name: form.name, username: form.username, password: form.password })
        : await authApi.login({ username: form.username, password: form.password });
      onSignedIn(r.user);
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">C</div>
          <div>
            <div className="text-lg font-semibold text-gray-900">Candelier</div>
            <div className="text-sm text-gray-500">Management System</div>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-base font-semibold text-gray-900">{needsSetup ? 'Create the administrator account' : 'Sign in'}</h1>
            {needsSetup && <p className="mt-1 text-sm text-gray-500">This is the first sign-in. The account you create here can add everyone else.</p>}
          </div>

          {loadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError} <button type="button" onClick={onRetry} className="font-medium underline">Try again</button>
            </div>
          )}
          {message && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>}

          {needsSetup && (
            <Field id="l-name" label="Your name" error={errors.name}>
              <input id="l-name" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls(errors.name)} autoComplete="name" />
            </Field>
          )}
          <Field id="l-username" label="Username" error={errors.username}>
            <input id="l-username" value={form.username} onChange={(e) => set('username', e.target.value)} className={inputCls(errors.username)} autoComplete="username" autoCapitalize="none" autoFocus />
          </Field>
          <Field id="l-password" label="Password" error={errors.password}>
            <input id="l-password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} className={inputCls(errors.password)} autoComplete={needsSetup ? 'new-password' : 'current-password'} />
          </Field>
          {needsSetup && (
            <Field id="l-confirm" label="Repeat password" error={errors.confirm}>
              <input id="l-confirm" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} className={inputCls(errors.confirm)} autoComplete="new-password" />
            </Field>
          )}

          <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {busy ? 'Please wait…' : needsSetup ? 'Create account and sign in' : 'Sign in'}
          </button>
        </form>
        {!needsSetup && <p className="mt-4 text-center text-xs text-gray-500">Forgot your password? Ask an administrator to set a new one in Users.</p>}
      </div>
    </div>
  );
}

function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
