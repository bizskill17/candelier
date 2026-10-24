import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { itemsApi, imageUrl } from '../api/client';

// Shrinks a photo in the browser before upload (longest side max px, JPEG), so uploads stay small.
export async function shrinkImage(file, max = 1600, quality = 0.85) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 600 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', quality));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

// Full-size view of a photo.
export function PhotoViewer({ src, title, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4 print:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mb-2 flex w-full max-w-4xl items-center justify-between text-sm text-white">
        <span className="font-medium">{title}</span>
        <button onClick={onClose} aria-label="Close photo" className="rounded-md p-1.5 hover:bg-white/10"><X size={18} /></button>
      </div>
      <img src={src} alt={title} className="max-h-[82vh] max-w-full rounded-lg bg-white object-contain" />
    </div>,
    document.body
  );
}

// Small photo that opens full size when clicked. Prints as a normal image.
export function PhotoThumb({ path, title, className = 'h-14 w-14' }) {
  const [open, setOpen] = useState(false);
  if (!path) return null;
  const src = imageUrl(path);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title} className={`${className} shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white print:border-gray-400`}>
        <img src={src} alt={title} className="h-full w-full object-contain" loading="lazy" />
      </button>
      {open && <PhotoViewer src={src} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

// Photo box on the order form: add, view, change or remove one photo.
export function PhotoSlot({ id, label, value, onChange, disabled, error, compact }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('Choose a photo (JPG, PNG, WEBP).'); return; }
    setBusy(true);
    setErr('');
    try {
      const small = await shrinkImage(f);
      const r = await itemsApi.upload(small);
      onChange(r.data.path);
    } catch (x) {
      setErr(x.message);
    } finally { setBusy(false); }
  };

  const src = imageUrl(value);
  return (
    <div>
      {!compact && <div className="mb-1 text-xs font-medium text-gray-600">{label}</div>}
      <div title={compact ? label : undefined} className={`relative flex ${compact ? 'h-14 w-14' : 'h-24 w-full'} items-center justify-center overflow-hidden rounded-lg border ${error || err ? 'border-red-400' : 'border-dashed border-gray-300'} bg-gray-50`}>
        {value ? (
          <>
            <button type="button" onClick={() => setOpen(true)} className="h-full w-full" aria-label={`View ${label}`}>
              <img src={src} alt={label} className="h-full w-full object-contain" />
            </button>
            {!disabled && (
              <div className={`absolute flex gap-0.5 ${compact ? 'right-0 top-0' : 'right-1 top-1 gap-1'}`}>
                <button type="button" onClick={() => input.current?.click()} title="Change photo" aria-label={`Change ${label}`} className={`rounded-md bg-white/90 text-gray-700 shadow-sm hover:text-brand-600 ${compact ? 'hidden' : 'p-1'}`}><ImagePlus size={14} /></button>
                <button type="button" onClick={() => onChange('')} title="Remove photo" aria-label={`Remove ${label}`} className={`rounded-md bg-white/90 text-gray-700 shadow-sm hover:text-red-600 ${compact ? 'p-0.5' : 'p-1'}`}><X size={compact ? 11 : 14} /></button>
              </div>
            )}
          </>
        ) : disabled ? (
          <span className="px-1 text-center text-[10px] leading-tight text-gray-400">{compact ? '—' : 'No photo'}</span>
        ) : (
          <button id={id} type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={`Add ${label}`} className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-brand-600">
            <ImagePlus size={compact ? 15 : 18} />{compact ? <span className="text-[10px] leading-none">{label.split(' ')[0]}</span> : ' Add photo'}
          </button>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs text-gray-600"><Loader2 size={16} className="animate-spin" />{!compact && <span className="ml-1.5">Uploading…</span>}</div>}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} aria-label={`Upload ${label}`} />
      {(error || err) && <p className={`mt-1 text-xs text-red-600 ${compact ? 'max-w-[7rem]' : ''}`}>{error || err}</p>}
      {open && <PhotoViewer src={src} title={label} onClose={() => setOpen(false)} />}
    </div>
  );
}
