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
- US Congress, Trump and cabinet stock trades (`CONG`, `POL`)
- Day-count convention math (`/api/daycount`)
- Crypto markets via CoinGecko, no key (`/api/crypto`) — API only, no widget yet
- Euro-area macro/FX series via ECB SDW, no key (`/api/ecb`) — API only, no widget yet

## Roadmap (feature parity target, free sources only)

| Bloomberg area | Free source |
|---|---|
| Equities, ETFs, indices, FX, futures | Yahoo chart endpoint, Stooq\*, Twelve Data |
| Filings and fundamentals | SEC EDGAR, Financial Modeling Prep free tier |
| Macro and economics | FRED, World Bank, IMF, ECB\*\* |
| Crypto | CoinGecko\*\*, Binance public API\*\*\* |
| News | RSS, GDELT, Finnhub |
| Screener, heatmaps, movers | Computed from quotes |
| Yield curves, rates | FRED, US Treasury |
| Earnings and economic calendar | Finnhub, FRED releases |
| Portfolio and risk analytics | Computed locally |

## Known limits

Free feeds are delayed or rate-limited. Real-time ticks, dealer-quoted fixed income, licensed analyst consensus and chat are out of scope. Check each provider's terms before redistributing data publicly.

\* Stooq's `/q/d/l/` and `/q/l/` endpoints now serve a JS proof-of-work challenge page instead of CSV for plain server-side requests (verified directly, 2026-10-15) — no key, no CAPTCHA, just a bot check a headless fetch can't pass. Dead as a server-side source until that changes.

\*\* CoinGecko and ECB are wired (`/api/crypto`, `/api/ecb`), API only — no terminal widget yet.

\*\*\* Binance's public REST API geo-blocks by request IP per their own terms (`"Service unavailable from a restricted location"`, verified directly, 2026-10-15) — unreliable from US-region hosts. Not wired in; CoinGecko covers crypto without that risk.
