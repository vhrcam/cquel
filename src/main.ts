import './style.css'
import { tracks, allTasks, taskById, trackOf, type Task } from './tasks/index.ts'
import { DbClient } from './db/client.ts'
import type { Prepared, Checked, RunResult } from './db/engine.ts'
import { TraceEditor } from './app/editor.ts'
import { WMS_CLOCK } from './db/clock.ts'
import { esc, markup, gridHtml, runHtml, inline } from './app/render.ts'
import { explain, activeTip, tipById, skillTip, GROUPS, LOOKUP, type Explained, type Tip } from './app/why.ts'
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
let refOn = saved.ref ?? true
let explainedText: string | null = null
let explained: Explained | null = null
let refFrame = 0
const openCards = new Set<string>()
const lookOpen = new Set<string>()
let refTab: 'query' | 'all' = 'query'

const KIND = { query: 'query', 'fix-query': 'fix the query', 'fix-data': 'ticket' }
const progressOf = (id: string) => saved.progress[id] ?? {}
const draftKey = (id: string, on: boolean) => `${id}:${on ? 'trace' : 'free'}`
const narrow = () => matchMedia('(max-width: 860px)').matches
const RUN_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'ctrl+↵'
const RUN_HOW = matchMedia('(hover: none)').matches ? 'tap run' : `${RUN_KEY} to run`

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
    <div class="chips"><span class="label">skills</span>${task.skills.map(s => { const id = skillTip(s); return id ? `<button type="button" class="chip" data-skill="${id}" title="open it in the reference">${esc(s)}</button>` : `<span class="chip">${esc(s)}</span>` }).join('')}</div>
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
    : `letters off: write it from memory · ${RUN_HOW}`
  explainedText = null
  renderRef()
}

// ---------- reference

const refWide = matchMedia('(min-width: 1280px)')

// A habit that fits the kind of task sits at the top of "this query".
const PIN: Partial<Record<Task['kind'], string>> = { 'fix-data': 'h-look', 'fix-query': 'h-error' }

function cardHtml(t: Tip, line?: string, tag?: string) {
  return `<div class="card" data-tip="${t.id}"><button type="button" class="card-head" aria-expanded="false"><span class="card-label">${esc(t.label)}${tag ? `<span class="card-tag">${tag}</span>` : ''}</span><span class="card-means">${esc(t.means)}</span>${line ? `<span class="card-line">${esc(line)}</span>` : ''}</button><dl class="card-body"><dt>does</dt><dd>${inline(t.does)}</dd><dt>write</dt><dd><code>${esc(t.write)}</code></dd><dt class="dont">don't</dt><dd>${inline(t.dont)}</dd></dl></div>`
}

function showCard(card: HTMLElement, open: boolean) {
  card.classList.toggle('open', open)
  card.querySelector('.card-head')!.setAttribute('aria-expanded', String(open))
}

// On a wide screen the reference is a column on the right. On a smaller one it sits under the editor.
function placeRef() {
  const ref = $('ref')
  const home = refWide.matches ? document.querySelector<HTMLElement>('.app')! : $('bench')
  if (ref.parentElement !== home) home.append(ref)
  document.querySelector('.app')!.classList.toggle('with-ref', refOn && refWide.matches)
  $('bench').classList.toggle('with-ref', refOn && !refWide.matches)
  explainedText = null
  renderRef()
}

function renderRef() {
  const panel = $('ref')
  panel.hidden = !refOn
  if (!refOn || refTab !== 'query') return
  const list = $('ref-query')
  const { text, pos } = editor.where()
  if (text !== explainedText) {
    explainedText = text
    explained = explain(text)
    const pin = PIN[task.kind]
    list.innerHTML = (pin ? cardHtml(tipById.get(pin)!, undefined, 'habit') : '') + (explained.found.length
      ? explained.found.map(f => cardHtml(f.tip, f.line)).join('')
      : '<p class="muted">Start typing. Every SQL word you use gets a card here: what it means, what it does, how to write it, and what not to do.</p>')
  }
  const on = activeTip(explained!, pos)
  for (const card of list.querySelectorAll<HTMLElement>('.card')) {
    const hit = card.dataset.tip === on?.id
    card.classList.toggle('on', hit)
    showCard(card, hit || openCards.has(card.dataset.tip!))
  }
  const lit = list.querySelector<HTMLElement>('.card.on')
  if (!lit) return
  const sideways = !refWide.matches
  const box = (sideways ? list : panel).getBoundingClientRect()
  const r = lit.getBoundingClientRect()
  if (sideways && (r.left < box.left || r.right > box.right)) list.scrollBy({ left: r.left - box.left - 8, behavior: 'smooth' })
  if (!sideways && (r.top < box.top + 40 || r.bottom > box.bottom)) panel.scrollBy({ top: r.top - box.top - 48, behavior: 'smooth' })
}

// The look up tab: every entry by group. A search matches names first, then the rest of the text.
function renderLookup() {
  const q = $<HTMLInputElement>('ref-search').value.trim().toLowerCase()
  const all = GROUPS.flatMap(g => LOOKUP[g.id].map(id => tipById.get(id)!))
  const has = (list: string[]) => list.some(x => x.toLowerCase().includes(q))
  const named = all.filter(t => has([t.label, t.means, ...t.words]))
  const hits = new Set(!q ? all : named.length ? named : all.filter(t => has([t.does, t.write, t.dont])))
  const html = GROUPS.map(g => {
    const list = LOOKUP[g.id].map(id => tipById.get(id)!).filter(t => hits.has(t))
    return list.length ? `<section class="ref-group"><h3>${esc(g.name)}</h3>${list.map(t => cardHtml(t)).join('')}</section>` : ''
  }).join('')
  $('ref-list').innerHTML = html || `<p class="muted">Nothing matches “${esc(q)}”. Try a word like join, null or group.</p>`
  const few = !!q && hits.size <= 3
  for (const card of $('ref-list').querySelectorAll<HTMLElement>('.card')) showCard(card, few || lookOpen.has(card.dataset.tip!))
}

// A skill chip opens its entry in the look up tab.
function openRefEntry(id: string) {
  if (!refOn) setRef(true)
  $<HTMLInputElement>('ref-search').value = ''
  lookOpen.add(id)
  setRefTab('all')
  const card = $('ref-list').querySelector<HTMLElement>(`.card[data-tip="${id}"]`)
  if (!card) return
  card.scrollIntoView({ block: 'center' })
  card.classList.add('flash')
  setTimeout(() => card.classList.remove('flash'), 1400)
}

function setRefTab(tab: 'query' | 'all') {
  refTab = tab
  document.querySelectorAll<HTMLElement>('.ref-tabs [data-ref]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ref === tab)))
  $('ref-query').hidden = tab !== 'query'
  $('ref-all').hidden = tab !== 'all'
  if (tab === 'all') renderLookup()
  else {
    explainedText = null
    renderRef()
  }
}

const queueRef = () => {
  cancelAnimationFrame(refFrame)
  refFrame = requestAnimationFrame(renderRef)
}

function setRef(on: boolean) {
  refOn = on
  saved.ref = on
  persist()
  $('ref-switch').setAttribute('aria-checked', String(on))
  placeRef()
  if (!narrow()) editor.focus()
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
  openCards.clear()
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
editor.onCaret = queueRef

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
  const skill = (e.target as HTMLElement).closest<HTMLElement>('[data-skill]')
  if (skill) return openRefEntry(skill.dataset.skill!)
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
$('ref-switch').addEventListener('click', () => setRef(!refOn))
$('ref').addEventListener('click', e => {
  const head = (e.target as HTMLElement).closest<HTMLElement>('.card-head')
  if (!head) return
  const card = head.parentElement!
  const id = card.dataset.tip!
  const look = !!card.closest('#ref-all')
  const set = look ? lookOpen : openCards
  const open = look ? !card.classList.contains('open') : !openCards.has(id)
  if (open) set.add(id)
  else set.delete(id)
  showCard(card, open || (!look && card.classList.contains('on')))
})
document.querySelector('.ref-tabs')!.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]')
  if (b) setRefTab(b.dataset.ref as 'query' | 'all')
})
$('ref-search').addEventListener('input', renderLookup)
refWide.addEventListener('change', placeRef)
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
$('ref-switch').setAttribute('aria-checked', String(refOn))
openTask(task)
placeRef()
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
