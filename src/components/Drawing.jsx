import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FileUp, X, Loader2, ExternalLink, Download } from 'lucide-react';
import { itemsApi, imageUrl } from '../api/client';

const isPdf = (path, name) => {
  if (!path) return false;
  if (path.startsWith('data:')) return path.startsWith('data:application/pdf');
  if (path.startsWith('blob:')) return /\.pdf$/i.test(name || '');
  return /\.pdf$/i.test(path);
};

// A data: address can't be opened in a new tab or frame by browsers; turn it into a blob: address.
function useViewUrl(path) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!path) { setUrl(''); return undefined; }
    if (!path.startsWith('data:')) { setUrl(imageUrl(path)); return undefined; }
    let u = '';
    fetch(path).then((r) => r.blob()).then((b) => { u = URL.createObjectURL(b); setUrl(u); }).catch(() => setUrl(path));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [path]);
  return url;
}

// Full-screen view of a drawing (PDF or image), with open-in-new-tab and download.
export function DrawingViewer({ path, name, title, onClose }) {
  const url = useViewUrl(path);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const pdf = isPdf(path, name);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title || name} className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 print:hidden sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-auto mb-2 flex w-full max-w-6xl items-center gap-2 text-sm text-white">
        <FileText size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">{title ? `${title} · ` : ''}{name || 'Drawing'}</span>
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10"><ExternalLink size={14} /> Open in new tab</a>}
        {url && <a href={url} download={name || 'drawing'} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10"><Download size={14} /> Download</a>}
        <button onClick={onClose} aria-label="Close drawing" className="rounded-md p-1.5 hover:bg-white/10"><X size={18} /></button>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 overflow-hidden rounded-lg bg-white">
        {!url ? <div className="flex h-full items-center justify-center text-sm text-gray-500"><Loader2 size={16} className="mr-2 animate-spin" /> Opening…</div>
          : pdf ? <iframe title={name || 'Drawing'} src={url} className="h-full w-full" />
            : <div className="flex h-full items-center justify-center overflow-auto"><img src={url} alt={name || 'Drawing'} className="max-h-full max-w-full object-contain" /></div>}
      </div>
    </div>,
    document.body
  );
}

// Button that opens the drawing (lists and BOQ). Prints as "Drawing: name".
export function DrawingLink({ path, name, title, compact }) {
  const [open, setOpen] = useState(false);
  if (!path) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={name || 'Drawing'}
        className={`inline-flex max-w-full items-center gap-1 rounded-lg border border-gray-300 bg-white font-medium text-gray-800 hover:bg-gray-50 print:border-0 print:p-0 ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-2 text-sm'}`}>
        <FileText size={compact ? 13 : 15} className="shrink-0 text-red-600 print:hidden" />
        <span className="truncate">{compact ? 'Drawing' : `Drawing${name ? `: ${name}` : ''}`}</span>
      </button>
      {open && <DrawingViewer path={path} name={name} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

// Drawing box on the order form: upload, view, replace or remove the item's drawing.
export function DrawingSlot({ id, path, name, onChange, disabled, error, title }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setErr('Use a file under 25 MB.'); return; }
    setBusy(true);
    setErr('');
    try {
      const r = await itemsApi.upload(f, 'drawing');
      onChange(r.data.path, r.data.name || f.name);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="min-w-0">
      {path ? (
        <div className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${error ? 'border-red-400' : 'border-gray-200'} bg-white`}>
          <button type="button" onClick={() => setOpen(true)} title={name} className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium text-gray-800 hover:text-brand-600">
            <FileText size={14} className="shrink-0 text-red-600" /><span className="truncate">{name || 'Drawing'}</span>
          </button>
          {!disabled && <>
            <button type="button" onClick={() => input.current?.click()} title="Replace drawing" aria-label="Replace drawing" className="rounded p-0.5 text-gray-400 hover:text-brand-600"><FileUp size={13} /></button>
            <button type="button" onClick={() => onChange('', '')} title="Remove drawing" aria-label="Remove drawing" className="rounded p-0.5 text-gray-400 hover:text-red-600"><X size={13} /></button>
          </>}
        </div>
      ) : disabled ? <span className="text-xs text-gray-300">—</span> : (
        <button id={id} type="button" onClick={() => input.current?.click()} disabled={busy}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-brand-600 ${error || err ? 'border-red-400' : 'border-gray-300'}`}>
          {busy ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><FileUp size={14} /> Upload drawing</>}
        </button>
      )}
      {busy && path && <p className="mt-1 text-xs text-gray-500">Uploading…</p>}
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={pick} aria-label="Upload drawing file" />
      {(error || err) && <p className="mt-1 text-xs text-red-600">{error || err}</p>}
      {open && <DrawingViewer path={path} name={name} title={title} onClose={() => setOpen(false)} />}
    </div>
  );
}
