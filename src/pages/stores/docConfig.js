// Screen settings for the stores documents. Quantities only, no prices.
export const docConfig = {
  'material-in': {
    title: 'Material In', singular: 'Material Receipt', noLabel: 'Receipt No.', no: 'receipt_no', date: 'receipt_date',
    search: 'Search receipt no., supplier, challan, material…',
  },
  'material-issue': {
    title: 'Material Issue', singular: 'Material Issue', noLabel: 'Issue No.', no: 'issue_no', date: 'issue_date',
    search: 'Search issue no., order no., customer, material…',
  },
  damage: {
    title: 'Damage', singular: 'Damage Entry', noLabel: 'Damage No.', no: 'damage_no', date: 'damage_date',
    search: 'Search damage no., reported by, material…',
  },
};
