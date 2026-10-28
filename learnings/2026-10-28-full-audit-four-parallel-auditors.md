# Full audit with four parallel auditors, then targeted fixes

**Date:** 2026-10-28

## Problem
Audit all of OpenTerm (backtest lab, backend, frontend, seeders and CI), then fix what was found, in about 25 minutes.

## Approach
1. Four read-only auditors ran in parallel, one per area, each with its own port. They were told to report only confirmed findings with a repro.
2. Two fixers worked on disjoint file sets (backend vs seeders and CI), so their edits could not collide. I fixed the backtest lab and the frontend myself.
3. Every change was reviewed before commit, then re-verified: unit tests, the Python cross-check, curl checks, and an Obscura sweep of all 81 commands.

## Why
- Splitting by file ownership is what makes parallel fixing safe.
- "Confirmed with a repro" kept the reports short and true. The Obscura repros turned two vague UI symptoms into one root cause.

## Gotchas
- One shared DOM node broke every stale-render guard. `workspace()` reused the same `.pb`, so `box.isConnected` was always true. Swapping in a fresh node per command fixed loaders and live widgets in one place.
- `(cfg.fetch ?? FETCH[x])(cfg)` loses `this`. Never use `this` inside a seeder `fetch`.
- In this codebase an empty result also means "transient outage, keep the old snapshot". Failing the job on every empty result would email on every 429, so it fails only when the snapshot is older than 2 days.
- The seed job had been green while House data never refreshed, because the runner had no `pdftotext`. A pipeline that cannot fail cannot tell you it is broken.
- A real `.env` with production credentials is auto-loaded by `lib/redis.js`. Never run seeders locally during audits. Use stubbed harnesses.
- A subagent's "fix" can overreach. One fixer set `no-store` on every 4xx, which would have dropped deliberate short 404 caches. Review every diff before committing.

## Reusable pattern
Audit in parallel by area, read-only, confirmed findings only. Fix in parallel by disjoint file ownership. The lead reviews every diff and re-runs the full verification before each commit.
