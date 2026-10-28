// Option chain from CBOE delayed quotes, slimmed for the browser: /api/data?fn=options&s=AAPL[&exp=2026-10-16]
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36', Accept: 'application/json' };
const INDEXES = new Set(['SPX', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX', 'OEX']);
const DAY = 864e5;
const MAX_ROWS = 120;
const r = (v, d = 4) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const OCC = /^(.{1,6}?)(\d{6})([CP])(\d{8})$/;

function parse(o) {
  const m = OCC.exec(o.option);
  if (!m) return null;
  const d = m[2];
  return { date: `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`, right: m[3], k: +m[4] / 1000, o };
}
const leg = (o) => o && ({ bid: r(o.bid, 2), ask: r(o.ask, 2), last: r(o.last_trade_price, 2), iv: r(o.iv), delta: r(o.delta), gamma: r(o.gamma), theta: r(o.theta), vega: r(o.vega), vol: o.volume || 0, oi: o.open_interest || 0 });
const mid = (o) => (o && o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : o?.last_trade_price > 0 ? o.last_trade_price : null);

function atm(byK, spot) {
  let best = null;
  for (const k of byK.keys()) if (best == null || Math.abs(k - spot) < Math.abs(best - spot)) best = k;
  if (best == null) return null;
  const { c, p } = byK.get(best);
  const ivs = [c?.iv, p?.iv].filter((v) => v > 0);
  const mc = mid(c), mp = mid(p);
  return { k: best, iv: ivs.length ? ivs.reduce((a, b) => a + b) / ivs.length : null, straddle: mc != null && mp != null ? mc + mp : null };
}

function maxPain(byK) {
  const ks = [...byK.keys()];
  let best = null, bestV = Infinity;
  for (const s of ks) {
    let v = 0;
    for (const [k, { c, p }] of byK) v += (c?.open_interest || 0) * Math.max(0, s - k) + (p?.open_interest || 0) * Math.max(0, k - s);
    if (v < bestV) { bestV = v; best = s; }
  }
  return best;
}

export default async (q) => {
  let s = String(q.s ?? '').toUpperCase().replace(/^\^/, '');
  if (!/^[A-Z.\-]{1,6}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const cboe = INDEXES.has(s) ? `_${s}` : s.replace('-', '.');
  let j;
  try {
    const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${cboe}.json`, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (res.status === 403 || res.status === 404) return { status: 404, body: { error: `no options for ${s}` } };
    if (!res.ok) return { status: 502, body: { error: `upstream ${res.status}` } };
    j = await res.json();
  } catch (e) {
    console.error('options', s, e);
    return { status: 502, body: { error: 'upstream failed' } };
  }
  const d = j?.data;
  const list = (d?.options ?? []).map(parse).filter(Boolean);
  if (!list.length) return { status: 404, body: { error: `no options for ${s}` } };

  const spot = d.current_price ?? d.close ?? null;
  if (!(spot > 0)) return { status: 502, body: { error: 'no underlying price' } };
  const asOf = String(j.timestamp ?? '');
  const today = Date.parse((asOf.slice(0, 10) || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');

  // group: date -> strike -> {c,p}
  const byExp = new Map();
  for (const x of list) {
    if (!byExp.has(x.date)) byExp.set(x.date, new Map());
    const m = byExp.get(x.date);
    if (!m.has(x.k)) m.set(x.k, {});
    m.get(x.k)[x.right === 'C' ? 'c' : 'p'] = x.o;
  }

  const stats = [];
  for (const [date, byK] of [...byExp].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dte = Math.round((Date.parse(date + 'T00:00:00Z') - today) / DAY);
    if (dte < 0) continue;
    let calls = 0, puts = 0, callOI = 0, putOI = 0, callVol = 0, putVol = 0;
    for (const { c, p } of byK.values()) {
      if (c) { calls++; callOI += c.open_interest || 0; callVol += c.volume || 0; }
      if (p) { puts++; putOI += p.open_interest || 0; putVol += p.volume || 0; }
    }
    stats.push({ date, dte, calls, puts, callOI, putOI, callVol, putVol, byK });
  }
  if (!stats.length) return { status: 404, body: { error: `no listed expirations for ${s}` } };

  const want = /^\d{4}-\d{2}-\d{2}$/.test(q.exp ?? '') ? q.exp : null;
  const maxOI = Math.max(...stats.map((e) => e.callOI + e.putOI));
  const sel = stats.find((e) => e.date === want)
    ?? stats.find((e) => e.dte >= 1 && e.callOI + e.putOI >= maxOI * 0.1)
    ?? stats.find((e) => e.dte >= 1) ?? stats[0];

  const lo = spot * 0.75, hi = spot * 1.25;
  let ks = [...sel.byK.keys()].filter((k) => k >= lo && k <= hi).sort((a, b) => a - b);
  if (ks.length > MAX_ROWS) ks = ks.sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot)).slice(0, MAX_ROWS).sort((a, b) => a - b);
  const rows = ks.map((k) => { const { c, p } = sel.byK.get(k); return { k, c: leg(c) ?? null, p: leg(p) ?? null }; });
  const skew = rows.filter((x) => x.c?.iv > 0 || x.p?.iv > 0).map((x) => ({ k: x.k, ivCall: x.c?.iv > 0 ? x.c.iv : null, ivPut: x.p?.iv > 0 ? x.p.iv : null }));

  const a = atm(sel.byK, spot);
  const term = [];
  for (const e of stats) {
    if (term.length >= 12) break;
    if (e.dte < 1) continue;
    const t = atm(e.byK, spot);
    if (t?.iv) term.push({ date: e.date, atmIV: r(t.iv) });
  }
  const ratio = (x, y) => (y > 0 ? r(x / y, 3) : null);
  const body = {
    sym: s, asOf, spot: r(spot, 2),
    expirations: stats.slice(0, 40).map(({ byK, ...e }) => e),
    exp: sel.date, dte: sel.dte, rows,
    summary: {
      putCallVolRatio: ratio(sel.putVol, sel.callVol), putCallOIRatio: ratio(sel.putOI, sel.callOI),
      atmIV: r(a?.iv), atmStrike: a?.k ?? null, expectedMove: a?.straddle != null ? r(a.straddle / spot) : null,
      expectedMoveUsd: a?.straddle != null ? r(a.straddle, 2) : null, maxPain: maxPain(sel.byK),
    },
    termStructure: term, skew,
  };
  return { body, cache: 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' };
};
