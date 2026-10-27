# Google Sheets enquiry connection

Candelier receives rows from the Meta lead ads sheet **ladecore leads 2026 → Sheet1** (switched on 27-Oct-2026; enquiries imported earlier are kept, and the old key stopped working, so download a new script). It does not alter the sheet or automatically create Contacts. Google Apps Script installation and Google account authorisation must be completed by the sheet owner.

## Install

1. Sign in to Candelier as Admin. Open **Enquiries → Google Sheets Connection**.
2. Download **Connection Script**. This generates a dedicated key restricted to importing enquiries from the configured spreadsheet and tab. A new download invalidates the previous key.
3. Open the Google Sheet. Choose **Extensions → Apps Script**. Add a new `.gs` file named `CandelierSync`; preserve other scripts. Paste the downloaded code and save.
4. Run `setupCandelierSync`. Approve Google access to this spreadsheet, external HTTPS requests, and the script's own triggers. No web app deployment or public sheet sharing is required.
5. Use the new **Candelier → Test first 10 rows** menu. Check **Enquiry Inbox** and **Sync History** in the app. Then select **Sync Now** for the full source.

The installed trigger runs every 15 minutes. Each batch contains at most 100 rows. Long passes stop after about four minutes and resume at the saved row on the next trigger. Completed passes restart at row 2 so source edits are picked up, even if rows are sorted or inserted. The server uses source IDs, not row numbers, for identity. Replayed batches and unchanged rows are safe. If a source edit occurs during an interrupted pass, the next complete pass reconciles it. Do not use a numeric format that rounds source IDs or strips meaningful phone digits.

**Request Full Sync** in the app queues a restart for the next Google trigger; it does not remotely execute Apps Script. **Sync Now** in the sheet runs immediately. Trigger delivery is subject to Google's normal execution quotas and scheduling. For immediate operational errors, check Google Apps Script **Executions**. Requests reaching the app appear in Sync History; connection failures before reaching the server cannot appear there.

## Qualification

Sales and Admin can follow up on enquiries. A follow-up has discussion notes, a method, a decision and a next date where required. Create Lead requires Hot/Warm/Cold and a requirement. New Contacts require category, city and a valid mobile, consistent with the existing CRM. Conflicting phone/email matches require selecting the matching existing Contact. Existing Contact corrections remain Admin-only. Qualification is atomic and idempotent; source sync never changes follow-up decisions or Contact/Lead records. Archive is retained in history; only Admin can reopen it.

## Security and recovery

The integration key is stored only as a SHA-256 hash on the app server. It is generated for an Admin once per script download, never committed in this repository or printed in logs. Treat the downloaded configured script and its Google Script Properties as confidential. The key cannot read CRM data or create Contacts, Leads or follow-ups. Disable it with **Pause Connection**. Source deletions never delete app records. The sheet's `lead_status` is retained as source information and never used to assign Hot/Warm/Cold.

Columns are mapped by exact header name, independent of column order; unnamed or extra columns are ignored. Blank rows and Meta "test lead" rows are skipped. No existing sheet formula, formatting, sharing, trigger or unrelated script is changed by the integration code.
