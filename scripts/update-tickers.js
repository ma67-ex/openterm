// Refresh data/tickers.json from SEC. www.sec.gov blocks some cloud IPs, so the map is committed instead of fetched at runtime.
import { writeFileSync } from 'node:fs';

const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': process.env.EDGAR_UA || 'OpenTerm/0.1 (open-source terminal)' } });
if (!r.ok) throw new Error(`sec ${r.status}`);
const out = {};
for (const c of Object.values(await r.json())) out[c.ticker.toUpperCase()] = [c.cik_str, c.title];
writeFileSync(new URL('../data/tickers.json', import.meta.url), JSON.stringify(out));
console.log(Object.keys(out).length, 'tickers');
