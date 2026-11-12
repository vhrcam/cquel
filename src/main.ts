import './style.css'
import { tracks, allTasks, taskById, trackOf, type Task } from './tasks/index.ts'
import { DbClient } from './db/client.ts'
import type { Prepared, Checked, RunResult } from './db/engine.ts'
import { TraceEditor } from './app/editor.ts'
import { WMS_CLOCK } from './db/clock.ts'
import { esc, markup, gridHtml, runHtml, inline } from './app/render.ts'
import { explain, activeTip, type Explained } from './app/why.ts'
import { saved, persist } from './app/store.ts'

type Column = { name: string; type: string; note: string; key: string; ref: string }
type Table = { name: string; note: string; rows: number; columns: Column[] }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const db = new DbClient()
const editor = new TraceEditor($('editor'))
let ghost = saved.ghost ?? true
let task: Task = taskById.get(saved.current ?? '') ?? allTasks[0]
let tables: Table[] = []
let prepared: Prepared | null = null
let running = false
let lastSql = ''
let lastRun: Checked | null = null
let outTab: 'output' | 'expected' = 'output'
let starting = true
let whyOn = saved.why ?? false
let explainedText: string | null = null
let explained: Explained | null = null
let whyFrame = 0

const KIND = { query: 'query', 'fix-query': 'fix the query', 'fix-data': 'ticket' }
const progressOf = (id: string) => saved.progress[id] ?? {}
const draftKey = (id: string, on: boolean) => `${id}:${on ? 'trace' : 'free'}`
const narrow = () => matchMedia('(max-width: 860px)').matches
const RUN_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'ctrl+↵'

function mark(id: string) {
  const p = progressOf(id)
  if (p.solved) return '<span class="mark solved" title="solved with the letters off">●</span>'
  if (p.traced) return '<span class="mark traced" title="traced with the letters on">◐</span>'
  return '<span class="mark" title="not done yet">○</span>'
}

function setStatus(kind: string, text: string) {
  const el = $('status')
  el.className = `status ${kind}`
  el.textContent = text
}

// ---------- sidebar

function renderTasks() {
  $('tasklist').innerHTML = tracks
    .map((tr, n) => {
      const solved = tr.tasks.filter(t => progressOf(t.id).solved).length
      const open = !saved.closed.includes(tr.id) || tr.tasks.includes(task)
      const items = tr.tasks
        .map(t => `<li><button type="button" class="task-link${t === task ? ' current' : ''}" data-task="${t.id}"${t === task ? ' aria-current="true"' : ''}>${mark(t.id)}<span>${esc(t.title)}</span></button></li>`)
        .join('')
      return `<div class="track"><button type="button" class="track-head" data-track="${tr.id}" aria-expanded="${open}"><span>${String(n + 1).padStart(2, '0')} ${esc(tr.name)}</span><span class="count">${solved}/${tr.tasks.length}</span></button><ul class="track-tasks"${open ? '' : ' hidden'}>${items}</ul></div>`
    })
    .join('')
}

function columnsHtml(t: Table) {
  return `<ul class="cols">${t.columns
    .map(c => {
      const badge = [c.key.includes('PK') ? 'PK' : '', c.ref ? `→ ${esc(c.ref)}` : ''].filter(Boolean).join(' ')
      return `<li><span class="cname">${esc(c.name)}${badge ? `<span class="key">${badge}</span>` : ''}</span><span class="ctype">${esc(c.type)}</span>${c.note ? `<span class="cnote">${esc(c.note)}</span>` : ''}</li>`
    })
    .join('')}</ul>`
}

function renderSchema() {
  $('schema').innerHTML =
    `<p>${tables.length} tables in one warehouse. PK = primary key, → points at the table a foreign key refers to.</p><p>The data's clock is frozen at ${WMS_CLOCK}, so <code>CURRENT_DATE</code> is 2026-11-10 and <code>now()</code> never moves.</p>` +
    tables
      .map(t => `<details class="table-card"><summary><span>${esc(t.name)}</span><span class="rows">${t.rows.toLocaleString()} rows</span></summary>${t.note ? `<p class="table-note">${esc(t.note)}</p>` : ''}${columnsHtml(t)}</details>`)
      .join('')
}

function openSide(open: boolean) {
  $('side').classList.toggle('open', open)
  $('scrim').hidden = !open
  $('menu').setAttribute('aria-expanded', String(open))
}

// ---------- task

function renderTask() {
  const tr = trackOf.get(task.id)!
  const n = tr.tasks.indexOf(task) + 1
  $('task').innerHTML = `
    <div class="eyebrow"><span>${esc(tr.name)} · ${n}/${tr.tasks.length}</span><span class="kind">${KIND[task.kind]}</span></div>
    <h1>${esc(task.title)}</h1>
    <p class="role">${esc(tr.role)}</p>
    <div class="prompt">${markup(task.prompt)}</div>
    ${task.returns ? `<div class="returns"><span class="label">return</span>${esc(task.returns)}</div>` : ''}
    <div class="chips"><span class="label">tables</span>${task.tables.map(t => `<button type="button" class="chip" data-peek="${t}" aria-expanded="false">${t}</button>`).join('')}</div>
    <div class="chips"><span class="label">skills</span>${task.skills.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    <div id="peek"></div>`
}

function givenHtml(run: RunResult) {
  if (run.error) return runHtml(task.given!, run)
  if (task.kind === 'fix-data') return `<span class="muted">Dry run, rolled back, nothing saved:</span> ${runHtml(task.given!, run, 5)}`
  return `<p class="muted">It runs without an error, but here's what it returns:</p>${runHtml(task.given!, run, 6)}`
}

function renderGiven() {
  const box = $('given')
  box.hidden = !task.given
  if (!task.given) return
  const head = task.kind === 'fix-query' ? 'the query that needs fixing' : "your teammate's statement (don't run it as is)"
  box.innerHTML = `<div class="given-head">${head}</div><pre>${esc(task.given)}</pre><div class="given-out">${prepared?.given ? givenHtml(prepared.given) : '<span class="muted">checking it…</span>'}</div>`
}

function loadEditor() {
  const draft = saved.drafts[draftKey(task.id, ghost)]
  editor.placeholder = task.kind === 'fix-data' ? '-- look first with SELECT, then make the fix' : '-- write your query here'
  editor.set(draft ?? (ghost ? '' : task.given ?? ''), ghost ? task.solution : null, task.kind === 'fix-query' ? task.given : undefined)
  $('hint').textContent = ghost
    ? `type over the transparent letters · it runs when you finish${task.kind === 'fix-query' ? ' · underlined letters are the fix' : ''}`
    : `letters off: write it from memory · ${RUN_KEY} to run`
  explainedText = null
  renderWhy()
}

// ---------- why tips

function renderWhy() {
  $('bench').classList.toggle('with-why', whyOn)
  const panel = $('why')
  panel.hidden = !whyOn
  if (!whyOn) return
  const { text, pos } = editor.where()
  if (text !== explainedText) {
    explainedText = text
    explained = explain(text)
    const head = '<div class="why-head">why each word is there</div>'
    panel.innerHTML = explained.found.length
      ? head + explained.found.map(f => `<div class="tip" data-tip="${f.tip.id}"><div class="tip-label">${esc(f.tip.label)}</div><div class="tip-line">${esc(f.line)}</div><p>${inline(f.tip.why)}</p></div>`).join('')
      : `${head}<p class="muted">Start typing, and a tip shows up for each SQL word you use.</p>`
  }
  const on = activeTip(explained!, pos)
  for (const card of panel.querySelectorAll<HTMLElement>('.tip')) {
    const hit = card.dataset.tip === on?.id
    card.classList.toggle('on', hit)
    const below = card.offsetTop + card.offsetHeight > panel.scrollTop + panel.clientHeight
    if (hit && (card.offsetTop < panel.scrollTop || below)) panel.scrollTo({ top: card.offsetTop - 28, behavior: 'smooth' })
  }
}

const queueWhy = () => {
  cancelAnimationFrame(whyFrame)
  whyFrame = requestAnimationFrame(renderWhy)
}

function setWhy(on: boolean) {
  whyOn = on
  saved.why = on
  persist()
  $('why-switch').setAttribute('aria-checked', String(on))
  explainedText = null
  renderWhy()
}

function renderOutput() {
  const out = $('out')
  const hasExpected = task.kind !== 'fix-data' && !!prepared?.expected
  if (outTab === 'expected' && !hasExpected) outTab = 'output'
  out.querySelectorAll<HTMLButtonElement>('[data-out]').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.out === outTab))
    if (b.dataset.out === 'expected') b.hidden = !hasExpected
  })
  out.hidden = !lastRun && !hasExpected
  const body = $('out-body')
  if (outTab === 'expected' && prepared?.expected) {
    const g = prepared.expected
    body.innerHTML = `${gridHtml(g, 300)}<p class="muted">${g.rows.length} row${g.rows.length === 1 ? '' : 's'} expected. Column names don't have to match, only the values.</p>`
  } else body.innerHTML = lastRun ? runHtml(lastSql, lastRun.run, 300) : '<p class="muted">Run your query to see its output here.</p>'
}

function showNote(extra = '') {
  const parts = [extra, task.note ? `<span class="label">field note</span>${markup(task.note).replace(/^<p>|<\/p>$/g, '')}` : '']
    .filter(Boolean)
  $('note').innerHTML = parts.join('<br><br>')
  $('note').hidden = !parts.length
}

async function prepare() {
  prepared = null
  const id = task.id
  renderGiven()
  try {
    const p = await db.call<Prepared>('prepare', { taskId: id }, 30_000)
    if (task.id !== id) return
    prepared = p
    renderGiven()
    renderOutput()
  } catch (e) {
    if (task.id === id) setStatus('fail', (e as Error).message)
  }
}

function openTask(t: Task) {
  task = t
  saved.current = t.id
  persist()
  lastRun = null
  lastSql = ''
  outTab = 'output'
  renderTasks()
  renderTask()
  loadEditor()
  if (!starting) setStatus('', '')
  $('note').hidden = true
  $('next').classList.remove('go')
  renderOutput()
  $('main').scrollTop = 0
  openSide(false)
  prepare()
  if (!narrow()) editor.focus()
}

function passed(traced: boolean) {
  const p = (saved.progress[task.id] ??= {})
  if (traced) {
    p.traced = true
    delete saved.drafts[draftKey(task.id, true)]
  } else p.solved = true
  persist()
  renderTasks()
  $('next').classList.add('go')
  showNote(traced && !p.solved ? '<span class="label">next</span>Switch the transparent letters off and write it from memory to mark it solved.' : '')
}

async function run() {
  if (running) return
  const sql = editor.value
  if (!sql.trim()) return setStatus('pending', 'Nothing to run yet.')
  running = true
  $<HTMLButtonElement>('run').disabled = true
  setStatus('', 'running…')
  const id = task.id
  const traced = ghost
  try {
    const res = await db.call<Checked>('run', { taskId: id, sql }, 8_000)
    if (task.id !== id) return
    lastRun = res
    lastSql = sql
    outTab = 'output'
    const v = res.verdict
    setStatus(v.status, v.status === 'pass' ? `✓ ${v.message}` : v.status === 'fail' ? `✗ ${v.message}` : v.message)
    if (v.status === 'pass') passed(traced)
    renderOutput()
  } catch (e) {
    setStatus('fail', (e as Error).message)
  } finally {
    running = false
    $<HTMLButtonElement>('run').disabled = false
  }
}

async function resetDb() {
  setStatus('', 'resetting…')
  try {
    await db.call('reset', {}, 30_000)
    lastRun = null
    await prepare()
    renderOutput()
    setStatus('pending', 'The database is back to how it started.')
  } catch (e) {
    setStatus('fail', (e as Error).message)
  }
}

function setGhost(on: boolean) {
  ghost = on
  saved.ghost = on
  persist()
  $('ghost').setAttribute('aria-checked', String(on))
  loadEditor()
  editor.focus()
}

// ---------- events

editor.onInput = v => {
  const key = draftKey(task.id, ghost)
  if (v) saved.drafts[key] = v
  else delete saved.drafts[key]
  persist()
}
editor.onComplete = () => run()
editor.onRun = () => run()
editor.onPasteBlocked = () => setStatus('pending', 'Paste is off while the letters are on. Tracing works by typing.')
editor.onCaret = queueWhy

$('tasklist').addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-task], [data-track]')
  if (!el) return
  if (el.dataset.task) return openTask(taskById.get(el.dataset.task)!)
  const id = el.dataset.track!
  saved.closed = saved.closed.includes(id) ? saved.closed.filter(x => x !== id) : [...saved.closed, id]
  persist()
  renderTasks()
})

document.querySelector('.side-tabs')!.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]')
  if (!b) return
  const schema = b.dataset.tab === 'schema'
  $('schema').hidden = !schema
  $('tasklist').hidden = schema
  document.querySelectorAll('.side-tabs [data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)))
})

$('task').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-peek]')
  if (!b) return
  const open = b.getAttribute('aria-expanded') !== 'true'
  $('task').querySelectorAll('[data-peek]').forEach(x => x.setAttribute('aria-expanded', 'false'))
  const t = tables.find(x => x.name === b.dataset.peek)
  $('peek').innerHTML = open && t ? `<div class="peek"><h3>${esc(t.name)}</h3>${t.note ? `<p class="table-note">${esc(t.note)}</p>` : ''}${columnsHtml(t)}</div>` : open ? '<div class="peek muted">Still loading the schema…</div>' : ''
  b.setAttribute('aria-expanded', String(open))
})

$('out').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-out]')
  if (!b) return
  outTab = b.dataset.out as 'output' | 'expected'
  renderOutput()
})

$('run').addEventListener('click', () => run())
$('reset').addEventListener('click', () => resetDb())
$('ghost').addEventListener('click', () => setGhost(!ghost))
$('why-switch').addEventListener('click', () => setWhy(!whyOn))
$('menu').addEventListener('click', () => openSide(!$('side').classList.contains('open')))
$('scrim').addEventListener('click', () => openSide(false))
const step = (d: number) => {
  const i = allTasks.indexOf(task) + d
  if (i >= 0 && i < allTasks.length) openTask(allTasks[i])
}
$('prev').addEventListener('click', () => step(-1))
$('next').addEventListener('click', () => step(1))
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.target !== editor.input) {
    e.preventDefault()
    run()
  }
})

db.onRestart = () => prepare()

// ---------- start

const eastern = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })
const tick = () => {
  const p = Object.fromEntries(eastern.formatToParts(new Date()).map(x => [x.type, x.value]))
  $('clock').textContent = `${p.weekday} ${p.month} ${p.day} · ${p.hour}:${p.minute}:${p.second} ${p.dayPeriod} ${p.timeZoneName}`
  setTimeout(tick, 1000 - (Date.now() % 1000))
}
tick()
document.querySelector('#run kbd')!.textContent = RUN_KEY
$('ghost').setAttribute('aria-checked', String(ghost))
$('why-switch').setAttribute('aria-checked', String(whyOn))
openTask(task)
setStatus('', 'starting Postgres…')
db.ready.then(() => {
  starting = false
  if ($('status').textContent === 'starting Postgres…') setStatus('', '')
})
db.call<Table[]>('schema', {}, 30_000)
  .then(t => {
    tables = t
    renderSchema()
  })
  .catch(e => setStatus('fail', (e as Error).message))
