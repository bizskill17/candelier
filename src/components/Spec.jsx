import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Check } from 'lucide-react';
import { useCatalog, normValue } from '../lib/catalog';
import { materialsApi } from '../api/client';
import SearchSelect from './SearchSelect';
import { fmtQty } from '../lib/util';

// Text box with suggestions from values used before. Free typing is always allowed.
export function SuggestInput({ id, label, value, onChange, suggestions, onEnter, inputRef, autoFocus, placeholder, disabled, error, 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = normValue(value).toLowerCase();
  const list = (suggestions || []).filter((s) => !q || (s.toLowerCase().includes(q) && s.toLowerCase() !== q)).slice(0, 8);

  const pick = (s) => { onChange(s); setOpen(false); setActive(-1); };
  return (
    <div className="relative min-w-0">
      {label && <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>}
      <input
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        ref={inputRef}
        autoFocus={autoFocus}
        autoComplete="off"
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && list.length) { e.preventDefault(); setOpen(true); setActive((a) => Math.min(list.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp' && list.length) { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && active >= 0 && list[active]) pick(list[active]); else onEnter?.();
          } else if (e.key === 'Escape' && open && list.length) { e.stopPropagation(); setOpen(false); }
        }}
        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-700 ${error ? 'border-red-400' : 'border-gray-300'}`}
      />
      {open && !disabled && list.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {list.map((s, i) => (
            <li key={s} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className={`cursor-pointer px-2.5 py-1.5 ${i === active ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'}`}>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The box that opens under a material's specification cell: one input per specification field.
function SpecBox({ materialId, values, onChange, onClose, anchor, orderItemId }) {
  const cat = useCatalog();
  const m = cat.material(materialId);
  const fields = m?.fields || [];
  const panelRef = useRef(null);
  const inputs = useRef([]);
  const original = useRef(values);
  const [pos, setPos] = useState(null);
  const [stock, setStock] = useState(null);
  const variant = cat.findVariant(materialId, values);

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const width = Math.min(Math.max(320, fields.length * 170 + 32), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const h = panelRef.current?.offsetHeight || 220;
      const below = r.bottom + 6;
      const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below;
      setPos({ top, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, fields.length]);

  useEffect(() => {
    const onDown = (e) => { if (!panelRef.current?.contains(e.target) && !anchor.contains(e.target) && !e.target.closest?.('[data-searchselect-panel]')) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { onChange(original.current); onClose(); } };
    // capture phase: decide before React re-renders the suggestion list
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [anchor, onClose, onChange]);

  // Live stock for the exact specification
  useEffect(() => {
    if (!variant) { setStock(null); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      materialsApi.stats([variant.id], orderItemId).then((r) => { if (alive) setStock(r.data[variant.id]); }).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [variant?.id, orderItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return null;
  const existing = cat.variantsOf(materialId).map((v) => ({ value: v.id, label: v.spec_text || '(no values)' }));

  return createPortal(
    <div ref={panelRef} role="dialog" aria-label={`${m.name} specification`} style={pos ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : { position: 'fixed', visibility: 'hidden' }}
      className="z-50 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{m.name}</h3>
        {existing.length > 0 && (
          <SearchSelect
            aria-label="Pick an existing specification"
            className="w-60"
            options={existing}
            value={variant?.id || ''}
            onChange={(vid) => { const v = cat.variants.find((x) => String(x.id) === String(vid)); if (v) onChange({ ...v.values }); }}
            placeholder="Pick an existing one…"
          />
        )}
      </div>
      {fields.length === 0 ? (
        <p className="text-sm text-gray-500">{m.name} has no specification fields. Add them in Materials if needed.</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(fields.length, Math.max(1, Math.floor((pos?.width || 320) / 150)))}, minmax(0, 1fr))` }}>
          {fields.map((f, i) => (
            <SuggestInput
              key={f.id}
              id={`spec-${materialId}-${f.id}`}
              label={f.name}
              autoFocus={i === 0}
              inputRef={(el) => { inputs.current[i] = el; }}
              value={values?.[f.id] || ''}
              onChange={(v) => onChange({ ...values, [f.id]: v })}
              suggestions={cat.suggestions(materialId, f.id)}
              onEnter={() => (i < fields.length - 1 ? inputs.current[i + 1]?.focus() : onClose())}
            />
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm">
        <span className="text-gray-600">
          {!cat.hasValues(values) && fields.length ? 'Fill the values above.'
            : variant ? (stock ? <>In stock: <b className="tabular-nums text-gray-900">{fmtQty(stock.in_stock)} {m.unit}</b> · Available to book: <b className="tabular-nums text-gray-900">{fmtQty(stock.available)}</b></> : 'Checking stock…')
              : <span className="text-amber-700">New specification: no stock yet</span>}
        </span>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"><Check size={14} /> Done</button>
      </div>
    </div>,
    document.body
  );
}

// The specification cell: shows the joined values; click to fill or change them.
export function SpecCell({ materialId, values, onChange, readOnly, error, showMaterial, orderItemId, id }) {
  const cat = useCatalog();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const m = cat.material(materialId);
  const text = materialId ? cat.textOf(materialId, values) : '';
  const name = showMaterial && m ? <span className="font-semibold text-gray-900">{m.name}</span> : null;

  if (readOnly || !materialId) {
    return (
      <div className="px-1 py-1.5 text-sm">
        {name}{name && text ? <span className="text-gray-400"> · </span> : null}
        {text ? <span className="text-gray-800">{text}</span> : !name && <span className="text-gray-300">—</span>}
      </div>
    );
  }
  return (
    <>
      <button
        id={id}
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`group flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm ${error ? 'border-red-400 bg-red-50/40' : open ? 'border-brand-500 ring-2 ring-brand-100' : 'border-gray-200 hover:border-brand-500'} bg-white`}
      >
        <span className="min-w-0 flex-1 break-words">
          {name}{name && <span className="text-gray-400"> · </span>}
          {text ? <span className="text-gray-800">{text}</span> : <span className="text-gray-400">{m?.fields.length ? 'Fill specification' : 'No specification fields'}</span>}
        </span>
        <Pencil size={13} className="mt-0.5 shrink-0 text-gray-400 group-hover:text-brand-600" />
      </button>
      {open && ref.current && <SpecBox materialId={materialId} values={values || {}} onChange={onChange} onClose={() => setOpen(false)} anchor={ref.current} orderItemId={orderItemId} />}
    </>
  );
}
