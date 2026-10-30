# Free data sources that can back up Yahoo

Checked on 2026-10-30. Latency and status come from live requests made from one US home connection, so "works here" is not proof it works from Vercel or GitHub Actions, whose shared addresses are throttled more. Limits and terms come from each vendor's own pricing or docs page that day; items marked "recall" were not re-checked.

## What was fixed first

OpenTerm's quotes, history, search, company and seeder code all called Yahoo's `query1` host once, with no retry, and the batch quote path fired every symbol at once. Yahoo answers shared cloud addresses with 429 (and sometimes 401 or 403) in bursts, and an empty result was cached at the edge as a good one. All of those paths now share `lib/yahoo.js`:

- Up to four tries, alternating `query1` and `query2`, with 400, 800 and 1600 ms pauses (plus jitter), inside a 9 second budget on the API and 40 seconds in seeders.
- A 404 or 400 is final and is never retried.
- At most 8 symbols in flight, instead of all at once.
- A symbol whose chart request still fails gets a second chance through Yahoo's spark endpoint, which prices up to 20 symbols per request (no volume).
- If nothing at all could be priced, quotes now answer 502 with no cache header.

## The table

Verdicts: **Done** is already in this change. **Wire** means I recommend adding it. **Wire with key** needs you to make a free account. **Skip** says why.

| Source | Covers | Key? | Free limit | Measured here | Cloud-IP risk | Terms risk for a public site | Verdict | Why |
|---|---|---|---|---|---|---|---|---|
| Yahoo `query1` chart | Stocks, ETFs, indices, FX, futures, crypto, history | No | Unofficial, throttles shared IPs | 200, 0.15 s | High | Unofficial | Done (primary) | Widest coverage, nothing else free matches it |
| Yahoo `query2` chart | Same data, second host | No | Same | 200, 0.12 s | High, but separate from query1 | Same | Done (failover) | Free retry target; a block on one host often spares the other |
| Yahoo spark | Price and change for up to 20 symbols per request | No | 21 or more symbols is a 400 | 200, 0.11 s | Medium: 1 request instead of 20 | Same | Done (second chance) | Far fewer requests, so far less throttling; no volume |
| Cboe delayed quotes | US stocks, ETFs, indices (`_SPX`, `_VIX`) | No | Not published | 200 after a redirect, 0.14 to 0.24 s | Unknown | Unofficial: it is the JSON behind Cboe's own site, terms unclear | Wire, if you accept the risk | Different company and different network path from Yahoo; has price, change, open/high/low, previous close, volume, about 15 minutes delayed. An unknown symbol returns 403 |
| Coinbase Exchange public API | Crypto tickers, candles | No | About 10 requests/s/IP (recall) | 200, 0.06 to 0.10 s | Low | Public market data endpoints | Wire | Fastest source tested, US company, works from US servers |
| Kraken public API | Crypto tickers, OHLC | No | About 1 request/s (recall) | 200, 0.15 s | Low | Public endpoints | Wire | Second independent crypto source |
| Binance.US | Crypto tickers (fewer pairs) | No | Weight-based (recall) | 200, 0.32 s | Low | Public endpoints | Wire (third crypto source) | This is the US sibling of Binance. Global `api.binance.com` returned 451 "restricted location" from a US address, which is the block you noticed |
| CoinGecko (already used) | Crypto | No | Public tier, a few dozen calls/min (recall) | 200, 0.08 s | Medium | Attribution required | Keep | Already the main crypto source |
| Bitstamp, Gemini | Crypto tickers | No | Public (recall) | 200, 0.18 and 0.26 s | Low | Public endpoints | Backup only | Extra insurance; not needed unless the others fail |
| Frankfurter (ECB rates) | FX | No | Not published | 200, 0.32 s | Low | Free, open | Skip for now | OpenTerm already reads the ECB directly; the same source twice adds no resilience |
| US Treasury FiscalData and yield-curve XML | Rates, yield curve | No | Not published | 200, 0.70 s and 0.26 s | Low | US government data | Wire as the fallback for FRED | FRED needs a key and is a single point of failure for the yield curve |
| SEC EDGAR, World Bank (already used) | Filings, macro | No | SEC: 10 requests/s | 200, 0.18 s and 0.26 s | Low | Public | Keep | Not part of the Yahoo dependency |
| Finnhub | Real-time US quotes, company news | Free key | 60 calls/min (their docs) | Not tested (needs a key) | Low | Check the free-plan terms | Wire with key | Best quote fallback: generous rate. Stock candles are Premium, so it cannot back up history |
| Financial Modeling Prep | Quotes, statements | Free key | 250 calls/day, personal use | Not tested | Low | "Personal use" plan: public display is a grey area | Wire with key, as emergency backup | Enough for a few hundred fallback quotes a day |
| Tiingo | End-of-day prices, history | Free key | 50 requests/hour, 1000/day | Not tested | Low | Free tier is the "individual" tier | Wire with key, for history only | A real second source of daily history, but a small quota |
| Alpaca market data | US stocks, IEX feed | Free account keys | 200 calls/min | Not tested | Low | Redistribution limits apply | Wire with key, optional | Generous rate, but IEX-only volume and an account to maintain |
| Polygon (now Massive) | US stocks | Free key | 5 calls/min, end of day, 2 years of history | Not tested | Low | Check terms | Skip for now | 5 calls a minute is too little to fail over to |
| Twelve Data | Stocks, forex, crypto | Free key | 8 credits/min, 800/day | Not tested | Low | The free plan says data is for testing and development only and "cannot be displayed to users or used in production" | **Skip** | The limits look fine, but the terms rule it out for a public site. I would not wire it |
| Alpha Vantage | Stocks, forex, crypto | Free key | 25 requests/day | Not tested | Low | Standard | Skip | 25 a day is not a fallback |
| Stooq | Stocks, indices | No | n/a | 404 bot-check page | n/a | n/a | Skip | Now serves a challenge page to servers (matches the README note) |
| Nasdaq `api.nasdaq.com` quote | US stocks | No | Not published | 200, 1.1 s (slowest) | High: known to block automated traffic | Unofficial, restrictive | Skip | Slow, undocumented, and its terms are against automated use |
| Binance global | Crypto | No | n/a | 451 restricted location | n/a | n/a | Skip | Blocks US addresses |

## How I would order them

- **US stocks and indices:** Yahoo `query1`, then `query2`, then spark, then Cboe, then Finnhub (if you add a key).
- **Crypto:** CoinGecko, then Coinbase, then Kraken, then Binance.US.
- **Daily history:** Yahoo, then Tiingo (if you add a key).
- **Yield curve:** FRED, then US Treasury.

## What I need from you

1. Do you accept Cboe's unofficial endpoint as a fallback for US stocks? It is the only keyless second source for equities I found, and the terms are unclear.
2. Which keys will you create? Finnhub is the one I would start with.
3. Should the crypto fallback chain (Coinbase, Kraken, Binance.US) go in next? It needs no keys and fixes the Binance block directly.
