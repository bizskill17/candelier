// Small shared helpers. Quantities only, no prices.

// Today in the user's local timezone, as YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString('en-CA');
export const addDays = (d, n) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };

// YYYY-MM-DD → DD-MM-YYYY
export const fmtDate = (d) => (d ? d.slice(0, 10).split('-').reverse().join('-') : '');
export const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }) : '');

export const fmtQty = (n) =>
  n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const round3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

const STYLES = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
};
export function Badge({ color = 'gray', children }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[color]}`}>{children}</span>;
}

const ORDER_COLOR = { Open: 'blue', 'Partly Dispatched': 'amber', Dispatched: 'green', Cancelled: 'gray' };
export const OrderStatus = ({ status }) => <Badge color={ORDER_COLOR[status] || 'gray'}>{status}</Badge>;

const STAGE_COLOR = { 'Pending Drawing':'violet', 'BOQ Pending': 'gray', 'BOQ Final': 'green', 'BOQ Draft': 'amber', Dispatched: 'green' };
export const ItemStage = ({ stage }) => <Badge color={STAGE_COLOR[stage] || 'gray'}>{stage}</Badge>;

export const ORDER_STATUSES = ['Open', 'Partly Dispatched', 'Dispatched', 'Cancelled'];

// CRM
export const fmtTime = (t) => (t ? t.slice(0, 5) : '');
export const LeadTemp = ({ t }) => <Badge color={t === 'Hot' ? 'red' : 'blue'}>{t}</Badge>;
const LEAD_COLOR = { Open: 'amber', Success: 'green', Fail: 'red' };
export const LeadStatus = ({ status }) => <Badge color={LEAD_COLOR[status] || 'gray'}>{status}</Badge>;
