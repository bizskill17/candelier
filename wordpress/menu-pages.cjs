// Reads the app's left menu (src/config/menu.js) and writes the list of WordPress pages to create:
// [{ section, label, path }]. Run by build.sh; the plugin creates one WordPress page per screen.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const out = [];
let section = '';
const re = /heading\s*:\s*'([^']+)'|label\s*:\s*'([^']+)'\s*,\s*path\s*:\s*'([^']+)'/g;
for (let m; (m = re.exec(src)); ) {
  if (m[1]) section = m[1];
  else out.push({ section, label: m[2], path: m[3] });
}
if (out.length < 10) throw new Error('Menu not read: only ' + out.length + ' screens found');
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log('pages.json: ' + out.length + ' screens');
