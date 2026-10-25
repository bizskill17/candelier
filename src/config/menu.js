// The left menu. Quantities only: no rates or prices anywhere.
import {
  LayoutDashboard, FilePlus2, ListOrdered, Truck, ClipboardList, PackageOpen, PackagePlus, PackageMinus,
  AlertOctagon, UserPlus, Contact, PhoneCall, Megaphone, MapPin, ScrollText, Warehouse, TrendingDown, Boxes, ListChecks, Tags, Handshake, Building2, Send, UserCog,
} from 'lucide-react';

export const menu = [
  { items: [{ key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard }] },
  {
    heading: 'Contacts',
    items: [
      { key: 'contacts', label: 'All Contacts', path: '/contacts', icon: Contact, description: 'All relationships and contact follow-ups.' },
      { key: 'followup-logs', label: 'Follow Up Log', path: '/followup-logs', icon: ScrollText, description: 'Every follow-up entered, with filters.' },
    ],
  },
  {
    heading: 'Leads',
    items: [
      { key: 'leads-add', label: 'Add Lead', path: '/leads/new', icon: UserPlus, description: 'A specific requirement linked to a Contact.' },
      { key: 'leads', label: 'All Leads', path: '/leads/all', icon: Contact, description: 'Requirements with Hot, Warm or Cold temperature from history.' },
      { key: 'follow-ups', label: 'Lead Follow-ups', path: '/follow-ups', icon: PhoneCall, description: 'Follow-ups for all open Leads, including Hot, Warm and Cold.' },
    ],
  },
  {
    heading: 'Orders',
    items: [
      { key: 'customers', label: 'Customers', path: '/customers', icon: Handshake, description: 'Contacts with confirmed non-cancelled orders.' },
      { key: 'orders-add', label: 'Add Order', path: '/orders/new', icon: FilePlus2, description: 'Enter a new order with its items.' },
      { key: 'orders-master', label: 'Order Master', path: '/orders/all', icon: ListOrdered, description: 'Every order; open an item for its BOQ and dispatch.' },
    ],
  },
  {
    heading: 'BOQ & Issue',
    items: [
      { key: 'pending-boq', label: 'Pending BOQ', path: '/pending-boq', icon: ClipboardList, description: 'Order items with no BOQ or a Draft BOQ.' },
      { key: 'boq-master', label: 'Orders with BOQ', path: '/boq-master', icon: ClipboardList, description: 'Draft and Final BOQs for every order item.' },
      { key: 'pending-material-issue', label: 'Orders Pending Issue', path: '/pending-material-issue', icon: PackageMinus, description: 'Final BOQs with quantities still to be issued.' },
    ],
  },
  {
    heading: 'Production & Dispatch',
    items: [
      { key: 'production-in-progress', label: 'Production In Progress', path: '/production-in-progress', icon: PackageOpen, description: 'Issued order items currently in production.' },
      { key: 'ready-to-dispatch', label: 'Ready to Dispatch', path: '/ready-to-dispatch', icon: Truck, description: 'Completed order items awaiting dispatch.' },
      { key: 'dispatches', label: 'Orders Dispatched', path: '/dispatches', icon: Truck, description: 'Every dispatched order item.' },
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
      { key: 'lead_sources', label: 'Sources', path: '/lead-sources', icon: Megaphone, description: 'Where leads come from: Instagram Ads, Walk-in…' },
      { key: 'states', label: 'States', path: '/states', icon: MapPin, description: 'States used on leads.' },
      { key: 'client_categories', label: 'Contact Categories', path: '/client-categories', icon: Tags, description: 'Groups of customers: Architect, Hotel, Dealer…' },
      { key: 'suppliers', label: 'Suppliers', path: '/suppliers', icon: Building2, description: 'Parties who supply material.' },
      { key: 'transporters', label: 'Transporters', path: '/transporters', icon: Send, description: 'Used when dispatching.' },
      { key: 'users', label: 'Users', path: '/users', icon: UserCog, adminOnly: true, description: 'Sign-in accounts and roles.' },
    ],
  },
];
