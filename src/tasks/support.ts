import type { Track } from './types.ts'

export const support: Track = {
  id: 'support',
  name: 'WMS Support',
  role: "The WMS analyst is the system's mechanic. They fix stuck records, chase interface errors between the ERP (the company's main business system) and the WMS, and manage users and locations. Most of the job is finding the one bad row and changing only that row.",
  tasks: [
    {
      id: 'sa-errors',
      title: 'Interface errors',
      kind: 'query',
      skills: ['GROUP BY'],
      learn: "You can GROUP BY two columns. Each combination, a message type with an error text, becomes its own row.",
      prompt: "Every message between the ERP and the WMS is logged in `host_messages`. Summarize the ERROR messages from the last 7 days (`created_at` on or after Nov 3) by type and error text.",
      returns: 'msg_type, error_text, errors · most first, then msg_type, then error_text',
      tables: ['host_messages'],
      solution: `SELECT msg_type, error_text, COUNT(*) AS errors
FROM host_messages
WHERE status = 'ERROR'
  AND created_at >= CURRENT_DATE - 7
GROUP BY msg_type, error_text
ORDER BY errors DESC, msg_type, error_text;`,
    },
    {
      id: 'sa-stranded',
      title: 'Work held by people who left',
      kind: 'query',
      skills: ['JOIN', 'NOT IN'],
      prompt: "When someone leaves, any work still assigned to them gets stuck on their scanner. Find tasks that aren't DONE or CANCELLED and are assigned to an inactive user.",
      returns: 'task_id, task_type, status, username, created_at · oldest first',
      tables: ['tasks', 'users'],
      solution: `SELECT t.task_id, t.task_type, t.status, u.username, t.created_at
FROM tasks t
JOIN users u ON u.user_id = t.assigned_to
WHERE NOT u.active
  AND t.status NOT IN ('DONE', 'CANCELLED')
ORDER BY t.created_at;`,
    },
    {
      id: 'sa-barcodes',
      title: 'Duplicate barcodes',
      kind: 'query',
      skills: ['HAVING', 'string_agg'],
      learn: "`HAVING COUNT(*) > 1` keeps only the groups with more than one row, which is the standard way to find duplicates. **string_agg** lists each group's values on one line.",
      prompt: "Two locations must never share a barcode, or scanners can't tell them apart. Find barcodes used by more than one location, with a list of the locations on each. `string_agg(x, ', ' ORDER BY x)` joins text from many rows into one.",
      returns: 'barcode, locations (how many), location_codes (comma-separated, A to Z) · by barcode',
      tables: ['locations'],
      solution: `SELECT barcode, COUNT(*) AS locations,
       string_agg(location_code, ', ' ORDER BY location_code) AS location_codes
FROM locations
GROUP BY barcode
HAVING COUNT(*) > 1
ORDER BY barcode;`,
    },
    {
      id: 'sa-overalloc',
      title: 'Promised but not there',
      kind: 'query',
      skills: ['JOIN', 'WHERE'],
      learn: "WHERE can compare two columns of the same row: `inv.qty_allocated > inv.qty_on_hand`.",
      prompt: "`qty_allocated` is stock already promised to open picks. Find rows where something is allocated (`qty_allocated` above 0) and it's more than `qty_on_hand`.",
      returns: 'location_code, sku, qty_on_hand, qty_allocated · by location_code',
      tables: ['inventory', 'locations', 'items'],
      solution: `SELECT l.location_code, i.sku, inv.qty_on_hand, inv.qty_allocated
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE inv.qty_allocated > 0
  AND inv.qty_allocated > inv.qty_on_hand
ORDER BY l.location_code;`,
    },
    {
      id: 'sa-sync',
      title: 'WMS vs ERP stock',
      kind: 'query',
      skills: ['CTE', 'FULL JOIN', 'COALESCE'],
      learn: "To compare two lists where either side can be missing a row, use a **FULL JOIN**. It keeps the unmatched rows from both tables, with NULLs on the missing side. `COALESCE(x, 0)` turns those NULLs into 0, so you can compare and subtract.",
      prompt: "Every morning the ERP's stock is checked against the WMS's. `erp_inventory` holds the ERP's on-hand for each SKU. Total the WMS's `qty_on_hand` per SKU (every row, any status), then list every SKU where the two numbers differ, including SKUs that only one side has.",
      returns: 'sku, wms_qty, erp_qty, diff (wms_qty − erp_qty) · by sku',
      tables: ['inventory', 'items', 'erp_inventory'],
      solution: `WITH wms AS (
  SELECT i.sku, SUM(inv.qty_on_hand) AS wms_qty
  FROM inventory inv
  JOIN items i ON i.item_id = inv.item_id
  GROUP BY i.sku
)
SELECT COALESCE(w.sku, e.sku) AS sku,
       COALESCE(w.wms_qty, 0) AS wms_qty,
       COALESCE(e.qty_on_hand, 0) AS erp_qty,
       COALESCE(w.wms_qty, 0) - COALESCE(e.qty_on_hand, 0) AS diff
FROM wms w
FULL JOIN erp_inventory e ON e.sku = w.sku
WHERE COALESCE(w.wms_qty, 0) <> COALESCE(e.qty_on_hand, 0)
ORDER BY sku;`,
      note: "Each mismatch is a ticket. Two are the negative rows ICQA found (the ERP never goes below 0), a few are adjustments that never reached the ERP, one is a face the ERP thinks still has stock, and one is a discontinued item still sitting on a rack. Finance closes the books on the ERP's numbers, so these get fixed fast.",
    },
    {
      id: 'sa-fix-user',
      title: 'Ticket: turn off a login',
      kind: 'fix-data',
      skills: ['UPDATE'],
      learn: "Support's oldest habit: write the WHERE as a SELECT, check it finds exactly the rows you mean, and only then turn the same WHERE into an UPDATE.",
      prompt: "**Ticket from HR:** “Dana Whitfield's last day was Friday, Nov 6. Please turn off the WMS account.”\n\nDeactivate that one account and change nothing else.",
      tables: ['users'],
      check: ['SELECT user_id, active FROM users ORDER BY user_id'],
      solution: `SELECT user_id, username, full_name, active
FROM users
WHERE full_name = 'Dana Whitfield';

UPDATE users
SET active = false
WHERE username = 'dwhitfield';`,
      note: "Write the WHERE first and run it as a SELECT. Only then turn it into an UPDATE. It's the oldest habit in database support.",
    },
    {
      id: 'sa-fix-txn',
      title: 'Ticket: try it in a transaction',
      kind: 'fix-data',
      skills: ['BEGIN', 'UPDATE'],
      learn: "Wrap a change in **BEGIN** and **COMMIT**. Between them, run a SELECT to see what the UPDATE did. If it looks wrong, end with **ROLLBACK** instead of COMMIT, and nothing is saved.\n\nTry it twice: once ending in ROLLBACK to look, then again with COMMIT to keep it.",
      prompt: "**Ticket from ICQA:** “Some stock is past its expiry date but still shows AVAILABLE, so pickers could still send it to stores. Put every AVAILABLE row with an `expiry_date` before today on HOLD.”\n\nDo it inside a transaction, and check the rows before you commit.",
      tables: ['inventory'],
      check: ['SELECT inv_id, inv_status FROM inventory ORDER BY inv_id'],
      solution: `BEGIN;

UPDATE inventory
SET inv_status = 'HOLD'
WHERE inv_status = 'AVAILABLE'
  AND expiry_date < CURRENT_DATE;

SELECT inv_id, expiry_date, inv_status
FROM inventory
WHERE expiry_date < CURRENT_DATE;

COMMIT;`,
      note: "In a live WMS, an open transaction holds locks on the rows it changed. Leave one open and the next RF scan that needs those rows waits for you, so COMMIT or ROLLBACK right away.",
    },
    {
      id: 'sa-fix-release',
      title: 'Ticket: release stranded work',
      kind: 'fix-data',
      skills: ['UPDATE', 'subquery'],
      learn: "A subquery can return a list: `assigned_to IN (SELECT user_id FROM users WHERE NOT active)` matches any inactive user.",
      prompt: "**Ticket from the 3rd shift supervisor:** “Replen and putaway tasks are stuck on scanners that belong to people who don't work here anymore.”\n\nFor every task that isn't DONE or CANCELLED and is assigned to an inactive user, set `assigned_to` to NULL and `status` back to 'OPEN', so someone else can take it.",
      tables: ['tasks', 'users'],
      check: ['SELECT task_id, status, assigned_to FROM tasks ORDER BY task_id'],
      solution: `SELECT t.task_id, t.task_type, t.status, u.username
FROM tasks t
JOIN users u ON u.user_id = t.assigned_to
WHERE NOT u.active
  AND t.status NOT IN ('DONE', 'CANCELLED');

UPDATE tasks
SET assigned_to = NULL,
    status = 'OPEN'
WHERE status NOT IN ('DONE', 'CANCELLED')
  AND assigned_to IN (SELECT user_id FROM users WHERE NOT active);`,
    },
    {
      id: 'sa-fix-retry',
      title: 'Ticket: retry failed messages',
      kind: 'fix-data',
      skills: ['UPDATE'],
      learn: "`SET error_text = NULL` clears a value. NULL means empty.",
      prompt: "**Ticket from the ERP team:** “Four orders failed this morning with 'Unknown item 10518' because the item wasn't set up yet. It was added at 11:20, so please retry them.”\n\nSet those messages' `status` to 'PENDING' and clear their `error_text` (NULL), so the interface sends them again. Leave every other message alone.",
      tables: ['host_messages'],
      check: ['SELECT msg_id, status, error_text FROM host_messages ORDER BY msg_id'],
      solution: `SELECT msg_id, ref_no, status, error_text, created_at
FROM host_messages
WHERE error_text = 'Unknown item 10518';

UPDATE host_messages
SET status = 'PENDING',
    error_text = NULL
WHERE status = 'ERROR'
  AND error_text = 'Unknown item 10518';`,
    },
    {
      id: 'sa-fix-review',
      title: 'Ticket: review before you run',
      kind: 'fix-data',
      skills: ['UPDATE', 'WHERE'],
      learn: "An UPDATE without a WHERE changes every row in the table. Reading a teammate's statement before you run it is part of the job.",
      prompt: "**Ticket from maintenance:** “The rack repair in pick aisle 2 is done. Please unlock those locations.”\n\nA teammate wrote the statement below and asked you to run it. Don't. It has no WHERE, so it would also reopen locations that are locked or retired for other reasons. Fix it to unlock only the LOCKED locations in pick aisle 2 (zone `FPA`, aisle 2).",
      tables: ['locations'],
      given: `UPDATE locations
SET status = 'ACTIVE';`,
      check: ['SELECT location_id, status FROM locations ORDER BY location_id'],
      solution: `SELECT location_code, status
FROM locations
WHERE zone_code = 'FPA'
  AND aisle = 2
  AND status = 'LOCKED';

UPDATE locations
SET status = 'ACTIVE'
WHERE zone_code = 'FPA'
  AND aisle = 2
  AND status = 'LOCKED';`,
    },
    {
      id: 'sa-fix-fk',
      title: 'Ticket: foreign key error',
      kind: 'fix-data',
      skills: ['INSERT', 'foreign keys'],
      learn: "A **foreign key** makes the database check that an id points at a row that exists. `pick_faces.item_id` has to be a real `items.item_id`, or the insert is refused.",
      prompt: "**Ticket from slotting:** “Slot the new SKU 10518 into the empty face P-04-13-B, min 12, max 48.”\n\nA teammate's INSERT below fails with a foreign key error: they typed the SKU where the `item_id` goes. Look up the real id and insert the row.",
      tables: ['pick_faces', 'items', 'locations'],
      given: `INSERT INTO pick_faces (location_id, item_id, min_qty, max_qty)
VALUES (258, 10518, 12, 48);`,
      check: ['SELECT location_id, item_id, min_qty, max_qty FROM pick_faces ORDER BY location_id'],
      solution: `SELECT item_id, sku, description
FROM items
WHERE sku = '10518';

SELECT location_id, location_code
FROM locations
WHERE location_code = 'P-04-13-B';

INSERT INTO pick_faces (location_id, item_id, min_qty, max_qty)
VALUES (258, 101, 12, 48);`,
      note: "A foreign key makes sure an id points at a row that exists. The error is the database protecting you: without it, this face would point at an item that isn't there.",
    },
  ],
}
