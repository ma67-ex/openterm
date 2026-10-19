// Live market-wide news wire (not ticker-scoped): /api/data?fn=wire
import { parse } from './news.js';

const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };
const FEEDS = [
  ['Yahoo', 'https://finance.yahoo.com/news/rssindex'],
  ['MarketWatch', 'https://feeds.marketwatch.com/marketwatch/topstories/'],
  ['Google', 'https://news.google.com/rss/search?q=stocks+OR+markets+OR+Fed+OR+earnings+when:1d&hl=en-US&gl=US&ceid=US:en'],
];

export default async function wire() {
  const res = await Promise.allSettled(FEEDS.map(async ([name, url]) => {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${name} ${r.status}`);
    return parse(await r.text(), name);
  }));
  if (res.every((o) => o.status === 'rejected')) return { status: 502, body: { error: 'feeds unavailable' }, cache: 'public, max-age=0, s-maxage=30' };
  const seen = new Set();
  const rows = res.filter((o) => o.status === 'fulfilled').flatMap((o) => o.value)
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .filter((r) => { const k = r.t.toLowerCase(); return !seen.has(k) && seen.add(k); })
    .slice(0, 60);
  return { body: { rows }, cache: 'public, max-age=0, s-maxage=45, stale-while-revalidate=180' };
}
