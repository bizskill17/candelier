import { useEffect, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from './Toast';
import Toggle from './Toggle';
import { useAuth } from '../auth/AuthContext';
import SearchSelect from './SearchSelect';

const inputCls = (err) =>
  `w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
    err ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-brand-500 focus:ring-brand-100'
  }`;

function emptyValues(fields) {
  const v = { is_active: true };
  fields.forEach((f) => { v[f.name] = ''; });
  return v;
}

// Loads dropdown options for every "lookup" field in this form. reload(ref) refreshes one list.
function useLookups(fields) {
  const [lookups, setLookups] = useState({});
  const load = (ref) => api.lookup(ref)
    .then((res) => setLookups((l) => ({ ...l, [ref]: res.data })))
    .catch(() => setLookups((l) => ({ ...l, [ref]: [] })));
  useEffect(() => {
    fields.filter((f) => f.type === 'lookup').forEach((f) => load(f.ref));
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps
  return [lookups, load];
}

export default function MasterForm({ entity, def, record, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(record);
  const { canEdit: canCorrect, canCreateMaster } = useAuth();
  const canEdit = record ? canCorrect : canCreateMaster(entity);
  const [values, setValues] = useState(() =>
    record ? { ...emptyValues(def.fields), ...nullsToEmpty(record) } : emptyValues(def.fields)
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lookups, reloadLookup] = useLookups(def.fields);
  const [quick, setQuick] = useState(null); // { field, name, error } : add a State etc. on the spot
  const quickAdd = async () => {
    try {
      const r = await api.create(quick.field.ref, { name: quick.name });
      await reloadLookup(quick.field.ref);
      set(quick.field.name, r.data.id);
      toast(r.message);
      setQuick(null);
    } catch (e) { setQuick((q) => ({ ...q, error: e.fields?.name || e.message })); }
  };
  const firstInput = useRef(null);

  useEffect(() => {
    firstInput.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const submit = async (addAnother) => {
    setSaving(true);
    setFormError('');
    try {
      const res = isEdit ? await api.update(entity, record.id, values) : await api.create(entity, values);
      toast(res.message);
      onSaved(res.data);
      if (addAnother) {
        setValues(emptyValues(def.fields));
        setErrors({});
        firstInput.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <form
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit(false); }}
        noValidate
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-5">
          <div>
            <h2 className="font-semibold text-gray-900">{!canEdit ? def.singular : isEdit ? `Edit ${def.singular}` : `New ${def.singular}`}</h2>
            {isEdit && !def.hideCode && <p className="font-mono text-xs text-gray-500">{record.code}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
          )}
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            {def.fields.map((f, i) => (
              <Field
                key={f.name}
                field={f}
                value={values[f.name]}
                error={errors[f.name]}
                options={f.type === 'lookup' ? lookupOptions(lookups[f.ref], values[f.name]) : null}
                onChange={(v) => set(f.name, v)}
                inputRef={i === 0 ? firstInput : undefined}
                isEdit={isEdit}
                onQuickAdd={f.quickAdd && canEdit ? () => setQuick({ field: f, name: '', error: '' }) : null}
              />
            ))}

            <div className="flex items-center gap-3 text-sm text-gray-700 sm:col-span-2">
              <Toggle id="f-is_active" checked={Boolean(values.is_active)} onChange={(v) => set('is_active', v)} label="Active" />
              <label htmlFor="f-is_active">Active</label>
            </div>
          </div>
        </div>

        {quick && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={(e) => { e.stopPropagation(); setQuick(null); }}>
            <div role="dialog" aria-label={`Add ${quick.field.label}`} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-3 font-semibold text-gray-900">Add {quick.field.label}</h3>
              <label htmlFor="quick-name" className="mb-1 block text-sm font-medium text-gray-700">{quick.field.label} name</label>
              <input id="quick-name" autoFocus value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value, error: '' })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); quickAdd(); } if (e.key === 'Escape') { e.stopPropagation(); setQuick(null); } }} className={inputCls(quick.error)} />
              {quick.error && <p className="mt-1 text-xs text-red-600">{quick.error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setQuick(null)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
                <button type="button" onClick={quickAdd} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          {canEdit && !isEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(true)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Save &amp; add another
            </button>
          )}
          {canEdit && <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>}
        </div>
      </form>
    </div>
  );
}

function nullsToEmpty(obj) {
  const out = {};
  Object.entries(obj).forEach(([k, v]) => { out[k] = v === null ? '' : v; });
  return out;
}

// Active options, plus the currently selected one even if it has been deactivated.
function lookupOptions(rows, current) {
  if (!rows) return null;
  return rows
    .filter((r) => r.is_active || String(r.id) === String(current))
    .map((r) => ({ value: r.id, label: r.is_active ? r.name : `${r.name} (inactive)` }));
}

function Field({ field: f, value, error, options, onChange, inputRef, isEdit, onQuickAdd }) {
  if (f.type === 'password' && isEdit) f = { ...f, help: 'Leave blank to keep the current password.' };
  const id = `f-${f.name}`;
  const common = {
    id,
    ref: inputRef,
    value: value ?? '',
    placeholder: f.placeholder,
    className: inputCls(error),
    'aria-invalid': Boolean(error),
    onChange: (e) => onChange(f.upper ? e.target.value.toUpperCase() : e.target.value),
  };

  let control;
  if (f.type === 'textarea') {
    control = <textarea rows={2} {...common} />;
  } else if (f.type === 'select' || f.type === 'lookup') {
    const opts = f.type === 'select' ? f.options.map((o) => ({ value: o, label: o })) : options;
    control = (
      <SearchSelect
        id={id}
        options={opts || []}
        value={value ?? ''}
        onChange={onChange}
        error={error}
        disabled={f.type === 'lookup' && !opts}
        placeholder={opts ? `Select ${f.label.toLowerCase()}` : 'Loading…'}
        clearable={!f.required}
        className={onQuickAdd ? 'min-w-0 flex-1' : ''}
      />
    );
    if (onQuickAdd) {
      control = (
        <div className="flex gap-1.5">
          {control}
          <button type="button" onClick={onQuickAdd} title={`Add a new ${f.label.toLowerCase()}`} aria-label={`Add a new ${f.label.toLowerCase()}`} className="shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button>
        </div>
      );
    }
    if (f.type === 'lookup' && opts && opts.length === 0 && !onQuickAdd) {
      f = { ...f, help: `No ${f.label.toLowerCase()} yet. Add one in its master first.` };
    }
  } else {
    const type = { email: 'email', phone: 'tel', mobile: 'tel', number: 'number', url: 'text', pincode: 'text', password: 'password' }[f.type] || 'text';
    const extra = f.type === 'password' ? { autoComplete: 'new-password' }
      : f.type === 'username' ? { autoCapitalize: 'none', autoComplete: 'off' }
      : f.type === 'number' ? { min: 0, step: 'any', inputMode: 'decimal' }
      : f.type === 'pincode' ? { inputMode: 'numeric', maxLength: 6 }
      : f.type === 'mobile' ? { inputMode: 'numeric', maxLength: 10, onChange: (e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10)) }
      : f.type === 'gstin' ? { maxLength: 15 }
      : {};
    control = <input type={type} {...common} {...extra} />;
  }

  return (
    <div className={f.full ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {f.label}{f.required && <span className="text-red-500"> *</span>}
      </label>
      {control}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : f.help ? (
        <p className="mt-1 text-xs text-gray-500">{f.help}</p>
      ) : null}
    </div>
  );
}
