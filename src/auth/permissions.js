import { menu } from '../config/menu';

export function canAccessPath(path, role) {
 if(role==='Admin')return true;
 if(!['Sales','Store'].includes(role))return false;
 const base=path.split('/')[1]||'';
 if(['sample-inventory','sample-issues'].includes(base)&&role==='Sales')return false;
 if(base==='enquiry-settings')return false;
 if(['enquiries','enquiry-sync-history'].includes(base)&&role==='Store')return false;
 if(['whatsapp','whatsapp-failed','whatsapp-settings'].includes(base))return false;
 if(base==='users'||base==='item-fields')return false;
 if(role==='Sales')return !['opening-stock','material-in','material-issue','damage'].includes(base);
 if(['leads','follow-ups','followup-logs','pending-boq','lead-sources','client-categories'].includes(base))return false;
 if(base==='orders'&&path.startsWith('/orders/new'))return false;
 return true;
}
export const mayCreateMaster=(role,entity)=>role==='Admin'||(role==='Store'&&['suppliers','transporters','material_categories'].includes(entity));

export function roleViewGroups(role) {
  return menu.map(group => ({
    ...group,
    items: group.items.filter(item => !item.permissionKey && (role === 'Admin' || (['Sales', 'Store'].includes(role) && !item.adminOnly))),
  })).filter(group => group.items.length > 0);
}

const views = menu.flatMap(group => group.items)
  .sort((left, right) => right.path.length - left.path.length);

export function canOpenView(path, user) {
  const normalized = path.toLowerCase().replace(/\/+$/, '') || '/';
  if (!user) return false;
  if (user.role === 'Admin' || !Array.isArray(user.allowed_views)) return canAccessPath(normalized, user.role);
  if (!['Sales', 'Store'].includes(user.role)) return false;
  const view = views.find(item => normalized === item.path || (item.path !== '/' && normalized.startsWith(item.path + '/')));
  if (view) return !view.adminOnly && user.allowed_views.includes(view.permissionKey || view.key);
  const area = normalized.split('/')[1];
  if (area === 'low-stock') return user.allowed_views.includes('inventory');
  if (area === 'orders') return user.allowed_views.includes('orders-master');
  if (area === 'leads') return user.allowed_views.includes('leads');
  if (area === 'boq') {
    return ['pending-boq', 'boq-master', 'pending-material-issue'].some(key => user.allowed_views.includes(key));
  }
  return false;
}
