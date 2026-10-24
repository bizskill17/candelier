import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Check } from 'lucide-react';
import { SuggestInput } from './Spec';

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

// Order item details joined in field order, each with its label: "Size: 6.5 ft X 6.5 ft X 2.5 ft · Glass Colour: Amber"
export const itemText = (fields, values) => fields.filter((f) => norm(values?.[f.id])).map((f) => `${f.name}: ${norm(values[f.id])}`).join(' · ');

// Box under the cell: one input per item field, with suggestions from earlier orders.
function ItemSpecBox({ fields, values, suggestions, onChange, onClose, anchor, title }) {
  const panelRef = useRef(null);
  const inputs = useRef([]);
  const original = useRef(values);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const width = Math.min(Math.max(340, Math.min(fields.length, 4) * 180 + 32), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const h = panelRef.current?.offsetHeight || 260;
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
    const onDown = (e) => { if (!panelRef.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { onChange(original.current); onClose(); } };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [anchor, onClose, onChange]);

  const cols = Math.min(fields.length || 1, Math.max(1, Math.floor((pos?.width || 340) / 170)));
  return createPortal(
    <div ref={panelRef} role="dialog" aria-label={title} style={pos ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : { position: 'fixed', visibility: 'hidden' }}
      className="z-50 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {fields.length === 0 ? (
        <p className="text-sm text-gray-500">No item fields yet. Add them in Masters → Item Fields.</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {fields.map((f, i) => (
            <SuggestInput key={f.id} id={`item-spec-${f.id}`} label={f.name} autoFocus={i === 0}
              inputRef={(el) => { inputs.current[i] = el; }}
              value={values?.[f.id] || ''}
              onChange={(v) => onChange({ ...values, [f.id]: v })}
              suggestions={suggestions[f.id]}
              onEnter={() => (i < fields.length - 1 ? inputs.current[i + 1]?.focus() : onClose())} />
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm">
        <span className="min-w-0 truncate text-gray-600">{itemText(fields, values) || 'Fill the details above.'}</span>
        <button type="button" onClick={onClose} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"><Check size={14} /> Done</button>
      </div>
    </div>,
    document.body
  );
}

// The order item cell: shows the joined details; click to fill or change them.
export default function ItemSpecCell({ id, fields, values, suggestions, onChange, readOnly, error, title = 'Order item' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const text = itemText(fields, values);
  if (readOnly) return <div className="px-1 py-1.5 text-sm text-gray-900">{text ? fields.filter((f) => norm(values?.[f.id])).map((f) => <div key={f.id}><b className="font-semibold">{f.name}:</b> <span className="text-gray-700">{norm(values[f.id])}</span></div>) : <span className="text-gray-300">—</span>}</div>;
  return (
    <>
      <button id={id} ref={ref} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`group flex w-full items-start gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-sm ${error ? 'border-red-400 bg-red-50/40' : open ? 'border-brand-500 ring-2 ring-brand-100' : 'border-gray-200 hover:border-brand-500'}`}>
        <span className="min-w-0 flex-1 break-words">{text ? <span className="block space-y-0.5">{fields.filter((f) => norm(values?.[f.id])).map((f) => <span key={f.id} className="block"><b className="font-semibold text-gray-900">{f.name}:</b> <span className="text-gray-700">{norm(values[f.id])}</span></span>)}</span> : <span className="text-gray-400">Fill item details</span>}</span>
        <Pencil size={13} className="mt-0.5 shrink-0 text-gray-400 group-hover:text-brand-600" />
      </button>
      {open && ref.current && <ItemSpecBox fields={fields} values={values || {}} suggestions={suggestions || {}} onChange={onChange} onClose={() => setOpen(false)} anchor={ref.current} title={title} />}
    </>
  );
}
