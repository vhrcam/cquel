import { WMS_NOW } from './clock.ts'

const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000
const NOW = WMS_NOW
const T0 = NOW - 14 * HOUR

type Loc = { id: number; code: string; zone: string; aisle: number | null; bay: number | null; level: string | null; type: string; status: string; barcode: string }
type Item = { id: number; sku: string; desc: string; cat: string; vendor: number; caseQty: number; cost: string; weight: string; lot: boolean; shelf: number | null; created: string; active: boolean; w: number }
type User = { id: number; username: string; name: string; role: string; shift: string; hired: string; active: boolean }
type Cust = { id: number; name: string; type: string; city: string; state: string }
type Wave = { id: number; no: string; day: number; run: number; status: string; plannedFor: number; releasedAt: number | null; releasedBy: number | null }
type Order = { id: number; no: string; cust: Cust; carrier: string; priority: number; status: string; orderedAt: number; shipBy: number; wave: Wave | null; shippedAt: number | null; tracking: string | null; lines: Line[] }
type Line = { id: number; order: Order; lineNo: number; item: Item; qty: number; picked: number; shipped: number; tasks: Task[] }
type PO = { id: number; no: string; vendor: number; status: string; created: number; expected: number; lines: POLine[] }
type POLine = { id: number; po: PO; lineNo: number; item: Item; ordered: number; received: number }
type Receipt = { id: number; line: POLine; lpn: string; qty: number; lot: string | null; expiry: number | null; by: number; at: number; door: number }
type Task = { id: number; type: string; status: string; item: Item; from: number | null; to: number | null; qty: number; done: number; wave: Wave | null; line: Line | null; receipt: Receipt | null; user: number | null; created: number; started: number | null; completed: number | null }
type Face = { loc: Loc; item: Item; min: number; max: number }
type Inv = { id: number; item: Item; loc: Loc; lpn: string | null; lot: string | null; expiry: number | null; qty: number; alloc: number; status: string; received: number | null }
type Count = { loc: Loc; item: Item; status: string; system: number; counted: number | null; by: number | null; created: number; at: number | null }
type Txn = { type: string; item: Item; loc: number | null; lot: string | null; qty: number; reason: string | null; ref: string | null; user: number | null; at: number }
type Msg = { dir: string; type: string; ref: string; status: string; err: string | null; created: number; processed: number | null }

export type SeedFacts = Record<string, string | number>

const CATALOG: [string, string[]][] = [
  ['SNACKS', [
    'Kettle Chips Sea Salt 8oz|2.15|0.60|12|180',
    'Kettle Chips BBQ 8oz|2.15|0.60|12|180',
    'Kettle Chips Jalapeno 8oz|2.25|0.60|12|180',
    'Pretzel Twists 16oz|1.85|1.10|12|240',
    'Trail Mix Classic 26oz|6.40|1.80|8|270',
    'Granola Bar Oat Honey 12ct|3.10|0.90|12|300',
    'Granola Bar Choc Chip 12ct|3.10|0.90|12|300',
    'Peanut Butter Crackers 8ct|2.05|0.70|12|240',
    'Popcorn Butter 6pk|2.80|0.80|12|210',
    'Beef Jerky Original 3oz|4.35|0.30|24|365',
    'Beef Jerky Teriyaki 3oz|4.35|0.30|24|365',
    'Mixed Nuts Salted 30oz|8.90|2.00|6|300',
    'Rice Cakes Lightly Salted|1.65|0.30|12|270',
    'Fruit Snacks Variety 40ct|7.20|2.60|4|330',
    'Tortilla Chips Restaurant 13oz|2.40|0.90|9|150',
    'Cheese Crackers Family 20oz|3.60|1.40|12|270',
    'Animal Crackers 2lb|3.95|2.10|6|300',
  ]],
  ['BEVERAGE', [
    'Spring Water 24pk 16.9oz|3.40|27.00|1|730',
    'Sparkling Water Lime 12pk|3.90|10.50|2|365',
    'Sparkling Water Berry 12pk|3.90|10.40|2|365',
    'Cold Brew Coffee 48oz|4.75|3.30|6|180',
    'Green Tea Bottled 16oz|1.05|1.10|12|270',
    'Sports Drink Lemon-Lime 8pk|4.20|9.20|3|300',
    'Sports Drink Fruit Punch 8pk|4.20|9.20|3|300',
    'Energy Drink Original 4pk|5.10|3.40|6|450',
    'Ginger Ale 12pk Cans|3.75|9.80|2|270',
    'Cola 12pk Cans|3.75|9.80|2|270',
    'Lemonade Mix 10ct|2.60|0.50|12|540',
    'Coconut Water 1L|2.35|2.30|12|330',
    'Apple Juice Box 8pk|2.95|3.90|6|240',
    'Hot Cocoa Mix 30ct|5.80|1.90|6|540',
    'Coffee Pods Medium Roast 24ct|9.40|0.70|6|365',
    'Tea Bags Chamomile 40ct|2.70|0.30|12|730',
  ]],
  ['HOUSEHOLD', [
    'Paper Towels 6 Roll|6.80|3.40|4|',
    'Bath Tissue 12 Roll|7.90|4.80|4|',
    'Dish Soap Lemon 24oz|1.95|1.70|12|',
    'Laundry Detergent 92oz|8.60|6.40|4|',
    'Fabric Softener Sheets 120ct|4.30|0.90|8|',
    'Trash Bags 13gal 45ct|5.70|2.20|6|',
    'Trash Bags 33gal 30ct|6.90|3.10|6|',
    'Bleach Regular 121oz|3.20|8.40|3|',
    'All-Purpose Cleaner 32oz|2.45|2.30|12|',
    'Glass Cleaner 26oz|2.30|1.90|12|',
    'Sponges Scrub 6pk|2.10|0.40|24|',
    'Aluminum Foil 75ft|3.40|1.00|12|',
    'Plastic Wrap 200ft|2.60|0.80|12|',
    'Zip Bags Gallon 40ct|2.90|0.70|12|',
    'Dishwasher Pods 42ct|9.70|2.00|6|',
    'Paper Plates 9in 100ct|4.10|2.90|8|',
    'Disinfecting Wipes 75ct|3.80|1.40|12|',
  ]],
  ['PERSONAL CARE', [
    'Shampoo Daily Clean 25oz|3.90|1.80|6|',
    'Conditioner Daily 25oz|3.90|1.80|6|',
    'Body Wash Oat 18oz|3.40|1.30|6|',
    'Toothpaste Mint 2pk|3.15|0.50|24|720',
    'Toothbrush Soft 4pk|3.60|0.30|24|',
    'Mouthwash Mint 1L|3.85|2.50|6|720',
    'Sunscreen SPF50 8oz|6.90|0.60|12|540',
    'Hand Soap Refill 50oz|4.60|3.40|6|',
    'Hand Sanitizer 12oz|2.40|0.90|12|720',
    'Lip Balm 3pk|2.20|0.10|48|730',
    'Deodorant Fresh 2pk|4.80|0.60|12|',
    'Cotton Swabs 500ct|2.10|0.40|24|',
    'Razors Disposable 12ct|5.20|0.40|24|',
    'Multivitamin Adult 200ct|8.40|0.80|12|600',
    'Vitamin C 500mg 100ct|4.90|0.40|12|600',
    'Bandages Assorted 60ct|2.75|0.20|24|1095',
  ]],
  ['PET', [
    'Dog Food Chicken 15lb|14.80|15.40|1|365',
    'Dog Food Lamb 30lb|27.50|30.60|1|365',
    'Puppy Food Chicken 15lb|16.20|15.20|1|365',
    'Cat Food Salmon Pate 12ct|7.90|3.60|4|730',
    'Cat Food Dry Indoor 7lb|9.30|7.20|4|365',
    'Cat Litter Clumping 25lb|8.40|25.30|1|',
    'Dog Treats Bacon 25oz|7.60|1.70|6|365',
    'Rawhide Rolls 10pk|5.90|0.90|12|730',
    'Bird Seed Wild 10lb|6.20|10.20|2|365',
    'Dog Chew Toy Large|4.30|0.50|12|',
    'Cat Scratcher Pad|5.60|1.60|6|',
    'Dog Waste Bags 120ct|3.20|0.60|24|',
    'Cat Treats Tuna 3oz|1.85|0.20|24|450',
    'Pet Stain Remover 32oz|4.90|2.30|6|',
    'Fish Flakes 2oz|2.95|0.20|24|730',
    'Dog Shampoo Oatmeal 16oz|4.40|1.20|12|',
    'Hamster Bedding 60L|6.70|4.10|4|',
  ]],
  ['ELECTRONICS', [
    'USB-C Cable 6ft|3.10|0.20|24|',
    'USB-C Wall Charger 20W|6.40|0.30|24|',
    'Lightning Cable 3ft|3.40|0.10|24|',
    'AA Batteries 24pk|9.80|1.40|12|',
    'AAA Batteries 16pk|7.90|0.70|12|',
    'Wired Earbuds|4.20|0.10|24|',
    'HDMI Cable 10ft|4.60|0.40|24|',
    'Power Strip 6 Outlet|7.20|1.30|12|',
    'Phone Case Clear Universal|2.80|0.10|48|',
    'Bluetooth Speaker Mini|14.60|0.80|12|',
    'LED Bulb 60W 4pk|5.90|0.60|12|',
    'Extension Cord 15ft|6.10|1.10|12|',
    'Car Charger Dual USB|4.40|0.20|24|',
    'Screen Protector Tempered|1.90|0.10|48|',
    'Portable Power Bank 10000mAh|12.30|0.60|12|',
    'Wireless Mouse|7.40|0.30|12|',
    'Smart Plug 2pk|11.20|0.70|12|',
  ]],
]

const VENDORS: [number, string, string, string, number][] = [
  [1, 'Prairie Snack Co.', 'Omaha', 'NE', 5],
  [2, 'Golden Crunch Foods', 'Columbus', 'OH', 4],
  [3, 'Clearbrook Beverages', 'Louisville', 'KY', 3],
  [4, 'Riverbend Bottling', 'Peoria', 'IL', 6],
  [5, 'Homestead Household Supply', 'Fort Wayne', 'IN', 7],
  [6, 'Sparkle Clean Products', 'Toledo', 'OH', 5],
  [7, 'Bright Smile Personal Care', 'Cincinnati', 'OH', 8],
  [8, 'Fresh Day Health', 'Grand Rapids', 'MI', 6],
  [9, 'Trailside Pet Foods', 'Lexington', 'KY', 6],
  [10, 'Whisker & Tail Supply', 'Evansville', 'IN', 9],
  [11, 'VoltLine Electronics', 'Chicago', 'IL', 10],
  [12, 'Northpoint Accessories', 'Detroit', 'MI', 12],
]

const USERS: [string, string, string, string, string, boolean?][] = [
  ['Maria Rivera', 'mrivera', 'PICKER', '1ST', '2019-04-15'],
  ['Kiran Patel', 'kpatel', 'PICKER', '1ST', '2021-06-01'],
  ['Aisha Johnson', 'ajohnson', 'PICKER', '1ST', '2020-02-10'],
  ['Ben Carter', 'bcarter', 'PICKER', '1ST', '2023-08-21'],
  ['Lena Novak', 'lnovak', 'PICKER', '1ST', '2022-03-14'],
  ['Marcus Hill', 'mhill', 'PICKER', '1ST', '2018-11-05'],
  ['Priya Shah', 'pshah', 'PICKER', '1ST', '2024-05-06'],
  ['Sam Okafor', 'sokafor', 'PICKER', '1ST', '2025-01-13'],
  ['Grace Kim', 'gkim', 'PICKER', '1ST', '2021-09-27'],
  ['Luis Mendez', 'lmendez', 'PICKER', '1ST', '2017-07-17'],
  ['Mei Lin', 'mlin', 'PICKER', '1ST', '2026-11-09'],
  ['Hannah Weber', 'hweber', 'PICKER', '2ND', '2022-10-03'],
  ['Andre Thompson', 'athompson', 'PICKER', '2ND', '2020-12-07'],
  ['Chloe Martin', 'cmartin', 'PICKER', '2ND', '2024-02-19'],
  ['Victor Alvarez', 'valvarez', 'PICKER', '2ND', '2019-08-12'],
  ['Nina Brooks', 'nbrooks', 'PICKER', '2ND', '2023-04-24'],
  ['Omar Haddad', 'ohaddad', 'PICKER', '2ND', '2025-06-30'],
  ['Ruth Coleman', 'rcoleman', 'PICKER', '2ND', '2016-05-09'],
  ['Derek Young', 'dyoung', 'PICKER', '2ND', '2026-09-08'],
  ['Dana Whitfield', 'dwhitfield', 'PICKER', '2ND', '2021-01-11'],
  ['Carlos Romero', 'cromero', 'RECEIVER', '1ST', '2018-03-19'],
  ['Tasha Greene', 'tgreene', 'RECEIVER', '1ST', '2022-07-11'],
  ['Eli Navarro', 'enavarro', 'RECEIVER', '1ST', '2024-08-05'],
  ['Jose Ortiz', 'jortiz', 'RECEIVER', '1ST', '2019-10-14', false],
  ['Paul Fischer', 'pfischer', 'RECEIVER', '3RD', '2020-05-04'],
  ['Jada Wright', 'jwright', 'RECEIVER', '3RD', '2023-11-27'],
  ['Sofia Rossi', 'srossi', 'REPLEN', '3RD', '2021-02-22'],
  ['Kevin Doyle', 'kdoyle', 'REPLEN', '3RD', '2019-06-17'],
  ['Tom Barnes', 'tbarnes', 'REPLEN', '3RD', '2020-09-14', false],
  ['Amara Obi', 'aobi', 'REPLEN', '1ST', '2023-01-09'],
  ['Wes Turner', 'wturner', 'REPLEN', '2ND', '2022-04-18'],
  ['Rosa Delgado', 'rdelgado', 'LOADER', '1ST', '2018-12-03'],
  ['Gabe Silva', 'gsilva', 'LOADER', '1ST', '2024-10-14'],
  ['Ian McLeod', 'imcleod', 'LOADER', '2ND', '2021-05-24'],
  ['Holly Price', 'hprice', 'LOADER', '2ND', '2025-03-03'],
  ['Fatima Noor', 'fnoor', 'ICQA', '1ST', '2019-01-28'],
  ['Keisha Banks', 'kbanks', 'ICQA', '1ST', '2023-06-12'],
  ['Jon Park', 'jpark', 'ICQA', '3RD', '2022-08-29'],
  ['Liam Walsh', 'lwalsh', 'SUPERVISOR', '1ST', '2015-04-06'],
  ['Monica Reyes', 'mreyes', 'SUPERVISOR', '2ND', '2017-09-18'],
  ['Noah Fleming', 'nfleming', 'SUPERVISOR', '3RD', '2018-02-12'],
  ['Ray Castillo', 'rcastillo', 'SUPERVISOR', '1ST', '2020-11-02'],
  ['Olivia Stone', 'ostone', 'ANALYST', '1ST', '2021-03-15'],
  ['Tess Moran', 'tmoran', 'ANALYST', '1ST', '2024-01-08'],
  ['Zane Cooper', 'zcooper', 'ADMIN', '1ST', '2016-08-22'],
]

const CITIES: [string, string][] = [
  ['Indianapolis', 'IN'], ['Fort Wayne', 'IN'], ['Evansville', 'IN'], ['South Bend', 'IN'], ['Bloomington', 'IN'], ['Lafayette', 'IN'],
  ['Columbus', 'OH'], ['Dayton', 'OH'], ['Cincinnati', 'OH'], ['Toledo', 'OH'], ['Louisville', 'KY'], ['Lexington', 'KY'],
  ['Chicago', 'IL'], ['Peoria', 'IL'], ['Springfield', 'IL'], ['Grand Rapids', 'MI'], ['Kalamazoo', 'MI'], ['Detroit', 'MI'],
]

const CHAINS: [string, string[]][] = [
  ['Harbor Grocers', ['104', '112', '118', '125', '131', '140']],
  ['Maple Street Market', ['07', '11', '15', '22', '26', '30']],
  ['Corner Basket', ['3', '5', '8', '12', '14', '19']],
  ['Ridgeview Foods', ['210', '214', '219', '223', '227', '233']],
  ['Lakeshore Mart', ['41', '44', '48', '52', '57', '61']],
]

const CARRIERS: [string, string, string, string][] = [
  ['PLG', 'ParcelLine Ground', 'PARCEL', '18:30'],
  ['PL2', 'ParcelLine 2-Day', 'PARCEL', '18:30'],
  ['SWF', 'Swift Freight', 'LTL', '17:00'],
  ['RDX', 'Ridge Express', 'LTL', '16:30'],
  ['HTL', 'Heartland Truckload', 'TL', '13:30'],
  ['LCL', 'Local Fleet', 'FLEET', '11:00'],
]

const UNSLOTTED = new Set([
  'P-01-14-A', 'P-01-14-B', 'P-03-14-A', 'P-03-14-B', 'P-04-10-B', 'P-04-11-A', 'P-04-11-B',
  'P-04-12-A', 'P-04-12-B', 'P-04-13-A', 'P-04-13-B', 'P-04-14-A', 'P-04-14-B',
])

let cachedSql = ''
let cachedFacts: SeedFacts = {}

export function seedSql(): string {
  if (!cachedSql) build()
  return cachedSql
}

export function seedFacts(): SeedFacts {
  if (!cachedSql) build()
  return cachedFacts
}

function build() {
  let state = 1110
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]
  const chance = (p: number) => rand() < p
  const shuffle = <T>(list: T[]): T[] => {
    const a = list.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const pickW = (pairs: [string, number][]) => {
    let r = rand()
    for (const [v, p] of pairs) if ((r -= p) < 0) return v
    return pairs[pairs.length - 1][0]
  }
  const p2 = (n: number) => String(n).padStart(2, '0')
  const iso = (ms: number) => new Date(ms).toISOString()
  const ts = (ms: number | null) => (ms === null ? null : iso(Math.round(ms / 1000) * 1000).slice(0, 19).replace('T', ' '))
  const dt = (ms: number | null) => (ms === null ? null : iso(ms).slice(0, 10))
  const mmdd = (ms: number) => iso(ms).slice(5, 10).replace('-', '')
  const yymmdd = (ms: number) => iso(ms).slice(2, 10).replace(/-/g, '')
  const weekend = (d: number) => {
    const wd = (((2 + d) % 7) + 7) % 7
    return wd === 0 || wd === 6
  }
  const lpn = (n: number) => 'LP' + String(n).padStart(8, '0')
  const letter = () => pick(['A', 'B', 'C'])

  // ---------- locations
  const locs: Loc[] = []
  const byCode = new Map<string, Loc>()
  const addLoc = (code: string, zone: string, type: string, aisle: number | null = null, bay: number | null = null, level: string | null = null) => {
    const l: Loc = { id: locs.length + 1, code, zone, aisle, bay, level, type, status: 'ACTIVE', barcode: '' }
    locs.push(l)
    byCode.set(code, l)
  }
  for (let n = 1; n <= 4; n++) addLoc(`DOOR-R${p2(n)}`, 'RCV', 'DOOR')
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 8; b++) for (const lv of 'ABC') addLoc(`R-${p2(a)}-${p2(b)}-${lv}`, 'RSV', 'RACK', a, b, lv)
  for (let a = 1; a <= 4; a++) for (let b = 1; b <= 14; b++) for (const lv of 'AB') addLoc(`P-${p2(a)}-${p2(b)}-${lv}`, 'FPA', 'SHELF', a, b, lv)
  for (let n = 1; n <= 6; n++) addLoc(`QA-${p2(n)}`, 'QAH', 'CAGE')
  for (let n = 1; n <= 8; n++) addLoc(`STG-${p2(n)}`, 'STG', 'LANE')
  for (let n = 1; n <= 6; n++) addLoc(`DOOR-S${p2(n)}`, 'SHP', 'DOOR')
  for (const l of locs) {
    const raw = l.code.replace(/-/g, '')
    let sum = 0
    for (let i = 0; i < raw.length; i++) sum += raw.charCodeAt(i) * (i + 1)
    l.barcode = raw + (sum % 10)
  }
  const L = (code: string) => byCode.get(code)!
  L('P-02-08-A').barcode = L('P-02-07-A').barcode
  L('R-04-02-C').barcode = L('R-04-02-B').barcode
  for (const c of ['P-02-03-A', 'P-02-03-B', 'P-02-04-A', 'P-02-04-B', 'P-02-05-A', 'P-02-05-B', 'R-05-08-C']) L(c).status = 'LOCKED'
  for (const c of ['R-06-08-A', 'R-06-08-B', 'R-06-08-C']) L(c).status = 'INACTIVE'
  const rsvAll = locs.filter(l => l.zone === 'RSV' && l.status === 'ACTIVE')

  // ---------- items
  const items: Item[] = []
  CATALOG.forEach(([cat, list], c) => {
    list.forEach((line, n) => {
      const [desc, cost, weight, caseQty, shelf] = line.split('|')
      items.push({
        id: items.length + 1, sku: `10${c + 1}${p2(n + 1)}`, desc, cat, vendor: 2 * c + 1 + (n % 2),
        caseQty: Number(caseQty), cost, weight, lot: shelf !== '', shelf: shelf ? Number(shelf) : null,
        created: dt(T0 - int(90, 2700) * DAY)!, active: true, w: 0,
      })
    })
  })
  const NEW_ITEM: Item = { id: items.length + 1, sku: '10518', desc: 'Dog Dental Chews 30ct', cat: 'PET', vendor: 9, caseQty: 6, cost: '11.40', weight: '1.90', lot: true, shelf: 540, created: dt(T0)!, active: true, w: 0 }
  items.push(NEW_ITEM)
  const SKU = (sku: string) => items.find(i => i.sku === sku)!
  SKU('10603').active = false

  // ---------- users, customers
  const users: User[] = USERS.map(([name, username, role, shift, hired, active], k) => ({ id: k + 1, username, name, role, shift, hired, active: active !== false }))
  const U = (username: string) => users.find(u => u.username === username)!.id
  const customers: Cust[] = []
  let ci = 0
  const nextCity = () => CITIES[ci++ % CITIES.length]
  for (const [chain, nums] of CHAINS) for (const n of nums) {
    const [city, st] = nextCity()
    customers.push({ id: customers.length + 1, name: `${chain} #${n}`, type: 'STORE', city, state: st })
  }
  for (const name of ['Midwest Supply Co-op', 'Tri-State Distributors', 'Crossroads Wholesale', 'Hoosier Food Service', 'Great Lakes Vending', 'Keystone Office Supply']) {
    const [city, st] = nextCity()
    customers.push({ id: customers.length + 1, name, type: 'WHOLESALE', city, state: st })
  }
  for (const name of ['Web Store', 'Marketplace East', 'Marketplace West', 'Subscription Boxes']) customers.push({ id: customers.length + 1, name, type: 'ECOM', city: 'Indianapolis', state: 'IN' })
  const custByType: Record<string, Cust[]> = { STORE: [], ECOM: [], WHOLESALE: [] }
  for (const c of customers) custByType[c.type].push(c)

  // ---------- velocity + slotting
  const sellable = items.filter(i => i.active && i !== NEW_ITEM)
  const ranked = shuffle(sellable)
  ranked.forEach((it, r) => { it.w = 1 / Math.pow(r + 1, 0.7) })
  let totalW = 0
  const cum = ranked.map(it => (totalW += it.w))
  const pickItem = () => {
    const r = rand() * totalW
    let k = 0
    while (cum[k] < r) k++
    return ranked[k]
  }
  const faceLocs = locs.filter(l => l.zone === 'FPA' && !UNSLOTTED.has(l.code))
  const faceOf = new Map<Item, Loc>()
  ranked.forEach((it, k) => faceOf.set(it, faceLocs[k]))
  const reslot = ranked.slice(0, 8).find((it, k) => k >= 2 && it.caseQty >= 12)!
  const far = L('P-04-09-A')
  const swapWith = ranked.find(it => faceOf.get(it) === far)!
  faceOf.set(swapWith, faceOf.get(reslot)!)
  faceOf.set(reslot, far)
  const faces: Face[] = ranked.map((it, k) => {
    const cases = k < 20 ? 12 : k < 50 ? 8 : 4
    const max = it.caseQty * cases
    const min = Math.max(it.caseQty, Math.round(max / 4 / it.caseQty) * it.caseQty)
    return { loc: faceOf.get(it)!, item: it, min, max }
  })
  const faceByItem = new Map(faces.map(f => [f.item, f]))

  // ---------- orders
  const orders: Order[] = []
  for (let s = -13; s <= 2; s++) {
    const n = weekend(s) ? 20 : 44
    for (let k = 0; k < n; k++) {
      const r = rand()
      const type = r < 0.4 ? 'ECOM' : r < 0.85 ? 'STORE' : 'WHOLESALE'
      const cust = pick(custByType[type])
      const carrier = type === 'ECOM' ? pickW([['PLG', 0.7], ['PL2', 0.3]])
        : type === 'STORE' ? pickW([['LCL', 0.6], ['SWF', 0.25], ['RDX', 0.15]])
        : pickW([['HTL', 0.5], ['RDX', 0.3], ['SWF', 0.2]])
      const lead = type === 'WHOLESALE' ? 2 : type === 'STORE' ? int(1, 2) : 1
      const orderedAt = T0 + (s - lead) * DAY + int(360, 1319) * MIN + int(0, 59) * 1000
      const priority = chance(0.08) ? 1 : chance(0.16) ? 2 : 3
      const nLines = type === 'ECOM' ? int(1, 3) : type === 'STORE' ? int(3, 7) : int(5, 9)
      const o: Order = { id: 0, no: '', cust, carrier, priority, status: 'NEW', orderedAt, shipBy: s, wave: null, shippedAt: null, tracking: null, lines: [] }
      const used = new Set<Item>()
      while (o.lines.length < nLines) {
        const it = pickItem()
        if (used.has(it)) continue
        used.add(it)
        const qty = type === 'ECOM' ? int(1, 3) : type === 'STORE' ? it.caseQty * int(1, 3) : it.caseQty * int(2, 6)
        o.lines.push({ id: 0, order: o, lineNo: o.lines.length + 1, item: it, qty, picked: 0, shipped: 0, tasks: [] })
      }
      if (orderedAt <= NOW - 20 * MIN) orders.push(o)
    }
  }
  orders.sort((a, b) => a.orderedAt - b.orderedAt)
  orders.forEach((o, i) => { o.id = i + 1; o.no = `SO-${104201 + i}` })
  let lineSeq = 0
  for (const o of orders) for (const l of o.lines) l.id = ++lineSeq
  for (const o of shuffle(orders.filter(o => o.shipBy >= -12 && o.shipBy <= -2)).slice(0, 6)) o.status = 'CANCELLED'

  // ---------- waves
  const RUN_AT = [0, 7 * 60, 11 * 60 + 30, 16 * 60]
  const waves: Wave[] = []
  const waveAt = new Map<string, Wave>()
  for (let d = -14; d <= 0; d++) for (let run = 1; run <= 3; run++) {
    if (d === -14 && run < 3) continue
    const plannedFor = T0 + d * DAY + RUN_AT[run] * MIN
    const status = d === 0 && run === 3 ? 'PLANNED' : d === 0 && run === 2 ? 'RELEASED' : 'COMPLETE'
    const w: Wave = {
      id: waves.length + 1, no: `W${mmdd(plannedFor)}-${run}`, day: d, run, status, plannedFor,
      releasedAt: status === 'PLANNED' ? null : plannedFor + int(0, 3) * MIN,
      releasedBy: status === 'PLANNED' ? null : run === 3 ? U('mreyes') : U('lwalsh'),
    }
    waves.push(w)
    waveAt.set(`${d}:${run}`, w)
  }
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue
    if (o.carrier === 'LCL' || o.carrier === 'HTL') {
      const pre = waveAt.get(`${o.shipBy - 1}:3`)
      if (pre && o.orderedAt < pre.plannedFor - 30 * MIN) o.wave = pre
      else if (o.shipBy <= 0) o.wave = waveAt.get(`${o.shipBy}:1`)!
    } else if (o.shipBy <= 0) {
      o.wave = waveAt.get(`${o.shipBy}:${chance(0.45) ? 1 : 2}`)!
    }
  }

  // ---------- pick tasks
  const tasks: Task[] = []
  const STAGE: Record<string, string> = { PLG: 'STG-01', PL2: 'STG-02', SWF: 'STG-03', RDX: 'STG-04', HTL: 'STG-05', LCL: 'STG-07' }
  const WINDOW: Record<number, [number, number]> = { 1: [7 * 60 + 5, 10 * 60 + 30], 2: [11 * 60 + 35, 14 * 60 + 20], 3: [16 * 60 + 5, 21 * 60 + 30] }
  const pickers1 = users.filter(u => u.role === 'PICKER' && u.shift === '1ST')
  const pickers2 = users.filter(u => u.role === 'PICKER' && u.shift === '2ND')
  const works = (u: User, d: number) => {
    if (u.username === 'mlin') return d >= 0
    if (u.username === 'dwhitfield') return d <= -4
    if (d === -1 && (u.username === 'mrivera' || u.username === 'kpatel')) return true
    const wd = (((2 + d) % 7) + 7) % 7
    return wd !== (u.id * 2) % 7 && wd !== (u.id * 2 + 3) % 7
  }
  const schedule = (list: Task[], start: number, end: number) => {
    const times = list.map(() => start + rand() * (end - start)).sort((a, b) => a - b)
    let prev = start
    list.forEach((t, i) => {
      const dur = (45 + int(0, 75) + Math.round(Math.sqrt(t.qty) * 10)) * 1000
      const done = Math.max(times[i], prev + dur)
      t.started = Math.round((done - dur) / 1000) * 1000
      t.completed = Math.round(done / 1000) * 1000
      prev = done
    })
  }
  for (const w of waves) {
    if (w.status === 'PLANNED') continue
    const lines = orders.filter(o => o.wave === w).flatMap(o => o.lines)
    if (!lines.length) continue
    const today = w.day === 0
    const shift = (w.run === 3 ? pickers2 : pickers1)
    let pool = shuffle(shift.filter(u => works(u, w.day)))
    if (!pool.length) pool = shift.slice()
    if (today && w.run === 2) pool = pool.slice(0, 4)
    const list = shuffle(lines).map(l => {
      const t: Task = { id: 0, type: 'PICK', status: 'DONE', item: l.item, from: faceOf.get(l.item)!.id, to: L(STAGE[l.order.carrier]).id, qty: l.qty, done: l.qty, wave: w, line: l, receipt: null, user: null, created: w.releasedAt!, started: null, completed: null }
      l.tasks.push(t)
      tasks.push(t)
      return t
    })
    let assignable = list
    if (today && w.run === 2) {
      for (const t of list.slice(-4)) { t.status = 'OPEN'; t.done = 0 }
      assignable = list.slice(0, -4)
    }
    const per = new Map<User, Task[]>()
    pool.forEach(u => per.set(u, []))
    assignable.forEach((t, i) => {
      const u = pool[i % pool.length]
      t.user = u.id
      per.get(u)!.push(t)
    })
    if (w.day === -1 && w.run === 2) {
      const kiran = per.get(pool.find(u => u.username === 'kpatel')!)!
      for (const [u, mine] of per) {
        if (u.username === 'kpatel') continue
        while (kiran.length < 6 && mine.length > 1) { const t = mine.pop()!; t.user = U('kpatel'); kiran.push(t) }
      }
    }
    const [a, b] = WINDOW[w.run]
    const end = today && w.run === 2 ? 14 * 60 + 25 : b
    for (const [u, mine] of per) {
      let [s0, s1] = [a, end]
      if (w.day === -1 && w.run === 2 && u.username === 'kpatel') [s0, s1] = [13 * 60 + 2, 13 * 60 + 56]
      if (w.day === -1 && w.run === 2 && u.username === 'mrivera') s1 = 12 * 60 + 50
      schedule(mine, T0 + w.day * DAY + s0 * MIN, T0 + w.day * DAY + s1 * MIN)
    }
    if (!today) for (const t of assignable) if (chance(0.015)) { t.status = 'SHORT'; t.done = Math.floor(t.qty * (0.3 + rand() * 0.5)) }
  }
  const W = (d: number, run: number) => waveAt.get(`${d}:${run}`)!
  for (const t of tasks) {
    if (t.wave !== W(0, 2) || t.status === 'OPEN') continue
    if (t.completed! <= NOW) continue
    if (t.started! <= NOW) { t.status = 'IN_PROGRESS'; t.completed = null; t.done = 0 }
    else { t.status = 'ASSIGNED'; t.started = null; t.completed = null; t.done = 0 }
  }
  const shortW1: Task[] = []
  for (const t of shuffle(tasks.filter(t => t.wave === W(0, 1) && t.qty >= 4))) {
    if (shortW1.length === 2) break
    if (shortW1.some(s => s.line!.order === t.line!.order)) continue
    shortW1.push(t)
  }
  for (const t of shortW1) { t.status = 'SHORT'; t.done = Math.floor(t.qty / 2) }
  const shortW2 = pick(tasks.filter(t => t.wave === W(0, 2) && t.status === 'DONE' && t.qty >= 2 && !shortW1.some(s => s.line!.order === t.line!.order)))
  shortW2.status = 'SHORT'
  shortW2.done = Math.floor(shortW2.qty / 2)

  const nov9 = tasks.filter(t => t.wave && t.wave.day === -1)
  pick(nov9.filter(t => t.wave!.run === 1)).user = U('mlin')
  const h13 = T0 - DAY + 13 * HOUR
  const h14 = h13 + HOUR
  const borrowed = nov9.filter(t => t.user === U('kpatel') && t.completed! >= h13 && t.completed! < h14)
  for (const t of borrowed) t.user = U('mrivera')

  // ---------- order status
  const DEPART: Record<string, number> = { PLG: 1110, PL2: 1110, SWF: 1020, RDX: 990, HTL: 810, LCL: 660 }
  const LATE: Record<string, number> = { PLG: 0.02, PL2: 0.02, SWF: 0.05, RDX: 0.3, HTL: 0.02, LCL: 0.01 }
  const finished = (t: Task) => t.status === 'DONE' || t.status === 'SHORT'
  const digits = (n: number) => { let s = ''; for (let i = 0; i < n; i++) s += int(0, 9); return s }
  const stuckPool: Order[] = []
  for (const o of orders) {
    for (const l of o.lines) l.picked = l.tasks.filter(finished).reduce((s, t) => s + t.done, 0)
    if (o.status === 'CANCELLED') continue
    if (!o.wave || o.wave.status === 'PLANNED') { o.status = 'NEW'; continue }
    const ts2 = o.lines.flatMap(l => l.tasks)
    const all = ts2.every(finished)
    if (!all) { o.status = ts2.some(finished) ? 'PICKING' : 'RELEASED'; continue }
    if (o.wave.day === 0 && ts2.some(t => t.status === 'SHORT')) { o.status = 'PICKING'; continue }
    const last = Math.max(...ts2.map(t => t.completed!))
    const packed = last + int(15, 45) * MIN
    let dep = T0 + o.shipBy * DAY + DEPART[o.carrier] * MIN
    if (packed > dep) dep += DAY
    if (o.shipBy < 0 && chance(LATE[o.carrier])) dep += DAY
    if (dep <= NOW) {
      o.status = 'SHIPPED'
      o.shippedAt = dep + int(0, 20) * MIN
      o.tracking = o.carrier === 'PLG' || o.carrier === 'PL2' ? 'PL' + digits(10) : o.carrier === 'LCL' ? `LF${mmdd(o.shippedAt)}-${p2(int(1, 12))}` : 'PRO' + digits(8)
      for (const l of o.lines) l.shipped = l.picked
    } else o.status = packed <= NOW ? 'PACKED' : 'PICKED'
    if (o.wave === W(0, 2) && o.status !== 'SHIPPED') stuckPool.push(o)
  }
  const stuck = shuffle(stuckPool).slice(0, 3)
  for (const o of stuck) o.status = 'PICKING'

  // ---------- purchase orders + receipts
  const vendorItems = new Map<number, Item[]>()
  for (const it of sellable) {
    if (!vendorItems.has(it.vendor)) vendorItems.set(it.vendor, [])
    vendorItems.get(it.vendor)!.push(it)
  }
  const orderQty = (it: Item) => it.caseQty >= 6 ? it.caseQty * int(20, 80) : Math.max(it.caseQty, Math.floor(int(40, 160) / it.caseQty) * it.caseQty)
  const pos: PO[] = []
  const makePO = (vendor: number, expected: number, chosen: Item[]) => {
    const po: PO = { id: 0, no: '', vendor, status: 'OPEN', created: expected - VENDORS[vendor - 1][4] - int(0, 2), expected, lines: [] }
    chosen.forEach((it, k) => po.lines.push({ id: 0, po, lineNo: k + 1, item: it, ordered: orderQty(it), received: 0 }))
    pos.push(po)
    return po
  }
  let vt = 0
  for (let e = -14; e <= 3; e++) {
    const n = e === 0 ? 5 : weekend(e) ? 1 : 4
    for (let k = 0; k < n; k++) {
      const vendor = ((vt++ * 5) % 12) + 1
      const list = vendorItems.get(vendor)!
      makePO(vendor, e, shuffle(list).slice(0, e === 0 ? 5 : int(2, Math.min(5, list.length))))
    }
  }
  const firstOn = (e: number) => pos.find(p => p.expected === e)!
  const latePOs = [-5, -4, -1].map(firstOn)
  firstOn(-8).status = 'CANCELLED'
  const todayPOs = pos.filter(p => p.expected === 0)
  const granola = SKU('10106')
  const tenX = makePO(granola.vendor, -1, [granola, ...shuffle(vendorItems.get(granola.vendor)!.filter(i => i !== granola)).slice(0, 2)])
  tenX.lines[0].ordered = 960

  const receipts: Receipt[] = []
  let lpnSeq = 10044001
  const lotFor = (it: Item, at: number): [string | null, number | null] => {
    if (!it.lot) return [null, null]
    const prod = at - int(5, 40) * DAY
    return [`L${yymmdd(prod)}${letter()}`, prod + it.shelf! * DAY]
  }
  const receiversOn = (shift: string, d: number) => users.filter(u => u.role === 'RECEIVER' && u.shift === shift && (u.username !== 'jortiz' || d <= -5))
  const receive = (po: PO, start: number, by: number) => {
    let t = start
    const door = int(1, 4)
    for (const line of po.lines) {
      if (line.received <= 0) continue
      const [lot, expiry] = lotFor(line.item, start)
      const pallets = Math.max(1, Math.ceil(line.received / (line.item.caseQty * 40)))
      let left = line.received
      for (let p = 0; p < pallets; p++) {
        const qty = p === pallets - 1 ? left : Math.floor(line.received / pallets / line.item.caseQty) * line.item.caseQty
        left -= qty
        t += int(3, 7) * MIN
        receipts.push({ id: 0, line, lpn: lpn(lpnSeq++), qty, lot, expiry, by, at: t, door })
      }
    }
  }
  for (const po of pos) {
    if (po.status === 'CANCELLED' || latePOs.includes(po) || po === tenX || po.expected >= 0) continue
    po.status = 'CLOSED'
    for (const l of po.lines) {
      const r = rand()
      l.received = r < 0.85 ? l.ordered : r < 0.95 ? Math.max(l.item.caseQty, l.ordered - l.item.caseQty * int(1, 5)) : l.ordered + l.item.caseQty * int(1, 2)
    }
    const day = po.expected <= -2 && chance(0.1) ? po.expected + 1 : po.expected
    const night = chance(0.25)
    const by = pick(receiversOn(night ? '3RD' : '1ST', day)).id
    receive(po, T0 + day * DAY + (night ? int(30, 270) : int(390, 750)) * MIN, by)
  }
  const [poA, poB, poC] = todayPOs
  for (const po of [poA, poB]) {
    po.status = 'CLOSED'
    for (const l of po.lines) l.received = l.ordered
  }
  receive(poA, T0 + 70 * MIN, U('pfischer'))
  receive(poB, T0 + 400 * MIN, U('cromero'))
  poC.status = 'RECEIVING'
  poC.lines.forEach((l, k) => { l.received = k < 3 ? l.ordered : 0 })
  receive(poC, T0 + 665 * MIN, U('tgreene'))
  tenX.status = 'CLOSED'
  for (const l of tenX.lines) l.received = l.ordered
  receive(tenX, T0 - DAY + 550 * MIN, U('cromero'))
  const tenXBad = receipts.filter(r => r.line === tenX.lines[0])[1]
  tenXBad.qty = 4800
  tenX.lines[0].received = receipts.filter(r => r.line === tenX.lines[0]).reduce((s, r) => s + r.qty, 0)

  const nov5 = pos.find(p => p.expected === -5 && p.status === 'CLOSED')!
  const jLine = nov5.lines[0]
  const jQty = jLine.item.caseQty * int(10, 20)
  jLine.ordered += jQty
  jLine.received += jQty
  const jAt = T0 - 5 * DAY + 640 * MIN
  const [jLot, jExp] = lotFor(jLine.item, jAt)
  const jortizReceipt: Receipt = { id: 0, line: jLine, lpn: lpn(lpnSeq++), qty: jQty, lot: jLot, expiry: jExp, by: U('jortiz'), at: jAt, door: 2 }
  receipts.push(jortizReceipt)

  pos.sort((a, b) => a.created - b.created || a.expected - b.expected || a.vendor - b.vendor)
  pos.forEach((po, i) => { po.id = i + 1; po.no = `PO-${4500101 + i}` })
  let poLineSeq = 0
  for (const po of pos) for (const l of po.lines) l.id = ++poLineSeq
  receipts.sort((a, b) => a.at - b.at)
  receipts.forEach((r, i) => { r.id = 1001 + i })

  // ---------- putaway tasks
  const putawayOf = new Map<Receipt, Task>()
  const backlogCut = T0 + 645 * MIN
  for (const r of receipts) {
    const t: Task = { id: 0, type: 'PUTAWAY', status: 'DONE', item: r.line.item, from: r.door, to: null, qty: r.qty, done: r.qty, wave: null, line: null, receipt: r, user: null, created: r.at, started: null, completed: null }
    tasks.push(t)
    putawayOf.set(r, t)
    if (r === jortizReceipt) { t.status = 'IN_PROGRESS'; t.user = U('jortiz'); t.started = r.at + 12 * MIN; t.done = 0; continue }
    if (r.at >= backlogCut) { t.status = 'OPEN'; t.done = 0; continue }
    const night = new Date(r.at).getUTCHours() < 6
    t.user = U(pick(night ? ['srossi', 'kdoyle', 'pfischer'] : ['aobi', 'enavarro', 'cromero', 'tgreene']))
    t.started = r.at + int(5, 50) * MIN
    t.completed = t.started + int(3, 10) * MIN
  }
  const backlog = receipts.filter(r => r.at >= backlogCut)
  if (backlog[0]) { const t = putawayOf.get(backlog[0])!; t.status = 'IN_PROGRESS'; t.user = U('aobi'); t.started = T0 + 13 * HOUR + 50 * MIN }
  if (backlog[1]) { const t = putawayOf.get(backlog[1])!; t.status = 'ASSIGNED'; t.user = U('aobi') }

  // ---------- planted inventory choices
  const alloc = new Map<Item, number>()
  for (const t of tasks) if (t.type === 'PICK' && ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(t.status)) alloc.set(t.item, (alloc.get(t.item) ?? 0) + t.qty)
  const EXPLICIT = new Set(['10105', '10513', '10115', '10204', '10109', '10103', '10102', '10213', '10106'])
  const taken = new Set<Face>()
  const freeFaces = shuffle(faces.filter(f => !alloc.has(f.item) && f.loc.status === 'ACTIVE' && !EXPLICIT.has(f.item.sku) && f.item !== reslot))
  const takeFace = (ok: (f: Face) => boolean) => {
    const f = freeFaces.find(x => !taken.has(x) && ok(x))!
    taken.add(f)
    return f
  }
  const neg1 = takeFace(f => !f.item.lot && f.item.caseQty >= 6)
  const neg2 = takeFace(f => !f.item.lot)
  const fefo = takeFace(f => f.item.cat === 'SNACKS' && f.min >= 12)
  const below = [fefo, ...Array.from({ length: 9 }, () => takeFace(f => f.min >= 2))]
  const empty = Array.from({ length: 4 }, () => takeFace(() => true))
  const over = Array.from({ length: 3 }, () => takeFace(f => f.min >= 4))
  const expFaces = Array.from({ length: 7 }, () => takeFace(f => f.item.lot && f.item.shelf! <= 450))
  const plantedExpiry = new Map<Face, number>()
  const dayAt = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
  ;[dayAt(2026, 11, 10), dayAt(2026, 11, 18), dayAt(2026, 11, 25), dayAt(2026, 12, 4), dayAt(2026, 12, 8), dayAt(2026, 11, 3), dayAt(2026, 11, 8)]
    .forEach((ms, k) => plantedExpiry.set(expFaces[k], ms))
  const lotFromExpiry = (it: Item, expiry: number) => `L${yymmdd(expiry - it.shelf! * DAY)}${letter()}`

  const inv: Inv[] = []
  for (const f of faces) {
    if (empty.includes(f)) continue
    const it = f.item
    let qty = int(f.min, f.max)
    let a = alloc.get(it) ?? 0
    if (below.includes(f)) qty = int(1, f.min - 1)
    if (f === neg1) qty = -6
    if (f === neg2) qty = -2
    if (over.includes(f)) { qty = int(0, f.min - 1); a = qty + it.caseQty * int(1, 2) }
    else if (a > 0 && qty < a) qty = a + int(0, it.caseQty)
    let lot: string | null = null
    let expiry: number | null = null
    if (it.lot) {
      const planted = plantedExpiry.get(f)
      if (planted !== undefined) { expiry = planted; lot = lotFromExpiry(it, planted) }
      else { const prod = T0 - int(10, 50) * DAY; lot = `L${yymmdd(prod)}${letter()}`; expiry = prod + it.shelf! * DAY }
    }
    inv.push({ id: 0, item: it, loc: f.loc, lpn: null, lot, expiry, qty, alloc: a, status: 'AVAILABLE', received: null })
  }

  // ---------- reserve pallets
  const rsvFree = shuffle(rsvAll)
  let rsvNext = 0
  const takeRsv = () => rsvFree[rsvNext++]
  let oldLpn = 9880001
  const olderPallet = (it: Item, expiry?: number, status = 'AVAILABLE', lotOverride?: string) => {
    const received = T0 - int(15, 40) * DAY - int(0, 600) * MIN
    let lot: string | null = null
    let exp: number | null = null
    if (it.lot) {
      if (expiry !== undefined) { exp = expiry; lot = lotFromExpiry(it, expiry) }
      else { const prod = received - int(5, 20) * DAY; lot = `L${yymmdd(prod)}${letter()}`; exp = prod + it.shelf! * DAY }
    }
    if (lotOverride) lot = lotOverride
    inv.push({ id: 0, item: it, loc: takeRsv(), lpn: lpn(oldLpn++), lot, expiry: exp, qty: it.caseQty * int(10, 30), alloc: 0, status, received })
  }
  olderPallet(SKU('10105'))
  olderPallet(SKU('10105'))
  for (const ms of [dayAt(2027, 1, 14), dayAt(2027, 2, 2), dayAt(2027, 3, 9)]) olderPallet(fefo.item, ms)
  olderPallet(fefo.item, dayAt(2027, 1, 5), 'HOLD')
  const recall = SKU('10513')
  const recallExpiry = dayAt(2026, 9, 15) + recall.shelf! * DAY
  olderPallet(recall, recallExpiry, 'HOLD', 'L260915B')
  olderPallet(recall, recallExpiry, 'HOLD', 'L260915B')
  olderPallet(SKU('10115'), dayAt(2026, 11, 20))
  olderPallet(SKU('10204'), dayAt(2026, 12, 1))
  olderPallet(SKU('10109'), dayAt(2026, 12, 10))
  olderPallet(SKU('10103'), dayAt(2026, 12, 11))
  olderPallet(SKU('10102'), dayAt(2026, 10, 30))
  olderPallet(SKU('10213'), dayAt(2026, 11, 9))
  olderPallet(SKU('10603'))
  const keepOut = new Set([...EXPLICIT, fefo.item.sku])
  const donePutaways = tasks.filter(t => t.type === 'PUTAWAY' && t.status === 'DONE').sort((a, b) => b.completed! - a.completed!)
  let kept = 0
  for (const t of donePutaways) {
    const r = t.receipt!
    if (kept < 70 && !keepOut.has(r.line.item.sku) && r !== tenXBad) {
      const loc = takeRsv()
      t.to = loc.id
      kept++
      const qty = chance(0.3) ? Math.max(r.line.item.caseQty, r.qty - r.line.item.caseQty * int(1, 10)) : r.qty
      inv.push({ id: 0, item: r.line.item, loc, lpn: r.lpn, lot: r.lot, expiry: r.expiry, qty, alloc: 0, status: 'AVAILABLE', received: r.at })
    } else t.to = pick(rsvAll).id
  }
  while (rsvNext < 100) {
    const it = pickItem()
    if (!keepOut.has(it.sku)) olderPallet(it)
  }
  for (const r of receipts) {
    const t = putawayOf.get(r)!
    if (t.status === 'DONE') continue
    t.to = takeRsv().id
    inv.push({ id: 0, item: r.line.item, loc: locs[r.door - 1], lpn: r.lpn, lot: r.lot, expiry: r.expiry, qty: r.qty, alloc: 0, status: 'AVAILABLE', received: r.at })
  }
  for (let n = 1; n <= 6; n++) {
    let it = pickItem()
    while (keepOut.has(it.sku)) it = pickItem()
    const received = T0 - int(2, 10) * DAY - int(0, 600) * MIN
    const [lot, expiry] = lotFor(it, received)
    inv.push({ id: 0, item: it, loc: L(`QA-${p2(n)}`), lpn: lpn(oldLpn++), lot, expiry, qty: it.caseQty * int(1, 6), alloc: 0, status: n < 6 ? 'HOLD' : 'DAMAGED', received })
  }
  inv.sort((a, b) => a.loc.id - b.loc.id || a.item.id - b.item.id)
  inv.forEach((row, i) => { row.id = i + 1 })

  // ---------- replenishment tasks
  for (let d = -14; d <= 0; d++) {
    const night = ['srossi', 'kdoyle', ...(d <= -4 ? ['tbarnes'] : [])]
    const add = (created: number, user: string) => {
      const it = pickItem()
      const qty = it.caseQty * int(2, 6)
      const started = created + int(5, 30) * MIN
      tasks.push({ id: 0, type: 'REPLEN', status: 'DONE', item: it, from: pick(rsvAll).id, to: faceByItem.get(it)!.loc.id, qty, done: qty, wave: null, line: null, receipt: null, user: U(user), created, started, completed: started + int(4, 12) * MIN })
    }
    const n = int(10, 16)
    for (let k = 0; k < n; k++) add(T0 + d * DAY + int(15, 330) * MIN, pick(night))
    const n1 = int(2, 5)
    for (let k = 0; k < n1; k++) {
      const created = T0 + d * DAY + int(480, 780) * MIN
      if (created + 45 * MIN < NOW) add(created, 'aobi')
    }
    if (d < 0) {
      const n2 = int(2, 5)
      for (let k = 0; k < n2; k++) add(T0 + d * DAY + int(900, 1320) * MIN, 'wturner')
    }
  }
  for (const m of [260, 275]) {
    const it = pickItem()
    tasks.push({ id: 0, type: 'REPLEN', status: 'ASSIGNED', item: it, from: pick(rsvAll).id, to: faceByItem.get(it)!.loc.id, qty: it.caseQty * 4, done: 0, wave: null, line: null, receipt: null, user: U('tbarnes'), created: T0 - 4 * DAY + m * MIN, started: null, completed: null })
  }
  for (const f of [fefo, below[1]]) {
    const row = inv.find(r => r.loc === f.loc)!
    const fromRow = inv.find(r => r.item === f.item && r.loc.zone === 'RSV' && r.status === 'AVAILABLE')
    const qty = Math.floor((f.max - row.qty) / f.item.caseQty) * f.item.caseQty
    tasks.push({ id: 0, type: 'REPLEN', status: 'OPEN', item: f.item, from: fromRow ? fromRow.loc.id : pick(rsvAll).id, to: f.loc.id, qty, done: 0, wave: null, line: null, receipt: null, user: null, created: T0 + 13 * HOUR + 20 * MIN, started: null, completed: null })
  }
  const typeRank: Record<string, number> = { PUTAWAY: 0, REPLEN: 1, PICK: 2 }
  tasks.sort((a, b) => a.created - b.created || typeRank[a.type] - typeRank[b.type] || (a.line?.id ?? 0) - (b.line?.id ?? 0) || (a.receipt?.id ?? 0) - (b.receipt?.id ?? 0))
  tasks.forEach((t, i) => { t.id = i + 1 })

  // ---------- cycle counts
  const counts: Count[] = []
  const icqaDay = [U('fnoor'), U('kbanks')]
  const activeFaces = shuffle(faces.filter(f => f.loc.status === 'ACTIVE'))
  const overdue = activeFaces.slice(0, 12)
  const yday = activeFaces.slice(12, 32)
  const openToday = activeFaces.slice(32, 40)
  const rest = [...activeFaces.slice(40), ...faces.filter(f => f.loc.status !== 'ACTIVE')]
  const qtyAt = (f: Face) => inv.find(r => r.loc === f.loc)?.qty ?? 0
  const approved = (f: Face, day: number) => {
    const night = chance(0.2)
    const at = T0 + day * DAY + (night ? int(60, 300) : int(420, 840)) * MIN
    const system = int(Math.max(0, f.min - f.item.caseQty), f.max)
    const counted = chance(0.85) ? system : Math.max(0, system + pick([-3, -2, -1, 1, 2, 3]))
    counts.push({ loc: f.loc, item: f.item, status: 'APPROVED', system, counted, by: night ? U('jpark') : pick(icqaDay), created: at - int(30, 240) * MIN, at })
  }
  for (const f of rest) {
    const n = int(1, 2)
    for (let k = 0; k < n; k++) approved(f, int(-28, -2))
  }
  overdue.slice(0, 8).forEach(f => approved(f, int(-66, -33)))
  for (const f of openToday) approved(f, int(-28, -2))
  const VARIANCE = [20, -12, -8, 5, -3, 2, -1]
  yday.forEach((f, k) => {
    const at = T0 - DAY + int(420, 780) * MIN
    const v = k < VARIANCE.length ? VARIANCE[k] : 0
    const system = Math.max(int(f.min, f.max), 12 + int(0, 20))
    counts.push({ loc: f.loc, item: f.item, status: v === 20 ? 'RECOUNT' : 'COUNTED', system, counted: system + v, by: pick(icqaDay), created: at - int(30, 120) * MIN, at })
  })
  for (const f of openToday) counts.push({ loc: f.loc, item: f.item, status: 'OPEN', system: qtyAt(f), counted: null, by: null, created: T0 + 6 * HOUR, at: null })
  counts.sort((a, b) => a.created - b.created || a.loc.id - b.loc.id)

  // ---------- adjustments
  const adjusts: Txn[] = []
  const REASONS: [string, number, number, number][] = [['DAMAGED', 12, -6, -1], ['CYCLE_COUNT', 14, -12, 12], ['FOUND', 7, 1, 10], ['EXPIRED', 6, -48, -12], ['MISSING', 6, -8, -1]]
  for (const [reason, n, lo, hi] of REASONS) for (let k = 0; k < n; k++) {
    const f = pick(faces)
    let qty = 0
    while (qty === 0) qty = int(lo, hi)
    const d = int(-14, 0)
    const minute = d === 0 ? int(370, 480) : d === -7 ? int(900, 1200) : int(420, 900)
    adjusts.push({ type: 'ADJUST', item: f.item, loc: f.loc.id, lot: null, qty, reason, ref: null, user: U(pick(['fnoor', 'kbanks', 'lwalsh'])), at: T0 + d * DAY + minute * MIN })
  }
  const weekStart = T0 - 7 * DAY
  for (let guard = 0; guard < 50; guard++) {
    const sums = REASONS.map(([reason]) => adjusts.filter(a => a.reason === reason && a.at >= weekStart).reduce((s, a) => s + a.qty, 0))
    const dup = sums.findIndex((s, i) => sums.indexOf(s) !== i)
    if (dup < 0) break
    const a = adjusts.find(x => x.reason === REASONS[dup][0] && x.at >= weekStart)!
    a.qty += a.qty < 0 ? -1 : 1
  }

  // ---------- transactions
  // Picks of lot-controlled items record the lot they took. The recalled lot sat in its pick face until Nov 4.
  const RECALL_LOT = 'L260915B'
  const recallSwitch = T0 - 6 * DAY
  const faceLot = new Map(faces.map(f => [f.item, inv.find(r => r.loc === f.loc)?.lot ?? null]))
  const pickLot = (t: Task) => (!t.item.lot ? null : t.item === recall && t.completed! < recallSwitch ? RECALL_LOT : faceLot.get(t.item) ?? null)
  const txns: Txn[] = [...adjusts]
  for (const r of receipts) txns.push({ type: 'RECEIVE', item: r.line.item, loc: r.door, lot: r.lot, qty: r.qty, reason: null, ref: r.line.po.no, user: r.by, at: r.at })
  for (const t of tasks) {
    if (t.type === 'PUTAWAY' && t.status === 'DONE') txns.push({ type: 'PUTAWAY', item: t.item, loc: t.to, lot: t.receipt!.lot, qty: t.qty, reason: null, ref: t.receipt!.lpn, user: t.user, at: t.completed! })
    if (t.type === 'REPLEN' && t.status === 'DONE') txns.push({ type: 'REPLEN', item: t.item, loc: t.to, lot: null, qty: t.qty, reason: null, ref: null, user: t.user, at: t.completed! })
    if (t.type === 'PICK' && finished(t) && t.done > 0) txns.push({ type: 'PICK', item: t.item, loc: t.from, lot: pickLot(t), qty: -t.done, reason: null, ref: t.line!.order.no, user: t.user, at: t.completed! })
  }
  txns.sort((a, b) => a.at - b.at || a.item.id - b.item.id)

  // ---------- interface messages (last 7 days)
  const msgs: Msg[] = []
  const H0 = T0 - 7 * DAY
  for (const o of orders) if (o.orderedAt >= H0) msgs.push({ dir: 'IN', type: 'ORDER', ref: o.no, status: 'PROCESSED', err: null, created: o.orderedAt - 3000, processed: o.orderedAt })
  for (const po of pos) {
    const c = T0 + po.created * DAY + int(480, 960) * MIN
    if (c >= H0 && c <= NOW) msgs.push({ dir: 'IN', type: 'PO', ref: po.no, status: 'PROCESSED', err: null, created: c, processed: c + 4000 })
  }
  const shipMsgs = new Map<Order, Msg>()
  for (const o of orders) if (o.shippedAt && o.shippedAt >= H0) {
    const c = o.shippedAt + int(1, 5) * MIN
    const m: Msg = { dir: 'OUT', type: 'SHIP_CONFIRM', ref: o.no, status: 'PROCESSED', err: null, created: c, processed: c + 2000 }
    msgs.push(m)
    shipMsgs.set(o, m)
  }
  for (const po of pos) {
    if (po.status !== 'CLOSED') continue
    const last = Math.max(...receipts.filter(r => r.line.po === po).map(r => r.at))
    if (last >= H0) {
      const c = last + int(5, 30) * MIN
      msgs.push({ dir: 'OUT', type: 'RECEIPT_CONFIRM', ref: po.no, status: 'PROCESSED', err: null, created: c, processed: c + 3000 })
    }
  }
  msgs.push({ dir: 'IN', type: 'ITEM', ref: '10518', status: 'PROCESSED', err: null, created: T0 + 11 * HOUR + 20 * MIN, processed: T0 + 11 * HOUR + 20 * MIN + 2000 })
  for (let k = 0; k < 3; k++) {
    const c = H0 + int(1, 6) * DAY + int(480, 960) * MIN
    msgs.push({ dir: 'IN', type: 'ITEM', ref: pick(sellable).sku, status: 'PROCESSED', err: null, created: c, processed: c + 2000 })
  }
  const lastNo = 104201 + orders.length
  ;[492, 543, 587, 631].forEach((m, k) => msgs.push({ dir: 'IN', type: 'ORDER', ref: `SO-${lastNo + 7 + k * 3}`, status: 'ERROR', err: 'Unknown item 10518', created: T0 + m * MIN, processed: null }))
  ;[[-5, 612], [-1, 940]].forEach(([d, m]) => {
    const near = orders.filter(o => o.orderedAt < T0 + d * DAY + m * MIN).pop()!
    msgs.push({ dir: 'IN', type: 'ORDER', ref: near.no, status: 'ERROR', err: 'Duplicate order number', created: T0 + d * DAY + m * MIN, processed: null })
  })
  ;[[-6, 785], [-4, 584], [-2, 1100]].forEach(([d, m], k) => msgs.push({ dir: 'IN', type: 'ORDER', ref: `SO-${lastNo + 31 + k * 4}`, status: 'ERROR', err: 'Invalid ship-to address', created: T0 + d * DAY + m * MIN, processed: null }))
  const nov6Ships = shuffle([...shipMsgs.entries()].filter(([o]) => o.shippedAt! >= T0 - 4 * DAY && o.shippedAt! < T0 - 3 * DAY && o.carrier.startsWith('PL'))).slice(0, 5)
  for (const [, m] of nov6Ships) {
    m.status = 'ERROR'
    m.err = 'Timeout calling ERP'
    m.processed = null
    msgs.push({ dir: 'OUT', type: 'SHIP_CONFIRM', ref: m.ref, status: 'PROCESSED', err: null, created: m.created + 25 * MIN, processed: m.created + 25 * MIN + 2000 })
  }
  ;[0, 1].forEach(k => msgs.push({ dir: 'IN', type: 'PO', ref: `PO-${4509901 + k}`, status: 'ERROR', err: 'Unknown vendor 19', created: T0 - 3 * DAY + (510 + k) * MIN, processed: null }))
  msgs.sort((a, b) => a.created - b.created || a.ref.localeCompare(b.ref))

  // ---------- ERP stock
  // The ERP's count per SKU matches the WMS total, except where something went wrong: a negative WMS row
  // (the ERP never went below 0), adjustments that never reached it, stock it still thinks sits in an
  // empty face, and a discontinued item it already dropped (10603 is inactive, so it's left out).
  const rowsOf = (it: Item) => inv.filter(r => r.item === it)
  const erp = new Map<Item, number>()
  for (const it of items) if (it.active) erp.set(it, rowsOf(it).reduce((n, r) => n + Math.max(0, r.qty), 0))
  const steady = items
    .filter(it => it.active && rowsOf(it).length > 0 && rowsOf(it).every(r => r.qty >= 0) && !keepOut.has(it.sku) && it !== reslot)
    .sort((a, b) => a.sku.localeCompare(b.sku))
  for (const [k, cases] of [[7, 1], [23, 1], [41, 2], [56, -1]]) erp.set(steady[k], erp.get(steady[k])! + cases * steady[k].caseQty)
  const ghostFace = empty.find(f => rowsOf(f.item).length === 0)
  if (ghostFace) erp.set(ghostFace.item, ghostFace.item.caseQty * 2)

  // ---------- SQL
  const q = (v: unknown): string => v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`
  const out: string[] = []
  const insert = (table: string, cols: string, rows: unknown[][]) => {
    for (let i = 0; i < rows.length; i += 400) out.push(`INSERT INTO ${table} (${cols}) VALUES\n${rows.slice(i, i + 400).map(r => '(' + r.map(q).join(', ') + ')').join(',\n')};`)
  }
  insert('zones', 'zone_code, zone_name, zone_type', [
    ['RCV', 'Receiving Dock', 'DOCK'], ['RSV', 'Reserve Racking', 'RESERVE'], ['FPA', 'Forward Pick Area', 'PICK'],
    ['QAH', 'Quality Hold Cage', 'HOLD'], ['STG', 'Outbound Staging', 'STAGE'], ['SHP', 'Shipping Dock', 'DOCK'],
  ])
  insert('locations', 'location_id, location_code, zone_code, aisle, bay, level, loc_type, status, barcode', locs.map(l => [l.id, l.code, l.zone, l.aisle, l.bay, l.level, l.type, l.status, l.barcode]))
  insert('vendors', 'vendor_id, vendor_name, city, state, lead_time_days', VENDORS)
  insert('items', 'item_id, sku, description, category, vendor_id, case_qty, unit_cost, weight_lb, lot_controlled, shelf_life_days, created_on, active', items.map(i => [i.id, i.sku, i.desc, i.cat, i.vendor, i.caseQty, i.cost, i.weight, i.lot, i.shelf, i.created, i.active]))
  insert('customers', 'customer_id, customer_name, customer_type, city, state', customers.map(c => [c.id, c.name, c.type, c.city, c.state]))
  insert('carriers', 'carrier_code, carrier_name, mode, departs_at', CARRIERS)
  insert('users', 'user_id, username, full_name, job_role, shift, hired_on, active', users.map(u => [u.id, u.username, u.name, u.role, u.shift, u.hired, u.active]))
  insert('waves', 'wave_id, wave_no, status, planned_for, released_at, released_by', waves.map(w => [w.id, w.no, w.status, ts(w.plannedFor), ts(w.releasedAt), w.releasedBy]))
  insert('orders', 'order_id, order_no, customer_id, carrier_code, priority, status, ordered_at, ship_by, wave_id, shipped_at, tracking_no', orders.map(o => [o.id, o.no, o.cust.id, o.carrier, o.priority, o.status, ts(o.orderedAt), dt(T0 + o.shipBy * DAY), o.wave?.id ?? null, ts(o.shippedAt), o.tracking]))
  insert('order_lines', 'order_line_id, order_id, line_no, item_id, qty_ordered, qty_picked, qty_shipped', orders.flatMap(o => o.lines.map(l => [l.id, o.id, l.lineNo, l.item.id, l.qty, l.picked, l.shipped])))
  insert('purchase_orders', 'po_id, po_no, vendor_id, status, created_on, expected_date', pos.map(p => [p.id, p.no, p.vendor, p.status, dt(T0 + p.created * DAY), dt(T0 + p.expected * DAY)]))
  insert('po_lines', 'po_line_id, po_id, line_no, item_id, qty_ordered, qty_received', pos.flatMap(p => p.lines.map(l => [l.id, p.id, l.lineNo, l.item.id, l.ordered, l.received])))
  insert('receipts', 'receipt_id, po_line_id, lpn, qty, lot_no, expiry_date, received_by, received_at', receipts.map(r => [r.id, r.line.id, r.lpn, r.qty, r.lot, dt(r.expiry), r.by, ts(r.at)]))
  insert('tasks', 'task_id, task_type, status, item_id, from_location_id, to_location_id, qty, qty_done, wave_id, order_line_id, receipt_id, assigned_to, created_at, started_at, completed_at', tasks.map(t => [t.id, t.type, t.status, t.item.id, t.from, t.to, t.qty, t.done, t.wave?.id ?? null, t.line?.id ?? null, t.receipt?.id ?? null, t.user, ts(t.created), ts(t.started), ts(t.completed)]))
  insert('inventory', 'inv_id, item_id, location_id, lpn, lot_no, expiry_date, qty_on_hand, qty_allocated, inv_status, received_at', inv.map(r => [r.id, r.item.id, r.loc.id, r.lpn, r.lot, dt(r.expiry), r.qty, r.alloc, r.status, ts(r.received)]))
  insert('pick_faces', 'location_id, item_id, min_qty, max_qty', faces.slice().sort((a, b) => a.loc.id - b.loc.id).map(f => [f.loc.id, f.item.id, f.min, f.max]))
  insert('cycle_counts', 'count_id, location_id, item_id, status, system_qty, counted_qty, counted_by, created_at, counted_at', counts.map((c, i) => [i + 1, c.loc.id, c.item.id, c.status, c.system, c.counted, c.by, ts(c.created), ts(c.at)]))
  insert('inventory_txns', 'txn_id, txn_type, item_id, location_id, lot_no, qty, reason_code, ref_no, user_id, created_at', txns.map((x, i) => [i + 1, x.type, x.item.id, x.loc, x.lot, x.qty, x.reason, x.ref, x.user, ts(x.at)]))
  insert('host_messages', 'msg_id, direction, msg_type, ref_no, status, error_text, created_at, processed_at', msgs.map((m, i) => [880001 + i, m.dir, m.type, m.ref, m.status, m.err, ts(m.created), ts(m.processed)]))
  insert('erp_inventory', 'sku, qty_on_hand', [...erp].sort((a, b) => a[0].sku.localeCompare(b[0].sku)).map(([it, n]) => [it.sku, n]))
  for (const [table, col] of [['inventory', 'inv_id'], ['tasks', 'task_id'], ['cycle_counts', 'count_id'], ['inventory_txns', 'txn_id']]) {
    out.push(`SELECT setval(pg_get_serial_sequence('${table}', '${col}'), (SELECT max(${col}) FROM ${table}));`)
  }
  cachedSql = out.join('\n')

  const negRow = inv.find(r => r.loc === neg1.loc)!
  const amb = orders.filter(o => o.status === 'SHIPPED' && o.shipBy === -1 && o.lines.length === 5)[0]
  cachedFacts = {
    negSku: neg1.item.sku, negLoc: neg1.loc.code, negInvId: negRow.id, negItemId: neg1.item.id, negLocId: neg1.loc.id,
    fefoSku: fefo.item.sku,
    receiptId: tenXBad.id, receiptLineId: tenX.lines[0].id,
    ambOrderNo: amb.no, ambOrderId: amb.id,
    reslotSku: reslot.sku, reslotFrom: far.code,
    borrowed: borrowed.length,
    stuck: stuck.map(o => o.no).join(', '),
    w2Orders: orders.filter(o => o.wave === W(0, 2)).length,
    w2Lines: orders.filter(o => o.wave === W(0, 2)).reduce((n, o) => n + o.lines.length, 0),
    waiting: orders.filter(o => o.status === 'NEW').length,
  }
}
