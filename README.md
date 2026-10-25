# Candelier Management System

Workshop CRM, orders, BOQs and stores management. Quantities only.

## Materials

Create Material Categories, then materials. Each material requires one category and a unit.
Materials have no specification fields. Use Bulk Upload and the downloadable CSV template
(Material Code, Material Category, Material Name, Unit). Categories must already exist. Up to 500 rows are
validated together; invalid uploads import nothing and show row-specific errors.
Every new material needs a manually entered, unique Material Code. Individually added
or edited materials require a photo; bulk CSV imports may omit photos and display
Photo pending until completed through Edit. Upload an image or use Take Photo to
capture from a mobile camera or laptop webcam. Camera permission is requested only
when Take Photo is clicked; streams stop when the capture window closes. Existing
materials retain their IDs and remain usable; missing codes/photos are completed
on editing. The migration never invents codes. BOQ rows display live material codes
and photo thumbnails; click a thumbnail to enlarge it. Photos also appear when printing.

## BOQ workflow

Open an order item's BOQ. Start with a blank row and use Add Row. Select Material Category,
then Material, then Quantity; Unit is automatic. Duplicate materials are not allowed.

- **Save as Draft** retains incomplete work (including category-only rows). Issuing is blocked.
- **Save as Final** requires at least one complete row. Issuing becomes available.
- Both statuses remain editable. Saving a Final BOQ as Draft blocks further issues until finalised.
- Issued materials cannot be removed or reduced below quantities already issued. Release excess
  bookings before reducing Final quantities. Existing material issues/ledger entries are retained.
- Material Issue accepts only materials in the Final BOQ, up to its remaining requirement,
  and does not consume stock reserved for other order items.

BOQ Master includes Draft/Final filters. Pending BOQ includes untouched and Draft BOQs.
Opening Stock, Material In, Issue and Damage use category-filtered material selectors.
Inventory and Low Stock track one balance per material.

## Production and dispatch

Orders includes **Production In Progress** and **Ready to Dispatch**. Each order item
appears once after its first saved Material Issue, including existing issued items.
Production Status defaults to In Progress. Edit statuses and Remarks across rows/pages, then
click Update above the table to save the entire edited set together. Choose Complete and
Update to move the item to Ready to Dispatch; use the existing Dispatch dialog there, or Move Back to In Progress for corrections.
Dispatched and cancelled items are excluded. Undoing dispatch restores the saved production
status. Additional issues do not reset completion. Removing or reassigning issues updates
view membership from the current issue links. Customer and Area filters are searchable;
text search and server pagination use 20 items per page. Viewer accounts remain read-only.

## Upgrade and existing records

The first API request after deployment runs the versioned migration under a database lock.
Pre-conversion snapshots of materials, stock identities, BOQ lines and order items are retained
in `backup_categories_*` tables. Existing materials are assigned **Uncategorised**; reassign
these through Materials. Distinct legacy specification combinations become separately named
materials. Ledger identities, movements, bookings, reorder levels and issue history are preserved.
Existing Saved BOQs become Final. Legacy field/value tables remain as historical data only.
Do not manually merge or delete stock identities.

## Installation

React 18 + Vite + Tailwind; PHP 8 + MySQL/MariaDB. Import `database/schema.sql` into an empty
database. Configure `api/config.php` using `api/config.sample.php`. First sign-in creates an Admin.
Admin manages Users and corrections; Sales manages shared CRM and assigned Orders/BOQs; Store manages stock, production completion and dispatch.

Build with `npm install` and `npm run build`. Upload `dist/` contents and `api/` to `public_html`.
Preserve `api/config.php` and `uploads/`. GitHub Actions deploys main after build, syntax,
CSV and isolated database integration checks. The server configuration is created only when missing.

For local development, run PHP on port 8000 and `npm run dev` (Vite proxies `/api` and `/uploads`).

## Validation

`node tests/materialCsv.test.mjs` checks CSV parsing. `php tests/workflow.php` requires an isolated
MySQL database called `candelier_test` via `TEST_DB_DSN`; it creates fixture data in that test database.
Never run it against a production database. CI provisions its own MariaDB service.

## CRM

Contacts are the single identity record. Leads store a Contact link, enquiry date,
project and requirement. The shared `followups` table holds all status, Hot/Warm/Cold,
remarks and next schedules; latest activity time then entry ID determines current state.
Direct Contact follow-ups and Lead follow-ups have separate schedules. Lead Created
and Status Update events are history, not actual follow-up attempts.

CRM → Contacts includes Never Followed Up, Due Today, Upcoming, Overdue,
Next Date Missing and Closed Follow-ups. Use Requirement Received in a Contact
follow-up to create its Lead in the same transaction. User and entry timestamp are
captured automatically. Times use Asia/Kolkata. Lists use 20 rows per page.
Customers shows Contacts with a non-cancelled Order; creating an Order selects the
same Contact. All Contacts remain available for new Orders. Sources and Contact
Categories are maintained in Masters. Contacts and Customers retain City/Category
filters and Excel export. Contacts supports CSV template, preview and atomic bulk
upload with duplicate-mobile/email checks.

The first API request upgrades existing records under a database lock. Existing
Customer and Lead IDs and Order/BOQ/stock/production/dispatch links are preserved.
`legacy_crm_customers`, `legacy_crm_leads` and `legacy_crm_followups` preserve
original rows, including legacy contact-person text; they are audit snapshots only.
The `customers` compatibility view projects Contacts for operational queries.
`crm_contact_current` and `crm_lead_current` derive current schedules and state.
The schema file is the installation bootstrap; API migrations establish the current
schema on both fresh installations and upgrades. Do not reimport it over an upgraded DB.

`node tests/contactsCsv.test.mjs` validates the Contact CSV parser. CRM migration,
identity, schedules, atomic Lead creation, retry protection and Customer membership
are tested by `tests/crm.php` inside `tests/workflow.php`. The validation workflow
also exercises the CRM browser screens alongside operational UI checks.

## Roles and Order assignment

Only Admin edits, deletes or cancels saved records. Sales may create Contacts,
Leads, follow-ups and Orders. All Sales users share CRM visibility; only assigned
Orders and their BOQs are visible to each salesperson. Sales-created Orders are
assigned to the signed-in Sales user; Admin selects or reassigns an active Sales
user through Assigned Salesperson. Sales may continue a Pending/Draft BOQ and
finalise it. Once Final, only Admin may correct it.

Store views all Orders and Final BOQs, creates material receipts/issues/damage,
new materials and selected store masters, appends new opening-stock rows, completes
production and records dispatch. Only Admin changes existing entries, Order
remarks, reverses completion, edits dispatch or undoes it. Store dispatch requires
completed production. Sales can read stock availability but not the stock ledger.
All permissions and ownership restrictions are enforced in PHP, including details,
counts, dropdowns, BOQ copy sources, CRM Order links, item suggestions and exports.

The migration preserves user IDs and snapshots original users in backup_roles_users.
Staff becomes Sales. Former Viewer accounts become inactive Sales pending Admin
review, so read-only users never silently gain write access. Existing Orders are
assigned only when their existing Order By user is Sales; remaining unassigned
Orders stay visible to Admin/Store until Admin assigns them. No new users are created.

BOQ Master is labelled Orders with BOQ; its old URL remains valid. Orders Pending
Material Issue lists Final BOQ items with remaining quantities, including partial
issues; cancelled/dispatched items are excluded. It is scoped to assigned Orders
for Sales and provides Issue Material for Store/Admin. Lists paginate after 20 rows.
