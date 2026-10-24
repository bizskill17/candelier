const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let role = 'Staff', failStatus = false, failList = false, failFilters = false;
  let rows = Array.from({ length: 41 }, (_, n) => ({
    id: n + 1, order_id: 1, order_no: 'ORD-0001', line_no: n + 1,
    customer_id: n < 21 ? 1 : 2, customer_name: n < 21 ? 'Alpha Customer' : 'Beta Customer',
    project_name: 'Production Project', area: n < 21 ? 'Dining' : 'Living',
    details: [{ name: 'Size', value: `Chandelier ${String(n + 1).padStart(2, '0')}` }],
    item_title: `Chandelier ${String(n + 1).padStart(2, '0')}`,
    label: `ORD-0001 item ${n + 1}`, production_status: 'In Progress', remarks: '', dispatch_id: null,
  }));
  await page.route('**/api/index.php?**', async (route) => {
    const req = route.request(), url = new URL(req.url()), r = url.searchParams.get('r');
    let payload = { data: [] }, code = 200;
    const eligible = () => rows.filter((it) => !it.dispatch_id && it.production_status === url.searchParams.get('status'));
    if (r === 'auth/me') payload = { user: { id: 1, name: 'Test User', role }, needs_setup: false };
    if (r === 'variants/catalog') payload = { data: { materials: [], variants: [], categories: [] } };
    if (r === 'production/filters') {
      const items = eligible();
      payload = { data: { customers: [...new Map(items.map((it) => [it.customer_id, { id: it.customer_id, name: it.customer_name }])).values()], areas: [...new Map(items.map((it) => [`${it.customer_id}-${it.area}`, { customer_id: it.customer_id, name: it.area }])).values()] } };
      if (failFilters) { code = 500; payload = { error: 'Filter service unavailable' }; }
    }
    if (r === 'production') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const data = eligible().filter((it) => (!url.searchParams.get('customer_id') || String(it.customer_id) === url.searchParams.get('customer_id')) && (!url.searchParams.get('area') || it.area === url.searchParams.get('area')) && JSON.stringify(it).toLowerCase().includes(q));
      const pages = Math.max(1, Math.ceil(data.length / 20)), p = Math.min(pages, Number(url.searchParams.get('page') || 1));
      payload = { data: data.slice((p - 1) * 20, p * 20), total: data.length, pages, page: p, per_page: 20 };
      if (failList) { code = 500; payload = { error: 'Production service unavailable' }; }
    }
    if (r === 'production/bulk') {
      if (failStatus) { code = 409; payload = { error: 'Production update rejected' }; }
      else {
        const changes = req.postDataJSON().changes;
        for (const change of changes) {
          const item = rows.find((it) => it.id === change.id);
          if ('status' in change) item.production_status = change.status;
          if ('remarks' in change) item.remarks = change.remarks;
        }
        payload = { updated: changes.length, message: 'Production changes saved' };
      }
    }
    if (/^order-items\/\d+\/production-status$/.test(r)) {
      const item = rows.find((it) => it.id === Number(r.split('/')[1]));
      if (failStatus) { code = 409; payload = { error: 'Production update rejected' }; }
      else { item.production_status = req.postDataJSON().status; payload = { data: item, message: 'Production status saved' }; }
    }
    if (/^order-items\/\d+\/dispatch$/.test(r)) {
      rows.find((it) => it.id === Number(r.split('/')[1])).dispatch_id = 1;
      payload = { data: {}, message: 'Item dispatched' };
    }
    if (r === 'dispatches') payload = { data: rows.filter((it) => it.dispatch_id).map((it) => ({ ...it, order_item_id: it.id, dispatch_no: 'DSP-0001', dispatch_date: '2026-10-24' })) };
    await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  const openProgress = async () => { await page.goto('http://127.0.0.1:5173/production-in-progress'); await page.getByText('41 items', { exact: true }).waitFor(); };
  await openProgress();
  await page.getByRole('link', { name: 'Ready to Dispatch', exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 20);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByText('Chandelier 21', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByText('Chandelier 41', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByRole('combobox').selectOption('Complete');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByText('40 items', { exact: true }).waitFor();
  await page.getByText('Page 2 of 2', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 20);
  await page.getByRole('textbox', { name: 'Search production items' }).fill('Chandelier 01');
  await page.getByText('1 item', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  failStatus = true;
  await page.getByRole('combobox').selectOption('Complete');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByText('Production update rejected', { exact: true }).waitFor();
  assert.equal(rows[0].production_status, 'In Progress');
  failStatus = false;
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByText('40 items', { exact: true }).waitFor();
  await page.locator('#production-customer').click();
  await page.getByRole('textbox', { name: 'Search options' }).fill('Beta');
  assert.equal(await page.locator('[data-searchselect-panel]').getByRole('option').count(), 1);
  await page.getByRole('option', { name: 'Beta Customer', exact: true }).click();
  await page.getByText('19 items', { exact: true }).waitFor();
  await page.locator('#production-area').click();
  await page.getByRole('textbox', { name: 'Search options' }).fill('Liv');
  await page.getByRole('option', { name: 'Living', exact: true }).click();
  assert.equal(await page.locator('tbody tr').count(), 19);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByText('40 items', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/candelier-production-progress.png', fullPage: true });
  await page.getByRole('link', { name: 'Ready to Dispatch', exact: true }).click();
  await page.getByText('Chandelier 41', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Move Back to In Progress', exact: true }).click();
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByText('No completed items awaiting dispatch.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Production In Progress', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search production items' }).fill('Chandelier 41');
  await page.getByText('1 item', { exact: true }).waitFor();
  await page.getByRole('combobox').selectOption('Complete');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByText('No items match these filters.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Ready to Dispatch', exact: true }).click();
  await page.getByText('Chandelier 41', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/candelier-production-ready.png', fullPage: true });
  await page.getByRole('button', { name: 'Dispatch', exact: true }).click();
  await page.locator('#dp-date').waitFor();
  await page.getByRole('button', { name: 'Dispatch', exact: true }).last().click();
  await page.getByText('No completed items awaiting dispatch.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Dispatches', exact: true }).click();
  await page.getByText('Chandelier 41', { exact: true }).waitFor();
  // Errors are recoverable, and stale rows are hidden while loading/failing.
  failList = true; failFilters = true;
  await page.goto('http://127.0.0.1:5173/production-in-progress');
  await page.getByText('Production service unavailable', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox').count(), 0);
  failList = false; failFilters = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText('40 items', { exact: true }).waitFor();
  // Edits remain pending across pages and are saved together, not on change.
  await page.getByRole('textbox', { name: 'Remarks for ORD-0001 item 1', exact: true }).fill('Assembly checked');
  assert.equal(rows[0].remarks, '');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByText('Chandelier 21', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Remarks for ORD-0001 item 21', exact: true }).fill('Polish checked');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByRole('button', { name: 'Update', exact: true }).isDisabled();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Polish checked');
  assert.equal(rows[0].remarks, 'Assembly checked');
  assert.equal(rows[20].remarks, 'Polish checked');
  await page.getByRole('textbox', { name: 'Remarks for ORD-0001 item 21', exact: true }).fill('Discard this');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Remarks for ORD-0001 item 21', exact: true }).inputValue(), 'Polish checked');
  // Viewer retains filters/pagination but has no mutation controls.
  role = 'Viewer';
  await page.reload();
  await page.getByText('40 items', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox').count(), 0);
  rows[0].production_status = 'Complete';
  await page.goto('http://127.0.0.1:5173/ready-to-dispatch');
  await page.getByText('Chandelier 01', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Dispatch', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Move Back to In Progress', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Update', exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/candelier-production-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Production UI checks passed: pagination, filters, status persistence/failure, correction, dispatch, errors, and Viewer permissions.');
})().catch((e) => { console.error(e); process.exit(1); });
