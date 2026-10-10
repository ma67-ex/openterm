// Earnings calendar for the universe, next 7 weekdays (days=1..10): /api/data?fn=earnings
import { UNIVERSE } from '../../seeders/universe-list.js';

const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const names = new Map(UNIVERSE.map((u) => [u.s.replace('-', '.'), u]));

function weekdays(n) {
  const out = [], d = new Date();
  while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

const timeOf = (t) => (t === 'time-pre-market' ? 'BMO' : t === 'time-after-hours' ? 'AMC' : '--');
const cap = (x) => Number(String(x.marketCap ?? '').replace(/[^0-9]/g, '')) || 0;

// all=1: the 25 largest reporters per day, S&P 500 members flagged with sp
async function dayAll(d) {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, { headers: H, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`nasdaq ${r.status}`);
  const rows = ((await r.json())?.data?.rows ?? []).filter((x) => /^[A-Z0-9.\-]{1,10}$/.test(x.symbol ?? '')).sort((a, b) => cap(b) - cap(a)).slice(0, 25);
  return rows.map((x) => ({ d, s: x.symbol, n: names.get(x.symbol)?.n ?? x.name, time: timeOf(x.time), epsFcst: x.epsForecast || null, sp: names.has(x.symbol) }));
}

async function day(d) {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, { headers: H, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`nasdaq ${r.status}`);
  const rows = (await r.json())?.data?.rows ?? [];
  return rows.filter((x) => names.has(x.symbol)).map((x) => ({
    d, s: names.get(x.symbol).s, n: names.get(x.symbol).n,
    time: timeOf(x.time),
    epsFcst: x.epsForecast || null,
  }));
}

export default async function earnings(q = {}) {
  const n = Math.min(10, Math.max(1, Math.floor(+q.days) || 7));
  const res = await Promise.allSettled(weekdays(n).map(q.all === '1' ? dayAll : day));
  const rows = res.flatMap((o) => (o.status === 'fulfilled' ? o.value : []));
  if (!rows.length && res.every((o) => o.status === 'rejected')) return { status: 502, body: { error: 'calendar unavailable' }, cache: 'public, max-age=0, s-maxage=300' };
  return { body: { rows }, cache: 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400' };
}
