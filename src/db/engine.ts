import type { PGlite } from '@electric-sql/pglite'
import { schemaSql } from './schema.ts'
import { seedSql } from './seed.ts'
import { compareGrids, compareStates, type Grid, type Verdict } from './compare.ts'
import { hasTopLevelOrderBy, touchesTransaction, changesData, txnEnd } from './sqltext.ts'
import type { Task } from '../tasks/types.ts'

export type PgError = { message: string; detail?: string; hint?: string; position?: number }
export type Output = { command: string; rowCount: number; grid?: Grid }
export type RunResult = { outputs: Output[]; error?: PgError; ms: number; note?: string }
export type Prepared = { expected?: Grid; given?: RunResult }
export type Checked = { run: RunResult; verdict: Verdict }

const RAW: Record<number, (v: string) => string> = {}
for (const oid of [16, 17, 20, 21, 23, 26, 114, 199, 700, 701, 1000, 1001, 1005, 1007, 1009, 1014, 1015, 1016, 1021, 1022, 1082, 1083, 1114, 1115, 1182, 1184, 1185, 1186, 1187, 1231, 1266, 1700, 3802, 3807]) RAW[oid] = v => v

const cell = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v))

type Results = Awaited<ReturnType<PGlite['exec']>>

function toOutputs(results: Results): Output[] {
  return results.map(r => ({
    command: r.command ?? '',
    rowCount: r.rowCount ?? r.rows.length,
    grid: r.fields.length ? { columns: r.fields.map(f => f.name), types: r.fields.map(f => f.dataTypeID), rows: (r.rows as unknown[][]).map(row => row.map(cell)) } : undefined,
  }))
}

function toError(e: unknown): PgError {
  const x = e as { message?: string; detail?: string; hint?: string; position?: string | number }
  return { message: x.message ?? String(e), detail: x.detail || undefined, hint: x.hint || undefined, position: x.position ? Number(x.position) : undefined }
}

const lastGrid = (run: RunResult) => [...run.outputs].reverse().find(o => o.grid)?.grid ?? null

// A ticket's verdict, with a word about transactions and runs that only looked.
function ticketVerdict(run: RunResult, txn: ReturnType<typeof txnEnd>, v: Verdict): Verdict {
  if (run.error) return { status: 'fail', message: txn === 'commit' ? 'Error: see the output below. Anything before your COMMIT was saved.' : 'Error, so nothing was changed. See the output below.' }
  if (txn === 'open') return { status: 'fail', message: 'BEGIN with no COMMIT: nothing was saved, so it was rolled back. End with COMMIT to keep the change, or ROLLBACK to undo it.' }
  if (v.status !== 'pending') return v
  if (txn === 'rollback') return { status: 'pending', message: 'Rolled back, so nothing was saved. If the rows looked right, change ROLLBACK to COMMIT and run it again.' }
  const changed = run.outputs.filter(o => changesData(o.command))
  if (!changed.length) return { status: 'pending', message: 'You only looked, so nothing has changed yet. Now write the fix.' }
  if (changed.every(o => o.rowCount === 0)) return { status: 'pending', message: `Not fixed yet: your ${changed[0].command} changed 0 rows. Check its WHERE against what the SELECT found.` }
  return v
}

export class Engine {
  db: PGlite
  dirty = false
  private expected = new Map<string, Grid>()
  private states = new Map<string, { seed: { grids: (Grid | null)[] }; fixed: { grids: (Grid | null)[] } }>()

  constructor(db: PGlite) {
    this.db = db
  }

  async load() {
    await this.db.exec(schemaSql)
    await this.db.exec(seedSql())
  }

  async reset() {
    await this.db.exec('ROLLBACK').catch(() => {})
    await this.db.exec('RESET ALL; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
    await this.load()
    this.dirty = false
  }

  async exec(sql: string): Promise<RunResult> {
    const t = performance.now()
    try {
      const results = await this.db.exec(sql, { rowMode: 'array', parsers: RAW })
      return { outputs: toOutputs(results), ms: performance.now() - t }
    } catch (e) {
      return { outputs: [], error: toError(e), ms: performance.now() - t }
    }
  }

  async isolated(sql: string): Promise<RunResult> {
    await this.db.exec('RESET ALL; BEGIN')
    const run = await this.exec(sql)
    await this.db.exec('ROLLBACK').catch(() => {})
    if (touchesTransaction(sql)) await this.reset()
    if (!run.error && run.outputs.some(o => changesData(o.command))) run.note = 'Changes are rolled back after each run in query tasks.'
    return run
  }

  async expectedFor(task: Task): Promise<Grid> {
    let grid = this.expected.get(task.id)
    if (!grid) {
      if (this.dirty) await this.reset()
      const run = await this.isolated(task.solution)
      grid = lastGrid(run)!
      if (run.error || !grid) throw new Error(`${task.id}: the answer query failed: ${run.error?.message}`)
      this.expected.set(task.id, grid)
    }
    return grid
  }

  async capture(task: Task) {
    const grids: (Grid | null)[] = []
    for (const q of task.check ?? []) {
      const run = await this.exec(q)
      if (run.error) return { grids, error: run.error.message }
      grids.push(lastGrid(run))
    }
    return { grids }
  }

  async statesFor(task: Task) {
    let st = this.states.get(task.id)
    if (!st) {
      await this.reset()
      const seed = await this.capture(task)
      const run = await this.exec(task.solution)
      if (run.error) throw new Error(`${task.id}: the fix failed: ${run.error.message}`)
      const fixed = await this.capture(task)
      await this.reset()
      st = { seed, fixed }
      this.states.set(task.id, st)
    }
    return st
  }

  async prepare(task: Task): Promise<Prepared> {
    if (task.kind === 'fix-data') {
      await this.statesFor(task)
      if (this.dirty) await this.reset()
      return { given: task.given ? await this.isolated(task.given) : undefined }
    }
    const expected = await this.expectedFor(task)
    if (this.dirty) await this.reset()
    return { expected, given: task.given ? await this.isolated(task.given) : undefined }
  }

  async run(task: Task, sql: string): Promise<Checked> {
    if (task.kind === 'fix-data') {
      const st = await this.statesFor(task)
      await this.db.exec('RESET ALL')
      const run = await this.exec(sql)
      const txn = txnEnd(sql)
      if (run.error || txn === 'open') await this.db.exec('ROLLBACK').catch(() => {})
      this.dirty = true
      const now = await this.capture(task)
      return { run, verdict: ticketVerdict(run, txn, compareStates(st.seed, st.fixed, now)) }
    }
    const expected = await this.expectedFor(task)
    if (this.dirty) await this.reset()
    const run = await this.isolated(sql)
    const verdict: Verdict = run.error
      ? { status: 'fail', message: 'Error: see the output below.' }
      : compareGrids(expected, lastGrid(run), hasTopLevelOrderBy(task.solution))
    return { run, verdict }
  }
}
