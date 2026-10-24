// Centred dialog. Click outside or Cancel to close.
//   wide: false (small) | true (medium) | 'xl' (large)
export default function Modal({ open, title, children, footer, onClose, wide }) {
  if (!open) return null;
  const w = wide === 'xl' ? 'max-w-4xl' : wide ? 'max-w-lg' : 'max-w-sm';
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[90vh] w-full ${w} flex-col rounded-xl bg-white shadow-xl`}>
        <div className="border-b border-gray-200 px-5 py-3.5">
          <h2 className="font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm text-gray-700">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
