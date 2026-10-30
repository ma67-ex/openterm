// US Treasury daily par yield curve, straight from the Treasury: no key, no account, free to reuse.
// The keyless fallback for FRED's DGS series (same numbers, FRED just republishes them).
const BASE = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';
// our maturity labels -> the Treasury's column names
export const COLS = { '1M': '1 Mo', '3M': '3 Mo', '6M': '6 Mo', '1Y': '1 Yr', '2Y': '2 Yr', '3Y': '3 Yr', '5Y': '5 Yr', '7Y': '7 Yr', '10Y': '10 Yr', '20Y': '20 Yr', '30Y': '30 Yr' };

// CSV text -> [{ date: 'YYYY-MM-DD', y: { '1M': 4.06, ... } }], oldest first. A blank or missing column is null.
export function parseCurveCsv(text) {
  const [head, ...lines] = String(text).trim().split(/\r?\n/);
  const names = head.split(',').map((h) => h.replace(/"/g, '').trim());
  const rows = [];
  for (const line of lines) {
    const cells = line.split(',').map((c) => c.replace(/"/g, '').trim()); // the values never contain commas
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0]);
    if (!d) continue;
    const y = {};
    for (const [label, col] of Object.entries(COLS)) {
      const v = parseFloat(cells[names.indexOf(col)]);
      y[label] = Number.isFinite(v) ? v : null;
    }
    rows.push({ date: `${d[3]}-${d[1]}-${d[2]}`, y });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// parsed years kept in memory: past years never change, the current one changes once a day
const memo = new Map();
export const clearTreasuryCache = () => memo.clear();

// fetchFn is for tests; with the default fetch, results are remembered
export async function curveYear(year, fetchFn) {
  const cacheable = fetchFn === undefined;
  const hit = cacheable && memo.get(year);
  if (hit && Date.now() - hit.at < (year < new Date().getUTCFullYear() ? 864e5 : 18e5)) return hit.rows;
  fetchFn ??= fetch;
  const r = await fetchFn(`${BASE}/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`, { headers: { 'User-Agent': 'openterm' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`treasury ${r.status}`);
  const rows = parseCurveCsv(await r.text());
  if (cacheable) memo.set(year, { at: Date.now(), rows });
  return rows;
}

// every row from startYear to this year, oldest first
export async function curveSince(startYear, fetchFn) {
  const now = new Date().getUTCFullYear();
  const years = Array.from({ length: Math.max(0, now - startYear + 1) }, (_, i) => startYear + i);
  return (await Promise.all(years.map((y) => curveYear(y, fetchFn)))).flat();
}

// the shape fetchCurve() returns: the latest value and the one before it, per maturity
export async function latestCurve(fetchFn) {
  const now = new Date().getUTCFullYear();
  let rows = await curveYear(now, fetchFn);
  if (rows.length < 2) rows = [...(await curveYear(now - 1, fetchFn)), ...rows]; // early January: the year has barely started
  return Object.keys(COLS).map((m) => {
    const have = rows.filter((r) => r.y[m] != null);
    const last = have.at(-1);
    return last ? { m, y: last.y[m], prev: have.at(-2)?.y[m] ?? null, date: last.date } : null;
  }).filter(Boolean);
}

// the observations obs() returns for one FRED series: [[date, value], ...]
export const asObservations = (rows, label) => rows.filter((r) => r.y[label] != null).map((r) => [r.date, r.y[label]]);
