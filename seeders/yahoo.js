// Yahoo chart endpoint adapter (unofficial, delayed). Returns normalised rows.
import { yahooFetch, mapLimit, sparkRows } from '../lib/yahoo.js';

const IN_FLIGHT = 8; // symbols fetched at once

async function one([sym, name], opts) {
  const r = await yahooFetch(`/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, opts);
  if (!r.ok) throw new Error(`${sym} ${r.status}`);
  const res = (await r.json()).chart.result[0];
  const m = res.meta, raw = res.indicators.quote[0].close, ts = res.timestamp;
  const idx = raw.map((x, i) => (x != null ? i : -1)).filter((i) => i >= 0);
  const last = m.regularMarketPrice;
  // the newest daily bar is today's session if the last trade is within a day of its timestamp; then prev close is the bar before it
  const sameSession = m.regularMarketTime - ts[idx.at(-1)] < 86400;
  const prev = raw[idx.at(sameSession ? -2 : -1)];
  return { s: sym, n: name, p: last, c: +(last - prev).toFixed(4), pc: +(((last - prev) / prev) * 100).toFixed(2), v: m.regularMarketVolume ?? null };
}

export async function fetchRows(rows, opts = {}) {
  const done = await mapLimit(rows, IN_FLIGHT, (row) => one(row, opts));
  const got = new Map(done.filter((o) => o.status === 'fulfilled').map((o) => [o.value.s, o.value]));
  // symbols whose chart request kept failing get a second chance through the 20-at-a-time spark endpoint
  const missing = rows.filter(([s]) => !got.has(s));
  if (missing.length) for (const r of await sparkRows(missing, opts)) got.set(r.s, r);
  return rows.map(([s]) => got.get(s)).filter(Boolean); // the caller's order, unknown symbols left out
}
