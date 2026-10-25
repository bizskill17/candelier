// Screen definitions for the simple masters. Must match api/entities.php.
// Codes are generated automatically, so there is no Code field in forms.

const partyFields = [
  { name: 'name', label: 'Name', type: 'text', required: true, full: true },
  { name: 'contact_person', label: 'Contact person', type: 'text' },
  { name: 'phone', label: 'Phone', type: 'phone', placeholder: '98640 12345' },
  { name: 'city', label: 'City', type: 'text' },
  { name: 'address', label: 'Address', type: 'textarea', full: true },
];
const partyColumns = [
  { key: 'name', label: 'Name', sort: 'name', strong: true },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'phone', label: 'Phone', nowrap: true },
  { key: 'city', label: 'City', sort: 'city' },
];

export const masters = {
  material_categories: { singular: 'Material Category', plural: 'material categories', hideCode: true, columns: [{ key: 'name', label: 'Name', sort: 'name', strong: true }], fields: [{ name: 'name', label: 'Name', type: 'text', required: true, full: true }] },
  customers: {
    singular: 'Customer', plural: 'customers', hideCode: true, minWidth: 1600,
    filters: [
      { name: 'city', label: 'All cities', values: true },
      { name: 'category_id', label: 'All categories', ref: 'client_categories' },
    ],
    exportName: 'Customers',
    columns: [
      { key: 'name', label: 'Name', sort: 'name', strong: true },
      { key: 'category_name', label: 'Client Category', sort: 'category_name', nowrap: true },
      { key: 'phone', label: 'Phone', nowrap: true },
      { key: 'email', label: 'Email', sort: 'email' },
      { key: 'contact_person', label: 'Contact Person', sort: 'contact_person' },
      { key: 'contact_mobile', label: 'Contact Mobile', nowrap: true },
      { key: 'city', label: 'City', sort: 'city' },
      { key: 'state_name', label: 'State', sort: 'state_name', nowrap: true },
      { key: 'address', label: 'Address' },
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, full: true },
      { name: 'category_id', label: 'Client Category', type: 'lookup', ref: 'client_categories', quickAdd: true },
      { name: 'phone', label: 'Phone', type: 'mobile', placeholder: '10-digit mobile' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'name@example.com' },
      { name: 'contact_person', label: 'Contact person', type: 'text' },
      { name: 'contact_mobile', label: 'Contact person mobile', type: 'mobile', placeholder: '10-digit mobile' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'state_id', label: 'State', type: 'lookup', ref: 'states', quickAdd: true },
      { name: 'address', label: 'Address', type: 'textarea', full: true },
    ],
  },
  suppliers: { singular: 'Supplier', plural: 'suppliers', hideCode: true, columns: partyColumns, fields: partyFields },
  transporters: {
    singular: 'Transporter', plural: 'transporters', hideCode: true,
    columns: [{ key: 'name', label: 'Name', sort: 'name', strong: true }, { key: 'phone', label: 'Phone', nowrap: true }],
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, full: true, placeholder: 'e.g. Blue Dart' }, { name: 'phone', label: 'Phone', type: 'phone' }],
  },
  client_categories: {
    singular: 'Contact Category', plural: 'contact categories', hideCode: true,
    columns: [{ key: 'name', label: 'Name', sort: 'name', strong: true }],
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, full: true, placeholder: 'e.g. Architect' }],
  },
  states: {
    singular: 'State', plural: 'states', hideCode: true,
    columns: [{ key: 'name', label: 'Name', sort: 'name', strong: true }],
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, full: true, placeholder: 'e.g. Assam' }],
  },
  lead_sources: {
    singular: 'Source', plural: 'sources', hideCode: true,
    columns: [{ key: 'name', label: 'Name', sort: 'name', strong: true }],
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, full: true, placeholder: 'e.g. Instagram Ads' }],
  },
  users: {
    singular: 'User', plural: 'users', hideCode: true,
    columns: [
      { key: 'name', label: 'Name', sort: 'name', strong: true },
      { key: 'username', label: 'Username', sort: 'username', mono: true },
      { key: 'role', label: 'Role', sort: 'role', badge: true },
      { key: 'phone', label: 'Phone', nowrap: true, hideSm: true },
      { key: 'last_login', label: 'Last Sign-in', sort: 'last_login', datetime: true, hideSm: true },
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, full: true },
      { name: 'username', label: 'Username', type: 'username', required: true, placeholder: 'e.g. ravi', help: 'Used to sign in.' },
      { name: 'password', label: 'Password', type: 'password', help: 'At least 6 characters.' },
      { name: 'role', label: 'Role', type: 'select', options: ['Admin', 'Store', 'Sales'], required: true, help: 'Admin: full access and corrections. Sales: shared CRM and assigned Orders/BOQs. Store: stock, production and dispatch.' },
      { name: 'phone', label: 'Phone', type: 'phone' },
    ],
  },
};
