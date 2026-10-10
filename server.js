// Local dev server: static files + the same handlers Vercel runs from api/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import snap from './api/snap.js';
import chart from './api/chart.js';
import fundamentals from './api/fundamentals.js';
import data from './api/data.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = process.env.PORT || 3200;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const api = { '/api/snap': snap, '/api/chart': chart, '/api/fundamentals': fundamentals, '/api/data': data };

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (api[u.pathname]) { // Vercel-style res helpers
    req.query = Object.fromEntries(u.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    res.send = (b) => { res.setHeader('Content-Type', 'application/json'); res.end(b); };
    return api[u.pathname](req, res);
  }
  try {
    const p = normalize(u.pathname === '/' ? '/index.html' : u.pathname).replace(/^(\.\.[/\\])+/, '');
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`openterm on http://localhost:${PORT}`));
