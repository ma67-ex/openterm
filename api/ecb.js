// Euro-area macro/FX series via the ECB Statistical Data Warehouse (no API key). See lib/ecb.js.
import { series, latest } from '../lib/ecb.js';

// flowRef/key are ECB SDW path segments (e.g. EXR/D.USD.EUR.SP00.A) - restrict
// to the characters ECB itself uses so this can't be turned into a path-traversal
// or open proxy against data-api.ecb.europa.eu.
const SAFE = /^[A-Za-z0-9._-]{1,64}$/;

export default async function handler(req, res) {
  const q = (k) => String(req.query?.[k] ?? new URL(req.url, 'http://x').searchParams.get(k) ?? '');
  const flowRef = q('flowRef');
  const key = q('key');
  const lastN = Math.min(Math.max(+q('lastN') || 260, 1), 2000);
  const latestOnly = q('latest') === '1';

  if (!SAFE.test(flowRef) || !SAFE.test(key)) return res.status(400).json({ error: 'bad params', detail: 'flowRef and key must be ECB SDW path segments' });

  try {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(latestOnly ? await latest(flowRef, key) : await series(flowRef, key, lastN));
  } catch (e) { res.status(502).json({ error: 'upstream failed', detail: String(e.message).slice(0, 80) }); }
}
