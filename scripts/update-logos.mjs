// Downloads one logo per S&P 500 symbol into public/logos/ so the map serves them from our own origin with a long cache.
// Source: financialmodelingprep.com/image-stock/<TICKER>.png (keyless). Re-run with `npm run logos`; existing files are kept.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { UNIVERSE } from '../seeders/universe-list.js';
import { mapLimit } from '../lib/yahoo.js';

const dir = new URL('../public/logos/', import.meta.url);
mkdirSync(dir, { recursive: true });
const miss = [];
let got = 0;
await mapLimit(UNIVERSE, 6, async ({ s }) => {
  if (existsSync(new URL(`${s}.png`, dir))) return;
  const r = await fetch(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`, { signal: AbortSignal.timeout(15000) });
  const b = Buffer.from(await r.arrayBuffer());
  if (!r.ok || !r.headers.get('content-type')?.startsWith('image/') || b.length < 300) return void miss.push(s); // tiny = placeholder
  writeFileSync(new URL(`${s}.png`, dir), b);
  got++;
});
console.log(`downloaded ${got}; no logo: ${miss.join(' ') || 'none'}`);
