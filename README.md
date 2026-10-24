# Candelier Management System

Order, BOQ and stores management for a chandelier workshop. **Quantities only, no rates or prices anywhere.**

Stack: React 18 + Vite + Tailwind CSS (frontend), PHP 8 + MySQL API (backend), hosted on Hostinger.

## How it works

Stock is kept per **material + specification**. Each material (e.g. Crystal) has specification fields set once in
the Materials master (e.g. Shape, Size, Colour, Quality). The values are typed wherever material is used, with
suggestions from earlier values, and every new combination becomes its own stock item
(e.g. *Crystal · Prism · 50 mm · Clear · K9*).

### CRM (before the order)

1. **Add Lead**: New or Existing customer and **Lead Type** (Hot by default / Cold) side by side; name, phone, address (new) or the
   customer (existing); Email; City, **State** (dropdown from Masters → States, **+** adds one), Contact Person,
   Contact Person Mobile (Phone and Contact Person Mobile must be 10-digit numbers); Source (Instagram Ads, Facebook Ads, Google Ads, Walk-in, Existing Customer, Referral, Other; the **+**
   beside it adds a new source, also editable in Masters → Lead Sources); Requirement (required); Remarks.
2. A **Hot** lead is due for follow-up from the lead date. A **Cold** lead is not, until it is marked Hot.
3. **Due Follow Ups** lists open leads: All (every lead not yet Success or Fail), Overdue, Today, Upcoming (Hot leads by due date). The **Follow Up** form has Date, Status, Follow Up By (a user)
   and Remarks. Status:
   - **Follow Up Again**: Next Follow Up Date (and optional time); the lead comes back on that date.
   - **Success**: the lead closes. A new lead's customer is added to Customers automatically (with all its details).
     **Create Order** opens Add Order with the customer filled in and links the order to the lead.
   - **Fail**: the lead closes.
4. Every follow-up is kept on the lead, and **Follow Up Logs** lists all follow-ups (filter by date, status, user). The latest one can be removed if entered by mistake.

### Customers

Name, Phone (10 digits), Email, Contact person, Contact person mobile (10 digits), City, State (from Masters → States, **+**
adds one on the spot), Address. A customer made from a lead gets all the lead's details; choosing an existing customer on
Add Lead fills City, State, Email, Contact person and mobile from the customer.

### Workflow

1. Enter **Opening Stock** (fill specification values like the BOQ).
2. Purchase material or receive samples; record in **Material In** (type Purchase / Sample). Samples are usable stock.
3. Receive an **order** (customer, name of project) with one or more order items. Each order item is exactly one piece.
   Type its **Area** (plain text, optional, e.g. Dining), then click the item cell to fill your own **item fields** (Size,
   Glass Colour, Glass Shape, Glass Qty, Metal Plate, Lights… set once in Masters → Item Fields) in a box, like a material
   specification; they then show joined in one line, e.g. *Size: 6.5 ft X 6.5 ft X 2.5 ft · Glass Colour: Amber*. The item's name
   everywhere is *Area · joined details*. Each item also has Remarks,
   two photos (**Component Picture**, **Reference Image**) and its **Drawing** (PDF or image), which opens from the order,
   Order Master and the BOQ.
4. Open each item's **BOQ**. It offers to copy an earlier BOQ, which fills all specifications and quantities at once.
5. All materials are listed. Click a material's specification to fill its fields; it then shows as one joined line. Enter Qty Required.
6. The BOQ shows, live: In Stock, Booked (All Orders), Available to Book, Booked (This Item), Required, Consumed.
7. Save the BOQ (only specifications and quantities are saved).
8. **Book** available stock to the item (Release gives it back).
9. Where Required is still above zero, buy the material and book it when it arrives.
10. Set a **production date** on each item. To see what is planned, filter **Order Master** by production date (From–To);
    matching items are highlighted. Print each BOQ (Print / PDF) with the item details and photos.
11. **Issue** materials to the item as needed, as many times as needed. Consumed goes up; the item's booking is used first.
12. **Dispatch** the item (date, transporter, vehicle no., docket no.). The order becomes Dispatched when all its items are.

Also: **Damage** entries reduce stock; **count corrections** are made from Inventory; a **reorder level** per specification
feeds the **Low Stock** report.

### Calculations (per material + specification, never stored)

| Figure | Calculation |
|---|---|
| In Stock | SUM of the stock ledger (`stock_moves`) |
| Consumed (item) | Total issued to that order item |
| Booked (This Item) | Bookings of the item − its consumed (0 once dispatched or the order is cancelled) |
| Booked (All Orders) | Sum of Booked (This Item) over all items |
| Available to Book | In Stock − Booked (All Orders) |
| Required | Qty Required − Booked (This Item) − Consumed |

Rules: stock never goes below zero; a booking can't exceed Available to Book; an issue can use the item's own booking
and free stock but not stock booked for other orders; records in use can't be deleted, only deactivated.

### Roles

| Role | Can do |
|---|---|
| Admin | Everything, including Users |
| Staff | Everything except Users |
| Viewer | Look at everything, change nothing |

## 1. Set up the database (Hostinger)

1. hPanel → **Databases → Management** → create a MySQL database and user.
2. Open **phpMyAdmin** → **Import** → choose `database/schema.sql` → Go.

This version is a fresh design: import it into an **empty** database (the tables differ from earlier versions).

## 2. Configure the API

Copy `api/config.sample.php` to `api/config.php` and fill in the database name, user and password.
`config.php` is ignored by Git.

## 3. First sign-in

Open the site. With no users yet, it asks you to **create the administrator account**. Then:
1. **Materials**: add your materials and their specification fields.
2. **Item Fields** (the defaults match a typical quotation; rename, reorder or add), **Customers, Suppliers, Transporters**.
3. **Opening Stock**.

## 4. Run locally (optional)

Requires Node.js 18+, PHP 8+ and MySQL.

```bash
npm install
php -S localhost:8000          # terminal 1: serves api/ from the project folder
npm run dev                    # terminal 2: http://localhost:5173 (API calls go to :8000)
```

## 5. Build and upload to Hostinger

```bash
npm run build
```

Upload to `public_html`: everything inside `dist/` (including the hidden `.htaccess` files, also `uploads/.htaccess`) and the
`api/` folder (including `api/config.php` and `api/.htaccess`). Check `https://yourdomain.com/api/index.php?r=health`.

### Photos and drawings

Order item photos are uploaded to `public_html/uploads/items/<year>/<month>/` (created automatically; the folder must be
writable, which it is by default on Hostinger). Photos are shrunk in the browser to at most 1600 px before upload, and the
server accepts JPG, PNG, WEBP and GIF up to 8 MB. `uploads/.htaccess` stops scripts from running there. Drawings (PDF, JPG, PNG or WEBP, up to 25 MB, not shrunk) go to `public_html/uploads/drawings/<year>/<month>/`.
`api/.user.ini` raises PHP's upload limit to 32 MB; if a drawing upload says it is larger than the server allows, set
`upload_max_filesize` and `post_max_size` in hPanel → Advanced → PHP Configuration. When you upload a new build, don't delete
the `uploads` folder: it holds your photos and drawings. Include it in your backups.

## Project structure

```
api/
  index.php                 entry point: sign-in check, roles, routing
  entities.php              simple masters (customers, suppliers, transporters, users)
  lib/stock.php             specifications, stock ledger, bookings and live figures
  handlers/auth.php         sign in/out, first admin setup, change password
  handlers/masters.php      generic list / save / status / delete for simple masters
  handlers/materials.php    materials + specification fields, specification catalogue
  handlers/items.php        order item fields, item details, photo and drawing uploads
  handlers/orders.php       orders, order items, production plan, dispatch
  handlers/boq.php          BOQ per order item, booking / release
  handlers/stores.php       Opening Stock, Material In, Material Issue, Damage
  handlers/inventory.php    inventory, history, reorder level, count correction, low stock, dashboard
  handlers/crm.php          leads, follow-ups, order from a lead
database/schema.sql         MySQL tables (28)
src/
  lib/catalog.jsx           specification catalogue (suggestions, matching)
  components/Spec.jsx       specification cell + fill box
  components/StockLines.jsx material + specification lines for stores documents
  pages/                    orders, boq, stores, materials, masters
public/.htaccess            Hostinger routing for React Router
public/uploads/.htaccess    blocks scripts in the photo folder
```

### Document numbers

| Entry | Format |
|---|---|
| Order | ORD-0001 |
| Material In | MIN-0001 |
| Material Issue | ISS-0001 |
| Damage | DMG-0001 |
| Count correction | ADJ-0001 |
| Dispatch | DSP-0001 |
| Lead | LD-0001 |
