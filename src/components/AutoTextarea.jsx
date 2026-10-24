import { useLayoutEffect, useRef } from 'react';

// Text box that wraps long text and grows taller as you type (used for line remarks).
export default function AutoTextarea({ value, onChange, className = '', ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`block resize-none overflow-hidden break-words leading-5 ${className}`}
      {...rest}
    />
  );
}
