// Shared FRED helpers for the macro seeded groups (not a group itself).
const base = 'https://api.stlouisfed.org/fred';
export const day = (d) => d.toISOString().slice(0, 10);
export const daysAgo = (n) => day(new Date(Date.now() - n * 864e5));

// Ascending [date, value] rows from `start`.
export async function fredObs(id, start) {
  if (!process.env.FRED_API_KEY) throw new Error('FRED_API_KEY missing');
  const r = await fetch(`${base}/series/observations?series_id=${id}&api_key=${process.env.FRED_API_KEY}&file_type=json&observation_start=${start}`);
  if (!r.ok) throw new Error(`${id} ${r.status}`);
  return (await r.json()).observations.filter((o) => o.value !== '.').map((o) => [o.date, +o.value]);
}

// Last observation dated on or before `date` (ISO strings compare lexically).
export const at = (rows, date) => [...rows].reverse().find((r) => r[0] <= date);
export const back = (date, days) => day(new Date(Date.parse(date) - days * 864e5));
export const r3 = (x) => +x.toFixed(3);
