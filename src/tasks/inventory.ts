import { facts as f, type Track } from './types.ts'

export const inventory: Track = {
  id: 'inventory',
  name: 'Inventory Control',
  role: "Inventory control (often called ICQA) keeps the system's numbers matching what's really on the shelves. They run cycle counts, approve adjustments, put stock on hold and chase down anything that doesn't add up.",
  tasks: [
    {
      id: 'ic-hold',
      title: 'Stock on hold',
      kind: 'query',
      skills: ['JOIN', 'WHERE'],
      learn: "Real WMS questions almost always need two or three tables. Start FROM the table that holds the rows you want (here, `inventory`), then JOIN the tables that turn its ids into names you can read.",
      prompt: "Quality put some stock on HOLD after damage reports and a supplier recall. List every inventory row whose `inv_status` is 'HOLD'.",
      returns: 'sku, location_code, lot_no, qty_on_hand · by sku, then location_code',
      tables: ['inventory', 'items', 'locations'],
      solution: `SELECT i.sku, l.location_code, inv.lot_no, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE inv.inv_status = 'HOLD'
ORDER BY i.sku, l.location_code;`,
    },
    {
      id: 'ic-negative',
      title: 'Below zero',
      kind: 'query',
      skills: ['JOIN', 'WHERE'],
      learn: "A **data check** is a query that should come back empty. Every row it finds is a problem to fix. ICQA runs a handful of them every morning.",
      prompt: "You can't have less than zero of something on a shelf, but the system can say you do after a bad scan. Find every inventory row with `qty_on_hand` below 0.",
      returns: 'inv_id, sku, location_code, qty_on_hand',
      tables: ['inventory', 'items', 'locations'],
      solution: `SELECT inv.inv_id, i.sku, l.location_code, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE inv.qty_on_hand < 0;`,
      note: "ICQA runs a check like this every morning. A negative row usually means someone picked from the wrong location, so a second location is off by the same amount.",
    },
    {
      id: 'ic-fix-or',
      title: 'Fix: AND before OR',
      kind: 'fix-query',
      skills: ['OR', 'AND'],
      learn: "When a WHERE mixes AND and OR, Postgres does the ANDs first, the way math does × before +. So `a OR b AND c` means `a OR (b AND c)`, however the lines are broken up.",
      prompt: "HOLD and DAMAGED stock belongs in the quality cage (zone `QAH`), where nobody can pick it by mistake. This check should list held or damaged stock sitting anywhere else, but it also lists stock that's already in the cage. Fix it.",
      returns: 'sku, location_code, inv_status, qty_on_hand · by location_code',
      tables: ['inventory', 'items', 'locations'],
      given: `SELECT i.sku, l.location_code, inv.inv_status, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE inv.inv_status = 'HOLD'
   OR inv.inv_status = 'DAMAGED'
  AND l.zone_code <> 'QAH'
ORDER BY l.location_code;`,
      solution: `SELECT i.sku, l.location_code, inv.inv_status, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE (inv.inv_status = 'HOLD'
   OR inv.inv_status = 'DAMAGED')
  AND l.zone_code <> 'QAH'
ORDER BY l.location_code;`,
      note: "`inv.inv_status IN ('HOLD', 'DAMAGED')` fixes it too, and leaves no OR to get wrong. The three pallets it finds are all in reserve racking: two of a recalled lot, and one more that quality is holding.",
    },
    {
      id: 'ic-expiring',
      title: 'Expiring soon',
      kind: 'query',
      skills: ['dates', 'BETWEEN'],
      learn: "Dates can do math. `CURRENT_DATE` is today, and `CURRENT_DATE + 30` is 30 days from today. **BETWEEN a AND b** keeps values from a to b, both ends included.",
      prompt: "Stores refuse product that's about to expire. Find stock with an `expiry_date` from today through 30 days from today, both days included.",
      returns: 'sku, lot_no, location_code, expiry_date, qty_on_hand · soonest first, then location_code',
      tables: ['inventory', 'items', 'locations'],
      solution: `SELECT i.sku, inv.lot_no, l.location_code, inv.expiry_date, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE inv.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
ORDER BY inv.expiry_date, l.location_code;`,
      note: "`CURRENT_DATE + 30` adds 30 days. The WMS clock here is fixed at Tue Nov 10, 2026, 2:00 PM, so `CURRENT_DATE` is 2026-11-10. `BETWEEN` includes both ends.",
    },
    {
      id: 'ic-variance',
      title: 'Count variances',
      kind: 'query',
      skills: ['expressions', 'ABS'],
      learn: "SELECT can calculate. `cc.counted_qty - cc.system_qty` works out the miss on every row, and `AS variance` names the new column. **ABS()** drops the minus sign, so you can sort by how big the miss is.",
      prompt: "Yesterday's cycle counts are waiting for approval. Show yesterday's counts (`counted_at` on Nov 9) where the counted quantity doesn't match the system.",
      returns: 'location_code, sku, system_qty, counted_qty, variance (counted_qty − system_qty) · biggest miss first, by size and ignoring the sign',
      tables: ['cycle_counts', 'locations', 'items'],
      solution: `SELECT l.location_code, i.sku, cc.system_qty, cc.counted_qty,
       cc.counted_qty - cc.system_qty AS variance
FROM cycle_counts cc
JOIN locations l ON l.location_id = cc.location_id
JOIN items i ON i.item_id = cc.item_id
WHERE cc.counted_at >= CURRENT_DATE - 1
  AND cc.counted_at < CURRENT_DATE
  AND cc.counted_qty <> cc.system_qty
ORDER BY ABS(cc.counted_qty - cc.system_qty) DESC;`,
      note: "`ABS()` drops the sign, so −12 sorts as a bigger miss than +5.",
    },
    {
      id: 'ic-adjust',
      title: 'Adjustments by reason',
      kind: 'query',
      skills: ['GROUP BY', 'SUM'],
      learn: "**SUM** adds a column up. With GROUP BY it adds up each group on its own, so you get one total per reason code.",
      prompt: "Every manual stock change is logged in `inventory_txns` with `txn_type` 'ADJUST' and a `reason_code`. Total the adjustments from the last 7 days (`created_at` on or after Nov 3) by reason.",
      returns: 'reason_code, adjustments (how many), net_units (sum of qty) · biggest loss first (lowest net_units)',
      tables: ['inventory_txns'],
      solution: `SELECT reason_code, COUNT(*) AS adjustments, SUM(qty) AS net_units
FROM inventory_txns
WHERE txn_type = 'ADJUST'
  AND created_at >= CURRENT_DATE - 7
GROUP BY reason_code
ORDER BY net_units;`,
    },
    {
      id: 'ic-overdue',
      title: 'Overdue counts',
      kind: 'query',
      skills: ['NOT EXISTS'],
      learn: "A **subquery** is a query inside another one, in parentheses. `NOT EXISTS (subquery)` is true when the subquery finds no rows.\n\nTie the subquery to the outer row (`cc.location_id = pf.location_id`) and it asks, for each face: is there no recent count here?",
      prompt: "Every pick face should be counted at least once every 30 days. Which slotted pick faces (rows in `pick_faces`) have no cycle count with a `counted_at` in the last 30 days, on or after Oct 11?",
      returns: 'location_code · A to Z',
      tables: ['pick_faces', 'cycle_counts', 'locations'],
      solution: `SELECT l.location_code
FROM pick_faces pf
JOIN locations l ON l.location_id = pf.location_id
WHERE NOT EXISTS (
  SELECT 1
  FROM cycle_counts cc
  WHERE cc.location_id = pf.location_id
    AND cc.counted_at >= CURRENT_DATE - 30
)
ORDER BY l.location_code;`,
      note: "`NOT EXISTS` asks “is there no matching row?”, so faces that were never counted at all show up too. `LEFT JOIN ... WHERE cc.count_id IS NULL` works as well.",
    },
    {
      id: 'ic-fix-group',
      title: 'Fix: GROUP BY error',
      kind: 'fix-query',
      skills: ['GROUP BY'],
      learn: "With GROUP BY, each row of the result stands for a whole group. A column with one value per group (the sku) can be shown. A column with many values inside a group (location_code, when one sku sits in several places) has to be grouped by too, or totaled.",
      prompt: "A coworker wants the total units of each sku across the whole building, but the query below errors out. Fix it.",
      returns: 'sku, total_units · most units first, then sku',
      tables: ['inventory', 'items'],
      given: `SELECT i.sku, l.location_code, SUM(inv.qty_on_hand) AS total_units
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
GROUP BY i.sku
ORDER BY total_units DESC, i.sku;`,
      solution: `SELECT i.sku, SUM(inv.qty_on_hand) AS total_units
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
GROUP BY i.sku
ORDER BY total_units DESC, i.sku;`,
      note: "Every column in SELECT must be in GROUP BY or inside an aggregate like SUM. Postgres won't guess which of many location codes you meant. Some databases quietly pick one, which hides bugs.",
    },
    {
      id: 'ic-fix-negative',
      title: 'Ticket: stock below zero',
      kind: 'fix-data',
      skills: ['UPDATE', 'INSERT'],
      learn: "Fixing data takes two new statements. **UPDATE** changes rows that already exist: `UPDATE table SET column = value WHERE …`. **INSERT** adds a new row: `INSERT INTO table (columns) VALUES (values)`.\n\nIn a ticket, look first with a SELECT, then make the change. You can run everything at once, or select lines and run just those.",
      prompt: "**Ticket from the 1st shift lead:** “Pick face {negLoc} shows −6 of SKU {negSku} after a bad scan. I counted it myself and the face is empty.”\n\nSet that row's `qty_on_hand` to 0, then log the fix in `inventory_txns`: an 'ADJUST' of +6 for that item and location, with `reason_code` 'CYCLE_COUNT'. Look first, then change.",
      tables: ['inventory', 'inventory_txns', 'items', 'locations'],
      check: [
        'SELECT inv_id, qty_on_hand FROM inventory ORDER BY inv_id',
        "SELECT txn_type, item_id, location_id, qty, reason_code FROM inventory_txns WHERE txn_type = 'ADJUST' ORDER BY item_id, location_id, qty, reason_code",
      ],
      solution: `SELECT inv.inv_id, inv.item_id, inv.location_id, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE l.location_code = '${f.negLoc}'
  AND i.sku = '${f.negSku}';

UPDATE inventory
SET qty_on_hand = 0
WHERE inv_id = ${f.negInvId};

INSERT INTO inventory_txns (txn_type, item_id, location_id, qty, reason_code)
VALUES ('ADJUST', ${f.negItemId}, ${f.negLocId}, 6, 'CYCLE_COUNT');`,
      note: "Support fixes always leave a trail. The adjustment row lets anyone see later what changed, when and why.",
    },
  ],
}
