// Shared table styling: blue header with white text, blue cell borders.
export const tableWrap =
  'overflow-hidden rounded-xl border border-blue-300 bg-white [&_th]:border-t-0 [&_tbody_tr:last-child_td]:border-b-0 [&_td:first-child]:border-l-0 [&_th:first-child]:border-l-0 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0';
export const theadCls = 'bg-brand-600 text-xs uppercase tracking-wide text-white';
export const thCls = 'border border-blue-400 px-4 py-3 text-left font-semibold';
export const tdCls = 'border border-blue-200 px-4 py-3 align-top';

export const inputCls = (err) =>
  `w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
    err ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-brand-500 focus:ring-brand-100'
  }`;
