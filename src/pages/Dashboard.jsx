import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, ClipboardList, Truck, TrendingDown, PhoneCall, AlarmClock, UserPlus, FilePlus2, PackagePlus, PackageMinus, Warehouse } from 'lucide-react';
import { inventoryApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { menu } from '../config/menu';

// Live counts. Quantities only, no prices.
export default function Dashboard() {
  const { canEdit, isAdmin } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { inventoryApi.dashboard().then((r) => setD(r.data)).catch(() => setD({})); }, []);
  const v = (k) => (d ? d[k] ?? '—' : '—');
  const stats = [
    { label: 'Follow-ups today', value: v('followups_today'), icon: PhoneCall, to: '/follow-ups' },
    { label: 'Overdue follow-ups', value: v('followups_overdue'), icon: AlarmClock, to: '/follow-ups', warn: d && d.followups_overdue > 0 },
    { label: 'Open orders', value: v('open_orders'), icon: ShoppingCart, to: '/orders/all' },
    { label: 'BOQs pending finalisation', value: v('boq_pending'), icon: ClipboardList, to: '/pending-boq' },
    { label: 'Items to dispatch', value: v('to_dispatch'), icon: Truck, to: '/orders/all' },
    { label: 'Low stock', value: v('low_stock'), icon: TrendingDown, to: '/low-stock', warn: d && d.low_stock > 0 },
  ];
  const quick = [
    { label: 'Add Lead', icon: UserPlus, to: '/leads/new' },
    { label: 'Add Order', icon: FilePlus2, to: '/orders/new' },
    { label: 'Material In', icon: PackagePlus, to: '/material-in/new' },
    { label: 'Issue Material', icon: PackageMinus, to: '/material-issue/new' },
    { label: 'Inventory', icon: Warehouse, to: '/inventory' },
    { label: 'Low Stock', icon: TrendingDown, to: '/low-stock' },
  ];
  const sections = menu.filter((g) => g.heading).map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) })).filter((g) => g.items.length);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        {stats.map(({ label, value, icon: Icon, to, warn }) => (
          <Link key={label} to={to} className={`rounded-xl border bg-white p-4 transition hover:shadow-sm ${warn ? 'border-red-200 hover:border-red-400' : 'border-gray-200 hover:border-brand-500'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-500">{label}</span>
              <Icon size={18} className={warn ? 'text-red-500' : 'text-gray-400'} />
            </div>
            <div className={`mt-2 text-2xl font-semibold tabular-nums ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
          </Link>
        ))}
      </div>
      {canEdit && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {quick.map(({ label, icon: Icon, to }) => (
              <Link key={label} to={to} className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100"><Icon size={16} /> {label}</Link>
            ))}
          </div>
        </div>
      )}
      {sections.map((g) => (
        <div key={g.heading}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.heading}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map(({ key, label, path, icon: Icon, description }) => (
              <Link key={key} to={path} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-500">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><Icon size={18} /></span>
                <span><span className="block font-medium text-gray-900">{label}</span><span className="text-sm text-gray-500">{description}</span></span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
