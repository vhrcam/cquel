import { facts as f, type Track } from './types.ts'

export const shipping: Track = {
  id: 'shipping',
  name: 'Shipping',
  role: "The shipping lead gets orders out the door on time: what has to leave today, which picks came up short, how far each wave has gotten, and which carriers keep missing pickups.",
  tasks: [
    {
      id: 'ob-due',
      title: 'Due out today',
      kind: 'query',
      skills: ['JOIN', 'NOT IN'],
      learn: "**NOT IN (…)** keeps the rows whose value isn't in the list. Here it skips orders that are already SHIPPED or CANCELLED.",
      prompt: "Which orders have to ship today (`ship_by` is today) but haven't SHIPPED and weren't CANCELLED?",
      returns: 'order_no, customer_name, carrier_code, status · by order_no',
      tables: ['orders', 'customers'],
      solution: `SELECT o.order_no, c.customer_name, o.carrier_code, o.status
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.ship_by = CURRENT_DATE
  AND o.status NOT IN ('SHIPPED', 'CANCELLED')
ORDER BY o.order_no;`,
    },
    {
      id: 'ob-status',
      title: 'Orders by status',
      kind: 'query',
      skills: ['GROUP BY'],
      prompt: "How many orders are in each status right now?",
      returns: 'status, orders · most first, then status',
      tables: ['orders'],
      solution: `SELECT status, COUNT(*) AS orders
FROM orders
GROUP BY status
ORDER BY orders DESC, status;`,
    },
    {
      id: 'ob-cutoff',
      title: 'Cutoff watch',
      kind: 'query',
      skills: ['NOT IN', 'INTERVAL'],
      learn: "`now()::time` keeps just the time of day, like 14:00:00. One time minus another gives a length of time, so `ca.departs_at - now()::time` is how long until the truck leaves. `INTERVAL '3 hours'` is a length of time you can add.",
      prompt: "Each carrier's truck leaves at its `departs_at` time, and an order that isn't packed by then waits a day. List today's orders (`ship_by` today) that aren't PACKED, SHIPPED or CANCELLED yet and whose truck leaves in the next 3 hours, with the time left.",
      returns: 'order_no, carrier_code, status, departs_at, time_left · least time left first, then order_no',
      tables: ['orders', 'carriers'],
      solution: `SELECT o.order_no, o.carrier_code, o.status, ca.departs_at,
       ca.departs_at - now()::time AS time_left
FROM orders o
JOIN carriers ca ON ca.carrier_code = o.carrier_code
WHERE o.ship_by = CURRENT_DATE
  AND o.status NOT IN ('PACKED', 'SHIPPED', 'CANCELLED')
  AND ca.departs_at > now()::time
  AND ca.departs_at <= now()::time + INTERVAL '3 hours'
ORDER BY time_left, o.order_no;`,
      note: "One Local Fleet order is still PICKING, and its truck left at 11:00. A shipping lead runs a check like this every hour so that doesn't happen.",
    },
    {
      id: 'ob-shorts',
      title: 'Short picks',
      kind: 'query',
      skills: ['JOIN'],
      learn: "Joins can chain. A pick task points at an order line, and the line points at its order. Each JOIN follows one id to the next table.",
      prompt: "A SHORT pick means the picker found less than the task asked for. List the PICK tasks that finished SHORT today (`completed_at` today).",
      returns: 'order_no, sku, location_code (the pick face), qty, qty_done · by order_no',
      tables: ['tasks', 'order_lines', 'orders', 'items', 'locations'],
      solution: `SELECT o.order_no, i.sku, l.location_code, t.qty, t.qty_done
FROM tasks t
JOIN order_lines ol ON ol.order_line_id = t.order_line_id
JOIN orders o ON o.order_id = ol.order_id
JOIN items i ON i.item_id = t.item_id
JOIN locations l ON l.location_id = t.from_location_id
WHERE t.task_type = 'PICK'
  AND t.status = 'SHORT'
  AND t.completed_at >= CURRENT_DATE
ORDER BY o.order_no;`,
    },
    {
      id: 'ob-waves',
      title: 'Wave progress',
      kind: 'query',
      skills: ['FILTER', 'ROUND'],
      learn: "`COUNT(*) FILTER (WHERE …)` counts only the rows that pass its test, inside each group. Next to a plain `COUNT(*)` you get the part and the whole in one row, and a percent is part ÷ whole × 100.",
      prompt: "For each wave released today, how far along is picking? Count its PICK tasks, how many have finished (DONE or SHORT), and the percent finished.",
      returns: 'wave_no, picks, finished, pct_finished (1 decimal) · by wave_no',
      tables: ['tasks', 'waves'],
      solution: `SELECT w.wave_no,
       COUNT(*) AS picks,
       COUNT(*) FILTER (WHERE t.status IN ('DONE', 'SHORT')) AS finished,
       ROUND(100.0 * COUNT(*) FILTER (WHERE t.status IN ('DONE', 'SHORT')) / COUNT(*), 1) AS pct_finished
FROM tasks t
JOIN waves w ON w.wave_id = t.wave_id
WHERE w.released_at >= CURRENT_DATE
GROUP BY w.wave_no
ORDER BY w.wave_no;`,
      note: "`COUNT(*) FILTER (WHERE ...)` counts some of the rows inside a group. The version that works in every database is `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`.",
    },
    {
      id: 'ob-ontime',
      title: 'On-time by carrier',
      kind: 'query',
      skills: ['FILTER', 'dates'],
      learn: "`shipped_at::date` turns a timestamp into just its date. `::` converts a value to another type, so it can be compared with the `ship_by` date.",
      prompt: "For orders shipped in the last 7 days (`shipped_at` on or after Nov 3), what percent of each carrier's orders left on or before their `ship_by` date? `shipped_at::date` turns a timestamp into a date.",
      returns: 'carrier_name, shipped, on_time, on_time_pct (1 decimal) · worst first, then carrier_name',
      tables: ['orders', 'carriers'],
      solution: `SELECT ca.carrier_name,
       COUNT(*) AS shipped,
       COUNT(*) FILTER (WHERE o.shipped_at::date <= o.ship_by) AS on_time,
       ROUND(100.0 * COUNT(*) FILTER (WHERE o.shipped_at::date <= o.ship_by) / COUNT(*), 1) AS on_time_pct
FROM orders o
JOIN carriers ca ON ca.carrier_code = o.carrier_code
WHERE o.shipped_at >= CURRENT_DATE - 7
GROUP BY ca.carrier_name
ORDER BY on_time_pct, ca.carrier_name;`,
    },
    {
      id: 'ob-fix-ambiguous',
      title: 'Fix: ambiguous column',
      kind: 'fix-query',
      skills: ['JOIN', 'aliases'],
      learn: "When two joined tables have a column with the same name, Postgres needs to know which one you mean. The table's alias in front, like `o.order_id`, tells it.",
      prompt: "Customer service wants the lines on order {ambOrderNo}. The query below fails. Fix it.",
      returns: 'order_id, line_no, sku, qty_ordered, qty_picked · by line_no',
      tables: ['orders', 'order_lines', 'items'],
      given: `SELECT order_id, line_no, sku, qty_ordered, qty_picked
FROM orders o
JOIN order_lines ol ON ol.order_id = o.order_id
JOIN items i ON i.item_id = ol.item_id
WHERE o.order_no = '${f.ambOrderNo}'
ORDER BY line_no;`,
      solution: `SELECT o.order_id, line_no, sku, qty_ordered, qty_picked
FROM orders o
JOIN order_lines ol ON ol.order_id = o.order_id
JOIN items i ON i.item_id = ol.item_id
WHERE o.order_no = '${f.ambOrderNo}'
ORDER BY line_no;`,
      note: "When two joined tables share a column name, say which table you mean. Putting the alias on every column is a good habit even when it isn't required.",
    },
    {
      id: 'ob-fix-stuck',
      title: 'Ticket: stuck in PICKING',
      kind: 'fix-data',
      skills: ['UPDATE', 'NOT EXISTS'],
      learn: "An UPDATE's WHERE can use NOT EXISTS too. Here it limits the change to orders with no line still waiting to be picked.",
      prompt: "**Ticket from packing:** “A few orders in wave W1110-2 are fully picked, but they still say PICKING, so they never showed up at the pack station.”\n\nSet every PICKING order whose lines are all fully picked (`qty_picked` = `qty_ordered` on every line) to PICKED. Orders that are only partly picked stay PICKING.",
      tables: ['orders', 'order_lines'],
      check: ['SELECT order_id, status FROM orders ORDER BY order_id'],
      solution: `SELECT o.order_no, ol.line_no, ol.qty_ordered, ol.qty_picked
FROM orders o
JOIN order_lines ol ON ol.order_id = o.order_id
WHERE o.status = 'PICKING'
ORDER BY o.order_no, ol.line_no;

UPDATE orders o
SET status = 'PICKED'
WHERE o.status = 'PICKING'
  AND NOT EXISTS (
    SELECT 1
    FROM order_lines ol
    WHERE ol.order_id = o.order_id
      AND ol.qty_picked < ol.qty_ordered
  );`,
      note: "The quick fix, `UPDATE orders SET status = 'PICKED' WHERE status = 'PICKING'`, would also send the partly picked orders to packing. NOT EXISTS keeps only orders with no unfinished line.",
    },
  ],
}
