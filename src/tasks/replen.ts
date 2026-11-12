import type { Track } from './types.ts'

export const replen: Track = {
  id: 'replen',
  name: 'Replenishment & Slotting',
  role: "Replenishment keeps every pick face stocked from reserve before pickers run out. Slotting decides which item lives in which face, so the fastest movers sit closest to the dock and pickers walk less.",
  tasks: [
    {
      id: 'rp-below',
      title: 'Faces below min',
      kind: 'query',
      skills: ['JOIN'],
      prompt: "Each pick face has a `min_qty` and a `max_qty`. When its stock drops below min, it needs a replen. Find the faces below min. A face's stock is the `inventory` row with the same location and item.",
      returns: 'location_code, sku, qty_on_hand, min_qty, max_qty · by location_code',
      tables: ['pick_faces', 'inventory', 'locations', 'items'],
      solution: `SELECT l.location_code, i.sku, inv.qty_on_hand, pf.min_qty, pf.max_qty
FROM pick_faces pf
JOIN inventory inv ON inv.location_id = pf.location_id
                  AND inv.item_id = pf.item_id
JOIN locations l ON l.location_id = pf.location_id
JOIN items i ON i.item_id = pf.item_id
WHERE inv.qty_on_hand < pf.min_qty
ORDER BY l.location_code;`,
    },
    {
      id: 'rp-fix-null',
      title: 'Fix: = NULL',
      kind: 'fix-query',
      skills: ['LEFT JOIN', 'IS NULL'],
      prompt: "This report should list slotted faces that have no inventory row at all. It runs fine but always comes back empty. Fix it.",
      returns: 'location_code, sku · by location_code',
      tables: ['pick_faces', 'inventory', 'locations', 'items'],
      given: `SELECT l.location_code, i.sku
FROM pick_faces pf
JOIN locations l ON l.location_id = pf.location_id
JOIN items i ON i.item_id = pf.item_id
LEFT JOIN inventory inv ON inv.location_id = pf.location_id
                       AND inv.item_id = pf.item_id
WHERE inv.inv_id = NULL
ORDER BY l.location_code;`,
      solution: `SELECT l.location_code, i.sku
FROM pick_faces pf
JOIN locations l ON l.location_id = pf.location_id
JOIN items i ON i.item_id = pf.item_id
LEFT JOIN inventory inv ON inv.location_id = pf.location_id
                       AND inv.item_id = pf.item_id
WHERE inv.inv_id IS NULL
ORDER BY l.location_code;`,
      note: "NULL means “unknown”, so `x = NULL` is never true, not even when x is NULL. Use `IS NULL` and `IS NOT NULL`.",
    },
    {
      id: 'rp-qty',
      title: 'How much to bring',
      kind: 'query',
      skills: ['division'],
      prompt: "For each face below min, work out `replen_qty`: the units needed to fill it back to `max_qty`, rounded down to whole cases (`case_qty` units per case). Whole number division helps here: 25 / 12 = 2.",
      returns: 'location_code, sku, qty_on_hand, max_qty, case_qty, replen_qty · by location_code',
      tables: ['pick_faces', 'inventory', 'locations', 'items'],
      solution: `SELECT l.location_code, i.sku, inv.qty_on_hand, pf.max_qty, i.case_qty,
       (pf.max_qty - inv.qty_on_hand) / i.case_qty * i.case_qty AS replen_qty
FROM pick_faces pf
JOIN inventory inv ON inv.location_id = pf.location_id
                  AND inv.item_id = pf.item_id
JOIN locations l ON l.location_id = pf.location_id
JOIN items i ON i.item_id = pf.item_id
WHERE inv.qty_on_hand < pf.min_qty
ORDER BY l.location_code;`,
    },
    {
      id: 'rp-fefo',
      title: 'Oldest first (FEFO)',
      kind: 'query',
      skills: ['WHERE', 'ORDER BY'],
      prompt: "SKU {fefoSku}'s face is low. Find AVAILABLE stock of it in reserve (zone `RSV`), soonest expiry first. Warehouses send the first-expiring lot out first (FEFO: first expired, first out).",
      returns: 'location_code, lpn, lot_no, expiry_date, qty_on_hand · soonest expiry first',
      tables: ['inventory', 'items', 'locations'],
      solution: `SELECT l.location_code, inv.lpn, inv.lot_no, inv.expiry_date, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE i.sku = '{fefoSku}'
  AND l.zone_code = 'RSV'
  AND inv.inv_status = 'AVAILABLE'
ORDER BY inv.expiry_date;`,
    },
    {
      id: 'rp-movers',
      title: 'Top movers',
      kind: 'query',
      skills: ['GROUP BY', 'LIMIT'],
      prompt: "Which 10 skus moved the most units in the last 7 days? Add up `qty_done` on PICK tasks with status DONE and `completed_at` on or after Nov 3.",
      returns: 'sku, description, units_picked · most first',
      tables: ['tasks', 'items'],
      solution: `SELECT i.sku, i.description, SUM(t.qty_done) AS units_picked
FROM tasks t
JOIN items i ON i.item_id = t.item_id
WHERE t.task_type = 'PICK'
  AND t.status = 'DONE'
  AND t.completed_at >= CURRENT_DATE - 7
GROUP BY i.sku, i.description
ORDER BY units_picked DESC
LIMIT 10;`,
    },
    {
      id: 'rp-abc',
      title: 'ABC classes',
      kind: 'query',
      skills: ['CTE', 'ROW_NUMBER', 'CASE'],
      prompt: "Slotting sorts items into classes by how much they move. Rank every active item by units picked in the last 7 days (DONE picks; an item with no picks counts as 0). Ranks 1–20 are class A, 21–50 are B, and the rest are C. Break ties by sku.",
      returns: 'sku, units_picked, abc · by rank',
      tables: ['items', 'tasks'],
      solution: `WITH moved AS (
  SELECT i.sku, COALESCE(SUM(t.qty_done), 0) AS units_picked
  FROM items i
  LEFT JOIN tasks t ON t.item_id = i.item_id
                   AND t.task_type = 'PICK'
                   AND t.status = 'DONE'
                   AND t.completed_at >= CURRENT_DATE - 7
  WHERE i.active
  GROUP BY i.sku
),
ranked AS (
  SELECT sku, units_picked,
         ROW_NUMBER() OVER (ORDER BY units_picked DESC, sku) AS rnk
  FROM moved
)
SELECT sku, units_picked,
       CASE WHEN rnk <= 20 THEN 'A'
            WHEN rnk <= 50 THEN 'B'
            ELSE 'C' END AS abc
FROM ranked
ORDER BY rnk;`,
      note: "`ROW_NUMBER()` numbers rows in the order you give it. A `WITH` query (a CTE) lets you build the answer in steps you can read top to bottom.",
    },
    {
      id: 'rp-fix-reslot',
      title: 'Ticket: re-slot a fast mover',
      kind: 'fix-data',
      skills: ['UPDATE', 'subquery'],
      prompt: "**Ticket from the slotting analyst:** “SKU {reslotSku} is a top-10 mover, but it's slotted way back in {reslotFrom}. Move it up front to the empty face P-01-14-A with min 24 and max 96.”\n\nUpdate its `pick_faces` row. The stock gets moved by hand later; this ticket only changes the slot.",
      tables: ['pick_faces', 'locations', 'items'],
      check: ['SELECT item_id, location_id, min_qty, max_qty FROM pick_faces ORDER BY item_id'],
      solution: `SELECT pf.location_id, l.location_code, pf.item_id, pf.min_qty, pf.max_qty
FROM pick_faces pf
JOIN locations l ON l.location_id = pf.location_id
JOIN items i ON i.item_id = pf.item_id
WHERE i.sku = '{reslotSku}';

UPDATE pick_faces
SET location_id = (SELECT location_id FROM locations WHERE location_code = 'P-01-14-A'),
    min_qty = 24,
    max_qty = 96
WHERE item_id = (SELECT item_id FROM items WHERE sku = '{reslotSku}');`,
      note: "A subquery like `(SELECT location_id FROM locations WHERE ...)` looks the id up for you, so you never have to copy numbers by hand.",
    },
  ],
}
