// Sharia screening rule sets as data, plus the pure screening function. A coarse screening aid, not a fatwa.
// Test: ratio = num / den. den: 'mcap' market cap, 'assets' total assets, 'revenue' revenue.
export const RULESETS = {
  sp: {
    label: 'S&P Shariah style',
    note: 'Uses current market cap; the real index uses a 36-month average.',
    tests: [
      { id: 'debt', label: 'Interest-bearing debt / market cap', num: 'debt', den: 'mcap', max: 0.33 },
      { id: 'cash', label: 'Cash + interest-bearing securities / market cap', num: 'cash', den: 'mcap', max: 0.33 },
      { id: 'recv', label: 'Receivables / market cap', num: 'recv', den: 'mcap', max: 0.49 },
      { id: 'income', label: 'Non-halal income / revenue (interest income proxy)', num: 'interest', den: 'revenue', max: 0.05 },
    ],
  },
  aaoifi: {
    label: 'AAOIFI style (market cap)',
    note: 'AAOIFI-style 30% limits on market cap; no receivables test.',
    tests: [
      { id: 'debt', label: 'Interest-bearing debt / market cap', num: 'debt', den: 'mcap', max: 0.30 },
      { id: 'cash', label: 'Cash + interest-bearing securities / market cap', num: 'cash', den: 'mcap', max: 0.30 },
      { id: 'income', label: 'Non-halal income / revenue (interest income proxy)', num: 'interest', den: 'revenue', max: 0.05 },
    ],
  },
  'aaoifi-assets': {
    label: 'AAOIFI style (total assets)',
    note: 'Total assets variant; denominators are balance sheet total assets.',
    tests: [
      { id: 'debt', label: 'Interest-bearing debt / total assets', num: 'debt', den: 'assets', max: 0.30 },
      { id: 'cash', label: 'Cash + interest-bearing securities / total assets', num: 'cash', den: 'assets', max: 0.30 },
      { id: 'income', label: 'Non-halal income / revenue (interest income proxy)', num: 'interest', den: 'revenue', max: 0.05 },
    ],
  },
};
export const DEFAULT_RULESET = 'sp';
export const DISCLAIMER = 'Screening aid only, not religious advice or a fatwa. Based on SEC filings and approximations (latest 10-K balance sheet, current price, interest income as a proxy for non-halal income). Consult a qualified scholar.';

// SIC codes: [from, to, category, severity]. FAIL = core prohibited activity, REVIEW = may contain it.
const SIC = [
  [6020, 6029, 'conventional banking', 'FAIL'], [6035, 6036, 'conventional banking', 'FAIL'], [6111, 6111, 'conventional lending', 'FAIL'],
  [6141, 6163, 'conventional lending', 'FAIL'], [6199, 6199, 'finance services', 'REVIEW'], [6200, 6289, 'brokerage / investment banking', 'REVIEW'],
  [6300, 6399, 'conventional insurance', 'FAIL'], [6411, 6411, 'insurance agents', 'REVIEW'],
  [2080, 2080, 'beverages (may include alcohol)', 'REVIEW'], [2082, 2085, 'alcohol', 'FAIL'],
  [2100, 2111, 'tobacco', 'FAIL'], [5180, 5182, 'alcohol wholesale', 'FAIL'], [5993, 5993, 'tobacco retail', 'FAIL'],
  [2011, 2013, 'meat packing (may include pork)', 'REVIEW'],
  [7011, 7011, 'hotels and casinos', 'REVIEW'], [7990, 7990, 'amusement and gambling', 'REVIEW'],
  [3480, 3489, 'weapons / ordnance', 'FAIL'], [3760, 3769, 'missiles', 'REVIEW'], [3795, 3795, 'tanks', 'FAIL'],
];
const KEYWORDS = [
  ['alcohol', /\b(brew\w*|distill\w*|spirits|vodka|whisk\w*|wine\w*|liquor|beer)\b/i], ['tobacco', /\b(tobacco|cigar\w*|smok\w*|vap\w*)\b/i],
  ['gambling', /\b(casino\w*|gaming|gambl\w*|lotter\w*|wager\w*|betting|sportsbook)\b/i], ['pork', /\b(pork|swine|bacon|hog)\b/i],
  ['conventional banking', /\b(bank\w*|bancorp|bancshares|savings|credit union|mortgage)\b/i], ['conventional insurance', /\b(insurance|assurance|reinsurance)\b/i],
  ['adult entertainment', /\b(playboy|adult|erotic|pornograph\w*)\b/i], ['weapons', /\b(ammunition|firearms?|weapons?|ordnance|arms)\b/i],
];

export function businessScreen(sic, name) {
  const reasons = [];
  let status = 'PASS';
  const n = parseInt(sic, 10);
  for (const [a, b, cat, sev] of SIC) {
    if (n >= a && n <= b) { reasons.push(`SIC ${sic}: ${cat}`); if (sev === 'FAIL') status = 'FAIL'; else if (status === 'PASS') status = 'REVIEW'; }
  }
  for (const [cat, re] of KEYWORDS) {
    if (re.test(name || '')) { reasons.push(`name keyword: ${cat}`); if (status === 'PASS') status = 'REVIEW'; }
  }
  return { status, reasons, heuristic: 'Coarse SIC code and name keyword heuristic, not a verified business-activity review.' };
}

const r4 = (x) => (x == null ? null : +x.toFixed(4));

// inputs: { mcap, assets, revenue, debt, cash, recv, interest } in USD, any may be null
export function screen(inputs, rulesetId = DEFAULT_RULESET) {
  const rs = RULESETS[rulesetId] ?? RULESETS[DEFAULT_RULESET];
  const tests = rs.tests.map((t) => {
    const n = inputs[t.num], d = inputs[t.den];
    const ratio = n == null || !d ? null : n / d;
    const status = ratio == null ? 'REVIEW' : ratio < t.max ? 'PASS' : 'FAIL';
    return { id: t.id, label: t.label, ratio: r4(ratio), max: t.max, status, approx: t.id === 'income' };
  });
  const purification = inputs.interest != null && inputs.revenue ? r4((inputs.interest / inputs.revenue) * 100) : null;
  return { tests, purification, ruleset: rulesetId in RULESETS ? rulesetId : DEFAULT_RULESET };
}

export function overall(business, tests) {
  const all = [business.status, ...tests.map((t) => t.status)];
  return all.includes('FAIL') ? 'FAIL' : all.includes('REVIEW') ? 'REVIEW' : 'PASS';
}
