// CSV import accepts quoted commas, line breaks, escaped quotes and UTF-8 BOM.
export function readCsvRows(text) {
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
  return rows;
}

export function parseMaterialCsv(text) {
  const rows = readCsvRows(text);
  const header = rows.shift();
  if (!header || header.map((x) => x.toLowerCase()).join('|') !== 'name|code|colour|category|photo|unit') throw new Error('Use the template columns: Name, Code, Colour, Category, Photo, Unit.');
  if (!rows.length || rows.length > 500) throw new Error('Upload between 1 and 500 material rows.');
  return rows.map((r, i) => { if (r.length !== 6) throw new Error(`Row ${i + 2}: expected 6 columns.`); return { name: r[0], material_code: r[1], color: r[2], category: r[3], photo_path: r[4], unit: r[5] }; });
}
