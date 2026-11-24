import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { canOpenView, roleViewGroups } from '../auth/permissions';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ChangePassword from './ChangePassword';

const COLLAPSE_KEY = 'ims.sidebar.collapsed';

export default function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const canOpen = canOpenView(pathname, user);
  const salesEntry = user?.role === 'Store' && /^\/(leads|orders)\/new(?:\/|$)/i.test(pathname);
  const startView = pathname === '/' && !canOpen
    ? roleViewGroups(user?.role).flatMap(group => group.items).find(item => canOpenView(item.path, user))
    : null;
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
          {canOpen ? (salesEntry ? <p role="status" className="rounded-lg border bg-white p-5">Creating this record requires the Sales or Admin role.</p> : <Outlet />) : startView ? <Navigate to={startView.path} replace /> : <p role="alert" className="rounded-lg border bg-white p-5">You do not have access to this section.</p>}
        </main>
      </div>
      {passwordOpen && <ChangePassword onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}
