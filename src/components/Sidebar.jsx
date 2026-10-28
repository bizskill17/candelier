import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react';
import { canAccessPath } from '../auth/permissions';
import { menu } from '../config/menu';
import { useAuth } from '../auth/AuthContext';

const sectionColors = {
  Enquiries: ['#eff6ff', '#1e40af'],
  Contacts: ['#ecfeff', '#155e75'],
  WhatsApp: ['#f0fdf4', '#166534'],
  Leads: ['#fdf2f8', '#9d174d'],
  Orders: ['#f5f3ff', '#5b21b6'],
  BOQ: ['#fffbeb', '#92400e'],
  Purchase: ['#fff1f2', '#9f1239'],
  Issue: ['#fff7ed', '#9a3412'],
  Production: ['#f7fee7', '#3f6212'],
  Dispatch: ['#eef2ff', '#3730a3'],
  Stores: ['#f0f9ff', '#075985'],
  Administration: ['#f1f5f9', '#334155'],
};

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
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white text-slate-700 transition-all duration-200',
          'lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          narrow ? 'lg:w-[72px]' : 'w-64',
        ].join(' ')}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-sidebar px-4">
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
            <div className="flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1.5">
              <Search size={15} className="text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a module…"
                className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group, gi) => {
            const colors = sectionColors[group.heading] || ['#f8fafc', '#334155'];
            const isClosed = group.heading && closed[group.heading] && !q;
            return (
              <div key={group.heading || gi} className="mb-2 rounded-xl border border-black/5 p-1" style={{backgroundColor: colors[0]}}>
                {group.heading && !narrow && (
                  <button
                    onClick={() => toggleGroup(group.heading)}
                    aria-expanded={!isClosed}
                    style={{color: colors[1]}}
                    className="flex w-full items-center justify-between px-2 pb-2 pt-2 text-xs font-bold uppercase tracking-wide hover:opacity-80"
                  >
                    {group.heading}
                    <ChevronDown size={14} className={`transition-transform ${isClosed ? '-rotate-90' : ''}`} />
                  </button>
                )}
                {group.heading && narrow && gi > 0 && <div className="mx-2 my-2 border-t border-slate-200" />}

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
                            title={item.label}
                            className={({ isActive }) =>
                              [
                                'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium leading-5 transition-colors',
                                narrow ? 'justify-center' : '',
                                isActive
                                  ? 'bg-sidebar-active font-medium text-white'
                                  : 'text-slate-700 hover:bg-white/70 hover:text-slate-950',
                              ].join(' ')
                            }
                          >
                            <Icon size={18} className="shrink-0" />
                            {!narrow && <span className="min-w-0 whitespace-normal break-words">{item.label}</span>}
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
          className="hidden h-12 shrink-0 items-center gap-2 border-t border-slate-200 px-5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:flex"
        >
          {narrow ? <ChevronsRight size={18} /> : <><ChevronsLeft size={18} /> Collapse</>}
        </button>
      </aside>
    </>
  );
}
