// Per-politician trade history (last 2 years of House + Senate trade reports), split over SHARDS snapshots by name hash.
// Each run only fetches filings missing from the previous snapshot; the client builds portfolios from the raw rows.
import { listFilings, filingRows } from '../congress.js';
import { mget } from '../../lib/redis.js';

export const SHARDS = 16;
const MAX_JSON = 28000;
export const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

async function fetchShard(i) {
  const log = (m) => console.log(`pol${i}: ${m}`);
  const mine = (await listFilings(730, log)).filter((f) => hash(f.who) % SHARDS === i);
  const [old] = await mget([`snap:pol${i}`]);
  const byId = new Map();
  for (const r of old?.rows ?? []) byId.set(r[10], [...(byId.get(r[10]) ?? []), r]);
  let rows = [], fresh = 0;
  for (const f of mine) {
    if (byId.has(f.id)) { rows.push(...byId.get(f.id)); continue; }
    try { rows.push(...await filingRows(f)); fresh++; } catch (e) { log(`${f.id}: ${e.message}`); }
  }
  if (!mine.length) return []; // listing failed or empty: keep the old snapshot instead of wiping it
  rows.sort((a, b) => b[7].localeCompare(a[7]));
  let cut = 0;
  while (JSON.stringify(rows).length > MAX_JSON && rows.length > 20) { rows.pop(); cut++; }
  log(`${mine.length} filings (${fresh} new), ${rows.length} rows${cut ? `, ${cut} oldest dropped` : ''}`);
  return rows;
}

export const shards = Array.from({ length: SHARDS }, (_, i) => ({ key: `pol${i}`, when: 'always', hours: [1, 7, 13, 19], fetch: () => fetchShard(i) }));
