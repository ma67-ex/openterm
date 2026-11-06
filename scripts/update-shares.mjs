// Writes data/shares.json: S&P 500 symbol -> basic weighted shares outstanding, from the SEC XBRL frames API
// (one request per quarter, all companies). Market cap on the map = shares x live price. Run: npm run shares
import { readFileSync, writeFileSync } from 'node:fs';
import { UNIVERSE } from '../seeders/universe-list.js';

const UA = process.env.EDGAR_UA || 'OpenTerm/0.1 (open-source terminal)';
const tickers = JSON.parse(readFileSync(new URL('../data/tickers.json', import.meta.url), 'utf8'));
const now = new Date();
const q = (back) => { const i = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3) - back; return `CY${Math.floor(i / 4)}Q${(i % 4) + 1}`; };

const byCik = new Map(); // cik -> shares; basic before diluted, newest quarter first
for (const tag of ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'])
  for (const back of [1, 2, 3]) { // the current quarter is never filed yet
    const r = await fetch(`https://data.sec.gov/api/xbrl/frames/us-gaap/${tag}/shares/${q(back)}.json`, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.log(tag, q(back), r.status); continue; }
    for (const e of (await r.json()).data) if (!byCik.has(e.cik)) byCik.set(e.cik, e.val);
  }

// Approximate, hand-set where SEC reports no usable total (multi-class or odd XBRL). Refresh by hand now and then.
// WAT: SEC frame is off by 1000x (98 billion shares), so the hand value wins over SEC.
const HAND = { 'BRK-B': 2.16e9, V: 1.93e9, C: 1.85e9, WAT: 9.9e7 };
const out = {}, seen = new Set(), missing = [];
for (const { s } of UNIVERSE) {
  const cik = tickers[s]?.[0], v = byCik.get(cik);
  // ponytail: a dual-class company reports total shares once, so only its first listed class gets a tile (GOOGL, not GOOG)
  if (HAND[s]) { out[s] = HAND[s]; seen.add(cik); continue; }
  if (v && !seen.has(cik)) { out[s] = v; seen.add(cik); } else if (v) out[s] = 0; else missing.push(s);
}
writeFileSync(new URL('../data/shares.json', import.meta.url), JSON.stringify(out));
console.log(`${Object.keys(out).length}/${UNIVERSE.length} symbols; no shares: ${missing.join(' ') || 'none'}`);
