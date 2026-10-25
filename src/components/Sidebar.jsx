import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react';
import { canAccessPath } from '../auth/permissions';
import { menu } from '../config/menu';
import { useAuth } from '../auth/AuthContext';

const STORAGE_KEY = 'ims.sidebar.closedGroups';

function loadClosed() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const [closed, setClosed] = useState(loadClosed);
  const [query, setQuery] = useState('');

  const toggleGroup = (heading) => {
    const next = { ...closed, [heading]: !closed[heading] };
    setClosed(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const { isAdmin, user } = useAuth();
  const q = query.trim().toLowerCase();
  const groups = menu
    .map((g) => ({ ...g, items: g.items.filter((i) => (isAdmin || !i.adminOnly) && canAccessPath(i.path,user?.role) && (!q || i.label.toLowerCase().includes(q))) }))
    .filter((g) => g.items.length > 0);

  // On desktop the collapsed state shows icons only; the mobile drawer is always full width.
  const narrow = collapsed && !mobileOpen;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar text-gray-200 transition-all duration-200',
          'lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          narrow ? 'lg:w-[72px]' : 'w-64',
        ].join(' ')}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            C
          </div>
          {!narrow && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">Candelier</div>
              <div className="truncate text-xs text-sidebar-muted">Management System</div>
            </div>
          )}
          <button
            onClick={onCloseMobile}
            className="rounded p-1 text-sidebar-muted hover:bg-sidebar-hover hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Menu search */}
        {!narrow && (
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 rounded-md bg-sidebar-hover px-2.5 py-1.5">
              <Search size={15} className="text-sidebar-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a module…"
                className="w-full bg-transparent text-sm text-white placeholder:text-sidebar-muted focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group, gi) => {
            const isClosed = group.heading && closed[group.heading] && !q;
            return (
              <div key={group.heading || gi} className="mb-2">
                {group.heading && !narrow && (
                  <button
                    onClick={() => toggleGroup(group.heading)}
                    className="flex w-full items-center justify-between px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-heading hover:text-gray-300"
                  >
                    {group.heading}
                    <ChevronDown size={14} className={`transition-transform ${isClosed ? '-rotate-90' : ''}`} />
                  </button>
                )}
                {group.heading && narrow && gi > 0 && <div className="mx-2 my-2 border-t border-white/10" />}

                {!isClosed && (
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.key}>
                          <NavLink
                            to={item.path}
                            end={item.path === '/' || item.path === '/contacts'}
                            onClick={onCloseMobile}
                            title={narrow ? item.label : undefined}
                            className={({ isActive }) =>
                              [
                                'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                                narrow ? 'justify-center' : '',
                                isActive
                                  ? 'bg-sidebar-active font-medium text-white'
                                  : 'text-gray-300 hover:bg-sidebar-hover hover:text-white',
                              ].join(' ')
                            }
                          >
                            <Icon size={18} className="shrink-0" />
                            {!narrow && <span className="truncate">{item.label}</span>}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          {groups.length === 0 && (
            <p className="px-2 py-4 text-sm text-sidebar-muted">No module matches “{query}”.</p>
          )}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={onToggleCollapse}
          className="hidden h-12 shrink-0 items-center gap-2 border-t border-white/10 px-5 text-sm text-sidebar-muted hover:text-white lg:flex"
        >
          {narrow ? <ChevronsRight size={18} /> : <><ChevronsLeft size={18} /> Collapse</>}
        </button>
      </aside>
    </>
  );
}
