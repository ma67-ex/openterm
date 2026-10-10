# OpenTerm plan

Goal: a Bloomberg-style terminal that runs entirely on free data sources and free hosting tiers, and stays inside the Upstash free limits no matter how many people open it.

## 1. The one rule that keeps us under the limit

Browsers never call data providers, and they rarely call Redis either.

```
Free APIs  --(scheduled seeders)-->  Upstash Redis  --(read API)-->  CDN cache  -->  Browsers
```

1. Seeders are small scripts that run on a schedule, fetch from the free APIs, and write one JSON snapshot per panel into Redis.
2. The read API only reads those snapshots. It never calls a provider.
3. The CDN cache sits in front of the read API (`Cache-Control: s-maxage=...`). Many users inside the same time window cost one Redis read.

Command usage then depends on how often seeders run, not on how many users there are.

## 2. Upstash budget

Check the current free-tier numbers in the Upstash dashboard before relying on them. At the time of writing the free plan is roughly 500K commands per month and 256 MB of storage. Plan against the smaller number.

Budget at 500K commands per month (about 16K per day):

| Use | Commands per day | Notes |
|---|---|---|
| Seeder writes | about 5,000 | Roughly 20 snapshot keys, each rewritten on its own schedule, market hours only |
| Read API (cache misses) | about 6,000 | One `MGET` per cache window, not one `GET` per panel |
| Headroom | about 5,000 | Spikes, retries, new panels |

Rules that keep it there:

1. One key per panel, not one per row. `snap:indices` holds all indices in one JSON blob. Writing 12 indices is 1 command, not 12.
2. Read with `MGET`. A full page load is 1 command for all panels.
3. Never write when nothing changed. The seeder hashes the new payload and skips the `SET` if it matches the stored hash.
4. Only seed when the market is open. Equities snapshots stop outside exchange hours. Weekends and holidays cost almost nothing. Macro and filings data change daily or slower, so they run once a day.
5. Different TTL per data type, matching how often the source actually changes:

| Data | Seeder interval | CDN `s-maxage` | Redis TTL |
|---|---|---|---|
| Indices, watchlist, FX, commodities (market open) | 5 min | 60 s | 15 min |
| Crypto | 5 min | 60 s | 15 min |
| News headlines | 15 min | 300 s | 1 h |
| Yield curve, rates | 1 h | 1 h | 6 h |
| Macro (FRED, World Bank) | daily | 1 h | 3 days |
| Filings and fundamentals (EDGAR) | daily | 6 h | 7 days |
| Economic calendar | 6 h | 1 h | 2 days |

6. Charts are not stored in Redis. Historical price series are large and static. Store them as JSON files in free object storage (Cloudflare R2 free tier or the repo's `data/` folder via a scheduled commit) and let the CDN serve them. Redis only holds the latest quote snapshot.
7. Store compact JSON, no pretty printing, short field names. A snapshot should stay under about 20 KB. Total storage then stays far below 256 MB.
8. Fail soft. If Redis answers with a limit error, the read API serves the last copy from its in-memory cache, or a file fallback, and the UI shows "stale" instead of breaking.
9. A daily command counter. The seeder increments one key per run (`meta:cmds:YYYY-MM-DD`). If the count passes 80% of the daily budget, seeders drop to half frequency automatically. A status page reads it.

## 3. Free data sources

| Panel | Source | Limit to respect |
|---|---|---|
| Equities, indices, FX, futures quotes | Yahoo chart endpoint (unofficial), Stooq CSV as backup | Unofficial. Can break or throttle. Always keep a second source. |
| Historical prices | Stooq, Yahoo | Fetched once per day per symbol |
| Fundamentals, filings | SEC EDGAR (`data.sec.gov`) | 10 requests per second, needs a User-Agent with contact |
| Macro, rates, yield curve | FRED (free key), US Treasury | FRED allows about 120 requests per minute |
| Global macro | World Bank, IMF, ECB APIs | No key, generous |
| Crypto | CoinGecko public API, Binance public API | CoinGecko about 10 to 30 calls per minute |
| News | RSS feeds, GDELT | RSS has no limit but be polite |
| Economic calendar | FRED release dates, Finnhub free key | Finnhub 60 calls per minute |

Each source gets a small adapter in `seeders/` with the same shape: `fetch()` returns normalised rows, the runner writes the snapshot. Adding a source never touches the UI.

## 4. Architecture

```
openterm/
  public/            UI (static, already built as a skeleton)
  api/               read endpoints (serverless): /api/snap?keys=indices,fx,...
  seeders/           one file per source, shared runner with hash-skip and market-hours check
  lib/redis.js       thin wrapper: mget, set-if-changed, command counter
  .github/workflows/ cron schedules that run the seeders
  docs/
```

Hosting (all free tiers):

1. UI and read API: Vercel or Cloudflare Pages with functions. The CDN in front of the API is built in.
2. Seeder schedules: GitHub Actions cron. It is free, runs every 5 minutes at best, and needs no server. Vercel's free cron is too limited (daily), so we do not depend on it.
3. Redis: Upstash free database.
4. Secrets: Upstash URL and token, FRED key and Finnhub key live in GitHub Actions secrets and hosting environment variables. Never in the repo.

Known weak spot: GitHub Actions cron can run a few minutes late and is sometimes skipped under load. The UI always shows each snapshot's `asOf` time so a late run is visible rather than silent.

## 5. Phases

| Phase | What ships | Done when |
|---|---|---|
| 1. Plumbing | Redis wrapper, seeder runner (hash-skip, market hours, counter), `/api/snap`, CDN headers, status page | A fake seeder writes a snapshot and the skeleton UI reads it with 1 command |
| 2. Markets core | Indices, watchlist, FX, commodities, crypto panels with real data | Panels 1, 4, 5, 8 live, `asOf` shown, command counter under 5K per day |
| 3. Charts and command bar | `GP` chart panel with static history files, working commands (`AAPL GP`, `AAPL DES`) | Typing a ticker opens its chart and description |
| 4. Macro and rates | Yield curve, FRED series, economic calendar | Panels 6 and 7 live |
| 5. News | RSS and GDELT headlines, per-ticker filter | Panel 3 live |
| 6. Fundamentals | EDGAR financials, ratios, filings list (`FA`, `FIL`) | Any US ticker shows statements |
| 7. Analytics | Screener, heatmap, movers, portfolio tracker, correlation | Computed from existing snapshots, no new provider calls |
| 8. Niche layer | Halal screening, India and emerging-market coverage, AI filing summaries | Differentiates OpenTerm from other terminals |

Phases 1 and 2 come first. Nothing else matters until the cache path works, because it decides whether the free tier survives.

## 6. Risks

1. Unofficial APIs break. Yahoo has no contract. Mitigation: adapter per source, a second source for quotes, snapshot `asOf` visible.
2. Terms of service. Several free providers forbid public redistribution. The repo stays private and the app personal or portfolio use until each provider's terms are checked.
3. Free tiers change. Re-check Upstash, Vercel and GitHub Actions limits at the start of each phase.
4. Data accuracy. Free data has gaps and errors. Show the source and timestamp on every panel.

## 7. Open decisions

1. Hosting target: Vercel (familiar, already used for another project) or Cloudflare. Default: Vercel.
2. Start region and exchanges: US plus India first, then Europe and Asia.
3. Whether to keep one Upstash database for dev and prod, or two. Default: two, so testing never burns the production budget.
