// Small SQL text helpers: they only need to understand quotes, comments and parentheses.

export function blankOut(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      const stop = end < 0 ? sql.length : end + 2
      out += sql.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === c && sql[j + 1] === c) j += 2
        else if (sql[j] === c) break
        else j++
      }
      out += c + ' '.repeat(Math.max(0, Math.min(j, sql.length) - i - 1)) + (j < sql.length ? c : '')
      i = j + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

export function statements(sql: string): string[] {
  const blank = blankOut(sql)
  const parts: string[] = []
  let start = 0
  for (let i = 0; i <= blank.length; i++) {
    if (i === blank.length || blank[i] === ';') {
      if (blank.slice(start, i).trim()) parts.push(sql.slice(start, i).trim())
      start = i + 1
    }
  }
  return parts
}

export function hasTopLevelOrderBy(sql: string): boolean {
  const last = statements(sql).pop()
  if (!last) return false
  const blank = blankOut(last).toLowerCase()
  let depth = 0
  for (let i = 0; i < blank.length; i++) {
    const c = blank[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && /^order\s+by\b/.test(blank.slice(i, i + 20)) && (i === 0 || /\W/.test(blank[i - 1]))) return true
  }
  return false
}

const TXN = /^(commit|end|rollback|abort|begin|start|savepoint|release|prepare)\b/i

export function touchesTransaction(sql: string): boolean {
  return statements(blankOut(sql)).some(s => TXN.test(s.trim()))
}

// How a run leaves its transaction: still open after BEGIN, committed, rolled back, or no transaction at all.
export function txnEnd(sql: string): 'open' | 'commit' | 'rollback' | null {
  let state: 'open' | 'commit' | 'rollback' | null = null
  for (const st of statements(sql)) {
    const word = blankOut(st).trim().split(/\s+/)[0].toLowerCase()
    if (word === 'begin' || word === 'start') state = 'open'
    else if (word === 'commit' || word === 'end') state = 'commit'
    else if (word === 'rollback' || word === 'abort') state = 'rollback'
  }
  return state
}

export function changesData(command: string): boolean {
  return /^(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|COPY|GRANT|REVOKE)/.test(command)
}
