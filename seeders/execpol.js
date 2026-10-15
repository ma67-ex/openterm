// Executive-branch stock trades (President Trump and ~40 cabinet-level officials) from Open Cabinet's CSV of OGE 278-T filings (MIT licensed).
// Output per official: positions aggregated from disclosed trade ranges, plus latest trades.
import { readFileSync } from 'node:fs';
import { norm } from './sec13f.js';

const URL_ = 'https://open-cabinet.org/data/all-transactions.csv';
const MAX_JSON = 28000;

// ticker lookup by normalized company name, same trick as the 13F seeder
const byName = new Map();
for (const [t, [, n]] of Object.entries(JSON.parse(readFileSync(new URL('../data/tickers.json', import.meta.url), 'utf8')))) {
  const k = norm(n);
  if (k && !byName.has(k)) byName.set(k, t);
}

export function parseCSV(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// "Last, First M" -> "First M Last"
const flip = (n) => { const [l, ...f] = n.split(','); return f.length ? `${f.join(',').trim()} ${l.trim()}` : n; };
const K = (v) => Math.round(v / 1000);

export async function fetchExec(only, log = () => {}) {
  const r = await fetch(URL_, { headers: { 'User-Agent': 'OpenTerm/0.1 (open-source terminal)' }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`open-cabinet ${r.status}`);
  const all = parseCSV(await r.text());
  const hi = all.findIndex((x) => x[0] === 'official_name');
  const H = Object.fromEntries(all[hi].map((k, i) => [k, i]));
  const people = new Map();
  for (const x of all.slice(hi + 1)) {
    const name = x[H.official_name];
    if (!name || !!only(name) === false) continue;
    const desc = (x[H.description] || x[H.issuer_label] || '').replace(/\s*\([A-Z.\-]{1,6}\)\s*$/, '').trim();
    const tk = x[H.resolved_ticker] || x[H.ticker] || byName.get(norm(desc)) || '';
    const side = x[H.type] === 'Purchase' ? 'P' : x[H.type]?.startsWith('Sale') ? 'S' : 'E';
    const mid = +x[H.amount_midpoint] || 0, date = x[H.date];
    if (!date || !desc || side === 'E') continue;
    const p = people.get(name) ?? { n: flip(name), t: x[H.official_title], pos: new Map(), tr: [] };
    const k = tk || desc.slice(0, 28);
    const e = p.pos.get(k) ?? [tk, desc.slice(0, 28), 0, 0, 0, 0, ''];
    if (side === 'P') { e[2]++; e[4] += mid; } else { e[3]++; e[5] += mid; }
    if (date > e[6]) e[6] = date;
    p.pos.set(k, e);
    p.tr.push([tk || desc.slice(0, 20), side, date, x[H.amount_range]]);
    people.set(name, p);
  }
  const out = [...people.values()].map((p) => ({
    n: p.n, t: p.t, c: 'X',
    pos: [...p.pos.values()].map((e) => [e[0], e[1], e[2], e[3], K(e[4]), K(e[5]), e[6]]).sort((a, b) => b[4] + b[5] - (a[4] + a[5])),
    tr: p.tr.sort((a, b) => b[2].localeCompare(a[2])).slice(0, 8),
  }));
  // trim smallest positions, then trades, until the snapshot fits
  for (const o of out) log(`${o.n}: ${o.pos.length} positions`);
  while (JSON.stringify(out).length > MAX_JSON) {
    const big = out.reduce((a, b) => (a.pos.length >= b.pos.length ? a : b));
    if (big.pos.length <= 10) break;
    big.pos.length = Math.floor(big.pos.length * 0.9);
  }
  return out;
}
