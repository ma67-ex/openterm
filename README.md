# OpenTerm

An open-source, Bloomberg-style market terminal built only on free data sources.

## Run

```bash
npm start
```

Then open http://localhost:3200. No dependencies, Node 18+.

## What works now

- Command bar (`AAPL`, `CHART TSLA`, `NEWS NVDA`)
- Watchlist with live (delayed) quotes
- Price chart
- Headlines per symbol

## Roadmap (feature parity target, free sources only)

| Bloomberg area | Free source |
|---|---|
| Equities, ETFs, indices, FX, futures | Yahoo chart endpoint, Stooq\*, Twelve Data |
| Filings and fundamentals | SEC EDGAR, Financial Modeling Prep free tier |
| Macro and economics | FRED, World Bank, IMF, ECB |
| Crypto | CoinGecko, Binance public API |
| News | RSS, GDELT, Finnhub |
| Screener, heatmaps, movers | Computed from quotes |
| Yield curves, rates | FRED, US Treasury |
| Earnings and economic calendar | Finnhub, FRED releases |
| Portfolio and risk analytics | Computed locally |

## Known limits

Free feeds are delayed or rate-limited. Real-time ticks, dealer-quoted fixed income, licensed analyst consensus and chat are out of scope. Check each provider's terms before redistributing data publicly.

\* Stooq's historical CSV endpoint (`/q/d/l/`) now requires an API key obtained via CAPTCHA on their site, and throttled requests return HTTP 200 with an error string in the body rather than a 429. Verify current behavior before wiring this in.
