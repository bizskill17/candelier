import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, enquiriesApi, contactsApi, whatsappApi, crmApi, ordersApi, drawingApi, productionApi, historyApi, itemsApi, materialsApi, docsApi, inventoryApi, samplesApi } from '../api/client';

// Numbers shown beside left-menu items: how many records each list holds right now.
// Each uses the same request as its screen, so the number matches what the screen shows.
const size = (r) => Number(r?.total ?? (Array.isArray(r?.data) ? r.data.length : 0)) || 0;
const master = (entity) => () => api.list(entity, { page: 1, per_page: 1, status: 'active' }).then(size);
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
  'enquiry-sync-history': () => enquiriesApi.history({ page: 1 }).then(size),
  'followup-logs': () => historyApi.list({ page: 1 }).then(size),
  client_categories: master('client_categories'),
  states: master('states'),
  whatsapp: () => whatsappApi.get('campaigns').then(size),
  lead_sources: master('lead_sources'),
  'item-fields': () => itemsApi.fields().then(size),
  material_categories: master('material_categories'),
  materials: () => materialsApi.list().then(size),
  'opening-stock': () => docsApi.opening().then(size),
  'material-in': () => docsApi.list('material-in', { page: 1, per_page: 1 }).then(size),
  suppliers: master('suppliers'),
  'material-issue': () => docsApi.list('material-issue', { page: 1, per_page: 1 }).then(size),
  damage: () => docsApi.list('damage', { page: 1, per_page: 1 }).then(size),
  transporters: master('transporters'),
  'sample-inventory': () => samplesApi.list({ page: 1 }).then(size),
  'sample-issues': () => samplesApi.history({ page: 1 }).then(size),
  inventory: () => inventoryApi.list({ page: 1, per_page: 1 }).then(size),
  users: master('users'),
};

// Lists of work waiting (enquiries, follow-ups, pending stages…). A section heading adds up these;
// a section with none of them (e.g. Purchase) adds up all its lists instead.
export const WORK = new Set(['enquiries', 'contacts', 'whatsapp-failed', 'leads', 'follow-ups', 'customers', 'orders-master', 'pending-drawing', 'pending-boq', 'boq-master', 'pending-material-issue', 'production-in-progress', 'ready-to-dispatch', 'dispatches']);

const REFRESH_MS = 2 * 60 * 1000;

/** keys: the menu item keys this user can see. Refreshes on every screen change, after every save, and every 2 minutes. */
export function useMenuCounts(keys) {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({});
  const wanted = keys.filter((k) => counters[k]).join(',');
  useEffect(() => {
    let alive = true;
    const run = () => wanted.split(',').filter(Boolean).forEach((k) => {
      counters[k]().then((n) => { if (alive) setCounts((c) => (c[k] === n ? c : { ...c, [k]: n })); }).catch(() => {});
    });
    const due = Date.now() - (window.__menuCountsAt || 0) > 30000;
    const runAll = () => { window.__menuCountsAt = Date.now(); run(); };
    let t = due ? setTimeout(runAll, 400) : null; // after the screen's own data has loaded; at most every 30 s on navigation
    const iv = setInterval(runAll, REFRESH_MS);
    // Any save, change or delete anywhere in the app refreshes the numbers at once.
    const onChange = () => { clearTimeout(t); t = setTimeout(runAll, 250); };
    window.addEventListener('candelier:data-changed', onChange);
    return () => { alive = false; clearTimeout(t); clearInterval(iv); window.removeEventListener('candelier:data-changed', onChange); };
  }, [wanted, pathname]);
  return counts;
}
