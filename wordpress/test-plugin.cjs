// End-to-end check of the WordPress plugin: first admin, every menu screen, deep links,
// theme independence and file uploads. Run by .github/workflows/wordpress-plugin.yml.
const { chromium } = require('playwright');
const fs = require('fs');
const SITE = process.env.SITE || 'http://127.0.0.1:8080';
const SHOTS = process.env.SHOTS || 'shots';
const PATHS = '/ /enquiries /enquiry-sync-history /enquiry-settings /contacts /followup-logs /client-categories /states /whatsapp /whatsapp-failed /whatsapp-settings /leads/new /leads/all /follow-ups /lead-sources /customers /orders/new /orders/all /item-fields /pending-drawing /pending-boq /boq-master /material-categories /materials /opening-stock /material-in /suppliers /pending-material-issue /material-issue /damage /production-in-progress /ready-to-dispatch /dispatches /transporters /sample-inventory /sample-issues /inventory /users '.trim().split(/\s+/);
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('auth/me') && !r.url().includes('favicon')) problems.push(r.status() + ' ' + r.url()); });
  const t0 = Date.now();
  await page.goto(SITE + '/candelier/');
  await page.waitForSelector('#l-username', { timeout: 30000 });
  console.log('first load (creates tables via migrations):', Date.now() - t0, 'ms');
  if (!(await page.$('#l-name'))) throw new Error('Expected the "create administrator" screen on first visit');
  await page.screenshot({ path: SHOTS + '/01-setup.png' });
  await page.fill('#l-name', 'Owner');
  await page.fill('#l-username', 'owner');
  await page.fill('#l-password', 'secret123');
  await page.fill('#l-confirm', 'secret123');
  await page.click('button[type=submit]');
  await page.waitForSelector('nav, aside', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + '/02-dashboard.png' });
  // Nothing from WordPress or the theme on the app page.
  const html = await page.content();
  for (const bad of ['wpadminbar', 'wp-block-library', 'wp-content/themes', 'wp-emoji']) if (html.includes(bad)) problems.push('theme/WordPress markup found: ' + bad);
  // Every menu screen, opened as a direct address (as after a browser refresh).
  const timings = [];
  for (const p of PATHS) {
    const s = Date.now();
    await page.goto(SITE + '/candelier' + (p === '/' ? '/' : p));
    await page.waitForLoadState('networkidle');
    timings.push([p, Date.now() - s]);
    const text = await page.locator('body').innerText();
    if (/Page not found|Server error|config\.php is missing/i.test(text)) problems.push('screen problem on ' + p + ': ' + text.slice(0, 120).replace(/\s+/g, ' '));
  }
  console.log('screen load times (ms):', JSON.stringify(timings));
  await page.goto(SITE + '/candelier/orders/new'); await page.waitForLoadState('networkidle'); await page.screenshot({ path: SHOTS + '/03-add-order.png' });
  await page.goto(SITE + '/candelier/contacts'); await page.waitForLoadState('networkidle'); await page.screenshot({ path: SHOTS + '/04-contacts.png' });
  // In-app navigation keeps the /candelier prefix.
  await page.goto(SITE + '/candelier/'); await page.waitForLoadState('networkidle');
  await page.locator('a[href="/candelier/orders/all"]').first().click();
  await page.waitForLoadState('networkidle');
  if (!page.url().endsWith('/candelier/orders/all')) problems.push('menu link went to ' + page.url());
  // Photo upload lands in wp-content/uploads/candelier and is served back.
  const up = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const fd = new FormData(); fd.append('file', blob, 't.png');
    const res = await fetch(window.CANDELIER.apiBase + '?r=uploads', { method: 'POST', body: fd, credentials: 'same-origin' });
    const j = await res.json();
    const path = j.data && j.data.path;
    const file = await fetch(window.CANDELIER.filesBase + path);
    return { status: res.status, path, fileStatus: file.status, url: window.CANDELIER.filesBase + path };
  });
  console.log('upload:', JSON.stringify(up));
  if (up.status !== 201 || up.fileStatus !== 200 || !up.url.includes('/wp-content/uploads/candelier/uploads/')) problems.push('upload problem ' + JSON.stringify(up));
  // Sign out and in again with the app's own login.
  await page.context().clearCookies();
  await page.goto(SITE + '/candelier/');
  await page.waitForSelector('#l-username');
  if (await page.$('#l-name')) problems.push('setup screen shown again after admin exists');
  await page.fill('#l-username', 'owner'); await page.fill('#l-password', 'secret123'); await page.click('button[type=submit]');
  await page.waitForSelector('nav, aside', { timeout: 20000 });
  await browser.close();
  if (problems.length) { console.error('PROBLEMS:\n' + [...new Set(problems)].join('\n')); process.exit(1); }
  console.log('PASS: plugin installs, first admin, all screens, deep links, uploads, own login, no theme markup');
})().catch((e) => { console.error(e); process.exit(1); });
