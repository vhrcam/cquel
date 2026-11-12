import { PGlite } from '@electric-sql/pglite'
import { schemaSql } from '../src/db/schema.ts'
import { seedSql, seedFacts } from '../src/db/seed.ts'
import { WMS_NOW } from '../src/db/clock.ts'

const args = process.argv.slice(2)
const db = await PGlite.create()
let t = performance.now()
await db.exec(schemaSql)
await db.exec(seedSql())
const loadMs = Math.round(performance.now() - t)
Date.now = () => WMS_NOW

if (args[0] === '--facts') {
  console.log(`loaded in ${loadMs} ms`)
  console.log(seedFacts())
} else {
  const raw: Record<number, (v: string) => string> = {}
  for (const oid of [16, 17, 20, 21, 23, 26, 114, 700, 701, 1082, 1083, 1114, 1184, 1186, 1700, 3802]) raw[oid] = v => v
  for (const sql of args) {
    try {
      const results = await db.exec(sql, { rowMode: 'array', parsers: raw })
      for (const r of results) {
        if (!r.fields.length) { console.log(`${r.command} ${r.rowCount ?? ''}`); continue }
        const cols = r.fields.map(f => f.name)
        const rows = (r.rows as unknown[][]).map(row => row.map(v => (v === null ? 'NULL' : String(v))))
        const w = cols.map((c, i) => Math.min(40, Math.max(c.length, ...rows.map(row => row[i].length))))
        console.log(cols.map((c, i) => c.padEnd(w[i])).join(' | '))
        console.log(w.map(n => '-'.repeat(n)).join('-+-'))
        for (const row of rows) console.log(row.map((v, i) => v.slice(0, 40).padEnd(w[i])).join(' | '))
        console.log(`(${rows.length} rows)\n`)
      }
    } catch (e) {
      const err = e as { message: string; detail?: string; hint?: string }
      console.log(`ERROR: ${err.message}${err.detail ? `\nDETAIL: ${err.detail}` : ''}${err.hint ? `\nHINT: ${err.hint}` : ''}\n`)
    }
  }
}
await db.close()
process.exit(0)
