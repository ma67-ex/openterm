// Yahoo chart endpoint adapter (unofficial, delayed). Returns normalised rows.
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };

async function one([sym, name]) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(15000) });
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

export async function fetchRows(rows) {
  const out = await Promise.allSettled(rows.map(one));
  return out.filter((o) => o.status === 'fulfilled').map((o) => o.value);
}
