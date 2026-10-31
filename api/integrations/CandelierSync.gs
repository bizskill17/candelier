/** Candelier enquiry sync. Paste into a NEW Apps Script file; do not replace existing scripts. */
const CANDELIER_SETUP = {
  spreadsheetId: '__SHEET_ID__', tabName: '__TAB_NAME__', token: '__TOKEN__',
  endpoint: '__ENDPOINT__'
};
function setupCandelierSync() {
  const props = PropertiesService.getScriptProperties();
  const old = props.getProperty('CANDELIER_CONFIG');
  props.setProperty('CANDELIER_CONFIG', JSON.stringify(CANDELIER_SETUP));
  try {
    const sheet = SpreadsheetApp.openById(CANDELIER_SETUP.spreadsheetId).getSheetByName(CANDELIER_SETUP.tabName);
    if (!sheet) throw new Error('Configured sheet tab was not found.');
    candelierHeaders_(sheet);
    candelierRequest_({operation: 'status'});
    ScriptApp.getProjectTriggers().forEach(t => {
      if (['candelierSync', 'candelierOnOpen'].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('candelierSync').timeBased().everyMinutes(15).create();
    ScriptApp.newTrigger('candelierOnOpen').forSpreadsheet(CANDELIER_SETUP.spreadsheetId).onOpen().create();
    candelierOnOpen();
    SpreadsheetApp.getUi().alert('Connection verified. Automatic sync is installed every 15 minutes. Use Candelier → Test first 10 rows, then Sync Now for the complete sheet.');
  } catch (e) {
    if (old) props.setProperty('CANDELIER_CONFIG', old); else props.deleteProperty('CANDELIER_CONFIG');
    throw e;
  }
}
function candelierOnOpen() {
  SpreadsheetApp.getUi().createMenu('Candelier')
    .addItem('Test first 10 rows', 'candelierTestSync')
    .addItem('Sync Now', 'candelierSync')
    .addItem('Restart full sync', 'candelierRestartSync')
    .addItem('Stop automatic sync', 'candelierStopSync').addToUi();
}
function candelierRequest_(body) {
  const config = JSON.parse(PropertiesService.getScriptProperties().getProperty('CANDELIER_CONFIG') || 'null');
  if (!config) throw new Error('Run setupCandelierSync first.');
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = UrlFetchApp.fetch(config.endpoint, {
        method: 'post', contentType: 'application/json',
        headers: {'X-Candelier-Enquiry-Key': config.token},
        payload: JSON.stringify({spreadsheet_id: config.spreadsheetId, tab_name: config.tabName, ...body}),
        muteHttpExceptions: true, followRedirects: false
      });
      const code = response.getResponseCode();
      if (code >= 200 && code < 300) return JSON.parse(response.getContentText());
      if (code < 500 && code !== 429) throw new Error('Candelier rejected the request (HTTP ' + code + '). Check the connection settings and Sync History.');
      last = new Error('Candelier is temporarily unavailable (HTTP ' + code + ').');
    } catch (e) {
      if (/rejected the request/.test(e.message)) throw e;
      last = e;
    }
    Utilities.sleep(1000 * (attempt + 1));
  }
  throw new Error('Candelier sync could not complete. The checkpoint is retained for retry.');
}
function candelierHeaders_(sheet) {
  const headings = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(v => v.trim());
  ['id', 'full_name', 'phone_number', 'email'].forEach(key => {
    if (headings.filter(h => h === key).length !== 1) throw new Error('Missing or duplicate required heading: ' + key);
  });
  return headings;
}
function candelierRows_(sheet, headings, start, count) {
  if (!count) return [];
  const range = sheet.getRange(start, 1, count, headings.length);
  const displayed = range.getDisplayValues(), raw = range.getValues();
  const allowed = ['id','created_time','ad_id','ad_name','adset_id','adset_name','campaign_id','campaign_name','form_id','form_name','is_organic','platform','project_type','approximate_customization__chandelier_budget','project_timeline','how_many_customized_chandeliers_do_you_require?','full_name','email','phone_number','city','lead_status'];
  return displayed.map((values, i) => {
    const row = {_row: start + i};
    headings.forEach((key, j) => { if (allowed.includes(key)) row[key] = key === 'created_time' && raw[i][j] instanceof Date ? raw[i][j].toISOString() : values[j]; });
    return row;
  }).filter(row => String(row.id || '').trim() !== '' && !/^<test lead/i.test(String(row.full_name || '')));
  // Rows without a lead id (blank rows) and Meta "test lead" rows are skipped.
}
function candelierTestSync() { candelierRun_(true); }
function candelierSync() { candelierRun_(false); }
function candelierRestartSync() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('CANDELIER_ROW'); props.deleteProperty('CANDELIER_CYCLE'); candelierSync();
}
function candelierRun_(testOnly) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  const props = PropertiesService.getScriptProperties(); const started = Date.now();
  try {
    const config = JSON.parse(props.getProperty('CANDELIER_CONFIG') || 'null');
    if (!config) throw new Error('Run setupCandelierSync first.');
    const control = candelierRequest_({operation: 'status'});
    const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(config.tabName);
    if (!sheet) throw new Error('Configured sheet tab was not found.');
    const headers = candelierHeaders_(sheet), lastRow = sheet.getLastRow();
    let start = testOnly || control.full_sync_requested ? 2 : Number(props.getProperty('CANDELIER_ROW') || 2);
    if (start > lastRow || start < 2) start = 2;
    let cycle = testOnly ? Utilities.getUuid() : props.getProperty('CANDELIER_CYCLE');
    if (!cycle || control.full_sync_requested) cycle = Utilities.getUuid();
    if (!testOnly) props.setProperty('CANDELIER_CYCLE', cycle);
    let issues = 0;
    do {
      const count = Math.min(testOnly ? 10 : 100, Math.max(0, lastRow - start + 1));
      const rows = candelierRows_(sheet, headers, start, count);
      const result = candelierRequest_({request_key: cycle + '-' + start, rows});
      issues += (result.errors || []).length;
      start += count;
      if (testOnly) break;
      props.setProperty('CANDELIER_ROW', String(start));
      if (start > lastRow || !count) {
        // A new cycle checks edited and newly appended source rows without duplicating enquiries.
        props.setProperty('CANDELIER_ROW', '2'); props.deleteProperty('CANDELIER_CYCLE'); break;
      }
    } while (Date.now() - started < 240000);
    props.setProperty('CANDELIER_LAST_RUN', new Date().toISOString());
    if (testOnly) SpreadsheetApp.getUi().alert('Test batch received by Candelier. Row errors: ' + issues + '. Review Enquiry Inbox and Sync History before continuing.');
  } catch (e) {
    try { candelierRequest_({operation: 'failure', request_key: Utilities.getUuid(), message: 'Google script could not finish. Check Apps Script Executions and verify the sheet headings and connection. The previous checkpoint was retained.'}); } catch (ignored) {}
    throw e;
  } finally { lock.releaseLock(); }
}
function candelierStopSync() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'candelierSync') ScriptApp.deleteTrigger(t); });
  SpreadsheetApp.getUi().alert('Automatic Candelier sync stopped. Existing app data is unchanged.');
}
