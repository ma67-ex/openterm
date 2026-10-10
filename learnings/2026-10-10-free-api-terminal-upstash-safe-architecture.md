# Bloomberg-style terminal on free APIs without hitting the Upstash limit

**Date:** 2026-10-10

## Problem
Build a Bloomberg-like terminal from free data sources and free hosting (Vercel hobby, Upstash free, GitHub Actions) that stays inside the free limits no matter how many people open it, and that several people or agents can extend in parallel.

## Approach
1. Users never call data providers and rarely call Redis. Scheduled seeders write one compact JSON snapshot per panel to Upstash. A read API serves snapshots with a CDN cache header, so many users inside one window cost one Redis read.
2. Each seeder skips the write when a hash of the new payload matches the stored one, and a per-day command counter throttles groups past 80% of the budget.
3. Seeded groups carry their own gating (`hours`, `everyMin`, or `slot`) because the cron fires every 10 minutes. Slow data (macro, filings) runs once or twice a day.
4. Anything keyed by a user-typed ticker is an on-demand handler with a long CDN cache, not a seeded group. All handlers sit behind one `/api/data?fn=` function because the Vercel hobby plan caps the number of functions.
5. A small frontend framework (command registry, widget registry, snapshot hooks) was written first, then seven agents built feature modules in parallel, each owning disjoint files and adding one line to a shared registry.
6. The S&P 500 (503 rows) is split into 5 shard groups of about 15 KB each, one shard per 10-minute slot per hour. Views load the shards only when opened, with one MGET.

## Why
Budget control comes from how often seeders run and how big snapshots are, not from how many users there are. Splitting the framework from the features is what let parallel agents avoid editing each other's files.

## Gotchas
- www.sec.gov/files/company_tickers.json returns 403 from cloud IPs while data.sec.gov works with the same user agent. Commit a static ticker map (`npm run tickers`) instead of fetching it at runtime.
- Vercel environment variables only apply to new deployments, so redeploy after adding them.
- A GitHub environment secret is only visible to a job that declares `environment: <name>`. A secret saved in a differently named environment is invisible.
- ESM imports are hoisted, so loading `.env` in the server entry runs after the modules that read it. Load it inside the module that reads the variables.
- Relative cache paths break when the preview server starts from a different working directory. Resolve paths from `import.meta.url`.
- A bare `s-maxage` header let the browser reuse an old API response during development. Add `max-age=0`.
- A running dev server does not pick up new config or handlers. Restart it before testing new groups.
- Yahoo chart data marks the previous close ambiguously. Compare the last bar's timestamp with the last trade time before choosing the previous close, or every change shows as zero on weekends.

## Reusable pattern
For a data dashboard on free tiers, put a seeded snapshot store and a CDN-cached read path between providers and users, gate every seeder explicitly, keep per-ticker queries on cached on-demand handlers, and write the extension contract (docs/MODULES.md) before parallelizing work.
