export type Cell = string | null
export type Grid = { columns: string[]; types: number[]; rows: Cell[][]; total?: number }
export type Verdict = { status: 'pass' | 'fail' | 'pending'; message: string }

const NUM = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i
const s = (n: number) => (n === 1 ? '' : 's')

const canon = (v: Cell) => (v === null ? '\u0000' : NUM.test(v) ? String(parseFloat(Number(v).toPrecision(12))) : v)
const loose = (v: Cell) => (v !== null && NUM.test(v) ? Number(v).toPrecision(3) : canon(v))
const rowKey = (row: Cell[], f = canon) => row.map(f).join('\u0001')
const sortedKeys = (rows: Cell[][], f = canon) => rows.map(r => rowKey(r, f)).sort()
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

function columnMap(exp: Grid, act: Grid): number[] | null {
  const n = exp.columns.length
  const sig = (g: Grid, c: number) => g.rows.map(r => canon(r[c])).sort().join('\u0001')
  const es = exp.columns.map((_, c) => sig(exp, c))
  const as = act.columns.map((_, c) => sig(act, c))
  const want = sortedKeys(exp.rows)
  const used = new Array(n).fill(false)
  const map: number[] = []
  const walk = (c: number): boolean => {
    if (c === n) return sameList(sortedKeys(act.rows.map(r => map.map(k => r[k]))), want)
    const order = [c, ...Array.from({ length: n }, (_, k) => k).filter(k => k !== c)]
    for (const k of order) {
      if (used[k] || as[k] !== es[c]) continue
      used[k] = true
      map[c] = k
      if (walk(c + 1)) return true
      used[k] = false
    }
    return false
  }
  return walk(0) ? map.slice() : null
}

export function compareGrids(exp: Grid, act: Grid | null, ordered: boolean): Verdict {
  if (!act) return { status: 'fail', message: "The last statement didn't return any rows to check." }
  const ec = exp.columns.length
  if (act.columns.length !== ec) return { status: 'fail', message: `Expected ${ec} column${s(ec)} (${exp.columns.join(', ')}), got ${act.columns.length}.` }
  if (act.rows.length !== exp.rows.length) return { status: 'fail', message: `${act.rows.length} row${s(act.rows.length)}, expected ${exp.rows.length}.` }
  const map = columnMap(exp, act)
  if (!map) {
    if (sameList(sortedKeys(act.rows, loose), sortedKeys(exp.rows, loose))) return { status: 'fail', message: 'Close: some numbers are a little off. Check your rounding.' }
    return { status: 'fail', message: 'Right shape, different values. Compare with the expected output.' }
  }
  if (ordered) {
    const got = act.rows.map(r => rowKey(map.map(k => r[k])))
    const want = exp.rows.map(r => rowKey(r))
    if (!sameList(got, want)) return { status: 'fail', message: 'Right rows, wrong order. Check your ORDER BY.' }
  }
  const n = exp.rows.length
  return { status: 'pass', message: `Correct · ${n} row${s(n)}` }
}

type State = { grids: (Grid | null)[]; error?: string }

function diffCount(seed: Grid, target: Grid, actual: Grid) {
  const unique = (g: Grid) => new Set(g.rows.map(r => canon(r[0]))).size === g.rows.length
  if (unique(seed) && unique(target) && unique(actual)) {
    const index = (g: Grid) => new Map(g.rows.map(r => [canon(r[0]), rowKey(r)]))
    const a = index(seed), b = index(target), c = index(actual)
    const keys = new Set([...a.keys(), ...b.keys(), ...c.keys()])
    let needed = 0, collateral = 0, missed = 0
    for (const k of keys) {
      const sv = a.get(k), tv = b.get(k), av = c.get(k)
      const shouldChange = sv !== tv
      if (shouldChange) needed++
      if (shouldChange && av !== tv) missed++
      if (!shouldChange && av !== sv) collateral++
    }
    return { needed, collateral, missed }
  }
  const bag = (g: Grid) => {
    const m = new Map<string, number>()
    for (const r of g.rows) { const k = rowKey(r); m.set(k, (m.get(k) ?? 0) + 1) }
    return m
  }
  const minus = (x: Map<string, number>, y: Map<string, number>) => {
    let n = 0
    for (const [k, v] of x) n += Math.max(0, v - (y.get(k) ?? 0))
    return n
  }
  const sb = bag(seed), tb = bag(target), ab = bag(actual)
  const needed = minus(tb, sb) + minus(sb, tb)
  const off = minus(ab, tb) + minus(tb, ab)
  return { needed, collateral: 0, missed: off }
}

export function compareStates(seed: State, target: State, actual: State): Verdict {
  if (actual.error) return { status: 'fail', message: `Couldn't read the data back (${actual.error}). Try reset db.` }
  const same = (x: Grid | null, y: Grid | null) => !!x && !!y && sameList(x.rows.map(r => rowKey(r)), y.rows.map(r => rowKey(r)))
  if (actual.grids.every((g, i) => same(g, target.grids[i]))) return { status: 'pass', message: 'Fixed · the data matches' }
  if (actual.grids.every((g, i) => same(g, seed.grids[i]))) return { status: 'pending', message: 'Not fixed yet: nothing has changed.' }
  let needed = 0, collateral = 0, missed = 0
  actual.grids.forEach((g, i) => {
    const d = diffCount(seed.grids[i]!, target.grids[i]!, g!)
    needed += d.needed
    collateral += d.collateral
    missed += d.missed
  })
  if (collateral > 0) return { status: 'fail', message: `${collateral} row${s(collateral)} changed that should have stayed the same. The fix only touches ${needed} row${s(needed)}.` }
  if (missed > 0) return { status: 'fail', message: `Not quite: ${missed} of ${needed} row${s(needed)} still ${missed === 1 ? 'needs' : 'need'} fixing.` }
  return { status: 'fail', message: "The data doesn't match the fix yet." }
}
