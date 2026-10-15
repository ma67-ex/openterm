// CoinGecko public market-data endpoint, no API key required.
// Ported from ErTasselli/OpenTerminal (MIT), server/src/providers/coingecko.ts, verified live 2026-10-15.

const BASE = 'https://api.coingecko.com/api/v3';

export async function markets(perPage = 50) {
  const url = `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=true&price_change_percentage=24h`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const rows = await r.json();
  return rows.map((x) => ({
    id: x.id,
    symbol: (x.symbol ?? '').toUpperCase(),
    name: x.name,
    price: x.current_price,
    changePercent24h: x.price_change_percentage_24h ?? null,
    marketCap: x.market_cap ?? null,
    volume24h: x.total_volume ?? null,
    rank: x.market_cap_rank ?? null,
    sparkline: x.sparkline_in_7d?.price ?? [],
  }));
}

export async function globalStats() {
  const r = await fetch(`${BASE}/global`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const d = (await r.json())?.data;
  return {
    totalMarketCap: d?.total_market_cap?.usd ?? 0,
    btcDominance: d?.market_cap_percentage?.btc ?? 0,
    ethDominance: d?.market_cap_percentage?.eth ?? 0,
  };
}
