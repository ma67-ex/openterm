# Free data sources that can back up Yahoo

Checked on 2026-10-30. Latency and status come from live requests from one US home connection, so "works here" does not prove it works from Vercel or GitHub Actions. Terms were read on each provider's own page that day. This is a reading of the published terms, not legal advice.

The owner's position: OpenTerm is non-commercial and a personal project, and the owner accepts the risk of using Yahoo's unofficial endpoints.

## Terms that decided which sources are used

Non-commercial does not rescue a source whose terms forbid showing its data to other people, and OpenTerm is a public site. Those sources are not used:

| Source | Signup | What its terms say | Used? |
|---|---|---|---|
| Finnhub (free) | Free key | Personal use only; no redistributing or sharing the data or derived results with any third party | No |
| Tiingo (free) | Free key | Internal use only; the data may not be displayed or shared | No |
| Financial Modeling Prep (free) | Free key | Individual, personal, non-business use; no showing data on any website or app used by several people, free or paid | No |
| Twelve Data (free) | Free key | Development and testing only; not to be displayed to users or used in production | No |
| Coinbase market data | None | No redistributing, displaying or disseminating market data, or anything derived from it, to third parties without written consent | No |
| Cboe delayed quotes | None | Its page says downloading the quote data with automated programs is strictly prohibited | No |
| Alpha Vantage, Polygon (Massive), Alpaca | Free key | Not read in full. Alpha Vantage's 25 requests a day and Polygon's 5 a minute are too small to fail over to | No |
| Nasdaq `api.nasdaq.com`, Stooq | None | Undocumented and restrictive, or a bot-check page for servers | No |

## Sources that are used, or newly wired

| Source | Signup | Terms | Measured here | Role |
|---|---|---|---|---|
| Yahoo (`query1`, `query2`, spark) | None | Unofficial endpoints. Yahoo's terms prohibit automated access and commercial reuse without permission: accepted by the owner for this non-commercial project | 200, 0.11 to 0.15 s | Primary, now with retries, host failover and a 20-symbols-per-request fallback |
| Kraken public ticker | None | No explicit permission for displaying its public prices to third parties was found, and no prohibition either | 200, 0.15 s | New: crypto fallback, first |
| Binance.US public ticker | None | Same: terms silent. The global `api.binance.com` returns 451 from a US address; Binance.US is the US exchange | 200, 0.32 s | New: crypto fallback, second |
| US Treasury par yield curve | None, no key, no card | Free "to copy, adapt, redistribute, or otherwise use", commercial or not | 200, 0.26 to 0.32 s | New: fallback for FRED's yield curve; also makes the curve work without a FRED key |
| CoinGecko (already used) | None observed | Allowed with a visible "Powered by CoinGecko" no smaller than 10px; no selling, sublicensing or syndicating access to the API | 200, 0.08 s | Crypto top 30. The credit was missing from the UI, now added |
| SEC EDGAR, FRED, ECB, World Bank | None, a free key for FRED | Government or institutional open data; attribution where asked | 200 | Already used, unchanged |

None of the sources used needs a card or a new key. The only key in the project is the existing FRED key, and the yield curve no longer depends on it.

## What changed in the code

- `lib/yahoo.js`: every Yahoo call retries up to four times across both Yahoo hosts with backoff, inside a time budget, at most 8 symbols at once, and a failing symbol is priced through the spark endpoint (20 per request). Quotes answer 502 with no cache header when nothing could be priced.
- `lib/crypto-fallback.js`: a crypto pair such as BTC-USD that Yahoo cannot price is tried on Kraken, then Binance.US.
- `lib/treasury.js`: the yield curve falls back from FRED to the US Treasury, in the handler and in the seeder.
- CoinGecko credit added under the crypto table.

## What was not done

- There is no fallback for US stock quotes other than Yahoo itself. Every other free equity source I found forbids showing its data to other people, or its quota is too small. A real second source would be a paid, licensed one.
- The top-30-by-market-cap table has no fallback: Kraken and Binance.US do not publish market cap, so when CoinGecko fails the old snapshot stays.
