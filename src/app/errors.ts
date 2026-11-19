import type { PgError } from '../db/engine.ts'

// Plain-English help for the Postgres errors people hit most: what the error means and what to change.

type Rule = { id: string; re: RegExp; help: (m: RegExpMatchArray, sql: string) => string }

const NUMBER = /^(?:integer|bigint|smallint|numeric|double precision|real)$/
const TEXT = /^(?:text|character varying|unknown)$/

const RULES: Rule[] = [
  {
    id: 'column-of-table',
    re: /^column "(.+)" of relation "(.+)" does not exist/,
    help: m => `Table \`${m[2]}\` has no column called \`${m[1]}\`. Check the spelling against the schema tab.`,
  },
  {
    id: 'no-column',
    re: /^column "?([^"\s]+)"? does not exist/,
    help: (m, sql) => {
      const name = m[1]
      if (sql.includes(`"${name}"`)) return `Double quotes mean a column name in Postgres, so \`"${name}"\` is read as a column. Put text in single quotes: \`'${name}'\`.`
      const dot = name.indexOf('.')
      if (dot > 0) return `\`${name.slice(0, dot)}\` has no column called \`${name.slice(dot + 1)}\`. Check the spelling against the schema tab, and check that \`${name.slice(0, dot)}\` is the right table.`
      return `None of the tables after FROM and JOIN has a column called \`${name}\`. Check the spelling against the schema tab. If it's a value rather than a column, like the status LOCKED, put it in single quotes: \`'LOCKED'\`.`
    },
  },
  {
    id: 'no-table',
    re: /^relation "(.+)" does not exist/,
    help: m => `There's no table called \`${m[1]}\`. The schema tab lists every table, so check the spelling there.`,
  },
  {
    id: 'ambiguous',
    re: /^column reference "(.+)" is ambiguous/,
    help: m => `More than one of your tables has a column called \`${m[1]}\`, so Postgres doesn't know which one you mean. Put the table's alias in front of it, like \`o.${m[1]}\`.`,
  },
  {
    id: 'group-by',
    re: /^column "(.+)" must appear in the GROUP BY clause or be used in an aggregate function/,
    help: m => `With GROUP BY, each row of the result stands for a whole group, and \`${m[1]}\` can have many values inside one group. Add it to the GROUP BY, or put it inside an aggregate like SUM, COUNT or MAX.`,
  },
  {
    id: 'agg-where',
    re: /^aggregate functions are not allowed in WHERE/,
    help: () => 'WHERE runs before rows are grouped, so it can\'t use COUNT, SUM or AVG. Move that test to HAVING, after the GROUP BY.',
  },
  {
    id: 'window-where',
    re: /^window functions are not allowed in WHERE/,
    help: () => 'WHERE runs before window functions are worked out. Calculate it in a WITH step, then filter in the query after it.',
  },
  {
    id: 'syntax-end',
    re: /^syntax error at end of input/,
    help: () => 'The query ends before it\'s finished: a parenthesis that never closes, an AND or a comma with nothing after it, or a missing value at the end.',
  },
  {
    id: 'syntax',
    re: /^syntax error at or near "(.*)"/,
    help: m => m[1].toUpperCase() === 'FROM'
      ? 'Postgres got lost at FROM. The usual cause is a comma right before it, after the last column in SELECT.'
      : `Postgres got lost at \`${m[1]}\`. The mistake is usually just before it: a missing comma between columns, a missing quote, or clauses out of order. The order is SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.`,
  },
  {
    id: 'unterminated',
    re: /^unterminated quoted (string|identifier)/,
    help: m => m[1] === 'string' ? "A text value is missing its closing quote. Every `'` needs a partner." : 'A name in double quotes is missing its closing `"`.',
  },
  {
    id: 'divide-zero',
    re: /^division by zero/,
    help: () => 'Something was divided by 0, and one zero stops the whole query. Wrap the bottom number in `NULLIF(x, 0)`: dividing by NULL gives NULL instead of an error.',
  },
  {
    id: 'bad-date',
    re: /^(?:invalid input syntax for type (?:date|timestamp|time)[^:]*|date\/time field value out of range): "(.*)"/,
    help: m => `Postgres can't read \`${m[1]}\` as a date or time. Write dates as year-month-day in single quotes, like \`'2026-11-09'\`, and times like \`'2026-11-09 13:00'\`.`,
  },
  {
    id: 'bad-bool',
    re: /^invalid input syntax for type boolean: "(.*)"/,
    help: m => `\`${m[1]}\` isn't true or false. True/false columns take \`true\` or \`false\`. If this came from SET, separate the columns with commas, not AND.`,
  },
  {
    id: 'bad-number',
    re: /^invalid input syntax for type (?:integer|bigint|smallint|numeric|double precision|real): "(.*)"/,
    help: m => `\`${m[1]}\` isn't a number, so it can't go in a number column or be compared with one. Check for a word where a number goes, or a value in the wrong column.`,
  },
  {
    id: 'types',
    re: /^operator does not exist: (.+) (\S+) (.+)$/,
    help: m => {
      const [a, op, b] = [m[1], m[2], m[3]]
      if ((TEXT.test(a) && NUMBER.test(b)) || (NUMBER.test(a) && TEXT.test(b))) return `That compares text with a number. A text column needs its value in single quotes: \`sku = '10105'\`, not \`sku = 10105\`.`
      if (/^(?:timestamp|date|time)/.test(a) && NUMBER.test(b)) return `Postgres won't do \`${a} ${op} ${b}\`. Move a timestamp with an interval, like \`now() - INTERVAL '2 hours'\`. Plain numbers only move a date, like \`CURRENT_DATE - 1\`.`
      return `Postgres can't do \`${op}\` between ${a} and ${b}. Make both sides the same kind of value: text with text, a number with a number, a date with a date.`
    },
  },
  {
    id: 'no-alias',
    re: /^missing FROM-clause entry for table "(.+)"/,
    help: m => `\`${m[1]}.\` is used, but no table in FROM or JOIN is called \`${m[1]}\`. An alias has to be given right after its table, like \`FROM inventory inv\`, before you can write \`inv.qty_on_hand\`.`,
  },
  {
    id: 'use-alias',
    re: /^invalid reference to FROM-clause entry for table "(.+)"/,
    help: m => `\`${m[1]}\` has an alias, and once a table has one you have to use it. Write the alias in front of the column instead of the full table name.`,
  },
  {
    id: 'fk-insert',
    re: /^insert or update on table "(.+)" violates foreign key constraint/,
    help: () => "That id doesn't point at a row that exists, so the database refused it. Look the real id up with a SELECT, or use a subquery, instead of typing it.",
  },
  {
    id: 'fk-delete',
    re: /^update or delete on table "(.+)" violates foreign key constraint ".+" on table "(.+)"/,
    help: m => `Rows in \`${m[2]}\` still point at this row, so the database won't remove it. In a WMS you rarely delete: change the status instead, like CANCELLED or INACTIVE.`,
  },
  {
    id: 'not-null',
    re: /^null value in column "(.+?)"(?: of relation "(.+?)")? violates not-null constraint/,
    help: m => `\`${m[1]}\` has to have a value. Add it to the column list and to VALUES.`,
  },
  {
    id: 'duplicate',
    re: /^duplicate key value violates unique constraint/,
    help: () => 'That value is already taken, and this column allows only one of each. Look first with a SELECT to find the row that has it.',
  },
  {
    id: 'check',
    re: /^new row for relation "(.+)" violates check constraint/,
    help: () => "That value isn't one this column allows. Check the spelling and the case ('HOLD', not 'Hold'). The schema tab notes list the allowed values.",
  },
  {
    id: 'many-rows',
    re: /^more than one row returned by a subquery used as an expression/,
    help: () => 'The subquery found more than one row, but `=` needs a single value. Make its WHERE find exactly one row, or use `IN (…)` to match any of them.',
  },
  {
    id: 'many-columns',
    re: /^subquery (?:must return only one column|has too many columns)/,
    help: () => 'A subquery used as a value or a list can return only one column. Keep just the one you need in its SELECT.',
  },
  {
    id: 'no-function',
    re: /^function (\w+)\((.*)\) does not exist/,
    help: m => m[1] === 'round' && m[2].includes('double precision')
      ? 'ROUND with decimal places needs an exact number. Add `::numeric`, like `ROUND(x::numeric, 1)`.'
      : `Either \`${m[1]}\` is misspelled, or it was given the wrong kind of value. If there's a HINT line, it says which.`,
  },
  {
    id: 'aborted',
    re: /^current transaction is aborted/,
    help: () => 'An earlier statement after BEGIN failed, so Postgres ignores everything until the transaction ends. Run ROLLBACK, fix the error, and start again.',
  },
  {
    id: 'insert-count',
    re: /^INSERT has more (?:expressions than target columns|target columns than expressions)/,
    help: () => 'The column list and VALUES have to line up one to one: the same number of each, in the same order.',
  },
  {
    id: 'not-boolean',
    re: /^argument of (WHERE|AND|OR|NOT|HAVING) must be type boolean/,
    help: m => m[1] === 'AND'
      ? 'Each side of AND has to be a yes/no test, like `qty_on_hand < 0`. In an UPDATE, separate the SET columns with commas, not AND.'
      : `${m[1]} needs a yes/no test, like \`qty_on_hand < 0\`, not just a column or a number.`,
  },
  {
    id: 'same-name',
    re: /^table name "(.+)" specified more than once/,
    help: m => `\`${m[1]}\` is used as a name twice in FROM and JOIN. Give each table its own alias.`,
  },
  {
    id: 'wrong-type',
    re: /^column "(.+)" is of type (.+) but expression is of type (.+)/,
    help: m => `\`${m[1]}\` holds ${m[2]} values and that value is ${m[3]}. Text goes in single quotes, numbers without, and dates like '2026-11-09'.`,
  },
]

export function helpFor(e: PgError, sql = ''): { id: string; text: string } | null {
  for (const r of RULES) {
    const m = e.message.match(r.re)
    if (m) return { id: r.id, text: r.help(m, sql) }
  }
  return null
}
