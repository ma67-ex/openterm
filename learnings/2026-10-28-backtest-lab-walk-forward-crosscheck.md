# Backtest lab: walk-forward, leak tests, and an exact Python cross-check

**Date:** 2026-10-28

## Problem
Grow the `BT` command into a lab that shows how backtests lie (costs, lookahead, overfitting), with numbers that are reproducible and provably match the original Python backtester.

## Approach
1. Split the math into `run` (full-length daily series for one pair), `backtest` (one window), `sweep` (all pairs on one common window), and `walkForward` (rolling 3-year train, 1-year test), all pure in `btlib.js`.
2. Stored 10-year fixtures for AAPL, SPY and VFC, dropping today's bar because it is a live price during market hours.
3. Cross-checked against the real `stock-backtester` code in a git-ignored venv, stubbing `yfinance` and `matplotlib` in `sys.modules` instead of installing them.

## Why
- A stdlib Python rewrite would only compare the JS with a third copy of the same idea. Importing the original `run_backtest` and `performance` tests the code a reviewer would actually read.
- Sweep pairs must share one window (from the largest slow window). Otherwise a 50-day pair is scored on more days than a 250-day pair and the Sharpe values are not comparable.
- The lookahead test perturbs prices from day t onward and asserts positions up to t do not move. Running it on a peeking variant (trade the same-day signal) proves the test can fail. A guard that has never failed proves nothing.

## Gotchas
- Position index convention: `pos[t]` is held over the return from close t-1 to close t, so it may use closes up to t-1 only. Perturbing only prices after t would not catch a same-day peek.
- Yahoo `close` is split-adjusted only; `adjclose` matches yfinance `auto_adjust=True`. Keep the GP chart on raw prices and only switch the backtest.
- The cross-check matched with 0.0 difference, which looks suspicious, so a mutation run (feed the JS a different pair) was used to confirm the comparison can fail.
- Clicking a tab re-renders the widget, so element refs from `find` go stale. Recompute coordinates instead.
- `22` pairs, not `20`: count the grid, don't assume it.

## Reusable pattern
For any quant calculation: keep it pure, store a fixture, compare with the original implementation on the fixture, and pair every guard test with a deliberately broken variant that it must catch.
