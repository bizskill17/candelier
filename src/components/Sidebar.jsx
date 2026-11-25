import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, KeyRound, LogOut, X } from 'lucide-react';
import { canOpenView } from '../auth/permissions';
import { menu } from '../config/menu';
import { useAuth } from '../auth/AuthContext';
import { useMenuCounts } from '../lib/menuCounts';

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

export default function Sidebar({ collapsed, mobileOpen, onCloseMobile, onChangePassword }) {
  const { pathname } = useLocation();
  const selectedGroup = menu.find(g => g.heading && g.items.some(i => i.path !== '/' && (pathname === i.path || pathname.startsWith(i.path + '/'))))?.heading
    || menu.find(g => g.heading && g.items.some(i => i.path.split('/')[1] === pathname.split('/')[1]))?.heading
    || null;
  const [openGroup, setOpenGroup] = useState(selectedGroup);
  useEffect(() => { setOpenGroup(selectedGroup); }, [pathname, selectedGroup]);
  const toggleGroup = heading => setOpenGroup(current => current === heading ? null : heading);

  const { isAdmin, user, logout } = useAuth();
  const groups = menu
    .map((g) => ({ ...g, items: g.items.filter((i) => (isAdmin || !i.adminOnly) && canOpenView(i.path, user)) }))
    .filter((g) => g.items.length > 0);

  // On desktop the collapsed state shows icons only; the mobile drawer is always full width.
  const narrow = collapsed && !mobileOpen;
  const counts = useMenuCounts(groups.flatMap((g) => g.items.map((i) => i.key)));
  const displayName = user?.name || user?.username;
  const initials = displayName?.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const fmt = (n) => (n > 999 ? '999+' : String(n));

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

        {/* Navigation */}
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group, gi) => {
            const colors = sectionColors[group.heading] || ['#f8fafc', '#334155'];
            const isClosed = Boolean(group.heading && openGroup !== group.heading && !narrow);
            return (
              <div key={group.heading || gi} className="mb-2 rounded-xl border border-black/5 p-1" style={{backgroundColor: colors[0]}}>
                {group.heading && !narrow && (
                  <button
                    onClick={() => toggleGroup(group.heading)}
                    aria-expanded={!isClosed}
                    style={{color: colors[1]}}
                    className="flex w-full items-center gap-1.5 px-2 py-2 text-xs font-bold uppercase tracking-wide hover:opacity-80"
                  >
                    <span className="min-w-0 flex-1 text-left">{group.heading}</span>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${isClosed ? '-rotate-90' : ''}`} />
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
                            {({ isActive }) => (
                              <>
                                <span className="relative shrink-0">
                                  <Icon size={18} />
                                </span>
                                {!narrow && <span className="min-w-0 flex-1 whitespace-normal break-words">{item.label}</span>}
                                {!narrow && counts[item.key] !== undefined && (
                                  <span aria-hidden="true" className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${isActive ? 'bg-white/25 text-white' : counts[item.key] > 0 ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-400'}`}>{fmt(counts[item.key])}</span>
                                )}
                              </>
                            )}
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
            <p className="px-2 py-4 text-sm text-sidebar-muted">No modules available.</p>
          )}
        </nav>

        {user && (
          <div className={`flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 ${narrow ? 'flex-col' : ''}`}>
            <span title={displayName} aria-label={narrow ? displayName : undefined} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </span>
            {!narrow && (
              <div className="min-w-0 flex-1">
                <div title={displayName} className="truncate text-sm font-semibold text-slate-900">{displayName}</div>
                <div className="truncate text-xs text-slate-500">{user.role}</div>
              </div>
            )}
            <button type="button" onClick={onChangePassword} aria-label="Change password" title="Change password" className="shrink-0 rounded-md p-2 text-slate-600 hover:bg-slate-100">
              <KeyRound size={16} />
            </button>
            <button type="button" onClick={logout} aria-label="Sign out" title="Sign out" className="shrink-0 rounded-md p-2 text-red-600 hover:bg-red-50">
              <LogOut size={18} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
