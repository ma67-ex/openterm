// Company profile and key stats from SEC facts plus the Yahoo chart endpoint: /api/data?fn=company&s=AAPL
import { tickerToCik, getFacts, getSubmissions } from '../edgar.js';

const DAY = 864e5;
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' }; // a full Chrome UA string gets 429 from Yahoo, the short one does not
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const sum = (...xs) => (xs.every((x) => x == null) ? null : xs.reduce((a, b) => a + (b ?? 0), 0));
const days = (a, b) => (new Date(a) - new Date(b)) / DAY;

// Yahoo chart result with retry on rate limit / server errors; shared with the dividends handler
export async function chart(sym, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&events=div%7Csplit`;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (r.ok) return (await r.json()).chart.result?.[0] ?? null;
    if (r.status === 404) return null;
    if (r.status !== 429 && r.status < 500) throw new Error(`yahoo ${r.status}`);
    await sleep(800 * (i + 1));
  }
  throw new Error('yahoo rate limited');
}

// unique entries per tag (latest filing wins per start|end)
function entries(facts, tag, unit) {
  const m = new Map();
  for (const e of facts[tag]?.units?.[unit] ?? []) {
    const k = `${e.start ?? ''}|${e.end}`;
    const c = m.get(k);
    if (!c || e.filed > c.filed) m.set(k, e);
  }
  return [...m.values()];
}

// trailing twelve months of a flow: FY + current YTD - prior-year YTD, else latest FY
function ttmTag(facts, tag, unit) {
  const es = entries(facts, tag, unit).filter((e) => e.start);
  const fy = es.filter((e) => { const d = days(e.end, e.start); return d > 340 && d < 380; }).sort((a, b) => a.end.localeCompare(b.end));
  const lastFY = fy.at(-1);
  if (!lastFY) return null;
  const cur = es.filter((e) => e.end > lastFY.end && days(e.end, e.start) < 340).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
  const prior = cur && es.find((e) => Math.abs(days(cur.end, e.end) - 365) < 12 && Math.abs(days(cur.start, e.start) - 365) < 12 && Math.abs(days(e.end, e.start) - days(cur.end, cur.start)) < 8);
  const prevFY = fy.at(-2);
  if (cur && prior) return { v: lastFY.val + cur.val - prior.val, asOf: cur.end, basis: 'TTM', growth: div(cur.val, prior.val) == null ? null : cur.val / prior.val - 1, fy: lastFY.val };
  return { v: lastFY.val, asOf: lastFY.end, basis: 'FY', growth: prevFY ? div(lastFY.val, prevFY.val) - 1 : null, fy: lastFY.val };
}
// freshest result across alternative tags, earlier tag wins ties
function ttm(facts, tags, unit = 'USD') {
  let best = null;
  for (const t of tags) { const r = ttmTag(facts, t, unit); if (r && (!best || r.asOf > best.asOf)) best = r; }
  return best;
}
// latest point-in-time value
function inst(facts, tags, unit = 'USD') {
  let best = null;
  for (const t of tags) {
    const e = entries(facts, t, unit).filter((x) => !x.start && days(Date.now(), x.end) < 550).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
    if (e && (!best || e.end > best.end)) best = { v: e.val, end: e.end };
  }
  return best;
}
const onDate = (x, end) => (x && x.end === end ? x.v : null);

// latest cover-page share count; classes on the same filing are summed (distinct values only)
function shares(j) {
  const rows = j.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  if (rows.length) {
    const end = rows.map((e) => e.end).sort().at(-1);
    const top = rows.filter((e) => e.end === end);
    const filed = top.map((e) => e.filed).sort().at(-1);
    return { n: [...new Set(top.filter((e) => e.filed === filed).map((e) => e.val))].reduce((a, b) => a + b, 0), asOf: end, src: 'SEC cover page' };
  }
  const w = inst(j.facts?.['us-gaap'] ?? {}, ['WeightedAverageNumberOfDilutedSharesOutstanding', 'CommonStockSharesOutstanding'], 'shares');
  return w ? { n: w.v, asOf: w.end, src: 'SEC us-gaap shares' } : null;
}

const REV = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet'];

export default async function company(q) {
  const s = String(q.s || '').toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const co = await tickerToCik(s);
  const miss = 'public, max-age=0, s-maxage=3600';
  if (!co) return { status: 404, body: { error: 'unknown ticker' }, cache: miss };
  const [j, sub, ch] = await Promise.all([getFacts(co.cik), getSubmissions(co.cik), chart(s.replace('.', '-'), '1y', '1d').catch(() => null)]);
  if (!j && !sub) return { status: 404, body: { error: 'no SEC data' }, cache: miss };
  const f = j?.facts?.['us-gaap'] ?? {};

  // price, 52-week range, trailing dividends from the 1y chart
  let price = null;
  const dvd = [];
  if (ch) {
    const m = ch.meta, q0 = ch.indicators?.quote?.[0] ?? {};
    const hs = (q0.high ?? []).filter((x) => x != null), ls = (q0.low ?? []).filter((x) => x != null);
    const last = m.regularMarketPrice ?? null;
    price = { last, hi52: hs.length ? Math.max(...hs, last ?? 0) : null, lo52: ls.length ? Math.min(...ls, last ?? Infinity) : null, currency: m.currency ?? null, asOf: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10) : null, src: 'Yahoo chart (delayed)' };
    for (const d of Object.values(ch.events?.dividends ?? {})) dvd.push(d);
  }
  const px = price?.last ?? null;
  const sh = j ? shares(j) : null;
  const mcap = sh && px ? sh.n * px : null;

  const rev = ttm(f, REV), ni = ttm(f, ['NetIncomeLoss', 'ProfitLoss']), eps = ttm(f, ['EarningsPerShareDiluted'], 'USD/shares');
  const cfo = ttm(f, ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']);
  const capex = ttm(f, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
  const equity = inst(f, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
  const assets = inst(f, ['Assets']);

  // debt: total long-term debt, or noncurrent + current, plus commercial paper / short-term borrowings on the same date
  const ltA = inst(f, ['LongTermDebt']);
  const ltBn = inst(f, ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations']), ltBc = inst(f, ['LongTermDebtCurrent']);
  const ltB = ltBn ? { v: sum(ltBn.v, onDate(ltBc, ltBn.end)), end: ltBn.end } : null;
  const lt = ltA && (!ltB || ltA.end >= ltB.end) ? ltA : ltB;
  const debt = lt ? { v: sum(lt.v, onDate(inst(f, ['CommercialPaper']), lt.end), onDate(inst(f, ['ShortTermBorrowings']), lt.end)), end: lt.end } : null;
  // cash and short-term investments
  const cashSt = inst(f, ['CashCashEquivalentsAndShortTermInvestments']);
  const cashOnly = inst(f, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
  const cash = cashSt ?? (cashOnly ? { v: sum(cashOnly.v, onDate(inst(f, ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent']), cashOnly.end)), end: cashOnly.end } : null);

  const cut = Date.now() - 365 * DAY;
  const dps = dvd.length ? dvd.filter((d) => d.date * 1000 >= cut).reduce((a, d) => a + d.amount, 0) : (ch ? 0 : null);
  const fcf = cfo && capex ? cfo.v - Math.abs(capex.v) : null;
  const ev = mcap != null && debt && cash ? mcap + debt.v - cash.v : null;
  const st = (v, asOf, note) => ({ v: v ?? null, asOf: asOf ?? null, note });
  const bvps = div(equity?.v, sh?.n);
  const pe = eps && eps.v > 0 ? div(px, eps.v) : null;

  const stats = {
    mcap: st(mcap, price?.asOf, 'shares x price'),
    ev: st(ev, price?.asOf, 'market cap + debt - cash'),
    pe: st(pe, eps?.asOf, `price / diluted EPS (${eps?.basis ?? '--'})`),
    eps: st(eps?.v, eps?.asOf, `diluted EPS ${eps?.basis ?? ''}`),
    pb: st(bvps && bvps > 0 ? div(px, bvps) : null, equity?.end, 'price / book value per share'),
    evRev: st(div(ev, rev?.v), rev?.asOf, 'EV / revenue'),
    revenue: st(rev?.v, rev?.asOf, `revenue ${rev?.basis ?? ''}`),
    revGrowth: st(rev?.growth, rev?.asOf, rev?.basis === 'TTM' ? 'latest YTD vs prior-year YTD' : 'latest FY vs prior FY'),
    netIncome: st(ni?.v, ni?.asOf, `net income ${ni?.basis ?? ''}`),
    netMargin: st(ni?.asOf === rev?.asOf ? div(ni?.v, rev?.v) : null, rev?.asOf, 'net income / revenue'),
    roe: st(div(ni?.v, equity?.v), equity?.end, 'net income / ending equity'),
    fcf: st(fcf, cfo?.asOf, 'operating cash flow - capex'),
    debt: st(debt?.v, debt?.end, 'long-term debt + short-term borrowings'),
    cash: st(cash?.v, cash?.end, 'cash and short-term investments'),
    equity: st(equity?.v, equity?.end, "stockholders' equity"),
    debtEquity: st(div(debt?.v, equity?.v), equity?.end, 'debt / equity'),
    bvps: st(bvps, equity?.end, 'equity / shares'),
    dps: st(dps, price?.asOf, 'dividends paid, last 12 months'),
    yield: st(px && dps != null ? dps / px : null, price?.asOf, 'dividend per share / price'),
    payout: st(eps && eps.v > 0 && dps != null ? dps / eps.v : null, eps?.asOf, 'dividend per share / diluted EPS'),
  };
  const emp = inst(j?.facts?.dei ?? {}, ['EntityNumberOfEmployees'], 'pure');
  return {
    body: {
      s, cik: String(co.cik).padStart(10, '0'), name: sub?.name ?? j?.entityName ?? co.name,
      profile: { industry: sub?.sicDescription ?? null, sic: sub?.sic ?? null, exchange: sub?.exchanges?.[0] ?? null, state: sub?.stateOfIncorporation ?? null, fye: sub?.fiscalYearEnd ?? null, website: sub?.website || null, employees: emp?.v ?? null, assets: assets?.v ?? null },
      price, shares: sh, stats,
      notes: j && Object.keys(f).length ? null : 'no us-gaap facts (non-US filer?), fundamentals unavailable',
    },
    cache: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  };
}
