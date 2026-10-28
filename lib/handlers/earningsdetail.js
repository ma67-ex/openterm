// Earnings detail for one ticker: /api/data?fn=earningsdetail&s=AAPL
// Nasdaq public JSON (unofficial); EPS history falls back to SEC EDGAR when Nasdaq fails.
import { tickerToCik, getFacts } from '../edgar.js';

const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const LONG = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';
const MISS = 'public, max-age=0, s-maxage=300';
const DAY = 864e5;
const memo = new Map();

// Nasdaq JSON data object; null when the symbol is unknown, throws on transport errors. Cached in memory.
export async function nasdaq(path, ttl = 6 * 3600e3) {
  const m = memo.get(path);
  if (m && Date.now() - m.t < ttl) return m.d;
  const r = await fetch(`https://api.nasdaq.com/api/${path}`, { headers: H, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`nasdaq ${r.status}`);
  const j = await r.json();
  const d = j?.status?.rCode === 200 ? j.data ?? null : null;
  if (memo.size > 300) memo.clear();
  memo.set(path, { t: Date.now(), d });
  return d;
}
const safe = (p) => nasdaq(p).catch(() => undefined); // undefined = failed, null = unknown symbol
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };

function parseNext(d) {
  const t = d?.reportText;
  if (!t) return null;
  const m = t.match(/report earnings on\s+(\d\d)\/(\d\d)\/(\d{4})\s*([^.]*?)\./);
  if (!m) return null;
  const time = /after market/i.test(m[4]) ? 'AMC' : /before market/i.test(m[4]) ? 'BMO' : '--';
  const e = t.match(/EPS forecast for the quarter is \$?(-?\d+(?:\.\d+)?)/), n = t.match(/based on\s+(\d+)\s+analysts/i), q = t.match(/Quarter ending ([A-Za-z]{3} \d{4})/i);
  return { date: `${m[3]}-${m[1]}-${m[2]}`, time, fiscalQtr: q?.[1] ?? null, epsEst: e ? +e[1] : null, analysts: n ? +n[1] : null };
}
const fcRows = (t) => (t?.rows ?? []).map((r) => ({ end: r.fiscalEnd, eps: num(r.consensusEPSForecast), hi: num(r.highEPSForecast), lo: num(r.lowEPSForecast), n: num(r.noOfEstimates), up: num(r.up), down: num(r.down) }));
function parseHistory(d) {
  const rows = d?.earningsSurpriseTable?.rows ?? [];
  return rows.map((r) => {
    const eps = num(r.eps), est = num(r.consensusForecast), surp = num(r.percentageSurprise);
    return { q: r.fiscalQtrEnd, date: r.dateReported, eps, est, surp, beat: eps != null && est != null ? (eps > est ? 1 : eps < est ? -1 : 0) : null };
  }).reverse();
}
function parseRevenue(d) {
  const t = d?.revenueTable;
  if (!t?.rows?.length) return null;
  const years = Object.keys(t.headers).filter((k) => k !== 'value1').sort().map((k) => String(t.headers[k]).replace(/ \(Fiscal Year\)/, ''));
  const groups = [];
  for (const r of t.rows) {
    const vals = [r.value2, r.value3, r.value4];
    if (vals.every((v) => v === '') && r.value1 !== 'Revenue' && r.value1 !== 'EPS' && r.value1 !== 'Dividends') groups.push({ q: r.value1, rev: [], eps: [] });
    else if (groups.length && r.value1 === 'Revenue') groups.at(-1).rev = vals.map((v) => v || null);
    else if (groups.length && r.value1 === 'EPS') groups.at(-1).eps = vals.map((v) => v || null);
  }
  return { years, groups: groups.filter((g) => g.q !== 'Totals' && g.rev.some(Boolean)) };
}

// last 8 discrete quarters of diluted EPS from 10-Q facts (Q4 is not reported on its own, so it is absent)
async function edgarHistory(s) {
  const co = await tickerToCik(s);
  if (!co) return null;
  const j = await getFacts(co.cik);
  const es = j?.facts?.['us-gaap']?.EarningsPerShareDiluted?.units?.['USD/shares'] ?? [];
  const m = new Map();
  for (const e of es) {
    if (!e.start) continue;
    const d = (new Date(e.end) - new Date(e.start)) / DAY;
    if (d < 75 || d > 105) continue;
    const c = m.get(e.end);
    if (!c || e.filed > c.filed) m.set(e.end, e);
  }
  const rows = [...m.values()].sort((a, b) => a.end.localeCompare(b.end)).slice(-8);
  return rows.length ? rows.map((e) => ({ q: e.end, date: e.filed, eps: e.val, est: null, surp: null, beat: null })) : null;
}

export default async function earningsdetail(q) {
  const s = String(q.s || '').toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const e = encodeURIComponent(s);
  const [dt, fc, sp, rv] = await Promise.all([`analyst/${e}/earnings-date`, `analyst/${e}/earnings-forecast`, `company/${e}/earnings-surprise`, `company/${e}/revenue`].map(safe));
  const all = [dt, fc, sp, rv];
  const failed = all.every((x) => x === undefined);
  let history = parseHistory(sp), source = 'nasdaq', note = null;
  if (!history.length) {
    try { const h = await edgarHistory(s); if (h) { history = h; source = 'edgar'; note = 'No consensus available: EPS history from SEC filings (diluted, quarters reported on 10-Q).'; } } catch { /* leave empty */ }
  }
  const next = parseNext(dt);
  const forecast = { quarterly: fcRows(fc?.quarterlyForecast), yearly: fcRows(fc?.yearlyForecast) };
  const revenue = parseRevenue(rv);
  if (!next && !history.length && !forecast.quarterly.length && !forecast.yearly.length && !revenue) {
    return failed
      ? { status: 502, body: { error: 'earnings data unavailable' }, cache: MISS }
      : { status: 404, body: { error: 'no earnings data' }, cache: MISS };
  }
  return { body: { s, next, forecast, history, revenue, source, note }, cache: failed || all.includes(undefined) ? MISS : LONG };
}
