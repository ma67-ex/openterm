// FRED series: /api/data?fn=fredseries&id=DGS10&start=2020-01-01  and  /api/data?fn=curvehist
const base = 'https://api.stlouisfed.org/fred';
const CACHE_6H = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';
const CACHE_12H = 'public, max-age=0, s-maxage=43200, stale-while-revalidate=86400';
const MAX_ROWS = 4000;
const noKey = { status: 503, body: { error: 'FRED key not configured' }, cache: 'no-store' };

async function obs(id, start, end) {
  const u = `${base}/series/observations?series_id=${id}&api_key=${process.env.FRED_API_KEY}&file_type=json&observation_start=${start}${end ? `&observation_end=${end}` : ''}`;
  const r = await fetch(u);
  if (r.status === 400 || r.status === 404) return null;
  if (!r.ok) throw new Error(`fred ${r.status}`);
  return (await r.json()).observations.filter((o) => o.value !== '.').map((o) => [o.date, +o.value]);
}

export default async function fredseries(q) {
  const id = String(q.id || '').toUpperCase();
  if (!/^[A-Z0-9_]{1,30}$/.test(id)) return { status: 400, body: { error: 'bad id' } };
  const start = /^\d{4}-\d{2}-\d{2}$/.test(q.start || '') ? q.start : '1900-01-01';
  if (!process.env.FRED_API_KEY) return noKey;
  const [rows, meta] = await Promise.all([
    obs(id, start),
    fetch(`${base}/series?series_id=${id}&api_key=${process.env.FRED_API_KEY}&file_type=json`).then((r) => (r.ok ? r.json() : null)),
  ]);
  const s = meta?.seriess?.[0];
  if (!rows || !s) return { status: 404, body: { error: 'unknown series' }, cache: 'public, max-age=0, s-maxage=300' };
  const step = Math.ceil(rows.length / MAX_ROWS); // thin very long daily histories, keep the last point
  const out = step > 1 ? rows.filter((_, i) => i % step === 0 || i === rows.length - 1) : rows;
  return { body: { id, title: s.title, units: s.units_short || s.units, freq: s.frequency_short, rows: out }, cache: CACHE_6H };
}

const CURVE = [['1M', 'DGS1MO'], ['3M', 'DGS3MO'], ['6M', 'DGS6MO'], ['1Y', 'DGS1'], ['2Y', 'DGS2'], ['3Y', 'DGS3'], ['5Y', 'DGS5'], ['7Y', 'DGS7'], ['10Y', 'DGS10'], ['20Y', 'DGS20'], ['30Y', 'DGS30']];

// Yield curve today vs 1 month, 1 year and 5 years ago.
export async function curvehist() {
  if (!process.env.FRED_API_KEY) return noKey;
  const now = new Date(), day = (d) => d.toISOString().slice(0, 10);
  const ago = (y, m) => { const d = new Date(now); d.setUTCFullYear(d.getUTCFullYear() - y, d.getUTCMonth() - m); return day(d); };
  const targets = [['TODAY', day(now)], ['1M AGO', ago(0, 1)], ['1Y AGO', ago(1, 0)], ['5Y AGO', ago(5, 0)]];
  const all = await Promise.all(CURVE.map(([, id]) => obs(id, ago(5, 0).slice(0, 8) + '01')));
  const curves = targets.map(([label, t]) => {
    const dates = [];
    const y = all.map((rows) => {
      const o = rows && [...rows].reverse().find((r) => r[0] <= t);
      if (o) dates.push(o[0]);
      return o ? o[1] : null;
    });
    return { label, date: dates.sort().at(-1) ?? t, y };
  });
  return { body: { maturities: CURVE.map(([m]) => m), curves }, cache: CACHE_12H };
}
