// Multi-symbol price history: /api/data?fn=history&s=AAPL,MSFT&range=1y&interval=1d
// Also exports the range/interval rules shared with api/chart.js.
import { yahooFetch } from '../yahoo.js';
export const RANGES = ['1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max'];
export const INTERVALS = ['1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo'];
// longest range (index into RANGES) Yahoo serves per intraday interval
const MAX_RANGE = { '1m': 1, '5m': 2, '15m': 2, '30m': 2, '60m': 7 };

export const validCombo = (range, interval) => RANGES.includes(range) && INTERVALS.includes(interval) && RANGES.indexOf(range) <= (MAX_RANGE[interval] ?? 99);
export const validSym = (s) => /^[A-Za-z0-9.^=\-]{1,15}$/.test(s);
export const cacheFor = (interval) => (/^\d+m$/.test(interval)
  ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
  : 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');

export async function yahoo(sym, range, interval) {
  const r = await yahooFetch(`/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`);
  if (!r.ok) throw new Error(`${sym} ${r.status}`);
  return r.text();
}

export default async function history(q) {
  const syms = [...new Set(String(q.s || '').toUpperCase().split(',').filter(validSym))].slice(0, 8);
  const range = String(q.range || '1y'), interval = String(q.interval || '1d');
  if (!syms.length || !validCombo(range, interval)) return { status: 400, body: { error: 'bad params' } };
  const out = await Promise.allSettled(syms.map(async (s) => {
    const res = JSON.parse(await yahoo(s, range, interval)).chart.result?.[0];
    const qt = res.indicators.quote[0], m = res.meta;
    return [s, { t: res.timestamp || [], o: qt.open, h: qt.high, l: qt.low, c: qt.close, v: qt.volume, meta: { price: m.regularMarketPrice, prev: m.chartPreviousClose, name: m.shortName || m.symbol, cur: m.currency } }];
  }));
  const body = Object.fromEntries(out.filter((o) => o.status === 'fulfilled').map((o) => o.value));
  if (!Object.keys(body).length) return { status: 502, body: { error: 'no data' } };
  return { body, cache: cacheFor(interval) };
}
