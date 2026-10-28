# Adding a backtest command (BT) to OpenTerm

**Date:** 2026-10-28

## Problem
Join the private-ish Python `stock-backtester` with OpenTerm so a `BT` command shows strategy vs buy and hold inside the terminal.

## Approach
Read both codebases first. Ported the SMA crossover math to JS instead of shelling out to Python, because OpenTerm has no dependencies and deploys to Vercel with no Python runtime. Reused `sma`, `returns` and `stdev` from `public/mods/chartlib.js`, and the `/api/chart` history endpoint that `GP` already uses.

## Why
Keeping the math pure in `btlib.js` (no DOM) lets plain `node` test it, since `core.js` touches `document` and cannot be imported in Node. The test uses a 6-price series worked out by hand, plus a lookahead guard: changing only the last price must not change any earlier position.

## Gotchas
- pandas `std()` is the sample standard deviation (ddof=1), which matches `chartlib.stdev`. A population stdev would shift Sharpe.
- pandas `pct_change().fillna(0)` means the first return is 0 and counts in the mean and stdev. Match it with `[0, ...returns(closes)]`.
- No pandas on this machine, so the Python cross-check was replaced by hand-computed values.
- The command bar sits at y~49 in the 1485px viewport. A click at y=68 hits the tab row and silently drops typed text.

## Reusable pattern
New OpenTerm command = pure lib in `public/mods/`, a mod file calling `registerWidget` plus `registerCommand`, an `import` line in `mods/index.js`, and a node test in `scripts/`.
