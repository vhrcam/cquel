import type { Track } from './types.ts'

const daily = `WITH daily AS (
  SELECT o.shipped_at::date AS ship_date, SUM(ol.qty_shipped) AS units
  FROM orders o
  JOIN order_lines ol ON ol.order_id = o.order_id
  WHERE o.shipped_at >= CURRENT_DATE - 7
    AND o.shipped_at < CURRENT_DATE
  GROUP BY o.shipped_at::date
)`

export const labor: Track = {
  id: 'labor',
  name: 'Labor & Ops',
  role: "Operations managers run the shifts and answer for the numbers: units per hour, on-time shipping, how long pallets sit on the dock. Every morning an ops analyst turns yesterday's WMS history into those numbers.",
  tasks: [
    {
      id: 'op-open-work',
      title: 'Open work right now',
      kind: 'query',
      skills: ['FILTER', 'GROUP BY'],
      learn: "`COUNT(*) FILTER (WHERE …)` can turn values into columns: one count per status, side by side. A supervisor's board reads that way, with one row for each kind of work.",
      prompt: "The start-of-shift board: for each `task_type`, how many tasks are OPEN (waiting), ASSIGNED (on someone's scanner) and IN_PROGRESS right now?",
      returns: 'task_type, open, assigned, in_progress · by task_type',
      tables: ['tasks'],
      solution: `SELECT task_type,
       COUNT(*) FILTER (WHERE status = 'OPEN') AS open,
       COUNT(*) FILTER (WHERE status = 'ASSIGNED') AS assigned,
       COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress
FROM tasks
WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
GROUP BY task_type
ORDER BY task_type;`,
      note: "Some of that work is stuck on the scanners of people who've left. The WMS Support track finds it and sets it free.",
    },
    {
      id: 'op-yesterday',
      title: "Yesterday's work",
      kind: 'query',
      skills: ['GROUP BY'],
      learn: "To cover one whole day of timestamps, go from the start of that day to the start of the next: `>= CURRENT_DATE - 1` and `< CURRENT_DATE` is all of yesterday.",
      prompt: "For yesterday (Nov 9), count each person's finished tasks (DONE or SHORT) by task type, and add up the units they moved (`qty_done`). Use `completed_at` for the day.",
      returns: 'full_name, task_type, tasks, units · by full_name, then task_type',
      tables: ['tasks', 'users'],
      solution: `SELECT u.full_name, t.task_type, COUNT(*) AS tasks, SUM(t.qty_done) AS units
FROM tasks t
JOIN users u ON u.user_id = t.assigned_to
WHERE t.status IN ('DONE', 'SHORT')
  AND t.completed_at >= CURRENT_DATE - 1
  AND t.completed_at < CURRENT_DATE
GROUP BY u.full_name, t.task_type
ORDER BY u.full_name, t.task_type;`,
    },
    {
      id: 'op-uph',
      title: 'Units per hour',
      kind: 'query',
      skills: ['EXTRACT', 'HAVING'],
      learn: "`EXTRACT(EPOCH FROM interval)` turns a length of time into seconds, and ÷ 3600 makes it hours. **HAVING** filters groups after they're counted, like keeping only pickers with 10 or more picks.",
      prompt: "Picker productivity for yesterday: for each person with at least 10 finished PICK tasks (DONE or SHORT), show the units picked, the hours between their first and last completed pick, and units per hour. `EXTRACT(EPOCH FROM interval)` turns an interval into seconds. Round only at the end.",
      returns: 'full_name, units, hours (2 decimals), uph (units ÷ unrounded hours, 1 decimal) · highest uph first',
      tables: ['tasks', 'users'],
      solution: `SELECT u.full_name,
       SUM(t.qty_done) AS units,
       ROUND(EXTRACT(EPOCH FROM MAX(t.completed_at) - MIN(t.completed_at)) / 3600, 2) AS hours,
       ROUND(SUM(t.qty_done) / (EXTRACT(EPOCH FROM MAX(t.completed_at) - MIN(t.completed_at)) / 3600), 1) AS uph
FROM tasks t
JOIN users u ON u.user_id = t.assigned_to
WHERE t.task_type = 'PICK'
  AND t.status IN ('DONE', 'SHORT')
  AND t.completed_at >= CURRENT_DATE - 1
  AND t.completed_at < CURRENT_DATE
GROUP BY u.full_name
HAVING COUNT(*) >= 10
ORDER BY uph DESC;`,
      note: "`HAVING` filters groups after they're counted. `WHERE` can't do that, because it runs before the grouping.",
    },
    {
      id: 'op-daily',
      title: 'Units shipped per day',
      kind: 'query',
      skills: ['GROUP BY', 'dates'],
      prompt: "Units shipped per day for the last 7 full days, Nov 3 through Nov 9. `shipped_at::date` turns a timestamp into a date.",
      returns: 'ship_date, units · oldest first',
      tables: ['orders', 'order_lines'],
      solution: `SELECT o.shipped_at::date AS ship_date, SUM(ol.qty_shipped) AS units
FROM orders o
JOIN order_lines ol ON ol.order_id = o.order_id
WHERE o.shipped_at >= CURRENT_DATE - 7
  AND o.shipped_at < CURRENT_DATE
GROUP BY o.shipped_at::date
ORDER BY ship_date;`,
    },
    {
      id: 'op-running',
      title: 'Running total',
      kind: 'query',
      skills: ['CTE', 'window SUM'],
      learn: "A **window function** works across rows without squashing them. `SUM(units) OVER (ORDER BY ship_date)` adds up every day so far, on each day's row.",
      prompt: "Same daily units, plus a running total that adds up across the week. `SUM(...) OVER (ORDER BY ...)` is a window function that does it in one pass.",
      returns: 'ship_date, units, running_total · oldest first',
      tables: ['orders', 'order_lines'],
      solution: `${daily}
SELECT ship_date, units,
       SUM(units) OVER (ORDER BY ship_date) AS running_total
FROM daily
ORDER BY ship_date;`,
    },
    {
      id: 'op-change',
      title: 'Day over day',
      kind: 'query',
      skills: ['CTE', 'LAG'],
      learn: "**LAG(units)** reads the value from the row before, in the window's order. Subtract it from today's value and you get the change.",
      prompt: "Show each day's change from the day before: units minus the previous day's units. `LAG()` reads the row before. The first day has nothing before it, so its change is NULL.",
      returns: 'ship_date, units, change · oldest first',
      tables: ['orders', 'order_lines'],
      solution: `${daily}
SELECT ship_date, units,
       units - LAG(units) OVER (ORDER BY ship_date) AS change
FROM daily
ORDER BY ship_date;`,
    },
    {
      id: 'op-rank',
      title: 'Rank within a shift',
      kind: 'query',
      skills: ['RANK', 'PARTITION BY'],
      learn: "**RANK()** numbers rows by a sort, and ties share a number. **PARTITION BY** restarts it for each group, so each shift gets its own 1, 2, 3.",
      prompt: "Rank yesterday's pickers within their own shift by units picked (DONE or SHORT PICK tasks), 1 = most units. Ties share a rank.",
      returns: 'shift, full_name, units, shift_rank · by shift, then shift_rank, then full_name',
      tables: ['tasks', 'users'],
      solution: `SELECT u.shift, u.full_name, SUM(t.qty_done) AS units,
       RANK() OVER (PARTITION BY u.shift ORDER BY SUM(t.qty_done) DESC) AS shift_rank
FROM tasks t
JOIN users u ON u.user_id = t.assigned_to
WHERE t.task_type = 'PICK'
  AND t.status IN ('DONE', 'SHORT')
  AND t.completed_at >= CURRENT_DATE - 1
  AND t.completed_at < CURRENT_DATE
GROUP BY u.shift, u.full_name
ORDER BY u.shift, shift_rank, u.full_name;`,
      note: "`PARTITION BY` restarts the ranking for each shift, like running a separate ranking per group.",
    },
    {
      id: 'op-dock',
      title: 'Dock to stock',
      kind: 'query',
      skills: ['AVG', 'EXTRACT'],
      learn: "AVG and MAX work on calculations too. Here the calculation is the minutes between receiving a pallet and putting it away.",
      prompt: "Dock-to-stock time is how long a pallet waits between being received and being put away. For pallets received yesterday whose PUTAWAY task is DONE, show the average and the longest wait in minutes.",
      returns: 'avg_minutes, max_minutes (both 1 decimal) · one row',
      tables: ['receipts', 'tasks'],
      solution: `SELECT ROUND(AVG(EXTRACT(EPOCH FROM t.completed_at - r.received_at) / 60), 1) AS avg_minutes,
       ROUND(MAX(EXTRACT(EPOCH FROM t.completed_at - r.received_at) / 60), 1) AS max_minutes
FROM receipts r
JOIN tasks t ON t.receipt_id = r.receipt_id
WHERE t.task_type = 'PUTAWAY'
  AND t.status = 'DONE'
  AND r.received_at >= CURRENT_DATE - 1
  AND r.received_at < CURRENT_DATE;`,
    },
    {
      id: 'op-fix-divzero',
      title: 'Fix: division by zero',
      kind: 'fix-query',
      skills: ['NULLIF'],
      learn: "Dividing by zero is an error, and it stops the whole query even when only one row has the zero.",
      prompt: "The morning productivity report crashes. A new hire did one single pick yesterday, so their first and last pick happened at the same moment: 0 hours. Fix the query so that person's `uph` shows NULL instead of crashing, and everyone else's numbers stay the same.",
      returns: 'full_name, units, uph · highest uph first (NULL last), then full_name',
      tables: ['tasks', 'users'],
      given: `SELECT u.full_name,
       SUM(t.qty_done) AS units,
       ROUND(SUM(t.qty_done) / (EXTRACT(EPOCH FROM MAX(t.completed_at) - MIN(t.completed_at)) / 3600), 1) AS uph
FROM tasks t
JOIN users u ON u.user_id = t.assigned_to
WHERE t.task_type = 'PICK'
  AND t.status IN ('DONE', 'SHORT')
  AND t.completed_at >= CURRENT_DATE - 1
  AND t.completed_at < CURRENT_DATE
GROUP BY u.full_name
ORDER BY uph DESC NULLS LAST, u.full_name;`,
      solution: `SELECT u.full_name,
       SUM(t.qty_done) AS units,
       ROUND(SUM(t.qty_done) / NULLIF(EXTRACT(EPOCH FROM MAX(t.completed_at) - MIN(t.completed_at)) / 3600, 0), 1) AS uph
FROM tasks t
JOIN users u ON u.user_id = t.assigned_to
WHERE t.task_type = 'PICK'
  AND t.status IN ('DONE', 'SHORT')
  AND t.completed_at >= CURRENT_DATE - 1
  AND t.completed_at < CURRENT_DATE
GROUP BY u.full_name
ORDER BY uph DESC NULLS LAST, u.full_name;`,
      note: "`NULLIF(x, 0)` turns a 0 into NULL, and dividing by NULL gives NULL instead of an error.",
    },
    {
      id: 'op-fix-login',
      title: 'Ticket: wrong login',
      kind: 'fix-data',
      skills: ['UPDATE', 'ranges'],
      learn: "Moving work between people needs an exact time window. Times go in quotes like dates: `'2026-11-09 13:00'`.",
      prompt: "**Ticket from the 1st shift supervisor:** “Yesterday from 1:00 to 2:00 PM, Maria Rivera was in forklift training, and Kiran Patel picked on Maria's scanner because Kiran's was broken. Kiran's numbers are short and Maria's are inflated.”\n\nMove the PICK tasks that Maria's login (`mrivera`) completed yesterday from 13:00 up to, but not including, 14:00 over to Kiran (`kpatel`). Leave every other task alone.",
      tables: ['tasks', 'users'],
      check: ['SELECT task_id, assigned_to FROM tasks ORDER BY task_id'],
      solution: `SELECT user_id, username, full_name
FROM users
WHERE username IN ('mrivera', 'kpatel');

SELECT task_id, completed_at, qty_done
FROM tasks
WHERE assigned_to = 1
  AND task_type = 'PICK'
  AND completed_at >= '2026-11-09 13:00'
  AND completed_at < '2026-11-09 14:00';

UPDATE tasks
SET assigned_to = 2
WHERE assigned_to = 1
  AND task_type = 'PICK'
  AND completed_at >= '2026-11-09 13:00'
  AND completed_at < '2026-11-09 14:00';`,
      note: "Use `>=` for the start and `<` for the end of a time range, so a task finished at exactly 14:00:00 isn't counted in two hours.",
    },
  ],
}
