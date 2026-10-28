// Universe snapshot: ~100 US large caps with price, change, volume, 52w range, 1M and YTD change.
import { UNIVERSE } from '../universe-list.js';

const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };
const r2 = (x) => +x.toFixed(2);

async function one({ s, n, sec }) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1y&interval=1d`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${s} ${r.status}`);
  const res = (await r.json()).chart.result[0];
  const q = res.indicators.quote[0], ts = res.timestamp, m = res.meta;
  const bars = ts.map((t, i) => ({ t, c: q.close[i], h: q.high[i], l: q.low[i], v: q.volume[i] })).filter((b) => b.c != null);
  const last = m.regularMarketPrice ?? bars.at(-1).c;
  const sameSession = m.regularMarketTime - bars.at(-1).t < 86400;
  const prev = bars.at(sameSession ? -2 : -1).c;
  const hs = bars.map((b) => b.h).filter((x) => x != null), ls = bars.map((b) => b.l).filter((x) => x != null);
  const vs = bars.slice(-30).map((b) => b.v).filter((x) => x != null);
  const ago = (days) => bars.find((b) => b.t >= m.regularMarketTime - days * 86400)?.c;
  const ytd = bars.find((b) => new Date(b.t * 1000).getUTCFullYear() === new Date(m.regularMarketTime * 1000).getUTCFullYear());
  const chg = (base) => (base ? r2(((last - base) / base) * 100) : null);
  return {
    s, n, sec, p: r2(last), pc: r2(((last - prev) / prev) * 100), v: m.regularMarketVolume ?? bars.at(-1).v ?? null,
    av: vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) : null,
    h52: r2(Math.max(...hs, last)), l52: r2(Math.min(...ls, last)), m1: chg(ago(30)), ytd: chg(ytd?.c),
  };
}

// The S&P 500 is split into 5 shards (about 100 rows, 15 KB each) that refresh one per 10-minute slot, hourly.
export const SHARDS = 5;
const shard = (i) => ({
  key: i ? `universe${i + 1}` : 'universe', when: 'weekday', slot: [i, 6],
  async fetch() {
    const list = UNIVERSE.filter((_, j) => j % SHARDS === i);
    const out = [];
    for (let k = 0; k < list.length; k += 20) {
      const part = await Promise.allSettled(list.slice(k, k + 20).map(one));
      out.push(...part.filter((o) => o.status === 'fulfilled').map((o) => o.value));
    }
    return out;
  },
});
export const shards = Array.from({ length: SHARDS }, (_, i) => shard(i));
export default shards[0];
