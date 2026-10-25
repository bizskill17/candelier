// CSV import accepts quoted commas, line breaks, escaped quotes and UTF-8 BOM.
export function parseContactsCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"' && cell === '' && !closed) quoted = true;
    else if (c === ',') { row.push(cell.trim()); cell = ''; closed = false; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; closed = false;
    } else {
      if (c === '"' || (closed && c.trim())) throw new Error('Invalid CSV quoting. Save the template as CSV and retry.');
      if (!closed) cell += c;
    }
  }
  if (quoted) throw new Error('The CSV has an unclosed quotation mark.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift();
  if (!header || header.length !== 11 || header.map((x) => x.toLowerCase()).join('|') !== 'contact name|company name|mobile|alternate mobile|email|category|source|source details|city|state|address') throw new Error('Use the Contacts CSV template and keep its 11 columns.');
  if (!rows.length || rows.length > 1000) throw new Error('Upload between 1 and 1000 contact rows.');
  return rows.map((r, i) => { if (r.length !== 11) throw new Error(`Row ${i + 2}: expected 11 columns.`); return Object.fromEntries(['name','company_name','mobile','alternate_mobile','email','category','source','source_details','city','state','address'].map((key,index)=>[key,r[index]])); });
}
