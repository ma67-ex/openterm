// Free RSS/Atom headline feeds merged into one newest-first list. A dead feed is skipped, never fatal.
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' };
const FEEDS = [
  ['Yahoo', 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US'],
  ['CNBC', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'],
  ['MarketWatch', 'http://feeds.marketwatch.com/marketwatch/topstories/'],
  ['Reuters', 'https://feeds.reuters.com/reuters/businessNews'],
  ['BBC', 'https://feeds.bbci.co.uk/news/business/rss.xml'],
];
const LIMIT = 30;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const clean = (s) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const tag = (x, name) => x.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

function parse(xml, source) {
  const out = [];
  for (const [, x] of xml.matchAll(/<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const t = clean(tag(x, 'title') ?? '');
    const u = clean(tag(x, 'link') ?? '') || x.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] || '';
    const d = new Date(clean(tag(x, 'pubDate') ?? tag(x, 'published') ?? tag(x, 'updated') ?? ''));
    if (!t || !/^https?:\/\//i.test(u) || isNaN(d)) continue;
    out.push({ t, u: decode(u), s: source, ts: d.toISOString() });
  }
  return out;
}

export async function fetchNews() {
  const res = await Promise.allSettled(FEEDS.map(async ([name, url]) => {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${name} ${r.status}`);
    const rows = parse(await r.text(), name);
    console.log(`news: ${name} ${rows.length} items`);
    return rows;
  }));
  res.forEach((o) => { if (o.status === 'rejected') console.log(`news: feed failed (${o.reason?.message})`); });
  const seen = new Set();
  return res.filter((o) => o.status === 'fulfilled').flatMap((o) => o.value)
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .filter((r) => { const k = r.t.toLowerCase(); return !seen.has(k) && seen.add(k); })
    .slice(0, LIMIT);
}
