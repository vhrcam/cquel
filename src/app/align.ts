// Lines what you typed up against the transparent query.
// Outside quotes, letter case and the amount of whitespace don't matter.
// A wrong letter only stays wrong; the next word lines up again on its own.

const WS = /\s/
const PUNCT = /[(),;=<>+\-*/|.:'"[\]%!]/

const isWs = (ch: string) => WS.test(ch)
const isPunct = (ch: string) => ch !== '' && PUNCT.test(ch)

export function strictMask(ghost: string): boolean[] {
  const mask = new Array<boolean>(ghost.length).fill(false)
  let i = 0
  while (i < ghost.length) {
    const c = ghost[i]
    if (c === '-' && ghost[i + 1] === '-') {
      while (i < ghost.length && ghost[i] !== '\n') i++
      continue
    }
    if (c === "'" || c === '"') {
      mask[i] = true
      let j = i + 1
      while (j < ghost.length) {
        mask[j] = true
        if (ghost[j] === c && ghost[j + 1] === c) { mask[j + 1] = true; j += 2; continue }
        if (ghost[j] === c) break
        j++
      }
      i = j + 1
      continue
    }
    i++
  }
  return mask
}

export type Alignment = { marks: Uint8Array; next: number; done: boolean; errors: number }

export function align(typed: string, ghost: string, mask = strictMask(ghost)): Alignment {
  const marks = new Uint8Array(typed.length)
  let i = 0
  let j = 0
  let prev = ''
  let errors = 0
  const skipGhostWs = () => { while (j < ghost.length && !mask[j] && isWs(ghost[j])) j++ }
  while (i < typed.length) {
    const t = typed[i]
    if (j < ghost.length && mask[j]) {
      const ok = t === ghost[j]
      marks[i] = ok ? 1 : 0
      if (!ok) errors++
      if (!isWs(t)) prev = t
      i++
      j++
      continue
    }
    if (isWs(t)) {
      let k = i
      while (k < typed.length && isWs(typed[k])) k++
      if (j < ghost.length && isWs(ghost[j])) {
        skipGhostWs()
        for (; i < k; i++) marks[i] = 1
      } else if (j >= ghost.length || isPunct(prev) || isPunct(ghost[j])) {
        for (; i < k; i++) marks[i] = 1
      } else {
        for (; i < k; i++) marks[i] = 0
        errors++
        while (j < ghost.length && !mask[j] && !isWs(ghost[j])) j++
        skipGhostWs()
      }
      continue
    }
    if (j < ghost.length && isWs(ghost[j])) {
      if (isPunct(t) || isPunct(prev)) skipGhostWs()
      else {
        marks[i] = 0
        errors++
        prev = t
        i++
        continue
      }
    }
    if (j >= ghost.length) {
      marks[i] = 0
      errors++
      prev = t
      i++
      continue
    }
    const g = ghost[j]
    const ok = mask[j] ? t === g : t.toLowerCase() === g.toLowerCase()
    marks[i] = ok ? 1 : 0
    if (!ok) errors++
    prev = t
    i++
    j++
  }
  let rest = j
  while (rest < ghost.length && !mask[rest] && isWs(ghost[rest])) rest++
  return { marks, next: j, done: rest >= ghost.length && errors === 0, errors }
}

// The whitespace a fresh line should start with, so Enter lines the caret up with the letters.
export function ghostBreak(typed: string, ghost: string): string | null {
  const { next } = align(typed, ghost)
  let k = next
  while (k < ghost.length && ghost[k] === ' ') k++
  if (ghost[k] !== '\n') return null
  let end = k + 1
  while (end < ghost.length && ghost[end] === ' ') end++
  return ghost.slice(k, end)
}

// Which characters of `to` are new compared with `from` (word-level), for showing what a fix changed.
export function changedMask(from: string, to: string): boolean[] {
  const tok = (s: string) => s.match(/\s+|\w+|[^\w\s]/g) ?? []
  const a = tok(from)
  const b = tok(to)
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const keep = new Array<boolean>(b.length).fill(false)
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { keep[j] = true; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  const mask: boolean[] = []
  b.forEach((t, k) => { for (const _ of t) mask.push(!keep[k] && !/^\s+$/.test(t)) })
  return mask
}
