// SEC EDGAR client: ticker lookup, company facts parsed into compact statements, submissions.
import { readFileSync } from 'node:fs';

const UA = process.env.EDGAR_UA || 'OpenTerm/0.1 (open-source terminal)';
const GAP = 200; // ms between requests, ~5/sec (EDGAR allows 10)

let chain = Promise.resolve();
let lastAt = 0;
function get(url) {
  const run = chain.then(async () => {
    const wait = lastAt + GAP - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`edgar ${r.status}`);
    return r.json();
  });
  chain = run.catch(() => {});
  return run;
}

const pad = (cik) => String(cik).padStart(10, '0');

// ticker -> [cik, name], committed in data/ (refresh with `npm run tickers`)
const tickers = new Map(Object.entries(JSON.parse(readFileSync(new URL('../data/tickers.json', import.meta.url), 'utf8'))));
export async function tickerToCik(ticker) {
  const hit = tickers.get(ticker.toUpperCase().replace('.', '-'));
  return hit ? { cik: hit[0], name: hit[1] } : null;
}

export const getFacts = (cik) => get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`);
export const getSubmissions = (cik) => get(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`);

// Each line: [key, unit, flow?, tags in priority order]. Tags are merged per period, first hit wins.
const LINES = [
  ['revenue', 'USD', 1, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet']],
  ['cogs', 'USD', 1, ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold']],
  ['grossProfit', 'USD', 1, ['GrossProfit']],
  ['rnd', 'USD', 1, ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost']],
  ['operatingIncome', 'USD', 1, ['OperatingIncomeLoss']],
  ['netIncome', 'USD', 1, ['NetIncomeLoss', 'ProfitLoss']],
  ['eps', 'USD/shares', 1, ['EarningsPerShareDiluted']],
  ['assets', 'USD', 0, ['Assets']],
  ['liabilities', 'USD', 0, ['Liabilities']],
  ['equity', 'USD', 0, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']],
  ['cash', 'USD', 0, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']],
  ['debt', 'USD', 0, ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations']],
  ['cfo', 'USD', 1, ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']],
  ['capex', 'USD', 1, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']],
];
const DAY = 864e5;

// end date -> value for one tag: 10-K, FY, full-year duration for flows, latest filing wins
function annual(facts, tag, unit, flow) {
  const out = new Map();
  for (const e of facts[tag]?.units?.[unit] ?? []) {
    if (!e.form?.startsWith('10-K') || e.fp !== 'FY') continue;
    if (flow) {
      const d = (new Date(e.end) - new Date(e.start)) / DAY;
      if (d < 340 || d > 380) continue;
    }
    const cur = out.get(e.end);
    if (!cur || e.filed > cur.filed) out.set(e.end, { v: e.val, filed: e.filed });
  }
  return out;
}

const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const sub = (a, b) => (a == null || b == null ? null : a - b);

export function parseFacts(j, years = 5) {
  const facts = j?.facts?.['us-gaap'];
  if (!facts) return null;
  const maps = {};
  for (const [key, unit, flow, tags] of LINES) {
    const m = new Map();
    for (const t of tags) for (const [end, x] of annual(facts, t, unit, flow)) if (!m.has(end)) m.set(end, x.v);
    maps[key] = m;
  }
  const base = new Set([...maps.revenue.keys(), ...maps.netIncome.keys(), ...maps.assets.keys()]);
  const periods = [...base].sort().slice(-years);
  if (!periods.length) return null;
  const r = {};
  for (const [key] of LINES) r[key] = periods.map((p) => maps[key].get(p) ?? null);
  r.liabilities = r.liabilities.map((v, i) => v ?? sub(r.assets[i], r.equity[i]));
  r.grossProfit = r.grossProfit.map((v, i) => v ?? sub(r.revenue[i], r.cogs[i]));
  r.fcf = periods.map((_, i) => sub(r.cfo[i], r.capex[i] == null ? null : Math.abs(r.capex[i])));
  const per = (f) => periods.map((_, i) => f(i));
  r.grossMargin = per((i) => div(r.grossProfit[i], r.revenue[i]));
  r.opMargin = per((i) => div(r.operatingIncome[i], r.revenue[i]));
  r.netMargin = per((i) => div(r.netIncome[i], r.revenue[i]));
  r.roe = per((i) => div(r.netIncome[i], r.equity[i]));
  r.debtToEquity = per((i) => div(r.debt[i], r.equity[i]));
  r.revGrowth = per((i) => (i ? sub(div(r.revenue[i], r.revenue[i - 1]), 1) : null));
  r.fcfMargin = per((i) => div(r.fcf[i], r.revenue[i]));
  return { name: j.entityName, periods, rows: r };
}

export async function getFA(cik) {
  const j = await getFacts(cik);
  return j && parseFacts(j);
}

export async function getDES(cik) {
  const s = await getSubmissions(cik);
  if (!s) return null;
  const f = s.filings?.recent ?? {};
  const n = parseInt(cik, 10);
  const filings = (f.form ?? []).slice(0, 15).map((form, i) => ({
    form,
    date: f.filingDate[i],
    period: f.reportDate?.[i] || null,
    url: f.primaryDocument?.[i] ? `https://www.sec.gov/Archives/edgar/data/${n}/${f.accessionNumber[i].replaceAll('-', '')}/${f.primaryDocument[i]}` : null,
  }));
  return {
    name: s.name, cik: pad(cik), tickers: s.tickers ?? [], sic: s.sic || null, industry: s.sicDescription || null,
    exchange: s.exchanges?.[0] ?? null, state: s.stateOfIncorporation || null, fye: s.fiscalYearEnd || null,
    entityType: s.entityType || null, filings,
  };
}
