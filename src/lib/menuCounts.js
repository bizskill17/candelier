import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { menu } from '../config/menu';
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
  'follow-ups': () => crmApi.due({ tab: 'all', page: 1 }).then(size),
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
  inventory: () => inventoryApi.list({ only: 'instock' }).then(r => r.summary?.in_stock ?? size(r)),
  users: master('users'),
};

const REFRESH_MS = 2 * 60 * 1000;

const menuItems = menu.flatMap(group => group.items);

export function useMenuCounts(keys) {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({});
  const refresh = useRef(null);
  const wanted = keys.filter(key => counters[key]).join(',');
  const activeKey = menuItems.find(item => item.path === pathname)?.key;

  useEffect(() => {
    const visible = new Set(wanted.split(',').filter(Boolean));
    const latest = new Map();
    const pending = new Set();
    let alive = true;

    const run = (key, skipPending = false) => {
      if (!visible.has(key) || (skipPending && pending.has(key))) return;
      const request = Symbol();
      latest.set(key, request);
      pending.add(key);
      counters[key]().then(count => {
        if (alive && latest.get(key) === request) {
          setCounts(current => current[key] === count ? current : { ...current, [key]: count });
        }
      }).catch(() => {}).finally(() => {
        if (latest.get(key) === request) pending.delete(key);
      });
    };

    const refreshAll = () => visible.forEach(key => run(key));
    refresh.current = key => run(key, true);
    refreshAll();
    const interval = setInterval(refreshAll, REFRESH_MS);
    window.addEventListener('candelier:data-changed', refreshAll);
    return () => {
      alive = false;
      refresh.current = null;
      clearInterval(interval);
      window.removeEventListener('candelier:data-changed', refreshAll);
    };
  }, [wanted]);

  useEffect(() => {
    refresh.current?.(activeKey);
  }, [activeKey, wanted]);

  return counts;
}
