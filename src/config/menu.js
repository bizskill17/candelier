// The left menu. Quantities only: no rates or prices anywhere.
import {
  LayoutDashboard, FilePlus2, ListOrdered, Truck, ClipboardList, PackageOpen, PackagePlus, PackageMinus,
  AlertOctagon, UserPlus, Contact, PhoneCall, Megaphone, MapPin, ScrollText, Warehouse, TrendingDown, Boxes, ListChecks, Handshake, Building2, Send, UserCog,
} from 'lucide-react';

export const menu = [
  { items: [{ key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard }] },
  {
    heading: 'CRM',
    items: [
      { key: 'leads-add', label: 'Add Lead', path: '/leads/new', icon: UserPlus, description: 'A new enquiry from a new or existing customer.' },
      { key: 'leads', label: 'Leads', path: '/leads/all', icon: Contact, description: 'Every lead, Hot or Cold, with its follow-ups.' },
      { key: 'follow-ups', label: 'Due Follow Ups', path: '/follow-ups', icon: PhoneCall, description: 'Open leads to follow up: all, overdue, today, upcoming.' },
      { key: 'followup-logs', label: 'Follow Up Logs', path: '/followup-logs', icon: ScrollText, description: 'Every follow-up entered, with filters.' },
    ],
  },
  {
    heading: 'Orders',
    items: [
      { key: 'orders-add', label: 'Add Order', path: '/orders/new', icon: FilePlus2, description: 'Enter a new order with its items.' },
      { key: 'orders-master', label: 'Order Master', path: '/orders/all', icon: ListOrdered, description: 'Every order; open an item for its BOQ and dispatch.' },
      { key: 'boq-master', label: 'BOQ Master', path: '/boq-master', icon: ClipboardList, description: 'Draft and Final BOQs for every order item.' },
      { key: 'pending-boq', label: 'Pending BOQ', path: '/pending-boq', icon: ClipboardList, description: 'Order items with no BOQ or a Draft BOQ.' },
      { key: 'dispatches', label: 'Dispatches', path: '/dispatches', icon: Truck, description: 'Every dispatched order item.' },
    ],
  },
  {
    heading: 'Stores',
    items: [
      { key: 'opening-stock', label: 'Opening Stock', path: '/opening-stock', icon: PackageOpen, description: 'Stock on hand when you start using the system.' },
      { key: 'material-in', label: 'Material In', path: '/material-in', icon: PackagePlus, description: 'Material purchased or received as samples.' },
      { key: 'material-issue', label: 'Material Issue', path: '/material-issue', icon: PackageMinus, description: 'Material issued to an order item.' },
      { key: 'damage', label: 'Damage', path: '/damage', icon: AlertOctagon, description: 'Broken, defective or lost material.' },
      { key: 'inventory', label: 'Inventory', path: '/inventory', icon: Warehouse, description: 'Stock per material.' },
      { key: 'low-stock', label: 'Low Stock', path: '/low-stock', icon: TrendingDown, description: 'Materials below their reorder level.' },
    ],
  },
  {
    heading: 'Masters',
    items: [
      { key: 'material_categories', label: 'Material Categories', path: '/material-categories', icon: Boxes, description: 'Categories used to organise materials.' },
      { key: 'materials', label: 'Materials', path: '/materials', icon: Boxes, description: 'Materials and their categories.' },
      { key: 'item-fields', label: 'Item Fields', path: '/item-fields', icon: ListChecks, description: 'Your own list of details for each order item (Area, Size, Glass Colour…).' },
      { key: 'lead_sources', label: 'Lead Sources', path: '/lead-sources', icon: Megaphone, description: 'Where leads come from: Instagram Ads, Walk-in…' },
      { key: 'states', label: 'States', path: '/states', icon: MapPin, description: 'States used on leads.' },
      { key: 'customers', label: 'Customers', path: '/customers', icon: Handshake, description: 'Parties who place orders.' },
      { key: 'suppliers', label: 'Suppliers', path: '/suppliers', icon: Building2, description: 'Parties who supply material.' },
      { key: 'transporters', label: 'Transporters', path: '/transporters', icon: Send, description: 'Used when dispatching.' },
    ],
  },
  {
    heading: 'Administration',
    items: [{ key: 'users', label: 'Users', path: '/users', icon: UserCog, adminOnly: true, description: 'Sign-in accounts and roles.' }],
  },
];
