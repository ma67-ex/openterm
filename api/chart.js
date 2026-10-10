// Price history passthrough. Not stored in Redis: the CDN caches it (60 s intraday, 1 h daily).
import { validSym, validCombo, cacheFor, yahoo } from '../lib/handlers/history.js';

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x').searchParams;
  const s = String(req.query?.s ?? u.get('s') ?? '');
  const range = String(req.query?.range ?? u.get('range') ?? '6mo');
  const interval = String(req.query?.interval ?? u.get('interval') ?? '1d');
  if (!validSym(s) || !validCombo(range, interval)) return res.status(400).json({ error: 'bad params' });
  try {
    const body = await yahoo(s, range, interval);
    res.setHeader('Cache-Control', cacheFor(interval));
    res.status(200).send(body);
  } catch (e) { res.status(502).json({ error: String(e.message).startsWith(s) ? `upstream ${String(e.message).split(' ').pop()}` : 'upstream failed' }); }
}
