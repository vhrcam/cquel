import type { Grid } from '../db/compare.ts'
import type { PgError, RunResult } from '../db/engine.ts'

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const inline = (text: string) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>')

// Task text: `code`, **bold**, blank line = new paragraph.
export function markup(text: string) {
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${esc(p).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const NUMERIC = new Set([20, 21, 23, 26, 700, 701, 1700])

export function gridHtml(g: Grid, limit = Infinity) {
  const rows = g.rows.slice(0, limit)
  const head = g.columns.map(c => `<th>${esc(c)}</th>`).join('')
  const body = rows
    .map(r => `<tr>${r.map((v, i) => {
      const t = g.types[i]
      if (v === null) return '<td class="null">NULL</td>'
      const shown = t === 16 ? (v === 't' ? 'true' : v === 'f' ? 'false' : v) : v
      return `<td${NUMERIC.has(t) ? ' class="num"' : ''}>${esc(shown)}</td>`
    }).join('')}</tr>`)
    .join('')
  const total = g.total ?? g.rows.length
  const more = total > rows.length ? `<div class="result-head">showing ${rows.length} of ${total} rows</div>` : ''
  return `<div class="grid-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`
}

export function errorHtml(sql: string, e: PgError) {
  const parts = [`<div><b>ERROR:</b>  ${esc(e.message)}</div>`]
  if (e.position && e.position <= sql.length + 1) {
    const before = sql.slice(0, e.position - 1)
    const lineNo = before.split('\n').length
    const lineStart = before.lastIndexOf('\n') + 1
    const lineEnd = sql.indexOf('\n', lineStart)
    const line = sql.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
    const prefix = `LINE ${lineNo}: `
    parts.push(`<div class="err-at">${esc(prefix + line)}\n${' '.repeat(prefix.length + (e.position - 1 - lineStart))}^</div>`)
  }
  if (e.detail) parts.push(`<div><b>DETAIL:</b>  ${esc(e.detail)}</div>`)
  if (e.hint) parts.push(`<div><b>HINT:</b>  ${esc(e.hint)}</div>`)
  return `<div class="err">${parts.join('')}</div>`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function runHtml(sql: string, run: RunResult, limit = Infinity) {
  if (run.error) return errorHtml(sql, run.error)
  if (!run.outputs.length) return '<p class="muted">Nothing to run.</p>'
  const many = run.outputs.length > 1
  const parts = run.outputs.map((o, i) => {
    const head = many ? `<div class="result-head">statement ${i + 1} · ${esc(o.command || 'done')}</div>` : ''
    if (o.grid) return `<div class="result">${head}${gridHtml(o.grid, limit)}${o.grid.rows.length || o.grid.total ? '' : '<div class="result-head">0 rows</div>'}</div>`
    const what = /^(INSERT|UPDATE|DELETE|MERGE)/.test(o.command) ? `${o.command} · ${plural(o.rowCount, 'row')} affected` : o.command || 'done'
    return `<div class="result"><div class="result-head">${esc(what)}</div></div>`
  })
  return parts.join('') + (run.note ? `<p class="muted">${esc(run.note)}</p>` : '')
}
