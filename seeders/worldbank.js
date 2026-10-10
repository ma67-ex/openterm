// World Bank adapter: latest macro indicators for ~20 economies, one call per indicator.
const COUNTRIES = [['US', 'United States'], ['CN', 'China'], ['JP', 'Japan'], ['DE', 'Germany'], ['GB', 'United Kingdom'], ['FR', 'France'], ['IN', 'India'], ['BR', 'Brazil'], ['CA', 'Canada'], ['KR', 'South Korea'], ['AU', 'Australia'], ['MX', 'Mexico'], ['RU', 'Russia'], ['ID', 'Indonesia'], ['TR', 'Turkey'], ['SA', 'Saudi Arabia'], ['ZA', 'South Africa'], ['AR', 'Argentina'], ['IT', 'Italy'], ['ES', 'Spain']];
const INDICATORS = [['gdp', 'NY.GDP.MKTP.KD.ZG'], ['cpi', 'FP.CPI.TOTL.ZG'], ['un', 'SL.UEM.TOTL.ZS'], ['ca', 'BN.CAB.XOKA.GD.ZS'], ['debt', 'GC.DOD.TOTL.GD.ZS']];

async function indicator(code) {
  const r = await fetch(`https://api.worldbank.org/v2/country/${COUNTRIES.map(([c]) => c).join(';')}/indicator/${code}?format=json&mrv=2&per_page=200`);
  if (!r.ok) throw new Error(`worldbank ${code} ${r.status}`);
  const rows = (await r.json())[1] || [];
  const best = {};
  for (const x of rows) { // newest non-null year per country
    if (x.value == null) continue;
    const c = x.country.id;
    if (!best[c] || x.date > best[c][1]) best[c] = [+x.value.toFixed(2), +x.date];
  }
  return best;
}

// Row per country: { c, n, gdp: [value, year], cpi, un, ca, debt }.
export async function fetchWeco() {
  const res = await Promise.allSettled(INDICATORS.map(([, code]) => indicator(code)));
  if (res.every((x) => x.status === 'rejected')) throw new Error('worldbank unavailable');
  return COUNTRIES.map(([c, n]) => {
    const row = { c, n };
    INDICATORS.forEach(([k], i) => { const v = res[i].status === 'fulfilled' ? res[i].value[c] : null; if (v) row[k] = v; });
    return row;
  });
}
