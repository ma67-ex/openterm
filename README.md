# OpenTerm

![Node](https://img.shields.io/badge/node-18%2B-339933)
![Dependencies](https://img.shields.io/badge/dependencies-none-2ea44f)
![Data](https://img.shields.io/badge/data-free%20sources%20only-blue)
![License](https://img.shields.io/badge/license-MIT-green)

[![OpenTerm dashboard with watchlist, candlestick chart, news wire, yield curve and economic calendar](docs/screenshot.png)](https://openterm-lovat.vercel.app)

**[Live demo](https://openterm-lovat.vercel.app)**

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
- Live market news wire (`WIRE` or `WIRE <ticker>`), auto-refreshing every 45s, pauses on hover
- Earnings-call coverage headlines on `ERN` (no free full-transcript source exists, so this is press writeups, not the call itself)
- US Congress, Trump and cabinet stock trades (`CONG`, `POL`)
- Day-count convention math (`/api/daycount`)
- Total crypto market cap and BTC/ETH dominance in the `CRYPTO` widget header
- `ECB` widget: euro-area reference rate chart + majors strip (USD, GBP, JPY, CHF, CNY, AUD, CAD)

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

\*\* CoinGecko is wired via `CRYPTO` (seeded top-30 + live global dominance) and `/api/crypto`. ECB is wired via the `ECB` widget and `/api/ecb` (majors reference rates only, not the full dataflow catalog).

\*\*\* Binance's public REST API geo-blocks by request IP per their own terms (`"Service unavailable from a restricted location"`, verified directly, 2026-10-15) — unreliable from US-region hosts. Not wired in; CoinGecko covers crypto without that risk.

## License

MIT. See [LICENSE](LICENSE).
