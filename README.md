# cquel

`//cquel` · fill in the transparent letters to train the brain.

cquel is for practicing SQL on a sample warehouse management system (WMS) database. Each task shows its answer query as transparent letters. Type over them to learn how the query is built, then switch the letters off and write it from memory.

## How it works

- **A real Postgres database runs in your browser.** It uses [PGlite](https://pglite.dev) and holds one warehouse's data: locations, items, stock, purchase orders and receipts, customer orders and waves, pick, putaway and replenishment tasks, cycle counts, the inventory history and the ERP interface log.
- **The switch in the top right turns the transparent letters on or off.** With the letters on, the letters you type turn solid green, or red when they're wrong. Finishing the trace runs the query. With the letters off you write the query yourself.
- **Tasks are checked by their result, not their text.** Any query that returns the right rows passes. Column order doesn't matter, and row order only matters when the task asks for a sort. When an answer is wrong, the message says how (for example "7 rows, expected 8").
- **Each task keeps two marks:** ◐ traced with the letters on, and ● solved with the letters off.
- **The warehouse clock is frozen at one moment,** so `CURRENT_DATE` and `now()` always give the same answers.

## Tracks

There are 58 tasks in 7 tracks. Each track is built around a warehouse job, so you learn what the job does along with the SQL it needs.

| Track | The job | SQL it practices |
| --- | --- | --- |
| Orientation | Look around the database | SELECT, WHERE, ORDER BY, LIMIT, COUNT, DISTINCT, LIKE, GROUP BY, JOIN |
| Inventory Control | Keeps the system's counts matching the shelves | JOINs, date math, ABS, GROUP BY, NOT EXISTS |
| Receiving | Runs the inbound dock | Date math, intervals, GROUP BY |
| Shipping | Gets orders out the door on time | FILTER, NOT IN, ROUND |
| Replenishment & Slotting | Keeps pick faces stocked and fast movers up front | Integer division, LIMIT, CTEs, ROW_NUMBER |
| Labor & Ops | Turns WMS history into the daily numbers | EXTRACT, HAVING, SUM OVER, LAG, RANK |
| WMS Support | Fixes the system's data | UPDATE, INSERT, subqueries, foreign keys |

There are three kinds of tasks:

- **query:** answer a question from the data.
- **fix the query:** fix a broken query. It either fails with a real Postgres error or quietly returns the wrong numbers.
- **ticket:** a support ticket. Look at the data with SELECT, then fix it with UPDATE or INSERT. The checker compares whole tables, so a fix that touches extra rows fails and says how many rows it changed by mistake. **reset db** puts everything back.

## Run it

```bash
npm install
npm run dev
```

Then open the link it prints. Node 22.18 or newer is needed for the scripts below.

## Scripts

- `npm run verify` runs every task's answer against the database. It also checks that each broken query and each ticket fails before the fix and passes after.
- `npm run sql -- "SELECT * FROM zones"` runs any query against the sample database in the terminal.
- `npm run smoke` drives the built app in headless Chrome. Run `npm run build` and `npm run preview` first.
- `npm run build` type-checks and builds a static site into `dist/`.

## How it's built

- TypeScript and Vite, with no framework.
- Postgres runs in a web worker, so a runaway query gets stopped after 8 seconds without freezing the page.
- `src/db/seed.ts` builds the sample data the same way every time. Every person, store and company in it is made up.
- There's no backend and no sign-in. Progress is saved in your browser.
