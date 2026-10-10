// US sector ETFs: 1D, 1W, 1M, YTD from one 1y chart call each. Also exports the shared chart helper.
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };
const r2 = (x) => +x.toFixed(2);

export async function yc(sym, range) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, { headers: UA });
  if (!r.ok) throw new Error(`${sym} ${r.status}`);
  const res = (await r.json()).chart.result[0];
  const q = res.indicators.quote[0].close;
  const bars = res.timestamp.map((t, i) => ({ t, c: q[i] })).filter((b) => b.c != null);
  return { bars, m: res.meta };
}

const SECTORS = [['XLK', 'Technology'], ['XLF', 'Financials'], ['XLV', 'Health Care'], ['XLY', 'Cons Discretionary'], ['XLP', 'Cons Staples'], ['XLE', 'Energy'],
  ['XLI', 'Industrials'], ['XLB', 'Materials'], ['XLRE', 'Real Estate'], ['XLU', 'Utilities'], ['XLC', 'Comm Services']];

async function one([s, n]) {
  const { bars, m } = await yc(s, '1y');
  const last = m.regularMarketPrice ?? bars.at(-1).c, T = m.regularMarketTime;
  const prev = bars.at(T - bars.at(-1).t < 86400 ? -2 : -1).c;
  const ago = (d) => bars.find((b) => b.t >= T - d * 86400)?.c;
  const yr = new Date(T * 1000).getUTCFullYear();
  const base = bars.filter((b) => new Date(b.t * 1000).getUTCFullYear() < yr).at(-1)?.c ?? bars.find((b) => new Date(b.t * 1000).getUTCFullYear() === yr)?.c;
  const chg = (b) => (b ? r2(((last - b) / b) * 100) : null);
  return { g: 'sec', s, n, p: r2(last), d1: chg(prev), w1: chg(ago(7)), m1: chg(ago(30)), ytd: chg(base) };
}

export async function fetchSectors() {
  const out = await Promise.allSettled(SECTORS.map(one));
  return out.filter((o) => o.status === 'fulfilled').map((o) => o.value);
}
