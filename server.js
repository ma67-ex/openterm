// Zero-dependency server: static files + CORS-free proxy for free market-data APIs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = process.env.PORT || 3200;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };
const cache = new Map(); // url -> {t, body}; 30s TTL keeps us under free-tier rate limits

async function upstream(url, ttl = 30000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.body;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const body = await r.text();
  cache.set(url, { t: Date.now(), body });
  return body;
}

const routes = {
  // OHLC + quote meta. Yahoo chart endpoint (unofficial, delayed).
  '/api/chart': (q) => upstream(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.get('s'))}?range=${q.get('range') || '6mo'}&interval=${q.get('interval') || '1d'}`),
  // Symbol search.
  '/api/search': (q) => upstream(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.get('q'))}&quotesCount=8&newsCount=0`, 300000),
  // Headlines via Yahoo RSS.
  '/api/news': (q) => upstream(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(q.get('s') || '^GSPC')}&region=US&lang=en-US`, 120000),
};

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (routes[u.pathname]) {
      const body = await routes[u.pathname](u.searchParams);
      res.writeHead(200, { 'Content-Type': u.pathname === '/api/news' ? 'application/xml' : 'application/json' });
      return res.end(body);
    }
    const p = normalize(u.pathname === '/' ? '/index.html' : u.pathname).replace(/^(\.\.[/\\])+/, '');
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 502, { 'Content-Type': 'text/plain' });
    res.end(e.code === 'ENOENT' ? 'not found' : String(e.message));
  }
}).listen(PORT, () => console.log(`openterm on http://localhost:${PORT}`));
