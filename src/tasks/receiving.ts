import { facts as f, type Track } from './types.ts'

export const receiving: Track = {
  id: 'receiving',
  name: 'Receiving',
  role: "The receiving lead runs the inbound dock: which trucks are due, checking what arrived against each purchase order (PO), and getting pallets put away before they block the dock doors.",
  tasks: [
    {
      id: 'rc-due',
      title: 'Due today',
      kind: 'query',
      skills: ['JOIN', 'WHERE'],
      learn: "`CURRENT_DATE` is today's date. Using it instead of typing '2026-11-10' keeps the query right tomorrow, and the day after.",
      prompt: "Which purchase orders are expected today and aren't CLOSED yet?",
      returns: 'po_no, vendor_name, status · by po_no',
      tables: ['purchase_orders', 'vendors'],
      solution: `SELECT po.po_no, v.vendor_name, po.status
FROM purchase_orders po
JOIN vendors v ON v.vendor_id = po.vendor_id
WHERE po.expected_date = CURRENT_DATE
  AND po.status <> 'CLOSED'
ORDER BY po.po_no;`,
    },
    {
      id: 'rc-late',
      title: 'Late trucks',
      kind: 'query',
      skills: ['dates'],
      learn: "Subtract one date from another and you get the number of days between them. `CURRENT_DATE - po.expected_date` is how many days late a PO is.",
      prompt: "Find POs that are still OPEN after their `expected_date` has passed. Subtracting one date from another gives the number of days between them.",
      returns: 'po_no, vendor_name, expected_date, days_late · most days late first',
      tables: ['purchase_orders', 'vendors'],
      solution: `SELECT po.po_no, v.vendor_name, po.expected_date,
       CURRENT_DATE - po.expected_date AS days_late
FROM purchase_orders po
JOIN vendors v ON v.vendor_id = po.vendor_id
WHERE po.status = 'OPEN'
  AND po.expected_date < CURRENT_DATE
ORDER BY days_late DESC;`,
    },
    {
      id: 'rc-receivers',
      title: 'Who received what',
      kind: 'query',
      skills: ['GROUP BY', 'JOIN'],
      learn: "A **timestamp** holds a date and a time, like 2026-11-10 07:42:00. `received_at >= CURRENT_DATE` keeps everything from midnight today on.",
      prompt: "Each row in `receipts` is one pallet checked in. For today, show how many pallets and how many units each person received.",
      returns: 'full_name, pallets, units · most units first',
      tables: ['receipts', 'users'],
      solution: `SELECT u.full_name, COUNT(*) AS pallets, SUM(r.qty) AS units
FROM receipts r
JOIN users u ON u.user_id = r.received_by
WHERE r.received_at >= CURRENT_DATE
GROUP BY u.full_name
ORDER BY units DESC;`,
    },
    {
      id: 'rc-short',
      title: 'Short shipments',
      kind: 'query',
      skills: ['JOIN', 'expressions'],
      prompt: "On CLOSED POs, which lines arrived short (`qty_received` less than `qty_ordered`)?",
      returns: 'po_no, line_no, sku, qty_ordered, qty_received, short_by (ordered − received) · biggest shortage first, then po_no',
      tables: ['po_lines', 'purchase_orders', 'items'],
      solution: `SELECT po.po_no, pl.line_no, i.sku, pl.qty_ordered, pl.qty_received,
       pl.qty_ordered - pl.qty_received AS short_by
FROM po_lines pl
JOIN purchase_orders po ON po.po_id = pl.po_id
JOIN items i ON i.item_id = pl.item_id
WHERE po.status = 'CLOSED'
  AND pl.qty_received < pl.qty_ordered
ORDER BY short_by DESC, po.po_no;`,
    },
    {
      id: 'rc-backlog',
      title: 'Putaway backlog',
      kind: 'query',
      skills: ['timestamps', 'JOIN'],
      learn: "Subtract two timestamps and you get an **interval**: a length of time like `02:49:00` or `5 days 03:20:00`. `now()` is this moment.",
      prompt: "Pallets that are received but not put away pile up at the dock. List PUTAWAY tasks that aren't DONE, with how long each has waited (`now()` minus `created_at`). The task's `from_location_id` is where the pallet sits now.",
      returns: 'task_id, sku, location_code, status, waiting · oldest first',
      tables: ['tasks', 'items', 'locations'],
      solution: `SELECT t.task_id, i.sku, l.location_code, t.status,
       now() - t.created_at AS waiting
FROM tasks t
JOIN items i ON i.item_id = t.item_id
JOIN locations l ON l.location_id = t.from_location_id
WHERE t.task_type = 'PUTAWAY'
  AND t.status <> 'DONE'
ORDER BY t.created_at;`,
      note: "Subtracting timestamps gives an interval, like 02:49:00 or 5 days 03:20:00. The pallet at the top hasn't moved since Nov 5. The WMS Support track picks that story back up.",
    },
    {
      id: 'rc-fix-fill',
      title: 'Fix: 0% fill rate',
      kind: 'fix-query',
      skills: ['division', 'ROUND'],
      learn: "Postgres keeps whole-number math whole. `7 / 2` is 3, and `95 / 100` is 0: the remainder is dropped.",
      prompt: "The vendor scorecard says almost every vendor has a 0% fill rate, which can't be right. The query below runs without an error, so the bug is in the math. Fix it so `fill_rate` is received ÷ ordered as a percent, rounded to 1 decimal (like 97.4).",
      returns: 'vendor_name, fill_rate · lowest first, then vendor_name',
      tables: ['purchase_orders', 'vendors', 'po_lines'],
      given: `SELECT v.vendor_name,
       SUM(pl.qty_received) / SUM(pl.qty_ordered) * 100 AS fill_rate
FROM purchase_orders po
JOIN vendors v ON v.vendor_id = po.vendor_id
JOIN po_lines pl ON pl.po_id = po.po_id
WHERE po.status = 'CLOSED'
GROUP BY v.vendor_name
ORDER BY fill_rate, v.vendor_name;`,
      solution: `SELECT v.vendor_name,
       ROUND(SUM(pl.qty_received) * 100.0 / SUM(pl.qty_ordered), 1) AS fill_rate
FROM purchase_orders po
JOIN vendors v ON v.vendor_id = po.vendor_id
JOIN po_lines pl ON pl.po_id = po.po_id
WHERE po.status = 'CLOSED'
GROUP BY v.vendor_name
ORDER BY fill_rate, v.vendor_name;`,
      note: "Whole number ÷ whole number stays a whole number in Postgres (and SQL Server), so 95 / 100 is 0. Multiplying by 100.0 first makes the math use decimals.",
    },
    {
      id: 'rc-fix-receipt',
      title: 'Ticket: keyed 10x',
      kind: 'fix-data',
      skills: ['UPDATE'],
      learn: "The same number often lives in two tables. A receipt's `qty` is also counted in its PO line's `qty_received`, so one ticket can need two UPDATEs.",
      prompt: "**Ticket from the receiving lead:** “Receipt {receiptId} got keyed as 4800 units, but the pallet only had 480. Yesterday's numbers are way off.”\n\nFix the receipt's `qty`, then fix `qty_received` on its PO line, which still counts the extra 4320.",
      tables: ['receipts', 'po_lines'],
      check: [
        'SELECT receipt_id, qty FROM receipts ORDER BY receipt_id',
        'SELECT po_line_id, qty_received FROM po_lines ORDER BY po_line_id',
      ],
      solution: `SELECT r.receipt_id, r.po_line_id, r.qty, pl.qty_ordered, pl.qty_received
FROM receipts r
JOIN po_lines pl ON pl.po_line_id = r.po_line_id
WHERE r.receipt_id = ${f.receiptId};

UPDATE receipts
SET qty = 480
WHERE receipt_id = ${f.receiptId};

UPDATE po_lines
SET qty_received = qty_received - 4320
WHERE po_line_id = ${f.receiptLineId};`,
      note: "Fixing one table and forgetting the other is the classic half-fix. Ask what else stores the same number before you call it done.",
    },
  ],
}
