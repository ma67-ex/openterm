# GitHub Actions cron drift was silently starving every hours-gated seeder

**Date:** 2026-10-19

## Problem

While building the WIRE feature's natural follow-up (fixing the empty ECO economic-calendar
panel), checked whether `fetchCalendar()` was even wired up. It was -- `seeders/fred.js`,
`seeders/config.js` (`calendar: { source: 'fred-calendar', hours: [6] }`), and `seeders/run.js`
already had full support. Calling `fetchCalendar()` directly against the real FRED API returned
14 good rows immediately. So the code was never the bug.

Read the actual production Upstash snapshot store directly (read-only, via `lib/redis.js`'s
`mget`) and found `snap:calendar` was `null` -- never successfully written, ever. Checked every
other `hours`-gated group (`cbrates`, `weco`, `curve`, `credit`) the same way: all `null`. Only
groups without an `hours` gate (`news`, `indices`, `watchlist`, the `everyMin` groups) had fresh
data.

## Approach

1. Did not assume the bug was in the fetch logic, since a direct call already proved it worked.
   Moved one layer out: is the scheduler actually invoking it?
2. `gh run list --workflow=seed.yml --limit 15` showed every run green ("success"), so the
   workflow itself wasn't failing or misconfigured -- but the real firing timestamps were
   roughly every 1.5-3 hours apart, not the configured `cron: '*/10 * * * *'`. This is GitHub's
   documented behavior for scheduled workflows: low-traffic repos get scheduled runs delayed or
   dropped under platform load, sometimes by hours, with no error surfaced anywhere.
3. The gating logic in `seeders/run.js` was `hours.includes(now.getUTCHours()) && now.getUTCMinutes() < 20`
   -- a single 20-minute window per configured hour, once or twice a day. Against a cron that
   actually fires every 1-3 hours at unpredictable minutes, the odds of ever landing inside that
   window are low, and compound daily (a miss today doesn't make tomorrow more likely to hit).
4. Flagged this to the user as a separate, bigger-than-asked finding before touching it (it's
   shared production infra, not scoped to the WIRE task) and got explicit go-ahead before fixing.
5. Fix: replaced the exact-hour-and-minute check with a "run once per hour-threshold reached, not
   yet done today" check -- `due = hours.filter(h => h <= nowHour)`, then compare the stored
   snapshot's `asOf` against `Math.max(...due)`. Any firing from the target hour onward (same UTC
   day) now satisfies that slot, instead of needing to land inside one narrow window. Multi-hour
   groups (`curve`: `[13,19,21,23]`, `credit`: `[12,22]`) still get one attempt per threshold
   crossed through the day, preserving their "retry later for fresher data" intent -- just no
   longer require hitting an exact hour.
6. Reused the `mget` call for both the new gate check and the existing hash-compare (previously
   two separate reads) by hoisting `old` out and only re-fetching it for non-`hours` groups that
   never set it in the gate step.

## Why

The original design assumed GitHub Actions' `*/10 * * * *` cron fires close to on schedule. It
doesn't, for free-tier/low-traffic scheduled workflows -- this is a known, documented GitHub
limitation (scheduled workflows are deprioritized and can be delayed by a large margin or
dropped under load), not something specific to this repo. A narrow per-hour window is exactly
the wrong gating strategy against a scheduler with that much jitter; a "haven't done this slot
yet today" check is robust to arbitrary jitter as long as at least one run lands anywhere after
the target hour, which is a much weaker requirement.

## Gotchas

- `gh run list` showing all green does NOT mean the schedule is firing at the configured
  cadence -- it only proves the runs that did happen succeeded. Check actual timestamps between
  runs, not just status, when suspecting cron drift.
- Reading `snap:<key>` directly via `mget` against the real Upstash store is the fastest way to
  tell "code bug" from "never ran" apart -- don't assume a widget showing "NO DATA" means the
  fetch/parse logic is broken; check whether the snapshot was ever written first.
- This bug affects every `hours`-gated group, not just `calendar` -- `cbrates`, `curve`, `weco`,
  `credit`, and the `congress`/`execpol`/`polshards` groups all use the same `hours` gate in
  `seeders/run.js`, so they were all silently starved the same way. One fix in the shared runner
  covers all of them; no per-group changes were needed.
- Running `seeders/run.js --force` locally would have written directly to the real production
  Upstash store and consumed real daily command budget -- avoided that and verified with a
  read-only `mget` instead. The actual backfill should happen through the existing
  `workflow_dispatch` trigger on `seed.yml` (already wired with `--force`), not a local run.

## Reusable pattern

When a feature that reads from a periodically-seeded snapshot shows "NO DATA" and the fetch
function works fine when called directly, suspect the scheduler before the code: check
`gh run list --workflow=<name>` for actual firing cadence (not just pass/fail), and read the
snapshot store directly (read-only) to confirm whether it was ever written. If the gate logic
requires landing inside a narrow time window and the scheduler has any jitter, replace it with
an idempotent "haven't completed this period yet" check instead of an exact-time check.
