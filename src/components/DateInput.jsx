import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { inputCls } from './table';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pad = (n) => String(n).padStart(2, '0');
const toStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => new Date().toLocaleDateString('en-CA');

// Date field with a calendar icon on the right. The icon opens our own calendar (works in every
// browser and inside embedded pages); the date can also be typed. Value is YYYY-MM-DD.
export default function DateInput({ id, value, onChange, min, max, disabled, error, compact, small, className = '', 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthOf(value));
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  function monthOf(v) {
    const s = v || todayStr();
    return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 };
  }

  const place = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = 280;
    const h = 330;
    const up = window.innerHeight - r.bottom < h + 8 && r.top > h;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    setPos({ left, top: up ? r.top - h - 4 : r.bottom + 4, width: w });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = (e) => { if (!panelRef.current?.contains(e.target)) place(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (!open) setView(monthOf(value));
    setOpen((o) => !o);
  };
  const choose = (s) => { onChange(s); setOpen(false); };
  const shift = (n) => setView(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const allowed = (s) => (!min || s >= min) && (!max || s <= max);

  // Calendar grid (weeks start on Monday)
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const today = todayStr();

  const base = compact
    ? 'w-[8.75rem] bg-transparent py-2 pl-1 pr-8 text-sm text-gray-900 focus:outline-none'
    : `${small ? inputCls(error).replace('px-3 py-2', 'px-2.5 py-1.5') : inputCls(error)} pr-10`;

  return (
    <div ref={wrapRef} className={`relative ${compact ? 'inline-flex' : ''} ${className}`}>
      <input
        id={id}
        type="date"
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        value={value || ''}
        min={min || undefined}
        max={max || undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`date-input ${base}`}
      />
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label="Open calendar"
        aria-expanded={open}
        className={`absolute inset-y-0 right-0 flex items-center text-gray-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:hover:text-gray-400 ${compact ? 'pr-1.5' : 'pr-3'}`}
      >
        <Calendar size={16} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a date"
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width }}
          className="z-[70] rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"><ChevronLeft size={16} /></button>
            <div className="text-sm font-semibold text-gray-900">{MONTHS[view.m]} {view.y}</div>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {DAYS.map((d) => <div key={d} className="py-1 font-medium text-gray-400">{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const s = toStr(view.y, view.m, d);
              const ok = allowed(s);
              const sel = s === value;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!ok}
                  onClick={() => choose(s)}
                  aria-label={s}
                  aria-pressed={sel}
                  className={`h-8 rounded-md text-sm tabular-nums ${
                    sel ? 'bg-brand-600 font-semibold text-white'
                      : s === today ? 'font-semibold text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50'
                      : ok ? 'text-gray-800 hover:bg-brand-50' : 'cursor-not-allowed text-gray-300'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
            <button type="button" onClick={() => choose('')} className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">Clear</button>
            <button type="button" disabled={!allowed(today)} onClick={() => choose(today)} className="rounded-md px-2 py-1 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:text-gray-300">Today</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
