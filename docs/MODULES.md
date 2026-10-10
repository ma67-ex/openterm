# Adding a feature module

Each feature is a self-contained module. Modules never edit each other's files.

## Frontend: `public/mods/<name>.js`

Import helpers from `../core.js`: `$, esc, fmt, cls, sgn, vol, hhmm, msg, getJSON, status, workspace, panelBody, canvas, registerCommand, registerWidget, openWidget, mountWidget, useSnap, loadCSS`.

- `registerCommand('EQS', { help: 'EQS  equity screener', run(args) {} })`. The command bar accepts `NAME args` and `TICKER NAME args`; `run` gets the remaining upper-cased tokens (ticker first).
- `registerWidget('screener', { title, hint, render(box, args) {} })` makes a view that pages and commands can both place in any panel. Commands usually call `openWidget(id, args)`.
- `useSnap(['mykey'], (data) => {})` requests extra snapshot keys from `/api/snap` and gets called after each refresh (about once a minute).
- Module CSS goes in `public/mods/<name>.css`, loaded with `loadCSS(new URL('./<name>.css', import.meta.url))`. Prefix every class with the module name.
- Register the module by adding one `import './<name>.js';` line to `public/mods/index.js`.
- Build all DOM from escaped strings (`esc`). Never put feed or API text into `innerHTML` unescaped.

## Backend, on demand: `lib/handlers/<name>.js`

`export default async (query) => ({ body, status?, cache? })`, registered with one import and one map entry in `lib/handlers/index.js`. It is served as `/api/data?fn=<name>&...`. Validate every query value. Set a long CDN cache (`s-maxage`) so repeat requests do not reach the provider. Do not add new files under `api/` (the Vercel free plan limits the number of functions).

## Backend, seeded: `seeders/groups/<name>.js`

`export default { key, when: 'weekday' | 'always', everyMin | hours, fetch: async () => rows }`, registered with one import in `seeders/groups/index.js` and read by the page with `useSnap([key], ...)`. The runner writes one JSON snapshot per group and skips the write when the data is unchanged.

Upstash budget rules for seeded groups:
1. One snapshot key per group, kept under about 30 KB. Pack many rows into one object.
2. `everyMin` of 30 or more, or `hours`, so a group never runs on every 10-minute cron tick. Slow data (macro, filings) runs once or twice a day.
3. Anything a user asks for by ticker belongs in an on-demand handler with a CDN cache, not in a seeded group.

## Rules

- Free sources only. No paid keys. Keys that are free (FRED, in `process.env.FRED_API_KEY`) are fine; never read or print `.env`.
- No personal contact details anywhere in code, comments or headers.
- No new npm dependencies.
