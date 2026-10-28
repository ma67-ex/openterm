// Single dispatcher for on-demand endpoints (see lib/handlers/index.js).
import { handlers } from '../lib/handlers/index.js';

export default async function handler(req, res) {
  const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const h = Object.hasOwn(handlers, q.fn) ? handlers[q.fn] : null;
  if (!h) return res.status(404).json({ error: 'unknown fn' });
  try {
    const { status = 200, body, cache } = await h(q);
    // a handler's own cache wins (some cache a 404 briefly on purpose); otherwise never cache an error
    res.setHeader('Cache-Control', cache ?? (status >= 400 ? 'no-store' : 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600'));
    res.status(status).json(body);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); console.error(e); res.status(502).json({ error: 'upstream failed' }); }
}
