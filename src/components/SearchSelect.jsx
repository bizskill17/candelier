import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, X } from 'lucide-react';

// Searchable dropdown.
//   options:   [{ value, label, hint? }]   hint shows greyed on the right (e.g. a code or unit)
//   value:     selected value ('' for none)
//   onChange:  (value) => void
//   placeholder, error, disabled, id, clearable, className
export default function SearchSelect({
  id,
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  error,
  disabled,
  clearable,
  compact,
  className = '',
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const words = q.split(/\s+/);
    return options.filter((o) => {
      const text = `${o.label} ${o.hint || ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [options, query]);

  // Position the panel under (or above) the button, outside any scrolling container.
  const place = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 280 && r.top > spaceBelow;
    const width = Math.min(Math.max(r.width, 260), window.innerWidth - 16);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ left: Math.max(8, left), width, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = (e) => { if (!panelRef.current?.contains(e.target)) place(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      const i = options.findIndex((o) => String(o.value) === String(value));
      setActive(i >= 0 ? i : 0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const choose = (o) => {
    onChange(o.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); buttonRef.current?.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

  const onButtonKey = (e) => {
    if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
    else if (e.key.length === 1 && /\S/.test(e.key)) { setOpen(true); setTimeout(() => setQuery(e.key), 0); }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        ref={buttonRef}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        className={`flex ${compact ? 'min-h-[34px] px-2.5 py-1.5' : 'min-h-[38px] px-3 py-2'} w-full items-center gap-2 rounded-lg border bg-white text-left text-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 ${
          error ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
      >
        <span className={`min-w-0 flex-1 whitespace-normal break-words leading-snug ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
          {selected?.hint && <span className="block text-xs text-gray-400">{selected.hint}</span>}
        </span>
        {clearable && selected ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="-mr-1 shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={14} />
          </span>
        ) : (
          <ChevronDown size={16} className="shrink-0 text-gray-400" />
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          data-searchselect-panel=""
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="z-[70] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          onKeyDown={onKey}
        >
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search size={15} className="shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              aria-label="Search options"
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No match for “{query}”</li>}
            {filtered.map((o, i) => {
              const isSel = String(o.value) === String(value);
              return (
                <li
                  key={o.value === '' ? '__none' : o.value}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? 'bg-brand-50' : ''} ${o.value === '' ? 'text-gray-500' : 'text-gray-900'}`}
                >
                  <span className="min-w-0 flex-1 break-words leading-snug">{o.label}</span>
                  {o.hint && <span className="shrink-0 self-start pt-0.5 text-xs text-gray-400">{o.hint}</span>}
                  {isSel && <Check size={15} className="shrink-0 text-brand-600" />}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}
