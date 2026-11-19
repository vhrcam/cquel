// Checks every task against the sample database before anyone sees it.
// npm run verify            run all checks
// npm run verify -- --show rc-short,ob-due   also print those tasks' expected results

import { PGlite } from '@electric-sql/pglite'
import { Engine } from '../src/db/engine.ts'
import { WMS_NOW } from '../src/db/clock.ts'
import { compareGrids } from '../src/db/compare.ts'
import { hasTopLevelOrderBy, statements, blankOut } from '../src/db/sqltext.ts'
import { explain, skillTip, TIPS, GROUPS, LOOKUP } from '../src/app/why.ts'
import { align, changedMask } from '../src/app/align.ts'
import { tracks, allTasks, taskById } from '../src/tasks/index.ts'

const show = new Set((process.argv.find(a => a.startsWith('--show='))?.slice(7) ?? process.argv[process.argv.indexOf('--show') + 1] ?? '').split(',').filter(Boolean))
const db = await PGlite.create()
const engine = new Engine(db)
await engine.load()
Date.now = () => WMS_NOW

let problems = 0
const bad = (id: string, msg: string) => { problems++; console.log(`  ✗ ${id}: ${msg}`) }

const ids = new Set<string>()
for (const t of allTasks) {
  if (ids.has(t.id)) bad(t.id, 'duplicate id')
  ids.add(t.id)
  if (/\{\w+\}/.test(t.prompt + t.solution + (t.given ?? ''))) bad(t.id, 'unfilled {placeholder}')
}

// Tracing: the answer traced exactly, in lower case and with other line breaks all count as done.
for (const t of allTasks) {
  const g = t.solution
  const lower = g.replace(/'[^']*'|[A-Z_]+/g, m => (m.startsWith("'") ? m : m.toLowerCase()))
  const oneLine = g.replace(/\s+/g, ' ')
  for (const [label, typed] of [['exact', g], ['lowercase', lower], ['one line', oneLine]] as const) {
    if (!align(typed, g).done) bad(t.id, `tracing the answer (${label}) doesn't finish`)
  }
  if (align(g.slice(0, -1), g).done) bad(t.id, 'tracing finishes one letter early')
}
const typo = align('SELEC sku FROM items;', 'SELECT sku FROM items;')
if (typo.done || typo.errors !== 1 || typo.marks[7] !== 1) bad('align', 'a missing letter should be one error and the next word should line up again')
if (!changedMask('a = NULL', 'a IS NULL').some(Boolean)) bad('align', 'changedMask missed a change')

// The reference: every entry says what it means, what it does, how to write it and what not to do,
// shows up exactly once in the look up list, and every SQL word in an answer (or a broken query) is covered.
const tipIds = new Set<string>()
for (const tp of TIPS) {
  if (tipIds.has(tp.id)) bad('why', `duplicate tip id ${tp.id}`)
  tipIds.add(tp.id)
  for (const field of ['means', 'does', 'write', 'dont'] as const) if (!tp[field].trim()) bad('why', `tip ${tp.id} has no "${field}" text`)
}
const listed = Object.values(LOOKUP).flat()
for (const id of listed) if (!tipIds.has(id)) bad('why', `the look up list names an unknown tip ${id}`)
for (const tp of TIPS) {
  const n = listed.filter(id => id === tp.id).length
  if (n !== 1) bad('why', `tip ${tp.id} is in the look up list ${n} times`)
  if (!LOOKUP[tp.group].includes(tp.id)) bad('why', `tip ${tp.id} is listed outside its group (${tp.group})`)
}
if (GROUPS.map(g => g.id).join() !== Object.keys(LOOKUP).join()) bad('why', 'GROUPS and LOOKUP list different groups')
for (const t of allTasks) for (const sk of t.skills) if (!skillTip(sk)) bad(t.id, `the skill chip "${sk}" doesn't open a reference entry`)
const usedTips = new Set<string>()
for (const t of allTasks) {
  for (const sql of [t.solution, t.given]) {
    if (!sql) continue
    const found = explain(sql).found
    found.forEach(f => usedTips.add(f.tip.id))
    const covered = new Set(found.flatMap(f => f.tip.words))
    const missing = [...new Set(blankOut(sql).match(/\b[A-Z][A-Z_]+\b/g) ?? [])].filter(w => !covered.has(w))
    if (missing.length) bad(t.id, `no why tip covers ${missing.join(', ')}`)
  }
}
console.log(`Why tips: ${usedTips.size} of ${TIPS.length} tips show up in the answers, and every SQL word in them is covered.`)

for (const track of tracks) {
  console.log(`\n${track.name}`)
  for (const t of track.tasks) {
    try {
      const prep = await engine.prepare(t)
      let info = ''
      if (t.kind !== 'fix-data') {
        const exp = prep.expected!
        info = `${exp.rows.length} rows · ${hasTopLevelOrderBy(t.solution) ? 'ordered' : 'any order'}`
        if (!exp.rows.length) bad(t.id, 'the answer returns no rows')
        if (exp.rows.length > 120) bad(t.id, `the answer returns ${exp.rows.length} rows`)
        if (t.returns && !t.returns.startsWith('every') && !t.returns.startsWith('one number')) {
          for (const c of exp.columns) if (!t.returns.includes(c)) bad(t.id, `column ${c} isn't named in "returns"`)
        }
        if (show.has(t.id)) {
          console.log(`    ${exp.columns.join(' | ')}`)
          for (const r of exp.rows.slice(0, 40)) console.log(`    ${r.map(v => v ?? 'NULL').join(' | ')}`)
        }
      }
      const pass = await engine.run(t, t.solution)
      if (pass.verdict.status !== 'pass') bad(t.id, `the answer doesn't pass: ${pass.verdict.message}`)
      if (t.given) {
        if (t.kind === 'fix-data') await engine.prepare(t)
        const g = await engine.run(t, t.given)
        if (g.verdict.status === 'pass') bad(t.id, 'the broken version passes')
        info += ` · given: ${g.run.error ? 'ERROR ' + g.run.error.message : g.verdict.message}`
        if (t.kind === 'fix-query' && !g.run.error && prep.expected) {
          const v = compareGrids(prep.expected, [...g.run.outputs].reverse().find(o => o.grid)?.grid ?? null, true)
          if (v.status === 'pass') bad(t.id, 'the broken version gives the right answer')
        }
      }
      if (t.kind === 'fix-data') {
        await engine.prepare(t)
        info += ` · ${statements(t.solution).length} statements`
      }
      console.log(`  ✓ ${t.id.padEnd(18)} ${info}`)
    } catch (e) {
      bad(t.id, (e as Error).message)
    }
  }
}

// Wrong answers that must be caught, with the hint they should get.
const wrong: [string, string, RegExp][] = [
  ['ob-fix-stuck', "UPDATE orders SET status = 'PICKED' WHERE status = 'PICKING';", /should have stayed the same/],
  ['sa-fix-review', "UPDATE locations SET status = 'ACTIVE';", /should have stayed the same/],
  ['sa-fix-user', "UPDATE users SET active = false;", /should have stayed the same/],
  ['ic-fix-negative', `UPDATE inventory SET qty_on_hand = 0 WHERE inv_id = ${taskById.get('ic-fix-negative')!.solution.match(/inv_id = (\d+)/)![1]};`, /still needs? fixing/],
  ['ic-expiring', 'SELECT i.sku, inv.lot_no, l.location_code, inv.expiry_date, inv.qty_on_hand FROM inventory inv JOIN items i ON i.item_id = inv.item_id JOIN locations l ON l.location_id = inv.location_id WHERE inv.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 ORDER BY l.location_code', /wrong order/],
  ['or-where', "SELECT zone_code, location_code FROM locations WHERE status = 'LOCKED';", /^Correct/],
  ['rc-fix-fill', 'SELECT v.vendor_name, ROUND(SUM(pl.qty_received) * 100.0 / SUM(pl.qty_ordered), 0) AS fill_rate FROM purchase_orders po JOIN vendors v ON v.vendor_id = po.vendor_id JOIN po_lines pl ON pl.po_id = po.po_id WHERE po.status = \'CLOSED\' GROUP BY v.vendor_name ORDER BY fill_rate, v.vendor_name', /rounding|different values|wrong order/],
]
console.log('\nWrong answers')
for (const [id, sql, want] of wrong) {
  const t = taskById.get(id)!
  await engine.prepare(t)
  const r = await engine.run(t, sql)
  if (!want.test(r.verdict.message)) bad(id, `expected a message like ${want}, got "${r.verdict.message}"`)
  else console.log(`  ✓ ${id.padEnd(18)} ${r.verdict.message}`)
}

console.log(problems ? `\n${problems} problem${problems === 1 ? '' : 's'}` : `\nAll ${allTasks.length} tasks check out.`)
await db.close()
process.exit(problems ? 1 : 0)
