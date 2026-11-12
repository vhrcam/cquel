// Drives the real app in headless Chrome: tracing, writing from memory, a ticket, and a runaway query.
// Start the app first (npm run build && npm run preview), then: node scripts/smoke.ts [url] [screenshot.png]

import puppeteer from 'puppeteer-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const shot = process.argv[3]
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--window-size=1360,900'] })
const page = await browser.newPage()
await page.setViewport({ width: 1360, height: 900, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

let failed = 0
const check = (ok: boolean, label: string, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${extra ? `  (${extra})` : ''}`)
}
const status = () => page.$eval('#status', el => el.textContent ?? '')
const waitStatus = async (re: RegExp, ms = 15000) => {
  try {
    await page.waitForFunction((src: string) => new RegExp(src).test(document.querySelector('#status')!.textContent ?? ''), { timeout: ms }, re.source)
  } catch {}
  return status()
}
const openTask = async (id: string) => {
  await page.click(`[data-task="${id}"]`).catch(async () => {
    await page.evaluate((tid: string) => (document.querySelector(`[data-task="${tid}"]`) as HTMLElement | null)?.click(), id)
  })
  await page.waitForFunction((tid: string) => document.querySelector('.task-link.current')?.getAttribute('data-task') === tid, {}, id)
}
const clearEditor = async () => {
  await page.$eval('.ed-input', el => {
    const ta = el as HTMLTextAreaElement
    ta.value = ''
    ta.dispatchEvent(new Event('input'))
  })
  await page.click('.ed-input')
}
const ghostOn = () => page.$eval('#ghost', el => el.getAttribute('aria-checked') === 'true')

const t0 = Date.now()
await page.goto(url, { waitUntil: 'load' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('#status')!.textContent !== 'starting Postgres…', { timeout: 60000 })
check(true, `Postgres started in the browser`, `${((Date.now() - t0) / 1000).toFixed(1)} s`)
await page.waitForFunction(() => document.querySelectorAll('.table-card').length > 0, { timeout: 20000 })
check((await page.$$('.table-card')).length === 19, 'schema panel lists 19 tables')
const clockA = await page.$eval('#clock', el => el.textContent ?? '')
await new Promise(r => setTimeout(r, 1100))
const clockB = await page.$eval('#clock', el => el.textContent ?? '')
check(clockA !== clockB && /\d:\d\d:\d\d [AP]M E[SD]T$/.test(clockB), 'the header clock shows live Eastern time', clockB)

// 1. trace the first task with the letters on
await openTask('or-zones')
check(await ghostOn(), 'letters start switched on')
const ghostText = await page.$eval('.ed-layer', el => el.textContent ?? '')
check(ghostText.includes('SELECT *'), 'the answer shows as transparent letters')
await page.click('.ed-input')
await page.keyboard.type('selet', { delay: 5 })
check((await page.$$('.ed-layer .bad')).length > 0, 'a wrong letter turns red')
for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace')
await page.keyboard.type('select *', { delay: 5 })
await page.keyboard.press('Enter')
await page.keyboard.type('from zones;', { delay: 5 })
let s = await waitStatus(/✓|✗/)
check(s.startsWith('✓ Correct'), 'finishing the trace runs it and passes', s)
check(await page.$eval('[data-task="or-zones"] .mark', el => el.classList.contains('traced')), 'sidebar marks it traced')

// 2. letters off: write a different but correct query from memory
await page.click('#ghost')
check(!(await ghostOn()), 'switch turns the letters off')
check((await page.$eval('.ed-input', el => (el as HTMLTextAreaElement).value)) === '', 'editor starts empty with letters off')
await page.click('.ed-input')
await page.keyboard.type('select zone_type, zone_code, zone_name from zones', { delay: 2 })
await page.keyboard.down('Meta')
await page.keyboard.press('Enter')
await page.keyboard.up('Meta')
s = await waitStatus(/✓|✗/)
check(s.startsWith('✓ Correct'), 'a different column order still counts', s)
check(await page.$eval('[data-task="or-zones"] .mark', el => el.classList.contains('solved')), 'sidebar marks it solved')

// 3. a wrong answer gets a useful message
await openTask('ic-expiring')
await page.waitForFunction(() => !document.querySelector('#out')!.hasAttribute('hidden'), { timeout: 15000 })
await page.click('.ed-input')
await page.keyboard.type("select i.sku, inv.lot_no, l.location_code, inv.expiry_date, inv.qty_on_hand from inventory inv join items i on i.item_id = inv.item_id join locations l on l.location_id = inv.location_id where inv.expiry_date between current_date and current_date + 29 order by inv.expiry_date", { delay: 0 })
await page.keyboard.down('Meta')
await page.keyboard.press('Enter')
await page.keyboard.up('Meta')
s = await waitStatus(/✓|✗/)
check(/rows, expected 8/.test(s), 'an off-by-one date range says how many rows are off', s)

// 4. a ticket: an UPDATE with no WHERE gets caught, reset puts it back, the right fix passes
await openTask('sa-fix-user')
await page.waitForFunction(() => !document.querySelector('#status')!.textContent!.startsWith('running'), { timeout: 15000 })
await clearEditor()
await page.keyboard.type('update users set active = false', { delay: 0 })
await page.keyboard.down('Meta')
await page.keyboard.press('Enter')
await page.keyboard.up('Meta')
s = await waitStatus(/✓|✗/)
check(/42 rows changed that should have stayed the same/.test(s), 'an UPDATE without WHERE is caught', s)
await page.click('#reset')
s = await waitStatus(/back to how it started/)
check(/back to how it started/.test(s), 'reset db works', s)
await clearEditor()
await page.keyboard.type("update users set active = false where username = 'dwhitfield'", { delay: 0 })
await page.keyboard.down('Meta')
await page.keyboard.press('Enter')
await page.keyboard.up('Meta')
s = await waitStatus(/✓|✗/)
check(s.startsWith('✓ Fixed'), 'the right fix passes', s)

// 5. fix-query: the real Postgres error shows, the letters underline the fix
await page.click('#ghost')
await openTask('ob-fix-ambiguous')
await page.waitForFunction(() => document.querySelector('#given .err') !== null, { timeout: 15000 })
check(/ambiguous/.test(await page.$eval('#given', el => el.textContent ?? '')), 'the broken query shows its real error')
check((await page.$$('.ed-layer .gh.chg')).length > 0, 'the fix is underlined in the letters')

// 6. a runaway query gets stopped and Postgres comes back
await page.click('#ghost')
await openTask('or-count')
await clearEditor()
await page.keyboard.type('select count(*) from inventory_txns a, inventory_txns b, inventory_txns c', { delay: 0 })
const before = Date.now()
await page.keyboard.down('Meta')
await page.keyboard.press('Enter')
await page.keyboard.up('Meta')
s = await waitStatus(/Stopped after/, 20000)
check(/Stopped after 8 seconds/.test(s), 'a runaway query is stopped', `${((Date.now() - before) / 1000).toFixed(1)} s`)
await clearEditor()
await page.keyboard.type('select count(*) from users where active', { delay: 0 })
await new Promise(r => setTimeout(r, 300))
await page.keyboard.down('Meta')
await page.keyboard.press('Enter')
await page.keyboard.up('Meta')
s = await waitStatus(/✓|✗/, 30000)
check(s.startsWith('✓ Correct'), 'Postgres works again after the restart', s)

// 7. frozen WMS clock inside the worker
await openTask('rc-backlog')
await page.click('#ghost')
await clearEditor()
await page.keyboard.type("select now()::text, current_date::text", { delay: 0 })
await page.keyboard.down('Meta')
await page.keyboard.press('Enter')
await page.keyboard.up('Meta')
await waitStatus(/✓|✗/)
const clock = await page.$eval('#out-body', el => el.textContent ?? '')
check(clock.includes('2026-11-10 14:00:00') && clock.includes('2026-11-10'), 'now() and CURRENT_DATE use the WMS clock', clock.slice(0, 80))

// 8. why tips: they explain the answer while tracing, follow the cursor, and explain your own words with the letters off
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const setLetters = async (on: boolean) => { if ((await ghostOn()) !== on) await page.click('#ghost') }
const tipLabels = () => page.$$eval('#why .tip-label', els => els.map(e => (e.textContent ?? '').trim()))
const lit = () => page.$eval('#why .tip.on .tip-label', el => (el.textContent ?? '').trim()).catch(() => 'none')
await openTask('or-zones')
await setLetters(true)
await clearEditor()
await page.click('#why-switch')
await frame()
let labels = await tipLabels()
check(labels[0] === 'SELECT' && labels.includes('FROM') && labels.some(l => l.startsWith(';')), 'why tips explain SELECT, FROM and the ;', labels.join(' | '))
await page.keyboard.type('select *', { delay: 5 })
await page.keyboard.press('Enter')
await frame()
check((await lit()) === 'FROM', 'the tip for the next part lights up', await lit())
await setLetters(false)
await clearEditor()
await page.keyboard.type('select count(*) from users where active', { delay: 0 })
await frame()
labels = await tipLabels()
check(labels.includes('COUNT') && labels.includes('WHERE') && !labels.includes('SELECT *'), 'letters off: tips explain your own query', labels.join(' | '))
await page.click('#why-switch')
check(await page.$eval('#why', el => el.hasAttribute('hidden')), 'the why switch hides the tips again')

if (shot) {
  if (!(await ghostOn())) await page.click('#ghost')
  await openTask('ic-hold')
  await clearEditor()
  await page.click('.ed-input')
  await page.keyboard.type('SELECT i.sku, l.location_code, inv.lot_no, inv.qty_on_hand\nFROM inventory inv\nJOIN items i ON i.item_id = inv.itme_id', { delay: 0 })
  await page.screenshot({ path: shot })
  console.log(`screenshot: ${shot}`)
}

check(errors.length === 0, 'no errors in the browser console', errors.join(' | ').slice(0, 300))
await browser.close()
console.log(failed ? `\n${failed} check${failed === 1 ? '' : 's'} failed` : '\nAll browser checks passed.')
process.exit(failed ? 1 : 0)
