import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { enquiriesApi, contactsApi, whatsappApi, crmApi, ordersApi, drawingApi, productionApi } from '../api/client';

// Numbers shown beside left-menu items: how many records each list holds right now.
// Each uses the same request as its screen, so the number matches what the screen shows.
const size = (r) => Number(r?.total ?? (Array.isArray(r?.data) ? r.data.length : 0)) || 0;
const counters = {
  enquiries: () => enquiriesApi.list({ view: 'pending', page: 1 }).then(size),
  contacts: () => contactsApi.list({ view: 'all', page: 1 }).then(size),
  'whatsapp-failed': () => whatsappApi.get('failed-contacts', { page: 1 }).then(size),
  leads: () => crmApi.list({ view: 'all', page: 1 }).then(size),
  'follow-ups': () => Promise.all([crmApi.due({ tab: 'today', page: 1 }), crmApi.due({ tab: 'overdue', page: 1 })]).then(([a, b]) => size(a) + size(b)),
  customers: () => contactsApi.list({ view: 'customers', page: 1 }).then(size),
  'orders-master': () => ordersApi.list({ page: 1, per_page: 1 }).then(size),
  'pending-drawing': () => drawingApi.pending('').then(size),
  'pending-boq': () => ordersApi.pendingBoq('').then(size),
  'boq-master': () => ordersApi.boqMaster('').then(size),
  'pending-material-issue': () => ordersApi.pendingIssue('').then(size),
  'production-in-progress': () => productionApi.list({ status: 'In Progress', page: 1 }).then(size),
  'ready-to-dispatch': () => productionApi.list({ status: 'Complete', page: 1 }).then(size),
  dispatches: () => ordersApi.dispatches({}).then(size),
};

const REFRESH_MS = 2 * 60 * 1000;

/** keys: the menu item keys this user can see. Refreshes on every screen change and every 2 minutes. */
export function useMenuCounts(keys) {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({});
  const wanted = keys.filter((k) => counters[k]).join(',');
  useEffect(() => {
    let alive = true;
    const run = () => wanted.split(',').filter(Boolean).forEach((k) => {
      counters[k]().then((n) => { if (alive) setCounts((c) => (c[k] === n ? c : { ...c, [k]: n })); }).catch(() => {});
    });
    const t = setTimeout(run, 400);            // after the screen's own data has loaded
    const iv = setInterval(run, REFRESH_MS);
    return () => { alive = false; clearTimeout(t); clearInterval(iv); };
  }, [wanted, pathname]);
  return counts;
}
