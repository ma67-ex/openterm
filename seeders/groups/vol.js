// Volatility indices with a compact 3-month sparkline. ^VIX6M is the extra term-structure point.
import { yc } from './sectors.js';

const L = [['^VIX9D', 'VIX 9-Day'], ['^VIX', 'VIX 30-Day'], ['^VIX3M', 'VIX 3-Month'], ['^VIX6M', 'VIX 6-Month'], ['^VVIX', 'VVIX Vol of Vol'], ['^SKEW', 'CBOE Skew'], ['^MOVE', 'MOVE Bond Vol'], ['^VXN', 'Nasdaq Vol']];
const r2 = (x) => +x.toFixed(2);

async function one([s, n]) {
  const { bars, m } = await yc(s, '3mo');
  const last = m.regularMarketPrice ?? bars.at(-1).c;
  const prev = bars.at(m.regularMarketTime - bars.at(-1).t < 86400 ? -2 : -1).c;
  const step = Math.ceil(bars.length / 40);
  const sp = bars.filter((_, i) => (bars.length - 1 - i) % step === 0).map((b) => r2(b.c));
  return { g: 'vol', s, n, p: r2(last), c: r2(last - prev), pc: r2(((last - prev) / prev) * 100), sp };
}

export async function fetchVol() {
  const out = await Promise.allSettled(L.map(one));
  return out.filter((o) => o.status === 'fulfilled').map((o) => o.value);
}
