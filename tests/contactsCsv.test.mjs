import assert from 'node:assert/strict';
import {parseContactsCsv} from '../src/lib/contactsCsv.js';
const h='Contact Name,Company Name,Mobile,Alternate Mobile,Email,Category,Source,Source Details,City,State,Address';
const rows=parseContactsCsv('\uFEFF'+h+'\r\n"Jain, Pankaj",Company,9876501234,,test@example.test,Architect,Referral,,Delhi,Delhi,"Street\nBuilding"\r\n');
assert.equal(rows[0].name,'Jain, Pankaj');assert.equal(rows[0].address,'Street\nBuilding');assert.equal(rows[0].mobile,'9876501234');
assert.throws(()=>parseContactsCsv(h+'\nName,Wrong'),/Row 2/);
assert.throws(()=>parseContactsCsv(h+'\n"Unclosed'),/unclosed/);
assert.throws(()=>parseContactsCsv('Name,Mobile\nTest,9876501234'),/template/);
console.log('Contacts CSV parsing checks passed.');
