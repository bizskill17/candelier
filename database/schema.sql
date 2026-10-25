-- Candelier Management System - MySQL schema
-- Import once in phpMyAdmin (Import tab) on an empty database.
-- Quantities only: there are no rates, prices or amounts anywhere.
--
-- Stock is kept per material + specification ("variant").
-- Stock in hand = SUM(stock_moves.quantity) for the variant. Never below zero.

SET NAMES utf8mb4;

-- ---------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(20)  NOT NULL,
  name           VARCHAR(100) NOT NULL,
  username       VARCHAR(50)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'Sales' COMMENT 'Admin, Store, Sales',
  phone          VARCHAR(20)  NULL,
  last_login     DATETIME     NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_code (code),
  UNIQUE KEY uq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Masters
-- ---------------------------------------------------------------
-- States (editable list; all Indian states and union territories to start with)
CREATE TABLE IF NOT EXISTS states (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL,
  name        VARCHAR(60)  NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_state_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO states (code, name) VALUES
  ('ST-0001', 'Andaman and Nicobar Islands'),
  ('ST-0002', 'Andhra Pradesh'),
  ('ST-0003', 'Arunachal Pradesh'),
  ('ST-0004', 'Assam'),
  ('ST-0005', 'Bihar'),
  ('ST-0006', 'Chandigarh'),
  ('ST-0007', 'Chhattisgarh'),
  ('ST-0008', 'Dadra and Nagar Haveli and Daman and Diu'),
  ('ST-0009', 'Delhi'),
  ('ST-0010', 'Goa'),
  ('ST-0011', 'Gujarat'),
  ('ST-0012', 'Haryana'),
  ('ST-0013', 'Himachal Pradesh'),
  ('ST-0014', 'Jammu and Kashmir'),
  ('ST-0015', 'Jharkhand'),
  ('ST-0016', 'Karnataka'),
  ('ST-0017', 'Kerala'),
  ('ST-0018', 'Ladakh'),
  ('ST-0019', 'Lakshadweep'),
  ('ST-0020', 'Madhya Pradesh'),
  ('ST-0021', 'Maharashtra'),
  ('ST-0022', 'Manipur'),
  ('ST-0023', 'Meghalaya'),
  ('ST-0024', 'Mizoram'),
  ('ST-0025', 'Nagaland'),
  ('ST-0026', 'Odisha'),
  ('ST-0027', 'Puducherry'),
  ('ST-0028', 'Punjab'),
  ('ST-0029', 'Rajasthan'),
  ('ST-0030', 'Sikkim'),
  ('ST-0031', 'Tamil Nadu'),
  ('ST-0032', 'Telangana'),
  ('ST-0033', 'Tripura'),
  ('ST-0034', 'Uttar Pradesh'),
  ('ST-0035', 'Uttarakhand'),
  ('ST-0036', 'West Bengal');

-- Client categories (editable list)
CREATE TABLE IF NOT EXISTS client_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL,
  name        VARCHAR(60)  NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_category_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO client_categories (code, name) VALUES
  ('CC-0001', 'Architect'),
  ('CC-0002', 'Interior Designer'),
  ('CC-0003', 'Hotel'),
  ('CC-0004', 'Banquet'),
  ('CC-0005', 'Residential'),
  ('CC-0006', 'Dealer');

CREATE TABLE IF NOT EXISTS customers (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20)  NOT NULL,
  name            VARCHAR(150) NOT NULL,
  phone           VARCHAR(20)  NULL COMMENT '10-digit mobile',
  email           VARCHAR(150) NULL,
  contact_person  VARCHAR(100) NULL,
  contact_mobile  VARCHAR(10)  NULL COMMENT '10-digit mobile',
  city            VARCHAR(80)  NULL,
  state_id        INT UNSIGNED NULL,
  address         VARCHAR(255) NULL,
  category_id     INT UNSIGNED NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customer_code (code),
  KEY idx_customer_city (city),
  CONSTRAINT fk_customer_state FOREIGN KEY (state_id) REFERENCES states(id),
  CONSTRAINT fk_customer_category FOREIGN KEY (category_id) REFERENCES client_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20)  NOT NULL,
  name            VARCHAR(150) NOT NULL,
  contact_person  VARCHAR(100) NULL,
  phone           VARCHAR(20)  NULL,
  city            VARCHAR(80)  NULL,
  address         VARCHAR(255) NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_supplier_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transporters (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(20)  NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transporter_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fields that describe an order item (your own list), e.g. Size, Glass Colour, Glass Shape
CREATE TABLE IF NOT EXISTS item_fields (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO item_fields (name, sort_order) VALUES
  ('Size', 1), ('Glass Colour', 2), ('Glass Shape', 3), ('Glass Qty', 4), ('Metal Plate', 5), ('Lights', 6);

-- ---------------------------------------------------------------
-- Materials and their specifications
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS material_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS materials (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name        VARCHAR(100) NOT NULL,
  unit        VARCHAR(20)  NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0 COMMENT 'Row order on the BOQ',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_material_name (name),
  KEY idx_material_category (category_id),
  CONSTRAINT fk_material_category FOREIGN KEY (category_id) REFERENCES material_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Specification fields of a material, e.g. Crystal: Shape, Size, Colour, Quality
CREATE TABLE IF NOT EXISTS material_spec_fields (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  material_id  INT UNSIGNED NOT NULL,
  name         VARCHAR(50)  NOT NULL,
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_msf_material (material_id),
  CONSTRAINT fk_msf_material FOREIGN KEY (material_id) REFERENCES materials(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per specification actually used (created automatically on first use)
CREATE TABLE IF NOT EXISTS material_variants (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  material_id    INT UNSIGNED NOT NULL,
  spec_key       VARCHAR(255) NOT NULL COMMENT 'Values in field order, lower-case, trimmed, joined by |',
  spec_text      VARCHAR(255) NOT NULL COMMENT 'Display line, e.g. Prism · 50 mm · Clear · K9',
  reorder_level  DECIMAL(12,3) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_variant (material_id, spec_key),
  CONSTRAINT fk_variant_material FOREIGN KEY (material_id) REFERENCES materials(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_variant_values (
  variant_id     INT UNSIGNED NOT NULL,
  spec_field_id  INT UNSIGNED NOT NULL,
  value          VARCHAR(100) NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (variant_id, spec_field_id),
  KEY idx_mvv_field (spec_field_id),
  CONSTRAINT fk_mvv_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id) ON DELETE CASCADE,
  CONSTRAINT fk_mvv_field FOREIGN KEY (spec_field_id) REFERENCES material_spec_fields(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Orders. Each order item is exactly one piece (no quantity).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no          VARCHAR(20)  NOT NULL,
  order_date        DATE         NOT NULL,
  delivery_date     DATE         NULL,
  customer_id       INT UNSIGNED NOT NULL,
  order_by_id       INT UNSIGNED NULL,
  project_name      VARCHAR(150) NULL COMMENT 'Name of project, e.g. Residence of Mr. Bhatiya',
  shipping_address  VARCHAR(255) NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'Open' COMMENT 'Open, Partly Dispatched, Dispatched (automatic), Cancelled (manual)',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_no (order_no),
  KEY idx_order_customer (customer_id),
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_order_by FOREIGN KEY (order_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id         INT UNSIGNED NOT NULL,
  line_no          INT UNSIGNED NOT NULL,
  area             VARCHAR(100) NULL COMMENT 'Where it goes, e.g. Dining, Entrance Double Height',
  remarks          VARCHAR(255) NULL,
  component_image  VARCHAR(255) NULL COMMENT 'Uploaded file path',
  reference_image  VARCHAR(255) NULL COMMENT 'Uploaded file path',
  drawing_file     VARCHAR(255) NULL COMMENT 'Uploaded drawing (PDF or image) path',
  drawing_name     VARCHAR(150) NULL COMMENT 'Original file name of the drawing',
  production_status VARCHAR(20) NOT NULL DEFAULT 'In Progress' COMMENT 'In Progress, Complete',
  boq_status       VARCHAR(20)  NOT NULL DEFAULT 'Pending' COMMENT 'Pending, Draft, Final',
  boq_draft_json LONGTEXT NULL,
  production_date  DATE         NULL COMMENT 'Production plan date',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_item_order (order_id),
  KEY idx_item_production (production_date),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Values of the item fields for each order item
CREATE TABLE IF NOT EXISTS order_item_values (
  order_item_id  INT UNSIGNED NOT NULL,
  field_id       INT UNSIGNED NOT NULL,
  value          VARCHAR(150) NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (order_item_id, field_id),
  KEY idx_oiv_field (field_id),
  CONSTRAINT fk_oiv_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_oiv_field FOREIGN KEY (field_id) REFERENCES item_fields(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- BOQ (the plan) and bookings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boq_lines (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id  INT UNSIGNED NOT NULL,
  line_no        INT UNSIGNED NOT NULL,
  material_id    INT UNSIGNED NOT NULL,
  variant_id     INT UNSIGNED NOT NULL,
  qty_required   DECIMAL(12,3) NOT NULL,
  remarks        VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_boq_item (order_item_id),
  KEY idx_boq_variant (variant_id),
  CONSTRAINT fk_boq_item FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  CONSTRAINT fk_boq_material FOREIGN KEY (material_id) REFERENCES materials(id),
  CONSTRAINT fk_boq_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock set aside for an order item. A release is a row with a negative quantity.
CREATE TABLE IF NOT EXISTS bookings (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id  INT UNSIGNED NOT NULL,
  variant_id     INT UNSIGNED NOT NULL,
  quantity       DECIMAL(12,3) NOT NULL COMMENT '+ book, - release',
  booked_on      DATETIME     NOT NULL,
  booked_by      INT UNSIGNED NULL,
  notes          VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_booking_item (order_item_id),
  KEY idx_booking_variant (variant_id),
  CONSTRAINT fk_booking_item FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  CONSTRAINT fk_booking_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id),
  CONSTRAINT fk_booking_user FOREIGN KEY (booked_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opening_stock (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entry_date  DATE         NOT NULL,
  variant_id  INT UNSIGNED NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL,
  remarks     VARCHAR(255) NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_opening_variant (variant_id),
  CONSTRAINT fk_opening_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_receipts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_no    VARCHAR(20)  NOT NULL,
  receipt_date  DATE         NOT NULL,
  receipt_type  VARCHAR(20)  NOT NULL DEFAULT 'Purchase' COMMENT 'Purchase, Sample',
  supplier_id   INT UNSIGNED NOT NULL,
  challan_no    VARCHAR(50)  NULL,
  notes         VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_receipt_no (receipt_no),
  KEY idx_receipt_supplier (supplier_id),
  CONSTRAINT fk_receipt_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_receipt_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_id  INT UNSIGNED NOT NULL,
  line_no     INT UNSIGNED NOT NULL,
  variant_id  INT UNSIGNED NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL,
  remarks     VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mri_receipt (receipt_id),
  KEY idx_mri_variant (variant_id),
  CONSTRAINT fk_mri_receipt FOREIGN KEY (receipt_id) REFERENCES material_receipts(id) ON DELETE CASCADE,
  CONSTRAINT fk_mri_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_issues (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  issue_no       VARCHAR(20)  NOT NULL,
  issue_date     DATE         NOT NULL,
  order_item_id  INT UNSIGNED NOT NULL,
  issued_to      VARCHAR(100) NULL,
  notes          VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_issue_no (issue_no),
  KEY idx_issue_item (order_item_id),
  CONSTRAINT fk_issue_item FOREIGN KEY (order_item_id) REFERENCES order_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_issue_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  issue_id    INT UNSIGNED NOT NULL,
  line_no     INT UNSIGNED NOT NULL,
  variant_id  INT UNSIGNED NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL,
  remarks     VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mii_issue (issue_id),
  KEY idx_mii_variant (variant_id),
  CONSTRAINT fk_mii_issue FOREIGN KEY (issue_id) REFERENCES material_issues(id) ON DELETE CASCADE,
  CONSTRAINT fk_mii_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS damages (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  damage_no    VARCHAR(20)  NOT NULL,
  damage_date  DATE         NOT NULL,
  reported_by  VARCHAR(100) NULL,
  notes        VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_damage_no (damage_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS damage_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  damage_id   INT UNSIGNED NOT NULL,
  line_no     INT UNSIGNED NOT NULL,
  variant_id  INT UNSIGNED NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL,
  reason      VARCHAR(20)  NOT NULL DEFAULT 'Broken' COMMENT 'Broken, Defective, Lost, Other',
  remarks     VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_di_damage (damage_id),
  KEY idx_di_variant (variant_id),
  CONSTRAINT fk_di_damage FOREIGN KEY (damage_id) REFERENCES damages(id) ON DELETE CASCADE,
  CONSTRAINT fk_di_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Count corrections after a physical check
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  adj_no      VARCHAR(20)  NOT NULL,
  adj_date    DATE         NOT NULL,
  variant_id  INT UNSIGNED NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL COMMENT '+ adds, - removes',
  notes       VARCHAR(255) NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_adj_no (adj_no),
  KEY idx_adj_variant (variant_id),
  CONSTRAINT fk_adj_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger: every stock movement. Written automatically; never edit by hand.
CREATE TABLE IF NOT EXISTS stock_moves (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  move_date   DATE         NOT NULL,
  variant_id  INT UNSIGNED NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL COMMENT '+ in, - out',
  ref_type    VARCHAR(20)  NOT NULL COMMENT 'opening, receipt, issue, damage, adjustment',
  ref_id      INT UNSIGNED NOT NULL,
  ref_no      VARCHAR(20)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_move_variant (variant_id),
  KEY idx_move_ref (ref_type, ref_id),
  CONSTRAINT fk_move_variant FOREIGN KEY (variant_id) REFERENCES material_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Dispatch: one per order item (no partial dispatch)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispatches (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dispatch_no     VARCHAR(20)  NOT NULL,
  order_item_id   INT UNSIGNED NOT NULL,
  dispatch_date   DATE         NOT NULL,
  transporter_id  INT UNSIGNED NULL,
  vehicle_no      VARCHAR(20)  NULL,
  docket_no       VARCHAR(50)  NULL,
  dispatch_by     VARCHAR(100) NULL,
  dispatch_document VARCHAR(255) NULL,
  dispatch_document_name VARCHAR(150) NULL,
  remarks         VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dispatch_no (dispatch_no),
  UNIQUE KEY uq_dispatch_item (order_item_id),
  CONSTRAINT fk_dispatch_item FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  CONSTRAINT fk_dispatch_transporter FOREIGN KEY (transporter_id) REFERENCES transporters(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- CRM: leads and their follow-ups
-- ---------------------------------------------------------------

-- Where leads come from (editable list)
CREATE TABLE IF NOT EXISTS lead_sources (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL,
  name        VARCHAR(60)  NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lead_source_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lead_sources (code, name) VALUES
  ('SRC-0001', 'Instagram Ads'), ('SRC-0002', 'Facebook Ads'), ('SRC-0003', 'Google Ads'), ('SRC-0004', 'Walk-in'),
  ('SRC-0005', 'Existing Customer'), ('SRC-0006', 'Referral'), ('SRC-0007', 'Other');

CREATE TABLE IF NOT EXISTS leads (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_no             VARCHAR(20)  NOT NULL,
  lead_date           DATE         NOT NULL,
  customer_type       VARCHAR(10)  NOT NULL COMMENT 'Existing or New',
  customer_id         INT UNSIGNED NULL COMMENT 'Existing customer, or the customer created when the order is made',
  name                VARCHAR(150) NULL COMMENT 'New customer name',
  phone               VARCHAR(10)  NULL COMMENT '10-digit mobile',
  email               VARCHAR(150) NULL,
  address             VARCHAR(255) NULL,
  city                VARCHAR(80)  NULL,
  state_id            INT UNSIGNED NULL,
  contact_person      VARCHAR(100) NULL,
  contact_mobile      VARCHAR(10)  NULL COMMENT '10-digit mobile',
  source_id           INT UNSIGNED NULL,
  requirement         VARCHAR(255) NULL,
  temperature         VARCHAR(4)   NOT NULL COMMENT 'Hot or Cold',
  status              VARCHAR(20)  NOT NULL DEFAULT 'Open' COMMENT 'Open, Success, Fail',
  next_followup_date  DATE         NULL,
  next_followup_time  TIME         NULL,
  remarks             VARCHAR(500) NULL,
  order_id            INT UNSIGNED NULL COMMENT 'Order created from this lead',
  created_by          INT UNSIGNED NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lead_no (lead_no),
  KEY idx_lead_due (status, temperature, next_followup_date),
  CONSTRAINT fk_lead_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_lead_source FOREIGN KEY (source_id) REFERENCES lead_sources(id),
  CONSTRAINT fk_lead_state FOREIGN KEY (state_id) REFERENCES states(id),
  CONSTRAINT fk_lead_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_lead_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_followups (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id        INT UNSIGNED NOT NULL,
  followup_date  DATE         NOT NULL,
  status         VARCHAR(20)  NOT NULL COMMENT 'Follow Up Again, Success, Fail',
  next_date      DATE         NULL,
  next_time      TIME         NULL,
  followup_by    INT UNSIGNED NULL,
  remarks        VARCHAR(500) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_followup_lead (lead_id),
  CONSTRAINT fk_followup_lead FOREIGN KEY (lead_id) REFERENCES leads(id),
  CONSTRAINT fk_followup_user FOREIGN KEY (followup_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
