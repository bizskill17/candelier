import { readCsvRows } from './materialCsv.js';

export const openingStockCsvHeader = 'Date,Material Code,Quantity,Remarks';

export function parseOpeningStockCsv(text, today) {
  const rows = readCsvRows(text);
  const header = rows.shift();
  if (!header || header.map(value => value.toLowerCase()).join(',') !== openingStockCsvHeader.toLowerCase()) {
    throw new Error('Use the Opening Stock CSV template and keep its four columns.');
  }
  if (!rows.length || rows.length > 500) throw new Error('Upload between 1 and 500 rows.');

  return rows.map((row, index) => {
    const [date = '', code = '', quantity = '', remarks = ''] = row;
    const localDate = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const entryDate = localDate
      ? localDate[3] + '-' + localDate[2].padStart(2, '0') + '-' + localDate[1].padStart(2, '0')
      : date;
    const parsed = new Date(entryDate + 'T00:00:00Z');
    const errors = [];
    if (row.length !== 4) errors.push('Expected four columns.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== entryDate) {
      errors.push('Enter a valid date in dd/mm/yyyy format.');
    } else if (entryDate > today) errors.push('Date cannot be in the future.');
    if (!code) errors.push('Material Code is required.');
    if (!/^\d+(?:\.\d{1,3})?$/.test(quantity) || !(Number(quantity) > 0) || Number(quantity) >= 1e12) {
      errors.push('Enter a positive quantity with up to three decimal places.');
    }
    if (remarks.length > 255) errors.push('Remarks must be 255 characters or fewer.');
    return { rowNumber: index + 2, date, entryDate, code, quantity, remarks, errors };
  });
}
