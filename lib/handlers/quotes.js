// Batch quotes for up to 40 symbols: /api/data?fn=quotes&s=AAPL,MSFT
import { fetchRows } from '../../seeders/yahoo.js';

export default async function quotes(q) {
  const syms = [...new Set(String(q.s || '').toUpperCase().split(',').filter((s) => /^[A-Z0-9.^=\-]{1,15}$/.test(s)))].slice(0, 40);
  if (!syms.length) return { status: 400, body: { error: 'no valid symbols' } };
  const rows = await fetchRows(syms.map((s) => [s, s]));
  return { body: { rows }, cache: 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' };
}
