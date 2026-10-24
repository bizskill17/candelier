// Thin wrapper around fetch for the PHP API.
// All calls go to /api/index.php?r=<route>, which works on Hostinger without extra rewrite rules.

const BASE = '/api/index.php';

export class ApiError extends Error {
  constructor(message, status, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(method, route, { params, body } = {}) {
  const qs = new URLSearchParams({ r: route });
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });

  let res;
  try {
    res = await fetch(`${BASE}?${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection and try again.', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (res.status === 401 && !route.startsWith('auth/')) {
    // Session expired: let the app show the sign-in screen.
    window.dispatchEvent(new Event('ims:signed-out'));
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Server error (${res.status}).`, res.status, data?.fields || {});
  }
  return data;
}

export const api = {
  list: (entity, params) => request('GET', `masters/${entity}`, { params }),
  get: (entity, id) => request('GET', `masters/${entity}/${id}`),
  create: (entity, body) => request('POST', `masters/${entity}`, { body }),
  update: (entity, id, body) => request('PUT', `masters/${entity}/${id}`, { body }),
  setStatus: (entity, id, isActive) => request('PATCH', `masters/${entity}/${id}/status`, { body: { is_active: isActive } }),
  remove: (entity, id) => request('DELETE', `masters/${entity}/${id}`),
  lookup: (entity) => request('GET', `lookup/${entity}`),
};


export const authApi = {
  me: () => request('GET', 'auth/me'),
  setup: (body) => request('POST', 'auth/setup', { body }),
  login: (body) => request('POST', 'auth/login', { body }),
  logout: () => request('POST', 'auth/logout'),
  changePassword: (body) => request('POST', 'auth/password', { body }),
};

export const materialsApi = {
  list: (params) => request('GET', 'materials', { params }),
  get: (id) => request('GET', `materials/${id}`),
  create: (body) => request('POST', 'materials', { body }),
  update: (id, body) => request('PUT', `materials/${id}`, { body }),
  setStatus: (id, isActive) => request('PATCH', `materials/${id}/status`, { body: { is_active: isActive } }),
  remove: (id) => request('DELETE', `materials/${id}`),
  catalog: () => request('GET', 'variants/catalog'),
  stats: (ids, orderItemId) => request('GET', 'variants/stats', { params: { ids: ids.join(','), order_item_id: orderItemId } }),
};

// Order item fields (your own list) and photo uploads
export const itemsApi = {
  fields: () => request('GET', 'item-fields'),
  saveFields: (fields) => request('PUT', 'item-fields', { body: { fields } }),
  upload: async (file, kind) => {
    const fd = new FormData();
    fd.append('file', file);
    let res;
    try {
      res = await fetch(`${BASE}?r=uploads${kind ? `&kind=${kind}` : ''}`, { method: 'POST', body: fd, credentials: 'same-origin' });
    } catch {
      throw new ApiError('Could not reach the server. Check your internet connection and try again.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) throw new ApiError(data?.error || `Server error (${res.status}).`, res.status, data?.fields || {});
    return data;
  },
};

// Address of an uploaded photo (stored as uploads/items/2026/10/xxx.jpg)
export const imageUrl = (path) => (!path ? '' : /^(data:|blob:|https?:)/.test(path) ? path : `/${path}`);

export const ordersApi = {
  list: (params) => request('GET', 'orders', { params }),
  get: (id) => request('GET', `orders/${id}`),
  create: (body) => request('POST', 'orders', { body }),
  update: (id, body) => request('PUT', `orders/${id}`, { body }),
  setStatus: (id, status) => request('PATCH', `orders/${id}/status`, { body: { status } }),
  remove: (id) => request('DELETE', `orders/${id}`),
  users: () => request('GET', 'users-list'),
  openItems: (include) => request('GET', 'order-items', { params: { include } }),
  boqMaster: (q) => request('GET', 'order-items', { params: { saved_boq: 1, q } }),
  pendingBoq: (q) => request('GET', 'order-items', { params: { pending_boq: 1, q } }),
  setProductionDate: (itemId, date) => request('PATCH', `order-items/${itemId}`, { body: { production_date: date } }),
  dispatch: (itemId, body) => request('PUT', `order-items/${itemId}/dispatch`, { body }),
  undoDispatch: (itemId) => request('DELETE', `order-items/${itemId}/dispatch`),
  dispatches: (params) => request('GET', 'dispatches', { params }),
};

export const boqApi = {
  get: (itemId) => request('GET', `boq/${itemId}`),
  save: (itemId, lines) => request('PUT', `boq/${itemId}`, { body: { lines } }),
  sources: (exclude) => request('GET', 'boq/sources', { params: { exclude } }),
  book: (itemId, variantId, quantity) => request('POST', `boq/${itemId}/book`, { body: { variant_id: variantId, quantity } }),
  release: (itemId, variantId, quantity) => request('POST', `boq/${itemId}/release`, { body: { variant_id: variantId, quantity } }),
};

// Material In, Material Issue, Damage
export const docsApi = {
  list: (type, params) => request('GET', `docs/${type}`, { params }),
  get: (type, id) => request('GET', `docs/${type}/${id}`),
  create: (type, body) => request('POST', `docs/${type}`, { body }),
  update: (type, id, body) => request('PUT', `docs/${type}/${id}`, { body }),
  remove: (type, id) => request('DELETE', `docs/${type}/${id}`),
  issuePrefill: (orderItemId, exceptId) => request('GET', 'docs/issue-prefill', { params: { order_item_id: orderItemId, except_id: exceptId } }),
  opening: () => request('GET', 'opening-stock'),
  saveOpening: (lines) => request('PUT', 'opening-stock', { body: { lines } }),
};

export const inventoryApi = {
  list: (params) => request('GET', 'inventory', { params }),
  detail: (variantId) => request('GET', `inventory/${variantId}`),
  setReorder: (variantId, level) => request('PATCH', `inventory/${variantId}`, { body: { reorder_level: level } }),
  adjust: (variantId, body) => request('POST', `inventory/${variantId}/adjust`, { body }),
  lowStock: (params) => request('GET', 'low-stock', { params }),
  dashboard: () => request('GET', 'dashboard'),
};

// CRM: leads and follow-ups
export const crmApi = {
  list: (params) => request('GET', 'leads', { params }),
  get: (id) => request('GET', `leads/${id}`),
  create: (body) => request('POST', 'leads', { body }),
  update: (id, body) => request('PUT', `leads/${id}`, { body }),
  remove: (id) => request('DELETE', `leads/${id}`),
  followUp: (id, body) => request('POST', `leads/${id}/followups`, { body }),
  undoFollowUp: (id, fid) => request('DELETE', `leads/${id}/followups/${fid}`),
  customer: (id) => request('POST', `leads/${id}/customer`),
  due: (params) => request('GET', 'follow-ups', { params }),
  logs: (params) => request('GET', 'followup-logs', { params }),
};
