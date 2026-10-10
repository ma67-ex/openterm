// Sharia screening from SEC facts: /api/data?fn=halal&s=MSFT[&rules=sp|aaoifi|aaoifi-assets]
import { tickerToCik, getFacts, getSubmissions } from '../edgar.js';
import { fetchRows } from '../../seeders/yahoo.js';
import { RULESETS, DEFAULT_RULESET, DISCLAIMER, businessScreen, screen, overall } from '../halal-rules.js';

const DAY = 864e5;
const num = (v) => (v == null ? null : v);

// value of the first tag with a 10-K FY entry ending on `end`; flow tags need a full-year duration
function at(facts, tags, end, flow = false, unit = 'USD') {
  for (const t of tags) {
    let best = null;
    for (const e of facts[t]?.units?.[unit] ?? []) {
      if (e.end !== end || !e.form?.startsWith('10-K')) continue;
      if (flow) { const d = (new Date(e.end) - new Date(e.start)) / DAY; if (d < 340 || d > 380) continue; }
      if (!best || e.filed > best.filed) best = e;
    }
    if (best) return best.val;
  }
  return null;
}
const add = (...xs) => (xs.every((x) => x == null) ? null : xs.reduce((a, b) => a + (b ?? 0), 0));

function latestEnd(facts) {
  const ends = (facts.Assets?.units?.USD ?? []).filter((e) => e.form?.startsWith('10-K') && e.fp === 'FY').map((e) => e.end);
  return ends.sort().at(-1) ?? null;
}

// latest cover-page share count; classes reported on the same filing are summed (distinct values only)
function shares(j) {
  const rows = (j.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? []);
  if (rows.length) {
    const end = rows.map((e) => e.end).sort().at(-1);
    const top = rows.filter((e) => e.end === end);
    const filed = top.map((e) => e.filed).sort().at(-1);
    return { n: [...new Set(top.filter((e) => e.filed === filed).map((e) => e.val))].reduce((a, b) => a + b, 0), src: `dei cover page ${end}` };
  }
  const w = (j.facts?.['us-gaap']?.WeightedAverageNumberOfDilutedSharesOutstanding?.units?.shares ?? []).filter((e) => e.form?.startsWith('10-K') && e.fp === 'FY');
  const e = w.sort((a, b) => a.end.localeCompare(b.end)).at(-1);
  return e ? { n: e.val, src: `diluted weighted average ${e.end}` } : null;
}

export default async function halal(q) {
  const s = String(q.s || '').toUpperCase();
  const rules = Object.hasOwn(RULESETS, q.rules) ? q.rules : DEFAULT_RULESET;
  if (!/^[A-Z.\-]{1,10}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const co = await tickerToCik(s);
  if (!co) return { status: 404, body: { error: 'unknown ticker' }, cache: 'public, max-age=0, s-maxage=3600' };
  const [j, sub, px] = await Promise.all([getFacts(co.cik), getSubmissions(co.cik), fetchRows([[s.replace('.', '-'), s]]).catch(() => [])]);
  const f = j?.facts?.['us-gaap'];
  const end = f && latestEnd(f);
  if (!end) return { status: 404, body: { error: 'no us-gaap 10-K data' }, cache: 'public, max-age=0, s-maxage=3600' };

  const cashSt = at(f, ['CashCashEquivalentsAndShortTermInvestments'], end);
  const cashOnly = at(f, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], end);
  const stInv = at(f, ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'], end);
  const ltInv = at(f, ['MarketableSecuritiesNoncurrent', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent', 'LongTermInvestments'], end);
  const debtTotal = at(f, ['LongTermDebt'], end) ?? add(at(f, ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'], end), at(f, ['LongTermDebtCurrent'], end));
  const debt = add(debtTotal, at(f, ['CommercialPaper'], end), at(f, ['ShortTermBorrowings'], end));
  const sh = shares(j);
  const price = px[0]?.p ?? null;
  const inputs = {
    assets: at(f, ['Assets'], end),
    revenue: at(f, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet'], end, true),
    debt,
    cash: cashSt != null ? add(cashSt, ltInv) : add(cashOnly, stInv, ltInv),
    recv: at(f, ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsReceivableNet'], end),
    interest: at(f, ['InvestmentIncomeInterest', 'InvestmentIncomeInterestAndDividend', 'InterestAndDividendIncomeOperating', 'InterestIncomeOther'], end, true),
    mcap: sh && price ? Math.round(sh.n * price) : null,
  };
  const biz = businessScreen(sub?.sic, sub?.name || j.entityName);
  const { tests, purification, ruleset } = screen(inputs, rules);
  return {
    body: {
      s, name: j.entityName, sic: sub?.sic ?? null, industry: sub?.sicDescription ?? null, fiscalEnd: end, price, shares: sh?.n ?? null, sharesSrc: sh?.src ?? null,
      inputs, ruleset, rulesets: Object.fromEntries(Object.entries(RULESETS).map(([k, v]) => [k, v.label])), rulesNote: RULESETS[ruleset].note,
      business: biz, tests, overall: overall(biz, tests), purification, disclaimer: DISCLAIMER,
    },
    cache: 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400',
  };
}
