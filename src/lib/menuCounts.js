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
    const queue = new Set();
    let active = true;
    let running = false;
    let timer = null;
    let priorityKey;
    let retryAfter = 0;

    function schedule(delay = 150) {
      if (!active || running || timer !== null || !queue.size) return;
      timer = setTimeout(runNext, Math.max(delay, retryAfter - Date.now()));
    }

    // Keep foreground page loads responsive on shared hosting.
    async function runNext() {
      timer = null;
      const key = queue.has(priorityKey) ? priorityKey : queue.values().next().value;
      if (!active || !key) return;
      queue.delete(key);
      running = true;
      try {
        const count = await counters[key]();
        if (active && !queue.has(key)) {
          setCounts(current => current[key] === count ? current : { ...current, [key]: count });
        }
      } catch (error) {
        if (error.status === 0 || error.status === 429 || error.status >= 500) {
          queue.add(key);
          priorityKey = undefined;
          retryAfter = Date.now() + 5000;
        }
      } finally {
        running = false;
        schedule();
      }
    }

    function refreshAll() {
      visible.forEach(key => queue.add(key));
      schedule(350);
    }

    refresh.current = key => {
      if (!visible.has(key)) return;
      priorityKey = key;
      queue.add(key);
      schedule();
    };
    refreshAll();
    const interval = setInterval(refreshAll, REFRESH_MS);
    window.addEventListener('candelier:data-changed', refreshAll);
    return () => {
      active = false;
      refresh.current = null;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('candelier:data-changed', refreshAll);
    };
  }, [wanted]);

  useEffect(() => {
    refresh.current?.(activeKey);
  }, [activeKey, wanted]);

  return counts;
}
