import { blankOut } from '../db/sqltext.ts'

// The reference: one entry per SQL word or symbol, plus a few habits.
// Each one says what it means in plain words, what it does, how to write it, and what not to do.
// A 'clause' covers the text until the next clause, a 'call' covers its parentheses, a 'word' just itself.
// 'note' entries (keys and habits) are never matched in a query. They live in the look up list.

type Kind = 'clause' | 'call' | 'word' | 'note'
export type Group = 'read' | 'filter' | 'join' | 'sum' | 'sort' | 'math' | 'window' | 'change' | 'habit'
export type Tip = { id: string; label: string; group: Group; kind: Kind; re: RegExp | null; words: string[]; means: string; does: string; write: string; dont: string }
export type Spot = { at: number; end: number; tip: Tip }
export type Found = { tip: Tip; line: string }
export type Explained = { found: Found[]; spots: Spot[] }

export const TIPS: Tip[] = [
  {
    id: 'with', label: 'WITH … AS', group: 'join', kind: 'clause', re: /\bWITH\s+\w+\s+AS\s*\(/gi, words: ['WITH', 'AS'],
    means: 'name a step, then use it',
    does: 'Names a step of the query (a CTE), so the final SELECT can read it like a table. Long queries read top to bottom instead of inside out.',
    write: 'WITH daily AS (SELECT …) SELECT … FROM daily',
    dont: "Don't put a semicolon after the step's closing parenthesis. The WITH and the SELECT after it are one statement.",
  },
  {
    id: 'select', label: 'SELECT', group: 'read', kind: 'clause', re: /\bSELECT\b/gi, words: ['SELECT'],
    means: 'show me these columns',
    does: 'Lists the columns you want back, in the order you want them. Every query that reads data starts here.',
    write: 'SELECT sku, description',
    dont: "Don't leave a comma after the last column. `SELECT sku, description, FROM` is a syntax error.",
  },
  {
    id: 'star', label: 'SELECT *', group: 'read', kind: 'word', re: /\bSELECT\s+\*/gi, words: [],
    means: 'every column',
    does: "`*` brings back every column of the table. It's the quickest way to see what a table holds.",
    write: 'SELECT * FROM zones LIMIT 20',
    dont: "Don't use it in a saved report or on a big history table. Name the columns you need: less comes back, and the report doesn't change when the table does.",
  },
  {
    id: 'distinct', label: 'DISTINCT', group: 'read', kind: 'word', re: /\bDISTINCT\b/gi, words: ['DISTINCT'],
    means: 'one of each',
    does: 'Removes duplicate rows, so each value shows up once. `COUNT(DISTINCT x)` counts the different values.',
    write: 'SELECT DISTINCT job_role',
    dont: "Don't use it to hide duplicates a JOIN made. They're a sign the join repeats rows, and your totals will still be off.",
  },
  {
    id: 'from', label: 'FROM', group: 'read', kind: 'clause', re: /\bFROM\b/gi, words: ['FROM'],
    means: 'from this table',
    does: 'Names the table the rows come from. SELECT is what you want; FROM is where it lives.',
    write: 'FROM inventory',
    dont: "Don't guess table names. The schema tab lists them all: it's `inventory`, not `inventories`.",
  },
  {
    id: 'alias', label: 'table aliases', group: 'read', kind: 'word', re: /(?<=\b(?:FROM|JOIN)\s+\w+\s+)(?!(?:ON|WHERE|JOIN|LEFT|RIGHT|FULL|INNER|GROUP|ORDER|LIMIT|SET|USING|AS)\b)[a-z_]\w*/gi, words: [],
    means: 'a short name for a table',
    does: 'The short name after a table, like `inv` in `FROM inventory inv`. After that you write `inv.qty_on_hand` instead of the full table name.',
    write: 'FROM inventory inv',
    dont: "Once a table has an alias, don't use its full name. `inventory.qty_on_hand` fails; `inv.qty_on_hand` works.",
  },
  {
    id: 'dot', label: 'table.column', group: 'read', kind: 'word', re: /\b[a-z_]\w*\.[a-z_]\w*/gi, words: [],
    means: "this table's column",
    does: '`table.column` says which table a column comes from. You need it when two joined tables share a column name, like `order_id`.',
    write: 'o.order_id, ol.line_no',
    dont: "Don't leave it off when two tables share a column name, or Postgres says the column is ambiguous.",
  },
  {
    id: 'join', label: 'JOIN … ON', group: 'join', kind: 'clause', re: /(?<!\b(?:LEFT|RIGHT|FULL|CROSS)\s+(?:OUTER\s+)?)\bJOIN\b/gi, words: ['JOIN', 'ON', 'INNER'],
    means: 'line up rows from two tables',
    does: 'Matches rows from two tables. `ON` says which columns match, usually an id and the same id in the other table. Rows with no match are dropped.',
    write: 'JOIN items i ON i.item_id = inv.item_id',
    dont: "Don't skip checking the row count. If the second table has several matches for each row (lines per order), every row repeats and totals get multiplied.",
  },
  {
    id: 'left', label: 'LEFT JOIN', group: 'join', kind: 'clause', re: /\bLEFT\s+(?:OUTER\s+)?JOIN\b/gi, words: ['LEFT', 'OUTER', 'JOIN', 'ON'],
    means: 'keep every row from the first table',
    does: "Like JOIN, but rows with no match stay, with NULLs on the missing side. That's how you find what's missing.",
    write: 'LEFT JOIN inventory inv ON inv.location_id = l.location_id',
    dont: "Don't filter the second table in WHERE (like `WHERE inv.qty_on_hand > 0`). That drops the NULL rows and turns it back into a plain JOIN. Put the condition in ON.",
  },
  {
    id: 'full', label: 'FULL JOIN', group: 'join', kind: 'clause', re: /\bFULL\s+(?:OUTER\s+)?JOIN\b/gi, words: ['FULL', 'OUTER', 'JOIN', 'ON'],
    means: 'keep every row from both tables',
    does: "Keeps the unmatched rows from both sides, with NULLs where there's no match. It's how you compare two lists, like WMS stock against ERP stock.",
    write: 'FULL JOIN erp_inventory e ON e.sku = w.sku',
    dont: "Don't compare or subtract the NULLs as they are. Use `COALESCE(x, 0)` first, or a row that only one side has looks like no difference.",
  },
  {
    id: 'where', label: 'WHERE', group: 'filter', kind: 'clause', re: /\bWHERE\b/gi, words: ['WHERE'],
    means: 'only the rows where …',
    does: 'Keeps only the rows that pass the test. Leave it off and you get every row in the table.',
    write: "WHERE status = 'LOCKED'",
    dont: 'Never run an UPDATE or DELETE without one. It changes every row in the table.',
  },
  {
    id: 'and', label: 'AND', group: 'filter', kind: 'clause', re: /\bAND\b/gi, words: ['AND'],
    means: 'both must be true',
    does: 'Adds another test. A row has to pass all of them, so each AND makes the result smaller.',
    write: "WHERE zone_code = 'RSV' AND aisle = 3",
    dont: "Don't mix AND and OR without parentheses. AND goes first, so `a OR b AND c` means `a OR (b AND c)`.",
  },
  {
    id: 'or', label: 'OR', group: 'filter', kind: 'clause', re: /\bOR\b/gi, words: ['OR'],
    means: 'either one can be true',
    does: 'Keeps rows that pass at least one of the tests, so each OR makes the result bigger.',
    write: "WHERE status = 'HOLD' OR status = 'DAMAGED'",
    dont: "Don't mix it with AND without parentheses: write `(a OR b) AND c`. For one column, `IN ('HOLD', 'DAMAGED')` is shorter and can't go wrong.",
  },
  {
    id: 'not', label: 'NOT', group: 'filter', kind: 'word', re: /(?<!\bIS\s+)\bNOT\b(?!\s+(?:IN|EXISTS|NULL|LIKE|BETWEEN)\b)/gi, words: ['NOT'],
    means: 'the opposite',
    does: "Flips a true/false test. `WHERE NOT u.active` keeps the users who aren't active.",
    write: 'WHERE NOT active',
    dont: "Don't expect it to bring back NULL rows. `NOT (x = 5)` skips the rows where x is NULL, just like `x = 5` does.",
  },
  {
    id: 'compare', label: '<  >  <=  >=  <>', group: 'filter', kind: 'word', re: /<>|!=|<=|>=|(?<![<>!-])[<>](?![=>])/g, words: [],
    means: 'less than, more than, not equal',
    does: 'Compares numbers, dates and text: `<`, `>`, `<=`, `>=`, `=`, and `<>` for not equal.',
    write: 'WHERE qty_on_hand < 0',
    dont: "For a time range, don't end it with `<=`. Use `>=` for the start and `<` for the end, so a moment on the boundary only counts once.",
  },
  {
    id: 'in', label: 'IN (…)', group: 'filter', kind: 'call', re: /(?<!\bNOT\s+)\bIN\s*\(/gi, words: ['IN'],
    means: 'any of these',
    does: "A short way to write several ORs on one column. `status IN ('DONE', 'SHORT')` means the status is DONE or SHORT.",
    write: "WHERE status IN ('DONE', 'SHORT')",
    dont: "Don't forget the quotes and commas: `IN ('DONE', 'SHORT')`, not `IN (DONE SHORT)`.",
  },
  {
    id: 'notin', label: 'NOT IN (…)', group: 'filter', kind: 'call', re: /\bNOT\s+IN\b/gi, words: ['NOT', 'IN'],
    means: 'none of these',
    does: "Keeps rows whose value isn't in the list.",
    write: "WHERE status NOT IN ('SHIPPED', 'CANCELLED')",
    dont: "Don't use it with a subquery that can return a NULL. One NULL in the list and nothing matches. Use NOT EXISTS for subqueries.",
  },
  {
    id: 'between', label: 'BETWEEN', group: 'filter', kind: 'word', re: /\bBETWEEN\b/gi, words: ['BETWEEN', 'AND'],
    means: 'from … to …, both ends included',
    does: '`BETWEEN 1 AND 10` keeps 1 and 10 too. It works well on dates.',
    write: 'WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30',
    dont: "Don't use it on timestamps for whole days. `BETWEEN '2026-11-09' AND '2026-11-09'` only matches midnight. Use `>= '2026-11-09'` and `< '2026-11-10'`.",
  },
  {
    id: 'like', label: 'LIKE', group: 'filter', kind: 'word', re: /\bI?LIKE\b/gi, words: ['LIKE', 'ILIKE'],
    means: 'matches a pattern',
    does: "`%` stands for any run of characters and `_` for one character, so `'%Dog%'` finds Dog anywhere. `ILIKE` ignores upper and lower case.",
    write: "WHERE description LIKE '%Dog%'",
    dont: "Don't forget it's case-sensitive: `'%dog%'` won't find Dog. On a big table, a pattern that starts with `%` has to read every row.",
  },
  {
    id: 'null', label: 'NULL', group: 'filter', kind: 'word', re: /\bNULL\b/gi, words: ['NULL', 'IS', 'NOT'],
    means: 'no value',
    does: 'NULL means empty or unknown. Find it with `IS NULL`, or the filled ones with `IS NOT NULL`. In an UPDATE, `SET x = NULL` clears a value.',
    write: 'WHERE assigned_to IS NULL',
    dont: "Never write `= NULL`. It's never true, not even when the value is NULL, so the query quietly returns nothing.",
  },
  {
    id: 'exists', label: 'EXISTS', group: 'join', kind: 'call', re: /(?<!\bNOT\s+)\bEXISTS\b/gi, words: ['EXISTS'],
    means: 'is there at least one?',
    does: 'True when the subquery finds at least one row. It asks “is there a match?” without pulling the matches into the result.',
    write: 'WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.item_id = i.item_id)',
    dont: "Don't forget to tie the subquery to the outer row (`t.item_id = i.item_id`). Without that, it's true for every row.",
  },
  {
    id: 'notexists', label: 'NOT EXISTS', group: 'join', kind: 'call', re: /\bNOT\s+EXISTS\b/gi, words: ['NOT', 'EXISTS'],
    means: "there isn't one",
    does: 'True when the subquery finds nothing. It\'s the cleanest way to ask “which rows have no match?”, including rows that never had one.',
    write: 'WHERE NOT EXISTS (SELECT 1 FROM cycle_counts cc WHERE cc.location_id = pf.location_id)',
    dont: "Don't swap in NOT IN for a subquery. NOT IN returns nothing if the subquery has a single NULL.",
  },
  {
    id: 'subquery', label: '(SELECT …)', group: 'join', kind: 'call', re: /(?<!\b(?:AS|EXISTS)\s*)\(\s*SELECT\b/gi, words: [],
    means: 'a query inside a query',
    does: 'Its answer is used as a value or a list, so you can look an id up instead of copying it by hand.',
    write: "WHERE item_id = (SELECT item_id FROM items WHERE sku = '10105')",
    dont: 'With `=`, the subquery has to return exactly one row. If it can return several, use `IN (…)`.',
  },
  {
    id: 'group', label: 'GROUP BY', group: 'sum', kind: 'clause', re: /\bGROUP\s+BY\b/gi, words: ['GROUP', 'BY'],
    means: 'one row for each …',
    does: 'Squashes rows into one row per group, so COUNT and SUM total each group separately.',
    write: 'GROUP BY zone_code',
    dont: "Every column in SELECT has to be in the GROUP BY or inside an aggregate like SUM. Don't add a column just to see it.",
  },
  {
    id: 'having', label: 'HAVING', group: 'sum', kind: 'clause', re: /\bHAVING\b/gi, words: ['HAVING'],
    means: 'only the groups where …',
    does: "Filters groups after they're totaled. WHERE can't do that, because WHERE runs before the grouping.",
    write: 'HAVING COUNT(*) > 1',
    dont: "Don't use it for tests on single rows. Those belong in WHERE, which throws rows out before grouping and is faster.",
  },
  {
    id: 'order', label: 'ORDER BY', group: 'sort', kind: 'clause', re: /(?<!\bOVER\s*\([^)]*)\bORDER\s+BY\b/gi, words: ['ORDER', 'BY'],
    means: 'sort by …',
    does: 'Sorts the result. List more columns to break ties, like aisle, then bay, then level for a walking path.',
    write: 'ORDER BY aisle, bay, level',
    dont: "Don't count on any order without it. Rows come back in whatever order is fastest, and that can change from run to run.",
  },
  {
    id: 'desc', label: 'DESC / ASC', group: 'sort', kind: 'word', re: /\b(?:DESC|ASC)\b/gi, words: ['DESC', 'ASC'],
    means: 'biggest first / smallest first',
    does: '`DESC` sorts biggest, latest or Z first. `ASC` is the default: smallest, earliest or A first.',
    write: 'ORDER BY unit_cost DESC, sku',
    dont: "DESC only covers the column right before it. `ORDER BY a, b DESC` still sorts a smallest first.",
  },
  {
    id: 'nulls', label: 'NULLS LAST', group: 'sort', kind: 'word', re: /\bNULLS\s+(?:LAST|FIRST)\b/gi, words: ['NULLS', 'LAST', 'FIRST'],
    means: 'put empty values at the end',
    does: 'Says where NULLs go in the sort. Postgres treats NULL as bigger than everything, so `DESC` puts NULLs first unless you add `NULLS LAST`.',
    write: 'ORDER BY uph DESC NULLS LAST',
    dont: "Don't let NULLs take the top of a best-first list. Add NULLS LAST.",
  },
  {
    id: 'limit', label: 'LIMIT', group: 'sort', kind: 'clause', re: /\bLIMIT\b/gi, words: ['LIMIT'],
    means: 'only the first …',
    does: "Stops after that many rows. It's also the safe way to peek at a big table.",
    write: 'ORDER BY weight_lb DESC LIMIT 5',
    dont: "Don't use LIMIT without ORDER BY for a top 5. You'd get 5 rows in no particular order.",
  },
  {
    id: 'as', label: 'AS', group: 'read', kind: 'word', re: /\bAS\b(?!\s*\()/gi, words: ['AS'],
    means: 'call this column …',
    does: 'Gives a column a name in the result, like `COUNT(*) AS locations`. The output is easier to read, and you can sort by that name.',
    write: 'SUM(qty_done) AS units',
    dont: "Don't use that name in WHERE. WHERE runs before SELECT names anything, so repeat the calculation there.",
  },
  {
    id: 'count', label: 'COUNT', group: 'sum', kind: 'call', re: /\bCOUNT\s*\(/gi, words: ['COUNT'],
    means: 'how many',
    does: '`COUNT(*)` counts rows. `COUNT(column)` skips rows where that column is NULL. `COUNT(DISTINCT x)` counts the different values.',
    write: 'COUNT(*) AS orders',
    dont: "After joining orders to their lines, don't count orders with COUNT(*). Each order shows up once per line. Use `COUNT(DISTINCT o.order_id)`.",
  },
  {
    id: 'sum', label: 'SUM', group: 'sum', kind: 'call', re: /\bSUM\s*\(/gi, words: ['SUM'],
    means: 'add them up',
    does: "Adds up a column, or a calculation, across all the rows, or across each group when there's a GROUP BY.",
    write: 'SUM(qty_done) AS units',
    dont: "Don't sum across a join that repeats rows. Join two one-to-many tables and both sums get multiplied. Total each side first, in a WITH step.",
  },
  {
    id: 'avg', label: 'AVG', group: 'sum', kind: 'call', re: /\bAVG\s*\(/gi, words: ['AVG'],
    means: 'the average',
    does: 'The average of a column. NULLs are skipped, not counted as 0.',
    write: 'ROUND(AVG(qty), 1)',
    dont: "Don't assume empty values count as 0. If they should, write `AVG(COALESCE(x, 0))`.",
  },
  {
    id: 'minmax', label: 'MIN / MAX', group: 'sum', kind: 'call', re: /\b(?:MIN|MAX)\s*\(/gi, words: ['MIN', 'MAX'],
    means: 'the smallest / the largest',
    does: 'The smallest or largest value, like the first and last time something happened.',
    write: 'MIN(completed_at), MAX(completed_at)',
    dont: "Don't use MAX to find the latest row. It gives the latest value of one column, not the rest of that row. Use ORDER BY … DESC LIMIT 1 instead.",
  },
  {
    id: 'round', label: 'ROUND', group: 'math', kind: 'call', re: /\bROUND\s*\(/gi, words: ['ROUND'],
    means: 'round it off',
    does: 'Rounds to that many decimals: `ROUND(97.36, 1)` is 97.4.',
    write: 'ROUND(100.0 * done / total, 1)',
    dont: "Don't round the pieces and then do math with them. Round once, at the end, so the math before it stays exact.",
  },
  {
    id: 'abs', label: 'ABS', group: 'math', kind: 'call', re: /\bABS\s*\(/gi, words: ['ABS'],
    means: 'drop the minus sign',
    does: '−12 and +12 become the same size, so you can sort misses by how big they are.',
    write: 'ORDER BY ABS(counted_qty - system_qty) DESC',
    dont: "Don't show the ABS value when the direction matters. Short and over are different problems, so keep the sign in the output.",
  },
  {
    id: 'coalesce', label: 'COALESCE', group: 'math', kind: 'call', re: /\bCOALESCE\s*\(/gi, words: ['COALESCE'],
    means: "use this when it's empty",
    does: "Returns the first value that isn't NULL. `COALESCE(SUM(x), 0)` turns “nothing” into 0.",
    write: 'COALESCE(e.qty_on_hand, 0)',
    dont: "Don't use it to hide NULLs you haven't looked at. Sometimes the NULL is the problem you're looking for.",
  },
  {
    id: 'nullif', label: 'NULLIF', group: 'math', kind: 'call', re: /\bNULLIF\s*\(/gi, words: ['NULLIF'],
    means: 'treat this value as empty',
    does: '`NULLIF(x, 0)` gives NULL when x is 0. Dividing by NULL returns NULL instead of crashing with division by zero.',
    write: 'units / NULLIF(hours, 0)',
    dont: "Don't divide by anything that can be 0 without it. One zero crashes the whole report.",
  },
  {
    id: 'divide', label: '/  division', group: 'math', kind: 'word', re: /(?<![/*])\/(?![/*])/g, words: [],
    means: 'divided by',
    does: "Whole number ÷ whole number drops the remainder in Postgres: `7 / 2` is 3. Sometimes that's what you want, like counting whole cases.",
    write: 'SUM(qty_received) * 100.0 / SUM(qty_ordered)',
    dont: "Don't divide two whole numbers for a percent: 95 / 100 is 0. Multiply by `100.0` first, so the math keeps its decimals.",
  },
  {
    id: 'case', label: 'CASE WHEN', group: 'math', kind: 'call', re: /\bCASE\b/gi, words: ['CASE', 'WHEN', 'THEN', 'ELSE', 'END'],
    means: 'if … then … otherwise …',
    does: 'An if/else inside a query. `CASE WHEN … THEN … ELSE … END` turns values into labels, like ranks into classes A, B and C.',
    write: "CASE WHEN rnk <= 20 THEN 'A' ELSE 'C' END",
    dont: "Don't forget END. And the first WHEN that's true wins, so put the narrowest test first.",
  },
  {
    id: 'filter', label: 'FILTER (WHERE …)', group: 'sum', kind: 'call', re: /\bFILTER\s*\(/gi, words: ['FILTER', 'WHERE'],
    means: 'count only some of them',
    does: "Counts or sums only some of the rows in each group. It's Postgres; other databases write `SUM(CASE WHEN … THEN 1 ELSE 0 END)`.",
    write: "COUNT(*) FILTER (WHERE status = 'SHORT')",
    dont: "Don't confuse it with WHERE. WHERE removes rows from every column; FILTER only from that one count.",
  },
  {
    id: 'over', label: 'OVER (…)', group: 'window', kind: 'call', re: /\bOVER\s*\(/gi, words: ['OVER', 'ORDER', 'BY'],
    means: 'look across rows, but keep them all',
    does: 'Makes a window function. It calculates across other rows without squashing them into groups, like a running total next to each day.',
    write: 'SUM(units) OVER (ORDER BY ship_date)',
    dont: "Don't filter on a window function in WHERE. It isn't calculated yet at that point. Do it in a WITH step and filter outside.",
  },
  {
    id: 'partition', label: 'PARTITION BY', group: 'window', kind: 'word', re: /\bPARTITION\s+BY\b/gi, words: ['PARTITION', 'BY'],
    means: 'start over for each …',
    does: 'Restarts the window for each group, like ranking pickers separately within each shift.',
    write: 'OVER (PARTITION BY shift ORDER BY units DESC)',
    dont: "Don't mix it up with GROUP BY. PARTITION BY keeps every row; GROUP BY squashes them.",
  },
  {
    id: 'rownum', label: 'ROW_NUMBER()', group: 'window', kind: 'call', re: /\bROW_NUMBER\s*\(/gi, words: ['ROW_NUMBER'],
    means: 'number the rows 1, 2, 3 …',
    does: 'Numbers rows in the order you give it. No ties: every row gets its own number.',
    write: 'ROW_NUMBER() OVER (ORDER BY units DESC, sku)',
    dont: "Don't leave ties to chance. Add a tie-breaker like sku, or two rows can swap numbers between runs.",
  },
  {
    id: 'rank', label: 'RANK()', group: 'window', kind: 'call', re: /\b(?:DENSE_)?RANK\s*\(/gi, words: ['RANK', 'DENSE_RANK'],
    means: 'rank them, ties share',
    does: 'Like ROW_NUMBER, but ties share a rank and the next rank skips ahead: 1, 1, 3.',
    write: 'RANK() OVER (ORDER BY units DESC)',
    dont: "Don't use it when you need no gaps after a tie. `DENSE_RANK()` gives 1, 1, 2.",
  },
  {
    id: 'lag', label: 'LAG()', group: 'window', kind: 'call', re: /\b(?:LAG|LEAD)\s*\(/gi, words: ['LAG', 'LEAD'],
    means: 'the value from the row before',
    does: 'Reads a value from the previous row (`LEAD` reads the next one), so each day can be compared with the one before it.',
    write: 'units - LAG(units) OVER (ORDER BY ship_date)',
    dont: "Don't treat the first row's NULL as 0. There's no row before it, so there's nothing to compare.",
  },
  {
    id: 'stringagg', label: 'string_agg', group: 'sum', kind: 'call', re: /\bstring_agg\s*\(/gi, words: [],
    means: 'join text into one line',
    does: "Joins text from many rows into one, with the separator you give, like `'P-02-07-A, P-02-08-A'`.",
    write: "string_agg(location_code, ', ' ORDER BY location_code)",
    dont: "Don't leave out the ORDER BY inside it, or the list can come back in a different order each time.",
  },
  {
    id: 'extract', label: 'EXTRACT', group: 'math', kind: 'call', re: /\bEXTRACT\s*\(/gi, words: ['EXTRACT', 'EPOCH', 'FROM'],
    means: 'pull out one part',
    does: 'Pulls one part out of a date or a length of time. `EPOCH` gives the total seconds, so you can turn a duration into hours.',
    write: 'EXTRACT(EPOCH FROM done_at - started_at) / 3600',
    dont: "Don't use `EXTRACT(HOUR FROM …)` for a duration in hours. It only gives the hours part, so 1 day 2 hours gives 2.",
  },
  {
    id: 'today', label: 'CURRENT_DATE', group: 'math', kind: 'word', re: /\bCURRENT_DATE\b/gi, words: ['CURRENT_DATE'],
    means: "today's date",
    does: 'Use it instead of typing a date, so the query still works tomorrow.',
    write: 'WHERE ship_by = CURRENT_DATE',
    dont: "Don't use `=` with a timestamp column. `received_at = CURRENT_DATE` only matches midnight. Use `received_at >= CURRENT_DATE`.",
  },
  {
    id: 'datemath', label: 'date ± days', group: 'math', kind: 'word', re: /\bCURRENT_DATE\s*[-+]\s*\d+/gi, words: [],
    means: 'a date, moved by some days',
    does: 'Adding or subtracting a whole number moves a date: `CURRENT_DATE - 1` is yesterday. Subtracting two dates gives the days between them.',
    write: 'CURRENT_DATE - po.expected_date AS days_late',
    dont: "Don't add a plain number to a timestamp; Postgres won't do it. Use an interval: `now() - INTERVAL '2 hours'`.",
  },
  {
    id: 'now', label: 'now()', group: 'math', kind: 'word', re: /\bnow\s*\(\s*\)/gi, words: [],
    means: 'this moment',
    does: 'The current date and time. Subtract a timestamp from it to see how long ago something happened.',
    write: 'now() - created_at AS waiting',
    dont: "Don't use it to mean today. `>= now() - INTERVAL '1 day'` is the last 24 hours, not yesterday.",
  },
  {
    id: 'interval', label: 'INTERVAL', group: 'math', kind: 'word', re: /\bINTERVAL\b/gi, words: ['INTERVAL'],
    means: 'a length of time',
    does: "Like `INTERVAL '2 hours'` or `INTERVAL '7 days'`. Add it to or subtract it from a timestamp or a time of day.",
    write: "now() + INTERVAL '3 hours'",
    dont: "Don't leave out the quotes: `INTERVAL '3 hours'`, not `INTERVAL 3 hours`.",
  },
  {
    id: 'cast', label: ':: cast', group: 'math', kind: 'word', re: /::\s*\w+/g, words: [],
    means: 'turn it into another type',
    does: 'Converts a value. `::date` keeps only the date part of a timestamp, so you can group by day. `::time` keeps only the time.',
    write: 'shipped_at::date AS ship_date',
    dont: "Don't cast the column you filter on in a big table (`created_at::date = …`). The database can't use its index. Filter on a range instead.",
  },
  {
    id: 'bool', label: 'true / false', group: 'filter', kind: 'word', re: /\b(?:true|false)\b/gi, words: ['TRUE', 'FALSE'],
    means: 'yes or no',
    does: 'True/false values. A true/false column can stand on its own: `WHERE active` means the same as `WHERE active = true`.',
    write: 'WHERE active = false',
    dont: "Don't put true and false in quotes, or use 'Y' and 'N'. These columns hold real true/false values.",
  },
  {
    id: 'quote', label: "'text'", group: 'read', kind: 'word', re: /'[^']*'/g, words: [],
    means: 'a text value',
    does: "Text and dates go in single quotes. Inside the quotes, case matters: 'HOLD' isn't 'hold'.",
    write: "WHERE status = 'HOLD'",
    dont: 'Don\'t use double quotes for text. In Postgres, "HOLD" means a column named HOLD.',
  },
  {
    id: 'update', label: 'UPDATE', group: 'change', kind: 'clause', re: /\bUPDATE\b/gi, words: ['UPDATE'],
    means: 'change these rows',
    does: 'Changes rows that already exist: `UPDATE table SET column = value WHERE …`.',
    write: "UPDATE users SET active = false WHERE username = 'dwhitfield'",
    dont: "Don't run it until you've run the same WHERE as a SELECT. The UPDATE's row count should match what the SELECT showed.",
  },
  {
    id: 'set', label: 'SET', group: 'change', kind: 'clause', re: /\bSET\b/gi, words: ['SET'],
    means: 'to these new values',
    does: 'Lists the columns that get new values in an UPDATE.',
    write: "SET status = 'OPEN', assigned_to = NULL",
    dont: "Don't join two columns with AND (`SET a = 1 AND b = 2`). Separate them with a comma.",
  },
  {
    id: 'insert', label: 'INSERT INTO', group: 'change', kind: 'clause', re: /\bINSERT\s+INTO\b/gi, words: ['INSERT', 'INTO'],
    means: 'add a new row',
    does: 'Adds rows to a table. List the columns, then give the values in the same order. Columns you leave out get their default.',
    write: 'INSERT INTO pick_faces (location_id, item_id, min_qty, max_qty)',
    dont: "Don't skip the column list. Without it you have to give every column in the table's order, and it breaks when the table changes.",
  },
  {
    id: 'values', label: 'VALUES', group: 'change', kind: 'clause', re: /\bVALUES\b/gi, words: ['VALUES'],
    means: 'with these values',
    does: 'The values for the new row, in the same order as the column list before it.',
    write: 'VALUES (258, 101, 12, 48)',
    dont: "Don't type ids from memory. Look them up with a SELECT first, or use a subquery.",
  },
  {
    id: 'delete', label: 'DELETE', group: 'change', kind: 'clause', re: /\bDELETE\s+FROM\b/gi, words: ['DELETE', 'FROM'],
    means: 'remove rows for good',
    does: "Removes rows permanently. Once it's committed there's no undo.",
    write: 'DELETE FROM … WHERE …',
    dont: 'In a WMS you almost never delete, because history points at these rows. Change the status instead (CANCELLED, INACTIVE), and never run DELETE without a WHERE.',
  },
  {
    id: 'txn', label: 'BEGIN / COMMIT / ROLLBACK', group: 'change', kind: 'word', re: /\b(?:BEGIN|COMMIT|ROLLBACK)\b/gi, words: ['BEGIN', 'COMMIT', 'ROLLBACK'],
    means: 'try it, then keep it or undo it',
    does: 'BEGIN starts a transaction. Nothing after it is saved until COMMIT. ROLLBACK undoes everything since BEGIN.',
    write: 'BEGIN; UPDATE …; SELECT …; COMMIT;',
    dont: "Don't leave a transaction open. Until you COMMIT or ROLLBACK, the rows you changed stay locked, and RF scans that need them wait.",
  },
  {
    id: 'comment', label: '-- comment', group: 'read', kind: 'word', re: /--/g, words: [],
    means: 'a note for people',
    does: 'Everything after `--` on that line is skipped by the database. Use it to say what a query is for.',
    write: "-- yesterday's receipts by person",
    dont: "Don't put `--` in the middle of a line you still need. Everything after it on that line is gone.",
  },
  {
    id: 'semi', label: ';  semicolon', group: 'read', kind: 'word', re: /;/g, words: [],
    means: 'end of this statement',
    does: 'Ends a statement. You need it between statements when you run several at once, like a SELECT to look and an UPDATE to fix.',
    write: 'SELECT …; UPDATE …;',
    dont: "Don't run the whole editor when you only mean one statement. Select the lines you want and run just those.",
  },
  {
    id: 'keys', label: 'keys: PK and FK', group: 'join', kind: 'note', re: null, words: [],
    means: 'the ids that link tables',
    does: "A primary key (PK) is unique for every row, like `items.item_id`. A foreign key (FK) points at another table's primary key, like `inventory.item_id` → items. The schema tab marks both, and you join on those pairs.",
    write: 'JOIN items i ON i.item_id = inv.item_id',
    dont: "Don't join on names or descriptions when there's an id. Names repeat and change; ids don't.",
  },
  {
    id: 'h-order', label: 'the order it runs in', group: 'habit', kind: 'note', re: null, words: [],
    means: 'not the order you write it in',
    does: 'You write SELECT first, but Postgres starts with FROM and JOIN, then WHERE, GROUP BY, HAVING, SELECT, ORDER BY and LIMIT. That explains most of the rules: WHERE runs before SELECT names anything, and before any groups exist.',
    write: 'FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT',
    dont: "Don't use a name from SELECT (like `AS units`) in WHERE or HAVING; they run before it exists. ORDER BY can use it.",
  },
  {
    id: 'h-steps', label: 'build it in steps', group: 'habit', kind: 'note', re: null, words: [],
    means: 'small steps, check each one',
    does: 'Start with `SELECT * … LIMIT 20` to see the rows. Add the WHERE and run it. Add one JOIN at a time and check the row count. Add GROUP BY and ORDER BY last.',
    write: 'SELECT * FROM tasks LIMIT 20;',
    dont: "Don't write the whole query and then debug it. When something breaks, you won't know which part did it.",
  },
  {
    id: 'h-count', label: 'check the row count', group: 'habit', kind: 'note', re: null, words: [],
    means: 'does that number make sense?',
    does: 'After each step, ask if the count is believable: a wave of 14 orders, not 53. If a JOIN makes the count jump, rows got repeated.',
    write: 'SELECT COUNT(*) FROM …',
    dont: "Don't trust a total until you've looked at a few of the rows behind it.",
  },
  {
    id: 'h-look', label: 'look before you change', group: 'habit', kind: 'note', re: null, words: [],
    means: 'SELECT first, then UPDATE',
    does: 'Write the WHERE as a SELECT and run it on its own (select those lines, then run). Read the rows. Then turn it into an UPDATE with the same WHERE. Its row count should match.',
    write: 'SELECT … WHERE …;  then  UPDATE … WHERE …;',
    dont: "Don't fix one table and forget another that stores the same number, like a receipt and its PO line.",
  },
  {
    id: 'h-trail', label: 'leave a trail', group: 'habit', kind: 'note', re: null, words: [],
    means: 'log every fix you make by hand',
    does: 'When you change stock by hand, add a row to the history (an ADJUST in `inventory_txns`, with a reason code), so anyone can see later what changed, when and why.',
    write: 'INSERT INTO inventory_txns (txn_type, item_id, location_id, qty, reason_code)',
    dont: "Don't change a quantity silently. The next count will show it as a loss nobody can explain.",
  },
  {
    id: 'h-big', label: 'go easy on big tables', group: 'habit', kind: 'note', re: null, words: [],
    means: 'ask for less',
    does: 'A real WMS history table holds millions of rows, and the RF guns share the same database. Filter on a date range, name the columns you need, and peek with LIMIT.',
    write: 'WHERE created_at >= CURRENT_DATE - 7',
    dont: "Don't run `SELECT *` over all of history in the middle of a shift.",
  },
  {
    id: 'h-error', label: 'read the error', group: 'habit', kind: 'note', re: null, words: [],
    means: 'it tells you what and where',
    does: 'Postgres says what went wrong, and the `^` under LINE points at the spot. The real mistake is usually right there or just before it.',
    write: 'ERROR:  column "qty" does not exist',
    dont: "Don't change several things at once. Fix the spot it points at, then run it again.",
  },
]

export const GROUPS: { id: Group; name: string }[] = [
  { id: 'read', name: 'get rows' },
  { id: 'filter', name: 'keep only some rows' },
  { id: 'join', name: 'combine tables' },
  { id: 'sum', name: 'count and total' },
  { id: 'sort', name: 'sort and limit' },
  { id: 'math', name: 'numbers and dates' },
  { id: 'window', name: 'compare across rows' },
  { id: 'change', name: 'change data' },
  { id: 'habit', name: 'good habits' },
]

// The order entries are listed in under each group in the look up tab: the order you'd learn them.
export const LOOKUP: Record<Group, string[]> = {
  read: ['select', 'star', 'from', 'as', 'distinct', 'alias', 'dot', 'quote', 'comment', 'semi'],
  filter: ['where', 'compare', 'and', 'or', 'not', 'in', 'notin', 'between', 'like', 'null', 'bool'],
  join: ['keys', 'join', 'left', 'full', 'exists', 'notexists', 'subquery', 'with'],
  sum: ['count', 'sum', 'avg', 'minmax', 'group', 'having', 'filter', 'stringagg'],
  sort: ['order', 'desc', 'nulls', 'limit'],
  math: ['divide', 'round', 'abs', 'coalesce', 'nullif', 'case', 'today', 'datemath', 'now', 'interval', 'extract', 'cast'],
  window: ['over', 'partition', 'rownum', 'rank', 'lag'],
  change: ['update', 'set', 'insert', 'values', 'delete', 'txn'],
  habit: ['h-order', 'h-steps', 'h-count', 'h-look', 'h-trail', 'h-big', 'h-error'],
}

export const tipById = new Map(TIPS.map(t => [t.id, t]))

function closeParen(blank: string, from: number) {
  const open = blank.indexOf('(', from)
  if (open < 0) return blank.length
  let depth = 0
  for (let i = open; i < blank.length; i++) {
    if (blank[i] === '(') depth++
    else if (blank[i] === ')' && --depth === 0) return i + 1
  }
  return blank.length
}

function caseEnd(blank: string, from: number) {
  const re = /\b(CASE|END)\b/gi
  re.lastIndex = from
  let depth = 0
  for (let m = re.exec(blank); m; m = re.exec(blank)) {
    if (m[1].toUpperCase() === 'CASE') depth++
    else if (--depth === 0) return m.index + 3
  }
  return blank.length
}

export function explain(sql: string): Explained {
  const blank = blankOut(sql)
  const spots: Spot[] = []
  const betweenAnds = new Set<number>()
  for (const m of blank.matchAll(/\bBETWEEN\b[\s\S]*?\bAND\b/gi)) betweenAnds.add(m.index + m[0].length - 3)
  for (const t of TIPS) {
    if (!t.re) continue
    if (t.id === 'comment') {
      for (let i = sql.indexOf('--'); i >= 0; i = sql.indexOf('--', i + 2)) {
        if (blank[i] !== ' ') continue
        const nl = sql.indexOf('\n', i)
        spots.push({ at: i, end: nl < 0 ? sql.length : nl, tip: t })
      }
      continue
    }
    for (const m of blank.matchAll(t.re)) {
      if (t.id === 'and' && betweenAnds.has(m.index)) continue
      const end = t.kind !== 'call' ? m.index + m[0].length : t.id === 'case' ? caseEnd(blank, m.index) : closeParen(blank, m.index)
      spots.push({ at: m.index, end, tip: t })
    }
  }
  spots.sort((a, b) => a.at - b.at)
  const clauses = spots.filter(s => s.tip.kind === 'clause')
  clauses.forEach((s, i) => { s.end = i + 1 < clauses.length ? clauses[i + 1].at : sql.length })
  const found = new Map<Tip, Found>()
  for (const s of spots) {
    if (found.has(s.tip)) continue
    const start = sql.lastIndexOf('\n', s.at - 1) + 1
    const stop = sql.indexOf('\n', s.at)
    found.set(s.tip, { tip: s.tip, line: sql.slice(start, stop < 0 ? undefined : stop).trim() })
  }
  return { found: [...found.values()], spots }
}

// The tip for the spot at `pos`: the smallest piece of the query that holds it, or else the clause before it.
export function activeTip(e: Explained, pos: number): Tip | null {
  let best: Spot | null = null
  for (const s of e.spots) {
    if (s.at > pos) break
    const inside = s.tip.kind === 'clause' ? pos < s.end : pos <= s.end
    if (inside && (!best || s.end - s.at <= best.end - best.at)) best = s
  }
  if (best) return best.tip
  return e.spots.filter(s => s.at <= pos && s.tip.kind === 'clause').pop()?.tip ?? null
}
