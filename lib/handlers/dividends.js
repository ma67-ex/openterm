// Dividend and split history from the Yahoo chart endpoint: /api/data?fn=dividends&s=AAPL
import { chart } from './company.js';

const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10);

export default async function dividends(q) {
  const s = String(q.s || '').toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const res = await chart(s.replace('.', '-'), 'max', '1mo');
  if (!res) return { status: 404, body: { error: 'unknown symbol' }, cache: 'public, max-age=0, s-maxage=3600' };
  // the monthly series drops some recent dividends, so merge in a daily 2y pull
  const recent = await chart(s.replace('.', '-'), '2y', '1d').catch(() => null);
  const byDate = new Map();
  for (const d of [...Object.values(res.events?.dividends ?? {}), ...Object.values(recent?.events?.dividends ?? {})]) byDate.set(iso(d.date), { date: iso(d.date), amount: d.amount });
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const splits = Object.values(res.events?.splits ?? {}).sort((a, b) => a.date - b.date).map((d) => ({ date: iso(d.date), ratio: d.splitRatio || `${d.numerator}:${d.denominator}` }));
  const price = res.meta?.regularMarketPrice ?? null;
  const cut = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const ttm = rows.filter((r) => r.date >= cut).reduce((a, r) => a + r.amount, 0);

  // annual totals; the current calendar year is partial and excluded from streak and CAGR
  const tot = {};
  for (const r of rows) tot[r.date.slice(0, 4)] = (tot[r.date.slice(0, 4)] ?? 0) + r.amount;
  const thisYear = String(new Date().getUTCFullYear());
  const annual = Object.entries(tot).map(([year, total]) => ({ year: +year, total: +total.toFixed(4), partial: year === thisYear }));
  const full = annual.filter((a) => !a.partial);
  let streak = 0;
  for (let i = full.length - 1; i > 0 && full[i].total > full[i - 1].total && full[i].year === full[i - 1].year + 1; i--) streak++;
  const last = full.at(-1), base = full.find((a) => last && a.year === last.year - 5);
  const cagr5 = last && base && base.total > 0 && last.total > 0 ? (last.total / base.total) ** (1 / 5) - 1 : null;
  return {
    body: {
      s, currency: res.meta?.currency ?? null, price, rows, splits, annual, ttm: +ttm.toFixed(4), yield: price && rows.length ? ttm / price : null,
      streak, cagr5, cagrYears: cagr5 == null ? null : [base.year, last.year], note: 'Yahoo amounts are split-adjusted. Streak counts consecutive calendar years with a higher total than the year before.',
    },
    cache: 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400',
  };
}
