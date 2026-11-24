import { useLocation } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { menu } from '../config/menu';

export default function Topbar({ onOpenMobile, collapsed, onToggleCollapse }) {
  const { pathname } = useLocation();
  const all = menu.flatMap((g) => g.items.map((i) => ({ ...i, heading: g.heading })));
  const current =
    (pathname === '/contacts/updated-today' ? { heading: 'Contacts', label: 'Updated Today' } : null) ||
    all.find((i) => i.path === pathname) ||
    all.find((i) => i.path !== '/' && pathname.startsWith(i.path + '/')) ||
    (pathname.startsWith('/orders') ? { heading: 'Orders', label: 'Order' }
      : pathname.startsWith('/boq') ? { heading: 'Orders', label: 'Order Item BOQ' }
        : pathname.startsWith('/leads') ? { heading: 'CRM', label: 'Lead' } : null);


  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:px-6">
      <button onClick={onOpenMobile} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Open menu">
        <Menu size={20} />
      </button>

      {onToggleCollapse && (
        <button onClick={onToggleCollapse} className="hidden rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 lg:inline-flex" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-gray-900">{current?.label || 'Dashboard'}</h1>
      </div>

    </header>
  );
}
