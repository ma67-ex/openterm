// Price history passthrough. Not stored in Redis: the CDN caches it for an hour.
export default async function handler(req, res) {
  const s = String(req.query?.s ?? new URL(req.url, 'http://x').searchParams.get('s') ?? '');
  const range = String(req.query?.range ?? '6mo');
  if (!/^[A-Za-z0-9.^=\-]{1,15}$/.test(s) || !/^(1d|5d|1mo|3mo|6mo|1y|5y|max)$/.test(range)) return res.status(400).json({ error: 'bad params' });
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0 openterm' } });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(await r.text());
  } catch { res.status(502).json({ error: 'upstream failed' }); }
}
