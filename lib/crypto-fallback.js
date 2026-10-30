// Backup prices for crypto pairs written like Yahoo's ("BTC-USD") when Yahoo cannot answer: Kraken first, then Binance.US.
// Both are public market-data endpoints with no key. (Binance.com itself refuses US addresses with a 451.)
import { mapLimit } from './yahoo.js';

const KRAKEN_NAMES = { BTC: 'XBT', DOGE: 'XDG' }; // Kraken's own tickers for these two
const round = (x, d) => +x.toFixed(d);

async function kraken(base, fetchFn) {
  const r = await fetchFn(`https://api.kraken.com/0/public/Ticker?pair=${KRAKEN_NAMES[base] ?? base}USD`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const d = await r.json();
  const t = d.error?.length ? null : Object.values(d.result ?? {})[0];
  const last = t && parseFloat(t.c?.[0]), open = t && parseFloat(t.o);
  if (!(last > 0) || !(open > 0)) return null;
  return { p: last, c: round(last - open, 4), pc: round(((last - open) / open) * 100, 2), v: parseFloat(t.v?.[1]) || null };
}

async function binanceUs(base, fetchFn) {
  const r = await fetchFn(`https://api.binance.us/api/v3/ticker/24hr?symbol=${base}USD`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const t = await r.json();
  const last = parseFloat(t.lastPrice);
  if (!(last > 0)) return null;
  return { p: last, c: round(parseFloat(t.priceChange), 4), pc: round(parseFloat(t.priceChangePercent), 2), v: parseFloat(t.volume) || null };
}

// pairs: [[symbol, name], ...]. Only "XXX-USD" symbols are tried; anything else, or anything neither exchange lists, is left out.
export async function cryptoRows(pairs, { fetchFn = fetch } = {}) {
  const done = await mapLimit(pairs.filter(([s]) => /^[A-Z0-9]{2,10}-USD$/.test(s)), 4, async ([s, n]) => {
    const base = s.slice(0, -4);
    for (const source of [kraken, binanceUs]) {
      try {
        const row = await source(base, fetchFn);
        if (row) return { s, n, ...row };
      } catch { /* try the next exchange */ }
    }
    return null;
  });
  return done.filter((o) => o.status === 'fulfilled' && o.value).map((o) => o.value);
}
