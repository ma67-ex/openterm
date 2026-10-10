import { readSnaps } from '../lib/snap.js';

export default async function handler(req, res) {
  try {
    const data = await readSnaps(req.query?.keys ?? new URL(req.url, 'http://x').searchParams.get('keys'));
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (e) { res.status(502).json({ error: 'snapshot read failed' }); }
}
