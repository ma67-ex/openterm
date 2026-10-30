// FRED adapters (free key): US Treasury yield curve and upcoming major economic releases.
import { latestCurve } from '../lib/treasury.js';

const KEY = () => process.env.FRED_API_KEY;
const base = 'https://api.stlouisfed.org/fred';

const CURVE = [['1M', 'DGS1MO'], ['3M', 'DGS3MO'], ['6M', 'DGS6MO'], ['1Y', 'DGS1'], ['2Y', 'DGS2'], ['3Y', 'DGS3'], ['5Y', 'DGS5'], ['7Y', 'DGS7'], ['10Y', 'DGS10'], ['20Y', 'DGS20'], ['30Y', 'DGS30']];

async function latestTwo(id) {
  const r = await fetch(`${base}/series/observations?series_id=${id}&api_key=${KEY()}&file_type=json&sort_order=desc&limit=10`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${id} ${r.status}`);
  const obs = (await r.json()).observations.filter((o) => o.value !== '.'); // '.' = no print that day
  return { y: +obs[0].value, prev: obs[1] ? +obs[1].value : null, date: obs[0].date };
}

export async function fetchCurve() {
  if (KEY()) {
    const res = await Promise.allSettled(CURVE.map(([, id]) => latestTwo(id)));
    const out = CURVE.map(([m], i) => (res[i].status === 'fulfilled' ? { m, ...res[i].value } : null)).filter(Boolean);
    if (out.length) return out;
  }
  return latestCurve(); // no key, or FRED gave nothing: the Treasury publishes the same curve with no key
}

// Releases worth showing on a terminal calendar. FRED also lists hundreds of daily data feeds we skip.
const MAJOR = new Set(['Employment Situation', 'Consumer Price Index', 'Producer Price Index', 'Gross Domestic Product', 'Personal Income and Outlays', 'Advance Monthly Sales for Retail and Food Services', 'G.17 Industrial Production and Capacity Utilization', 'Job Openings and Labor Turnover Survey', 'ADP National Employment Report', 'New Residential Construction', 'Existing Home Sales', 'Surveys of Consumers', 'Employment Cost Index', 'Advance Economic Indicators', 'Empire State Manufacturing Survey', 'Housing Units Authorized By Building Permits', 'Construction Spending']);

export async function fetchCalendar() {
  if (!KEY()) throw new Error('FRED_API_KEY missing');
  const day = (d) => d.toISOString().slice(0, 10);
  const from = new Date(), to = new Date(Date.now() + 30 * 864e5);
  const r = await fetch(`${base}/releases/dates?api_key=${KEY()}&file_type=json&realtime_start=${day(from)}&realtime_end=${day(to)}&include_release_dates_with_no_data=true&order_by=release_date&sort_order=asc&limit=1000`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`calendar ${r.status}`);
  return (await r.json()).release_dates.filter((x) => MAJOR.has(x.release_name) && x.date >= day(from)).slice(0, 14).map((x) => ({ d: x.date, e: x.release_name }));
}
