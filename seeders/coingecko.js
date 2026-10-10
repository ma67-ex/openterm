// CoinGecko public API adapter: top 30 coins with 1h/24h/7d change and a compact sparkline.
const URL_ = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=true&price_change_percentage=1h,24h,7d';
const sig = (x) => (x == null ? null : Number(x.toPrecision(5)));
const r2 = (x) => (x == null ? null : +x.toFixed(2));

export async function fetchCrypto() {
  const r = await fetch(URL_, { headers: { 'User-Agent': 'Mozilla/5.0 openterm', accept: 'application/json' } });
  if (!r.ok) return []; // 429 or outage: no data, runner skips the write
  const j = await r.json();
  if (!Array.isArray(j)) return [];
  return j.map((c) => ({
    s: String(c.symbol).toUpperCase(), n: c.name, p: sig(c.current_price), mc: c.market_cap, v: c.total_volume,
    c1h: r2(c.price_change_percentage_1h_in_currency), c24h: r2(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h),
    c7d: r2(c.price_change_percentage_7d_in_currency), spark: (c.sparkline_in_7d?.price ?? []).slice(-24).map(sig),
  }));
}
