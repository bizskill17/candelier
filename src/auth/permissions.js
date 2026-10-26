export function canAccessPath(path, role) {
 if(role==='Admin')return true;
 if(!['Sales','Store'].includes(role))return false;
 const base=path.split('/')[1]||'';
 if(base==='whatsapp-settings')return false;
 if(base==='whatsapp'&&role==='Store')return false;
 if(base==='users'||base==='item-fields')return false;
 if(role==='Sales')return !['opening-stock','material-in','material-issue','damage'].includes(base);
 if(['leads','follow-ups','followup-logs','pending-boq','lead-sources','client-categories'].includes(base))return false;
 if(base==='orders'&&path.startsWith('/orders/new'))return false;
 return true;
}
export const mayCreateMaster=(role,entity)=>role==='Admin'||(role==='Store'&&['suppliers','transporters','material_categories'].includes(entity));
