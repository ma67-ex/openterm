// SEC EDGAR fundamentals. Not stored in Redis: the CDN caches it for a day.
import { tickerToCik, getFA, getDES } from '../lib/edgar.js';

export default async function handler(req, res) {
  const s = String(req.query?.s ?? new URL(req.url, 'http://x').searchParams.get('s') ?? '');
  const view = String(req.query?.view ?? new URL(req.url, 'http://x').searchParams.get('view') ?? 'fa');
  if (!/^[A-Za-z.\-]{1,10}$/.test(s) || !/^(fa|des)$/.test(view)) return res.status(400).json({ error: 'bad params' });
  try {
    const co = await tickerToCik(s);
    if (!co) return res.status(404).json({ error: 'unknown ticker' });
    const data = await (view === 'fa' ? getFA(co.cik) : getDES(co.cik));
    if (!data) return res.status(404).json({ error: 'no filings' });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ sym: s.toUpperCase(), view, cik: String(co.cik).padStart(10, '0'), ...data });
  } catch (e) { res.status(502).json({ error: 'upstream failed', detail: String(e.message).slice(0, 80) }); }
}
