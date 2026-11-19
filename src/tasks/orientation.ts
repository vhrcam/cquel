import type { Track } from './types.ts'

export const orientation: Track = {
  id: 'orientation',
  name: 'Orientation',
  role: "Every WMS job starts here. The warehouse is a building full of locations, and the database tracks what sits in each one, how many, and what work is happening to it. Look around before you change anything.",
  tasks: [
    {
      id: 'or-zones',
      title: 'Look around',
      kind: 'query',
      skills: ['SELECT'],
      learn: "A database is a set of **tables**. A table is a grid, like a spreadsheet: each **row** is one thing (one zone, one item, one order) and each **column** is one fact about it. You ask the database questions with a **query**, written in SQL.\n\nThe simplest query is `SELECT * FROM zones;`. It says: show every column (`*`) of every row in the zones table.\n\nHow to practice here: the transparent letters are the answer. Type over them and the query runs when you finish. Then switch the letters off and write it from memory. The reference explains each word as you type it.",
      prompt: "The building is split into zones: dock doors, reserve racking, the forward pick area and a few more. Show everything in the `zones` table.",
      returns: 'every column of zones',
      tables: ['zones'],
      solution: `SELECT *
FROM zones;`,
      note: "`SELECT *` is fine for a quick look. In a saved report, name the columns, so the report keeps working when someone adds a column.",
    },
    {
      id: 'or-columns',
      title: 'Pick your columns',
      kind: 'query',
      skills: ['SELECT'],
      learn: "Instead of `*`, list the columns you want, with commas between them. They come back in the order you list them. The schema tab on the left shows every table's columns.",
      prompt: "List every item's number and name. In a WMS the item number is the `sku`.",
      returns: 'sku, description',
      tables: ['items'],
      solution: `SELECT sku, description
FROM items;`,
    },
    {
      id: 'or-where',
      title: 'Filter with WHERE',
      kind: 'query',
      skills: ['WHERE'],
      learn: "**WHERE** keeps only the rows that pass a test. Postgres checks the test on every row: `WHERE status = 'LOCKED'` keeps a location only if its status is LOCKED.\n\nText values go in single quotes. Numbers don't: `WHERE aisle = 3`.",
      prompt: "A location gets LOCKED when something is wrong with it, like a damaged rack or a spill, so nobody puts stock there. Find every LOCKED location.",
      returns: 'location_code, zone_code',
      tables: ['locations'],
      solution: `SELECT location_code, zone_code
FROM locations
WHERE status = 'LOCKED';`,
      note: "Text values go in single quotes, and they're case-sensitive: 'LOCKED' and 'locked' are different values.",
    },
    {
      id: 'or-and',
      title: 'Two conditions',
      kind: 'query',
      skills: ['WHERE', 'AND'],
      learn: "**AND** adds a second test. A row has to pass both to stay, so every AND makes the result smaller.",
      prompt: "Show the reserve locations (zone `RSV`) in aisle 3.",
      returns: 'location_code, bay, level',
      tables: ['locations'],
      solution: `SELECT location_code, bay, level
FROM locations
WHERE zone_code = 'RSV'
  AND aisle = 3;`,
    },
    {
      id: 'or-order',
      title: 'Sort with ORDER BY',
      kind: 'query',
      skills: ['ORDER BY'],
      learn: "Rows come back in no set order unless you ask for one. **ORDER BY** sorts them, smallest or A first by default. Add `DESC` for biggest first. A second column breaks ties: `ORDER BY unit_cost DESC, sku`.",
      prompt: "List the PET items from most to least expensive (`unit_cost`). When two cost the same, sort them by sku.",
      returns: 'sku, description, unit_cost · most expensive first, then sku',
      tables: ['items'],
      solution: `SELECT sku, description, unit_cost
FROM items
WHERE category = 'PET'
ORDER BY unit_cost DESC, sku;`,
    },
    {
      id: 'or-limit',
      title: 'Top 5',
      kind: 'query',
      skills: ['ORDER BY', 'LIMIT'],
      learn: "**LIMIT 5** stops after 5 rows. Sort first, so the 5 you get are the 5 you want.",
      prompt: "Heavy items belong on the bottom rack level. Find the 5 heaviest items (`weight_lb`).",
      returns: 'sku, description, weight_lb · heaviest first',
      tables: ['items'],
      solution: `SELECT sku, description, weight_lb
FROM items
ORDER BY weight_lb DESC
LIMIT 5;`,
    },
    {
      id: 'or-count',
      title: 'Count rows',
      kind: 'query',
      skills: ['COUNT'],
      learn: "`COUNT(*)` counts rows instead of showing them, and gives back one number. With a WHERE, it counts only the rows that pass.",
      prompt: "How many WMS users are active right now? `active` is true or false.",
      returns: 'one number: how many active users',
      tables: ['users'],
      solution: `SELECT COUNT(*)
FROM users
WHERE active = true;`,
      note: "`WHERE active` works too, because the column is already true or false.",
    },
    {
      id: 'or-distinct',
      title: 'One of each',
      kind: 'query',
      skills: ['DISTINCT'],
      learn: "**DISTINCT** removes repeated rows, so each value shows up once. A building with twenty pickers has one PICKER row.",
      prompt: "What job roles does this building have? One row per role, A to Z.",
      returns: 'job_role · A to Z',
      tables: ['users'],
      solution: `SELECT DISTINCT job_role
FROM users
ORDER BY job_role;`,
    },
    {
      id: 'or-like',
      title: 'Search with LIKE',
      kind: 'query',
      skills: ['LIKE'],
      learn: "**LIKE** matches a pattern instead of an exact value. `%` means “anything here”, so `'%Dog%'` matches Dog anywhere in the text, and `'Dog%'` only at the start.",
      prompt: "A store is asking about dog products. Find every item with 'Dog' anywhere in its description.",
      returns: 'sku, description',
      tables: ['items'],
      solution: `SELECT sku, description
FROM items
WHERE description LIKE '%Dog%';`,
      note: "`%` matches any run of characters. `ILIKE` does the same match but ignores upper and lower case (that one is Postgres only).",
    },
    {
      id: 'or-group',
      title: 'Count by group',
      kind: 'query',
      skills: ['GROUP BY', 'COUNT'],
      learn: "**GROUP BY** squashes rows into one row per value. Put `COUNT(*)` beside it and you get a count for each group: one row per zone, with how many locations it has.",
      prompt: "How many locations does each zone have?",
      returns: 'zone_code, locations · most first, then zone_code',
      tables: ['locations'],
      solution: `SELECT zone_code, COUNT(*) AS locations
FROM locations
GROUP BY zone_code
ORDER BY locations DESC, zone_code;`,
      note: "`AS locations` names the column, and you can sort by that name.",
    },
    {
      id: 'or-join',
      title: 'Join tables',
      kind: 'query',
      skills: ['JOIN'],
      learn: "Most tables store ids instead of names, so each name is kept in one place. `inventory` says item 37 is in location 112. A **JOIN** looks those ids up in another table, matching `inventory.item_id` to `items.item_id`, so you can show the SKU and the location code instead.\n\n`ON` says which columns match. The schema tab marks them: PK is a table's own id, and → shows which table an id points at.",
      prompt: "`inventory` only stores ids (`item_id`, `location_id`). Join `items` and `locations` to see where SKU 10105 is stored.",
      returns: 'location_code, lot_no, qty_on_hand · by location_code',
      tables: ['inventory', 'items', 'locations'],
      solution: `SELECT l.location_code, inv.lot_no, inv.qty_on_hand
FROM inventory inv
JOIN items i ON i.item_id = inv.item_id
JOIN locations l ON l.location_id = inv.location_id
WHERE i.sku = '10105'
ORDER BY l.location_code;`,
      note: "The short names after each table (inv, i, l) are aliases. `ON` says which columns match up between two tables.",
    },
  ],
}
