import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 20;

export function usePagination(rows, resetKey = '') {
  const [requestedPage, setPage] = useState(1);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { setPage((current) => Math.min(current, pages)); }, [pages]);
  return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, total, setPage };
}

export default function Pagination({ page, pages, total, setPage }) {
  if (total <= PAGE_SIZE) return null;
  return <nav aria-label="Table pagination" className="print:hidden flex flex-wrap items-center justify-between gap-2 border-t border-blue-200 px-4 py-2.5 text-sm text-gray-600">
    <span className="tabular-nums">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-md p-1.5 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
      <span className="px-2 tabular-nums">Page {page} of {pages}</span>
      <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="rounded-md p-1.5 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
    </div>
  </nav>;
}
