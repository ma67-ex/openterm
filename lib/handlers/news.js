// Ticker news from Yahoo Finance and Google News RSS: /api/data?fn=news&s=AAPL
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const clean = (s) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const tag = (x, name) => x.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

function parse(xml, fallback) {
  const out = [];
  for (const [, x] of xml.matchAll(/<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi)) {
    let t = clean(tag(x, 'title') ?? '');
    const u = clean(tag(x, 'link') ?? '') || x.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] || '';
    const d = new Date(clean(tag(x, 'pubDate') ?? tag(x, 'published') ?? tag(x, 'updated') ?? ''));
    let src = clean(tag(x, 'source') ?? '') || fallback;
    if (fallback === 'Google' && src !== fallback && t.endsWith(` - ${src}`)) t = t.slice(0, -src.length - 3);
    if (!t || !/^https?:\/\//i.test(u) || isNaN(d)) continue;
    out.push({ t, u: decode(u), s: src, ts: d.toISOString() });
  }
  return out;
}

export default async function news(q) {
  const s = String(q.s || '').toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const feeds = [
    ['Yahoo', `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(s)}&region=US&lang=en-US`],
    ['Google', `https://news.google.com/rss/search?q=${encodeURIComponent(s)}+stock&hl=en-US&gl=US&ceid=US:en`],
  ];
  const res = await Promise.allSettled(feeds.map(async ([name, url]) => {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${name} ${r.status}`);
    return parse(await r.text(), name);
  }));
  if (res.every((o) => o.status === 'rejected')) return { status: 502, body: { error: 'feeds unavailable' }, cache: 'public, max-age=0, s-maxage=60' };
  const seen = new Set();
  const rows = res.filter((o) => o.status === 'fulfilled').flatMap((o) => o.value)
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .filter((r) => { const k = r.t.toLowerCase(); return !seen.has(k) && seen.add(k); })
    .slice(0, 40);
  return { body: { s, rows }, cache: 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' };
}
