import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { canAccessPath } from '../auth/permissions';
import { useLocation, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const COLLAPSE_KEY = 'ims.sidebar.collapsed';

export default function Layout() {
  const {user}=useAuth();const {pathname}=useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  return (
    <div className="flex h-full">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {canAccessPath(pathname,user?.role)?<Outlet />:<p role="alert" className="rounded-lg border bg-white p-5">You do not have access to this section.</p>}
        </main>
      </div>
    </div>
  );
}
