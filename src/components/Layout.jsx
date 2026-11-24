import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { canAccessPath } from '../auth/permissions';
import { useLocation, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ChangePassword from './ChangePassword';

const COLLAPSE_KEY = 'ims.sidebar.collapsed';

export default function Layout() {
  const {user}=useAuth();const {pathname}=useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  return (
    <div className="app-layout flex h-full">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onChangePassword={() => {
          setMobileOpen(false);
          setPasswordOpen(true);
        }}
      />
      <div className="app-content flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {canAccessPath(pathname,user?.role)?<Outlet />:<p role="alert" className="rounded-lg border bg-white p-5">You do not have access to this section.</p>}
        </main>
      </div>
      {passwordOpen && <ChangePassword onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}
