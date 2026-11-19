export const schemaSql = `
CREATE TABLE zones (
  zone_code text PRIMARY KEY,
  zone_name text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN ('DOCK', 'RESERVE', 'PICK', 'HOLD', 'STAGE'))
);
COMMENT ON TABLE zones IS 'Areas of the building. Every location belongs to one zone.';
COMMENT ON COLUMN zones.zone_type IS 'DOCK, RESERVE, PICK, HOLD or STAGE';

CREATE TABLE locations (
  location_id   integer PRIMARY KEY,
  location_code text NOT NULL UNIQUE,
  zone_code     text NOT NULL REFERENCES zones,
  aisle         integer,
  bay           integer,
  level         text,
  loc_type      text NOT NULL,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED', 'INACTIVE')),
  barcode       text NOT NULL
);
COMMENT ON TABLE locations IS 'Every spot that can hold stock: rack positions, pick shelves, dock doors, staging lanes.';
COMMENT ON COLUMN locations.location_code IS 'What is printed on the label, like R-03-04-B (zone R, aisle 03, bay 04, level B)';
COMMENT ON COLUMN locations.status IS 'ACTIVE, LOCKED (temporarily blocked) or INACTIVE (retired)';
COMMENT ON COLUMN locations.barcode IS 'Scanned by RF guns. Should be unique';

CREATE TABLE vendors (
  vendor_id      integer PRIMARY KEY,
  vendor_name    text NOT NULL,
  city           text NOT NULL,
  state          text NOT NULL,
  lead_time_days integer NOT NULL
);
COMMENT ON TABLE vendors IS 'Suppliers that send stock in on purchase orders.';
COMMENT ON COLUMN vendors.lead_time_days IS 'Days from ordering to the truck arriving';

CREATE TABLE items (
  item_id         integer PRIMARY KEY,
  sku             text NOT NULL UNIQUE,
  description     text NOT NULL,
  category        text NOT NULL,
  vendor_id       integer NOT NULL REFERENCES vendors,
  case_qty        integer NOT NULL,
  unit_cost       numeric(8,2) NOT NULL,
  weight_lb       numeric(6,2) NOT NULL,
  lot_controlled  boolean NOT NULL DEFAULT false,
  shelf_life_days integer,
  created_on      date NOT NULL,
  active          boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE items IS 'The item master: one row per product (SKU).';
COMMENT ON COLUMN items.sku IS 'The item number people use day to day';
COMMENT ON COLUMN items.case_qty IS 'Units in one case';
COMMENT ON COLUMN items.lot_controlled IS 'True when every unit is tracked by lot and expiry date';
COMMENT ON COLUMN items.active IS 'False once an item is discontinued';

CREATE TABLE customers (
  customer_id   integer PRIMARY KEY,
  customer_name text NOT NULL,
  customer_type text NOT NULL CHECK (customer_type IN ('STORE', 'ECOM', 'WHOLESALE')),
  city          text NOT NULL,
  state         text NOT NULL
);
COMMENT ON TABLE customers IS 'Who orders ship to: stores, online sales channels and wholesale accounts.';

CREATE TABLE carriers (
  carrier_code text PRIMARY KEY,
  carrier_name text NOT NULL,
  mode         text NOT NULL,
  departs_at   time NOT NULL
);
COMMENT ON TABLE carriers IS 'Trucking and parcel companies that pick up shipments.';
COMMENT ON COLUMN carriers.mode IS 'PARCEL, LTL (shared truck), TL (full truck) or FLEET (own trucks)';
COMMENT ON COLUMN carriers.departs_at IS 'When the daily truck leaves the dock';

CREATE TABLE users (
  user_id   integer PRIMARY KEY,
  username  text NOT NULL UNIQUE,
  full_name text NOT NULL,
  job_role  text NOT NULL,
  shift     text NOT NULL CHECK (shift IN ('1ST', '2ND', '3RD')),
  hired_on  date NOT NULL,
  active    boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE users IS 'WMS logins, one per person.';
COMMENT ON COLUMN users.shift IS '1ST 6:00-14:30, 2ND 14:30-23:00, 3RD 23:00-6:00';
COMMENT ON COLUMN users.active IS 'False once someone leaves; they can no longer sign in';

CREATE TABLE waves (
  wave_id     integer PRIMARY KEY,
  wave_no     text NOT NULL UNIQUE,
  status      text NOT NULL CHECK (status IN ('PLANNED', 'RELEASED', 'COMPLETE')),
  planned_for timestamp NOT NULL,
  released_at timestamp,
  released_by integer REFERENCES users
);
COMMENT ON TABLE waves IS 'Batches of orders released to the floor together for picking.';
COMMENT ON COLUMN waves.wave_no IS 'W + month + day + run of the day, like W1110-2';

CREATE TABLE orders (
  order_id     integer PRIMARY KEY,
  order_no     text NOT NULL UNIQUE,
  customer_id  integer NOT NULL REFERENCES customers,
  carrier_code text NOT NULL REFERENCES carriers,
  priority     integer NOT NULL DEFAULT 3,
  status       text NOT NULL CHECK (status IN ('NEW', 'RELEASED', 'PICKING', 'PICKED', 'PACKED', 'SHIPPED', 'CANCELLED')),
  ordered_at   timestamp NOT NULL,
  ship_by      date NOT NULL,
  wave_id      integer REFERENCES waves,
  shipped_at   timestamp,
  tracking_no  text
);
COMMENT ON TABLE orders IS 'Outbound customer orders sent down from the ERP.';
COMMENT ON COLUMN orders.priority IS '1 = rush, 3 = normal';
COMMENT ON COLUMN orders.status IS 'NEW > RELEASED > PICKING > PICKED > PACKED > SHIPPED (or CANCELLED)';
COMMENT ON COLUMN orders.ship_by IS 'The date the order must leave the building';

CREATE TABLE order_lines (
  order_line_id integer PRIMARY KEY,
  order_id      integer NOT NULL REFERENCES orders,
  line_no       integer NOT NULL,
  item_id       integer NOT NULL REFERENCES items,
  qty_ordered   integer NOT NULL,
  qty_picked    integer NOT NULL DEFAULT 0,
  qty_shipped   integer NOT NULL DEFAULT 0,
  UNIQUE (order_id, line_no)
);
COMMENT ON TABLE order_lines IS 'One row per item on an order.';

CREATE TABLE purchase_orders (
  po_id         integer PRIMARY KEY,
  po_no         text NOT NULL UNIQUE,
  vendor_id     integer NOT NULL REFERENCES vendors,
  status        text NOT NULL CHECK (status IN ('OPEN', 'RECEIVING', 'CLOSED', 'CANCELLED')),
  created_on    date NOT NULL,
  expected_date date NOT NULL
);
COMMENT ON TABLE purchase_orders IS 'Inbound orders placed with vendors (POs).';
COMMENT ON COLUMN purchase_orders.status IS 'OPEN (not arrived), RECEIVING, CLOSED or CANCELLED';

CREATE TABLE po_lines (
  po_line_id   integer PRIMARY KEY,
  po_id        integer NOT NULL REFERENCES purchase_orders,
  line_no      integer NOT NULL,
  item_id      integer NOT NULL REFERENCES items,
  qty_ordered  integer NOT NULL,
  qty_received integer NOT NULL DEFAULT 0,
  UNIQUE (po_id, line_no)
);
COMMENT ON TABLE po_lines IS 'One row per item on a purchase order.';
COMMENT ON COLUMN po_lines.qty_received IS 'Total of all receipts against this line';

CREATE TABLE receipts (
  receipt_id  integer PRIMARY KEY,
  po_line_id  integer NOT NULL REFERENCES po_lines,
  lpn         text NOT NULL UNIQUE,
  qty         integer NOT NULL,
  lot_no      text,
  expiry_date date,
  received_by integer NOT NULL REFERENCES users,
  received_at timestamp NOT NULL
);
COMMENT ON TABLE receipts IS 'One row per pallet checked in at the receiving dock.';
COMMENT ON COLUMN receipts.lpn IS 'License plate number: the pallet''s own barcode';

CREATE TABLE tasks (
  task_id          integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  task_type        text NOT NULL CHECK (task_type IN ('PICK', 'PUTAWAY', 'REPLEN')),
  status           text NOT NULL CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'SHORT', 'CANCELLED')),
  item_id          integer NOT NULL REFERENCES items,
  from_location_id integer REFERENCES locations,
  to_location_id   integer REFERENCES locations,
  qty              integer NOT NULL,
  qty_done         integer NOT NULL DEFAULT 0,
  wave_id          integer REFERENCES waves,
  order_line_id    integer REFERENCES order_lines,
  receipt_id       integer REFERENCES receipts,
  assigned_to      integer REFERENCES users,
  created_at       timestamp NOT NULL,
  started_at       timestamp,
  completed_at     timestamp
);
COMMENT ON TABLE tasks IS 'The work queue sent to RF guns: picks, putaways and replenishments.';
COMMENT ON COLUMN tasks.status IS 'OPEN, ASSIGNED, IN_PROGRESS, DONE, SHORT (found less than asked) or CANCELLED';
COMMENT ON COLUMN tasks.qty IS 'Units the task asked for';
COMMENT ON COLUMN tasks.qty_done IS 'Units actually moved';
COMMENT ON COLUMN tasks.order_line_id IS 'Set on PICK tasks';
COMMENT ON COLUMN tasks.receipt_id IS 'Set on PUTAWAY tasks';

CREATE TABLE inventory (
  inv_id        integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  item_id       integer NOT NULL REFERENCES items,
  location_id   integer NOT NULL REFERENCES locations,
  lpn           text,
  lot_no        text,
  expiry_date   date,
  qty_on_hand   integer NOT NULL,
  qty_allocated integer NOT NULL DEFAULT 0,
  inv_status    text NOT NULL DEFAULT 'AVAILABLE' CHECK (inv_status IN ('AVAILABLE', 'HOLD', 'DAMAGED')),
  received_at   timestamp
);
COMMENT ON TABLE inventory IS 'What the system thinks is in each location right now.';
COMMENT ON COLUMN inventory.lpn IS 'Pallet license plate (reserve pallets only)';
COMMENT ON COLUMN inventory.qty_allocated IS 'Units already promised to open picks';
COMMENT ON COLUMN inventory.inv_status IS 'AVAILABLE, HOLD (blocked by quality) or DAMAGED';

CREATE TABLE pick_faces (
  location_id integer PRIMARY KEY REFERENCES locations,
  item_id     integer NOT NULL UNIQUE REFERENCES items,
  min_qty     integer NOT NULL,
  max_qty     integer NOT NULL
);
COMMENT ON TABLE pick_faces IS 'Slotting: which item lives in which forward pick location.';
COMMENT ON COLUMN pick_faces.min_qty IS 'Replenish when the face drops below this';
COMMENT ON COLUMN pick_faces.max_qty IS 'Most units the face can hold';

CREATE TABLE cycle_counts (
  count_id    integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  location_id integer NOT NULL REFERENCES locations,
  item_id     integer NOT NULL REFERENCES items,
  status      text NOT NULL CHECK (status IN ('OPEN', 'COUNTED', 'RECOUNT', 'APPROVED')),
  system_qty  integer NOT NULL,
  counted_qty integer,
  counted_by  integer REFERENCES users,
  created_at  timestamp NOT NULL,
  counted_at  timestamp
);
COMMENT ON TABLE cycle_counts IS 'Spot counts of one location, compared with what the system says.';
COMMENT ON COLUMN cycle_counts.system_qty IS 'What the system said when the count was made';
COMMENT ON COLUMN cycle_counts.counted_qty IS 'What the counter found (NULL until counted)';

CREATE TABLE inventory_txns (
  txn_id      integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  txn_type    text NOT NULL CHECK (txn_type IN ('RECEIVE', 'PUTAWAY', 'REPLEN', 'PICK', 'ADJUST')),
  item_id     integer NOT NULL REFERENCES items,
  location_id integer REFERENCES locations,
  lot_no      text,
  qty         integer NOT NULL,
  reason_code text,
  ref_no      text,
  user_id     integer REFERENCES users,
  created_at  timestamp NOT NULL DEFAULT now()
);
COMMENT ON TABLE inventory_txns IS 'History of every stock movement and manual adjustment.';
COMMENT ON COLUMN inventory_txns.qty IS 'Change in units at the location (negative = removed)';
COMMENT ON COLUMN inventory_txns.reason_code IS 'Why an ADJUST happened: DAMAGED, CYCLE_COUNT, FOUND, EXPIRED or MISSING';
COMMENT ON COLUMN inventory_txns.ref_no IS 'Order, PO or pallet number the move belongs to';

CREATE TABLE host_messages (
  msg_id       integer PRIMARY KEY,
  direction    text NOT NULL CHECK (direction IN ('IN', 'OUT')),
  msg_type     text NOT NULL,
  ref_no       text NOT NULL,
  status       text NOT NULL CHECK (status IN ('PENDING', 'PROCESSED', 'ERROR')),
  error_text   text,
  created_at   timestamp NOT NULL,
  processed_at timestamp
);
COMMENT ON TABLE host_messages IS 'Interface log between the ERP (the company''s main business system) and the WMS. Kept for 7 days.';
COMMENT ON COLUMN host_messages.direction IS 'IN = ERP to WMS, OUT = WMS to ERP';
COMMENT ON COLUMN host_messages.msg_type IS 'ORDER, PO, ITEM, SHIP_CONFIRM or RECEIPT_CONFIRM';

CREATE TABLE erp_inventory (
  sku         text PRIMARY KEY,
  qty_on_hand integer NOT NULL
);
COMMENT ON TABLE erp_inventory IS 'The ERP''s on-hand count for each SKU. The WMS keeps it in step by sending a message for every receipt, shipment and adjustment, so each number should match the WMS total for that SKU.';
COMMENT ON COLUMN erp_inventory.sku IS 'The item number as text. The ERP keeps its own item list, so this isn''t a foreign key';
COMMENT ON COLUMN erp_inventory.qty_on_hand IS 'Units the ERP thinks are in the building, in any status';
`
