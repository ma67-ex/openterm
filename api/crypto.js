// Crypto market data via CoinGecko (no API key). See lib/coingecko.js.
import { markets, globalStats } from '../lib/coingecko.js';

export default async function handler(req, res) {
  const q = (k) => String(req.query?.[k] ?? new URL(req.url, 'http://x').searchParams.get(k) ?? '');
  const view = q('view') || 'markets';
  const perPage = Math.min(Math.max(+q('perPage') || 50, 1), 250);

  if (!/^(markets|global)$/.test(view)) return res.status(400).json({ error: 'bad params', detail: 'view must be markets or global' });

  try {
    const out = view === 'global' ? await globalStats() : await markets(perPage);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(out);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); console.error(e); res.status(502).json({ error: 'upstream failed' }); }
}
