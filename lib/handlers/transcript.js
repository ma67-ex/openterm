// Earnings-call coverage headlines for a ticker (no free full-transcript source exists, so this is
// press/analyst writeups about the call, not the call itself): /api/data?fn=transcript&s=AAPL
import { parse } from './news.js';

const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };

export default async function transcript(q) {
  const s = String(q.s || '').toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${s}" earnings call transcript`)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return { status: 502, body: { error: 'feed unavailable' }, cache: 'public, max-age=0, s-maxage=60' };
  const rows = parse(await r.text(), 'Google').slice(0, 10);
  return { body: { s, rows }, cache: 'public, max-age=0, s-maxage=1800, stale-while-revalidate=7200' };
}
