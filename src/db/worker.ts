import { PGlite } from '@electric-sql/pglite'
import { Engine, type Checked, type RunResult } from './engine.ts'
import type { Grid } from './compare.ts'
import { WMS_NOW } from './clock.ts'
import { taskById } from '../tasks/index.ts'

type Req = { id: number; type: 'schema' | 'prepare' | 'run' | 'reset'; taskId?: string; sql?: string }

const TABLES = ['zones', 'locations', 'items', 'vendors', 'customers', 'carriers', 'users', 'inventory', 'pick_faces', 'purchase_orders', 'po_lines', 'receipts', 'waves', 'orders', 'order_lines', 'tasks', 'cycle_counts', 'inventory_txns', 'host_messages', 'erp_inventory']

const started = (async () => {
  const db = await PGlite.create()
  const engine = new Engine(db)
  await engine.load()
  Date.now = () => WMS_NOW
  postMessage({ ready: true })
  return engine
})()

const MAX_ROWS = 300
const trimGrid = (g?: Grid) => (g && g.rows.length > MAX_ROWS ? { ...g, rows: g.rows.slice(0, MAX_ROWS), total: g.rows.length } : g)
const trimRun = (run?: RunResult) => run && { ...run, outputs: run.outputs.map(o => ({ ...o, grid: trimGrid(o.grid) })) }
const trimChecked = (c: Checked) => ({ ...c, run: trimRun(c.run)! })

async function schema(engine: Engine) {
  const cols = await engine.exec(`
    SELECT c.table_name, c.column_name,
           CASE c.data_type WHEN 'timestamp without time zone' THEN 'timestamp' WHEN 'time without time zone' THEN 'time' WHEN 'character varying' THEN 'varchar' ELSE c.data_type END,
           coalesce(col_description(('public.' || c.table_name)::regclass, c.ordinal_position), '')
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position`)
  const notes = await engine.exec(`SELECT relname, coalesce(obj_description(oid, 'pg_class'), '') FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`)
  const keys = await engine.exec(`
    SELECT conrelid::regclass::text, a.attname, contype::text, coalesce(confrelid::regclass::text, '')
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.connamespace = 'public'::regnamespace AND contype IN ('p', 'f')`)
  const counts = await engine.exec(TABLES.map(t => `SELECT '${t}', count(*) FROM ${t}`).join(' UNION ALL '))
  const rows = (r: RunResult) => r.outputs[0]?.grid?.rows ?? []
  const noteOf = new Map(rows(notes).map(([t, n]) => [t, n ?? '']))
  const countOf = new Map(rows(counts).map(([t, n]) => [t, Number(n)]))
  const keyOf = new Map<string, { key: string; ref: string }>()
  for (const [t, c, kind, ref] of rows(keys)) {
    const k = `${t}.${c}`
    const prev = keyOf.get(k)
    keyOf.set(k, { key: [prev?.key, kind === 'p' ? 'PK' : 'FK'].filter(Boolean).join(' '), ref: kind === 'f' ? ref! : prev?.ref ?? '' })
  }
  return TABLES.map(name => ({
    name,
    note: noteOf.get(name) ?? '',
    rows: countOf.get(name) ?? 0,
    columns: rows(cols).filter(r => r[0] === name).map(([, col, type, note]) => ({ name: col!, type: type!, note: note ?? '', ...(keyOf.get(`${name}.${col}`) ?? { key: '', ref: '' }) })),
  }))
}

async function handle(req: Req) {
  try {
    const engine = await started
    const task = () => {
      const t = taskById.get(req.taskId ?? '')
      if (!t) throw new Error(`unknown task ${req.taskId}`)
      return t
    }
    let body: unknown
    if (req.type === 'schema') body = await schema(engine)
    else if (req.type === 'reset') { await engine.reset(); body = {} }
    else if (req.type === 'prepare') { const p = await engine.prepare(task()); body = { ...p, given: trimRun(p.given) } }
    else body = trimChecked(await engine.run(task(), req.sql ?? ''))
    postMessage({ id: req.id, ok: true, body })
  } catch (e) {
    postMessage({ id: req.id, ok: false, error: (e as Error).message })
  }
}

let queue = Promise.resolve()
self.onmessage = (e: MessageEvent<Req>) => {
  queue = queue.then(() => handle(e.data))
}
