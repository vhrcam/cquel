import { blankOut } from '../db/sqltext.ts'

// One tip per SQL word or symbol: what it's for, and why you'd reach for it.
// A 'clause' tip covers the text until the next clause, a 'call' covers its parentheses, a 'word' just itself.

type Kind = 'clause' | 'call' | 'word'
export type Tip = { id: string; label: string; kind: Kind; re: RegExp; why: string; words: string[] }
export type Spot = { at: number; end: number; tip: Tip }
export type Found = { tip: Tip; line: string }
export type Explained = { found: Found[]; spots: Spot[] }

const tip = (id: string, label: string, kind: Kind, re: RegExp, why: string, words: string[] = []): Tip => ({ id, label, kind, re, why, words })

export const TIPS: Tip[] = [
  tip('with', 'WITH … AS', 'clause', /\bWITH\s+\w+\s+AS\s*\(/gi, 'Names a step of the query (a CTE), so the final SELECT can read it like a table. Long queries read top to bottom instead of inside out.', ['WITH', 'AS']),
  tip('select', 'SELECT', 'clause', /\bSELECT\b/gi, 'Says which columns you want back, in the order you list them. Every query that reads data starts here.', ['SELECT']),
  tip('star', 'SELECT *', 'word', /\bSELECT\s+\*/gi, "`*` means every column. Good for a first look at a table. In a saved report, name the columns, so the report doesn't change when the table does."),
  tip('distinct', 'DISTINCT', 'word', /\bDISTINCT\b/gi, 'Removes duplicate rows, so each value shows up once.', ['DISTINCT']),
  tip('from', 'FROM', 'clause', /\bFROM\b/gi, 'Says which table the rows come from. SELECT is what you want back; FROM is where it lives.', ['FROM']),
  tip('alias', 'table aliases', 'word', /(?<=\b(?:FROM|JOIN)\s+\w+\s+)(?!(?:ON|WHERE|JOIN|LEFT|RIGHT|INNER|GROUP|ORDER|LIMIT|SET|USING|AS)\b)[a-z_]\w*/gi, 'The short name after a table, like `inv` for inventory, is an alias. After that you write `inv.qty_on_hand` instead of the full table name.'),
  tip('dot', 'table.column', 'word', /\b[a-z_]\w*\.[a-z_]\w*/gi, "`table.column` says which table a column belongs to. It's required when two joined tables share a column name, like `order_id`."),
  tip('join', 'JOIN … ON', 'clause', /(?<!\b(?:LEFT|RIGHT|FULL|CROSS)\s+(?:OUTER\s+)?)\bJOIN\b/gi, 'Lines up two tables row by row. `ON` says which columns match, usually an id in one table and the same id in the other. Rows with no match are dropped.', ['JOIN', 'ON', 'INNER']),
  tip('left', 'LEFT JOIN', 'clause', /\bLEFT\s+(?:OUTER\s+)?JOIN\b/gi, "Like JOIN, but keeps every row from the first table even when the second has no match. The missing side comes back as NULL, which is how you find what's missing.", ['LEFT', 'OUTER', 'JOIN', 'ON']),
  tip('where', 'WHERE', 'clause', /\bWHERE\b/gi, 'Keeps only the rows that match. Leave it off and you get every row, and an UPDATE or DELETE would hit every row in the table.', ['WHERE']),
  tip('and', 'AND', 'clause', /\bAND\b/gi, 'Both sides must be true. Each AND narrows the result further.', ['AND']),
  tip('or', 'OR', 'clause', /\bOR\b/gi, 'Either side can be true. When you mix OR with AND, put the OR part in parentheses so it groups the way you mean.', ['OR']),
  tip('not', 'NOT', 'word', /(?<!\bIS\s+)\bNOT\b(?!\s+(?:IN|EXISTS|NULL|LIKE|BETWEEN)\b)/gi, "Flips a true/false condition: `WHERE NOT u.active` keeps the users who aren't active.", ['NOT']),
  tip('compare', '<  >  <=  >=  <>', 'word', /<>|!=|<=|>=|(?<![<>!-])[<>](?![=>])/g, 'Compares numbers, dates and text. `<>` means not equal. For a time range, use `>=` for the start and `<` for the end, so a moment on the boundary only counts once.'),
  tip('in', 'IN (…)', 'call', /(?<!\bNOT\s+)\bIN\s*\(/gi, "A short way to write several ORs: `status IN ('DONE', 'SHORT')` means the status is DONE or SHORT.", ['IN']),
  tip('notin', 'NOT IN (…)', 'call', /\bNOT\s+IN\b/gi, "Keeps rows whose value isn't in the list. Careful: if the list has a NULL in it, nothing matches.", ['NOT', 'IN']),
  tip('between', 'BETWEEN', 'word', /\bBETWEEN\b/gi, 'A range that includes both ends: `BETWEEN 1 AND 10` keeps 1 and 10 too.', ['BETWEEN', 'AND']),
  tip('like', 'LIKE', 'word', /\bI?LIKE\b/gi, "Matches a text pattern. `%` stands for any run of characters and `_` for one character, so `'%Dog%'` finds Dog anywhere. `ILIKE` ignores upper and lower case.", ['LIKE', 'ILIKE']),
  tip('null', 'NULL', 'word', /\bNULL\b/gi, 'NULL means no value at all. Find it with `IS NULL` or `IS NOT NULL`, because `= NULL` is never true. In an UPDATE, `SET x = NULL` clears the value.', ['NULL', 'IS', 'NOT']),
  tip('exists', 'EXISTS', 'call', /(?<!\bNOT\s+)\bEXISTS\b/gi, 'True when the subquery finds at least one row. It asks “is there a match?” without pulling every match into the result.', ['EXISTS']),
  tip('notexists', 'NOT EXISTS', 'call', /\bNOT\s+EXISTS\b/gi, "True when the subquery finds nothing. It's the cleanest way to ask “which rows have no match?”, including rows that never had one.", ['NOT', 'EXISTS']),
  tip('subquery', '(SELECT …)', 'call', /(?<!\b(?:AS|EXISTS)\s*)\(\s*SELECT\b/gi, 'A query inside a query. Its answer is used as a value or a list, so you can look an id up instead of copying it by hand.'),
  tip('group', 'GROUP BY', 'clause', /\bGROUP\s+BY\b/gi, 'Squashes rows into one row per group, so COUNT and SUM can total each group. Every other column in SELECT has to be in the GROUP BY or inside an aggregate.', ['GROUP', 'BY']),
  tip('having', 'HAVING', 'clause', /\bHAVING\b/gi, "Filters groups after they're totaled. WHERE can't do that, because WHERE runs before the grouping.", ['HAVING']),
  tip('order', 'ORDER BY', 'clause', /(?<!\bOVER\s*\([^)]*)\bORDER\s+BY\b/gi, 'Sorts the result. Without it, rows come back in whatever order is fastest, and that order can change from run to run.', ['ORDER', 'BY']),
  tip('desc', 'DESC / ASC', 'word', /\b(?:DESC|ASC)\b/gi, '`DESC` sorts biggest, latest or Z first. `ASC` is the default: smallest, earliest or A first.', ['DESC', 'ASC']),
  tip('nulls', 'NULLS LAST', 'word', /\bNULLS\s+(?:LAST|FIRST)\b/gi, 'Says where empty values go in the sort. Postgres treats NULL as bigger than everything, so `DESC` puts NULLs first unless you add `NULLS LAST`.', ['NULLS', 'LAST', 'FIRST']),
  tip('limit', 'LIMIT', 'clause', /\bLIMIT\b/gi, 'Stops after that many rows. Pair it with ORDER BY, or “the top 5” is just 5 rows in no particular order.', ['LIMIT']),
  tip('as', 'AS', 'word', /\bAS\b(?!\s*\()/gi, 'Gives a column a new name in the result, like `COUNT(*) AS locations`. It makes the output readable, and you can sort by that name.', ['AS']),
  tip('count', 'COUNT', 'call', /\bCOUNT\s*\(/gi, 'Counts rows. `COUNT(*)` counts every row; `COUNT(column)` skips rows where that column is NULL.', ['COUNT']),
  tip('sum', 'SUM', 'call', /\bSUM\s*\(/gi, "Adds up a column across all the rows, or across each group when there's a GROUP BY.", ['SUM']),
  tip('avg', 'AVG', 'call', /\bAVG\s*\(/gi, 'The average of a column. NULLs are skipped, not counted as 0.', ['AVG']),
  tip('minmax', 'MIN / MAX', 'call', /\b(?:MIN|MAX)\s*\(/gi, 'The smallest or largest value, like the first and last time something happened.', ['MIN', 'MAX']),
  tip('round', 'ROUND', 'call', /\bROUND\s*\(/gi, 'Rounds to that many decimals: `ROUND(97.36, 1)` is 97.4. Round once at the end, so the math before it stays exact.', ['ROUND']),
  tip('abs', 'ABS', 'call', /\bABS\s*\(/gi, 'Drops the minus sign, so −12 and +12 count as the same size of miss.', ['ABS']),
  tip('coalesce', 'COALESCE', 'call', /\bCOALESCE\s*\(/gi, "Returns the first value that isn't NULL. `COALESCE(SUM(x), 0)` turns “nothing” into 0.", ['COALESCE']),
  tip('nullif', 'NULLIF', 'call', /\bNULLIF\s*\(/gi, '`NULLIF(x, 0)` gives NULL when x is 0. Dividing by NULL returns NULL instead of crashing with division by zero.', ['NULLIF']),
  tip('divide', '/  division', 'word', /(?<![/*])\/(?![/*])/g, 'Whole number ÷ whole number drops the remainder in Postgres: `7 / 2` is 3. Write `100.0` instead of `100` when you need decimals.'),
  tip('case', 'CASE WHEN', 'call', /\bCASE\b/gi, 'An if/else inside a query. `CASE WHEN … THEN … ELSE … END` turns values into labels, like ranks into classes A, B and C.', ['CASE', 'WHEN', 'THEN', 'ELSE', 'END']),
  tip('filter', 'FILTER (WHERE …)', 'call', /\bFILTER\s*\(/gi, "Counts or sums only some of the rows in each group. It's Postgres; other databases write `SUM(CASE WHEN … THEN 1 ELSE 0 END)`.", ['FILTER', 'WHERE']),
  tip('over', 'OVER (…)', 'call', /\bOVER\s*\(/gi, 'Makes a window function: it calculates across other rows without squashing them into groups, like a running total next to each day.', ['OVER', 'ORDER', 'BY']),
  tip('partition', 'PARTITION BY', 'word', /\bPARTITION\s+BY\b/gi, 'Restarts the window for each group, like ranking pickers separately within each shift.', ['PARTITION', 'BY']),
  tip('rownum', 'ROW_NUMBER()', 'call', /\bROW_NUMBER\s*\(/gi, 'Numbers rows 1, 2, 3… in the order you give it. No ties: every row gets its own number.', ['ROW_NUMBER']),
  tip('rank', 'RANK()', 'call', /\b(?:DENSE_)?RANK\s*\(/gi, 'Like ROW_NUMBER, but ties share a rank and the next one skips ahead: 1, 1, 3.', ['RANK', 'DENSE_RANK']),
  tip('lag', 'LAG()', 'call', /\b(?:LAG|LEAD)\s*\(/gi, 'Reads a value from the row before (`LEAD` reads the row after), so each day can be compared with the one before it.', ['LAG', 'LEAD']),
  tip('stringagg', 'string_agg', 'call', /\bstring_agg\s*\(/gi, "Joins text from many rows into one, with the separator you give, like `'P-02-07-A, P-02-08-A'`."),
  tip('extract', 'EXTRACT', 'call', /\bEXTRACT\s*\(/gi, 'Pulls one part out of a date or interval. `EPOCH` gives the total seconds, so you can turn a duration into hours.', ['EXTRACT', 'EPOCH', 'FROM']),
  tip('today', 'CURRENT_DATE', 'word', /\bCURRENT_DATE\b/gi, "Today's date. Use it instead of typing a date, so the query still works tomorrow.", ['CURRENT_DATE']),
  tip('datemath', 'date ± days', 'word', /\bCURRENT_DATE\s*[-+]\s*\d+/gi, 'Adding or subtracting a whole number moves a date by that many days: `CURRENT_DATE - 1` is yesterday.'),
  tip('now', 'now()', 'word', /\bnow\s*\(\s*\)/gi, 'The current date and time. Subtract a timestamp from it to see how long ago something happened.'),
  tip('interval', 'INTERVAL', 'word', /\bINTERVAL\b/gi, "A length of time, like `INTERVAL '2 hours'`. Add it to or subtract it from a timestamp.", ['INTERVAL']),
  tip('cast', ':: cast', 'word', /::\s*\w+/g, 'Converts a value to another type. `::date` keeps only the date part of a timestamp, so you can group by day.'),
  tip('bool', 'true / false', 'word', /\b(?:true|false)\b/gi, 'True/false values. A true/false column can stand on its own: `WHERE active` means the same as `WHERE active = true`.', ['TRUE', 'FALSE']),
  tip('quote', "'text'", 'word', /'[^']*'/g, "Text and dates go in single quotes. Inside the quotes, case matters: `'HOLD'` isn't `'hold'`."),
  tip('update', 'UPDATE', 'clause', /\bUPDATE\b/gi, "Changes rows that already exist. Run the same WHERE as a SELECT first, so you know exactly which rows you're about to change.", ['UPDATE']),
  tip('set', 'SET', 'clause', /\bSET\b/gi, 'Lists the columns that get new values in an UPDATE. Separate several with commas.', ['SET']),
  tip('insert', 'INSERT INTO', 'clause', /\bINSERT\s+INTO\b/gi, 'Adds a new row. List the columns, then the values in the same order. Columns you leave out get their default.', ['INSERT', 'INTO']),
  tip('values', 'VALUES', 'clause', /\bVALUES\b/gi, 'The values for the new row, in the same order as the column list before it.', ['VALUES']),
  tip('delete', 'DELETE', 'clause', /\bDELETE\s+FROM\b/gi, 'Removes rows for good. Like UPDATE, it needs a WHERE, or it empties the table.', ['DELETE', 'FROM']),
  tip('comment', '-- comment', 'word', /--/g, 'Everything after `--` on that line is a note for people. The database skips it.'),
  tip('semi', ';  semicolon', 'word', /;/g, 'Ends a statement. You need it between statements when you run several at once, like a SELECT to look and an UPDATE to fix.'),
]

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
