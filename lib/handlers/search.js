// Symbol search: /api/data?fn=search&q=apple
export default async function search(q) {
  const text = String(q.q || '').slice(0, 40);
  if (!/^[\w .&\-]{1,40}$/.test(text)) return { status: 400, body: { error: 'bad query' } };
  const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(text)}&quotesCount=8&newsCount=0`, { headers: { 'User-Agent': 'Mozilla/5.0 openterm' } });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const d = await r.json();
  return { body: { rows: (d.quotes || []).filter((x) => x.symbol).map((x) => ({ s: x.symbol, n: x.shortname || x.longname || '', x: x.exchDisp || '', t: x.quoteType || '' })) }, cache: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' };
}
