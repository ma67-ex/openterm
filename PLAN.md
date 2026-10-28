# PLAN: OpenTerm backtest lab

Status: all 10 tasks done (2026-10-28). Only the optional stretch items in section 7 remain.

## 1. Goal and definition of done

Turn the `BT` command from a single in-sample backtest into a small, honest backtest lab. It should show a recruiter that you know how backtests lie: costs, lookahead, overfitting, and choosing the best parameters after seeing the data. Every number shown must come from a stored, reproducible run.

Done when every box is checked:

- [x] `BT` uses dividend-adjusted closes, matching the Python backtester's `auto_adjust=True`.
- [x] Costs: a `cost` input in basis points per side is applied on every position change. The table states the cost used, including when it is 0.
- [x] Sweep: a grid of fast and slow windows shows Sharpe per pair, the best pair, and how many pairs were tried.
- [x] Walk-forward: best pair chosen on each train window, judged only on the next unseen test window. Out-of-sample (OOS) results are shown next to the in-sample best.
- [x] Lookahead guard: a test proves the real strategy passes, and a deliberately peeking variant is caught and fails.
- [x] Python cross-check: the original `backtester.py` math, run on the same stored price file, matches the JS numbers within 1e-9.
- [x] `node scripts/test-backtest.mjs` and `python3 scripts/crosscheck.py` both exit 0.
- [x] README has a BT section, a screenshot, and a short method-and-limits write-up with numbers from the stored fixture.

## 2. Current state (what I found)

Works today:
- `public/mods/btlib.js` is pure and small. It shifts the signal one day (no lookahead), uses sample standard deviation (ddof=1, same as pandas), and treats the first return as 0, same as pandas `pct_change().fillna(0)`.
- `scripts/test-backtest.mjs` checks a hand-computed 6-price series, a lookahead perturbation, and a flat series.
- `BT` parses `AAPL BT 50 200` correctly, since `runCommand` moves the ticker into `args[0]`.

Wrong or fragile:
1. **Prices are not dividend-adjusted.** `toBars` reads `indicators.quote[0].close`, which is split-adjusted only. The Python version uses `yf.download(..., auto_adjust=True)`, which also adjusts for dividends. Buy-and-hold returns are understated, and JS and Python will never match. Fix: read `indicators.adjclose[0].adjclose` when present.
2. **Warmup days dilute the stats.** The first `slow` days (200 by default) are forced to cash with 0 return, and they still count in CAGR years and the Sharpe mean and stdev. Both versions do this. Fix: measure both strategy and buy-and-hold from the first day a signal exists, and say so in the note.
3. **No costs.** Every crossover is free, which flatters strategies that trade often.
4. **Linear chart axis.** Ten years of compounding squashes the early curve flat (visible in the AAPL screenshot). Fix: a log scale for equity.
5. **Survivorship and selection.** Testing AAPL, a known winner, is itself a biased choice. It can't be fixed in code, so it must be stated in the write-up.
6. **No stored data.** Results change each day as Yahoo history updates, so README numbers aren't reproducible. Fix: a stored fixture file.

## 3. Design decisions

**3.1 Dividend-adjusted prices.**
- Options: (a) keep raw close; (b) use Yahoo `adjclose`; (c) adjust manually from dividend events.
- Chosen: (b). It's already in the same response, needs one line in `toBars`, and matches the Python source. Fall back to `close`, with a visible "not dividend-adjusted" note, when `adjclose` is missing.

**3.2 Costs and slippage.**
- Options: a flat fee per trade, basis points per side, or a spread model.
- Chosen: one number, `cost` in basis points per side, covering commission plus slippage. It is charged as `cost/10000 * |pos[t] - pos[t-1]|` on the day the position changes.
- Default: 0 bps (your call). Costs are opt-in, and the table always prints the cost in use so a zero-cost result is never mistaken for a realistic one.

**3.3 Parameter sweep.**
- Grid: fast in {10, 20, 30, 50, 100}, slow in {50, 100, 150, 200, 250}, keeping fast below slow. That's 22 pairs.
- Shown as a heatmap table colored by Sharpe, with the count of pairs tested printed above it.
- Trap: picking the best of 20 pairs inflates its Sharpe (multiple testing). This is handled by 3.4 and stated in the note. A deflated Sharpe ratio is a stretch item.

**3.4 Walk-forward.**
- Options: anchored (train window grows) or rolling (fixed length).
- Chosen: rolling, 3 years train and 1 year test, stepping 1 year. On 10 years that gives about 6 test folds. Rolling is easier to explain and adapts to regime changes.
- For each fold: score all 20 pairs on the train window by Sharpe, take the best, and run it on the test window. Stitch the test-window returns into one OOS equity curve.
- SMAs in a test window may use prices from before the window starts. That's past data, so it's allowed and not lookahead.
- Reported: OOS CAGR, Sharpe and max drawdown; the in-sample best pair's full-period Sharpe; the gap between the two; and the pair chosen per fold.

**3.5 Lookahead detection.**
- Options: code review only, or a property test.
- Chosen: a reusable property test, `checkNoLookahead(strategyFn, closes)`. For random cut points t, it replaces every price after t with noise and asserts positions up to t don't change.
- Run it on the real strategy (must pass) and on a `peek` variant that uses the same-day signal (must fail). The test file asserts both outcomes, so it proves the guard can actually catch a bug.

**3.6 Python cross-check without installing pandas globally.**
- Options:
  - (a) A stdlib-only Python rewrite. Rejected: it would compare the JS to a third copy I wrote, not to the original.
  - (b) A local venv with pandas and numpy, importing `run_backtest` and `performance` from `../stock-backtester/backtester.py`, with `yfinance` and `matplotlib` stubbed in `sys.modules`.
- Chosen: (b). It tests the real original code on the stored fixture.
- The venv lives in `scripts/.venv` and is git-ignored. Cost is about 100 MB of disk, no account needed.

**3.7 Stored fixture.**
- `scripts/fixtures/aapl-10y.json` holds dates, adjusted closes, and a fetch timestamp, saved once by `node scripts/fetch-fixture.mjs AAPL`.
- Add `SPY` too, so the README can show a non-cherry-picked index alongside AAPL.
- Both are small, about 60 KB each.

**3.8 UI.**
- One `BT` widget with three tabs: Single, Sweep, Walk-forward, styled with the existing `chart-btn` buttons.
- Add a cost input box.
- Keep `AAPL BT 50 200` working as the Single tab, so nothing breaks.

## 4. Work breakdown

Estimates are for you at your pace, writing code yourself.

| # | Task | Files | Proof | Hours |
|---|---|---|---|---|
| 1 | Use dividend-adjusted closes, with a fallback note (a new `closesFrom` in `btlib.js`, not `toBars`, so the GP chart keeps raw prices) | `btlib.js`, `backtest.js` | unit check on a fake response with and without `adjclose` | 1 |
| 2 | Store fixtures for AAPL and SPY | `scripts/fetch-fixture.mjs`, `scripts/fixtures/*.json` | file exists; date count is over 2,400 | 1 |
| 3 | Measure stats from the first valid signal day | `btlib.js`, test | hand-computed series where warmup days are excluded | 1 |
| 4 | Costs in bps per side | `btlib.js`, `backtest.js`, test | hand-computed: 2 trades at 10 bps reduce equity by the exact factor | 1.5 |
| 5 | Lookahead property test plus a peeking variant | `scripts/test-backtest.mjs` | real passes, peek is caught | 1.5 |
| 6 | Sweep function and heatmap tab | `btlib.js`, `backtest.js`, `backtest.css` | test: grid size is 20, best pair matches a manual scan of the fixture | 2.5 |
| 7 | Walk-forward function and tab | `btlib.js`, `backtest.js`, test | test: folds never overlap; test-window days are never used in their own training; fold count is right | 3 |
| 8 | Python cross-check | `scripts/crosscheck.py`, `.gitignore` | JS and Python metrics agree within 1e-9 on both fixtures | 2 |
| 9 | Log-scale equity chart | `backtest.js` | visual check; values above 0 only | 0.5 |
| 10 | README section, screenshot, method and limits | `README.md`, `docs/bt.png` | numbers in README match a fixture run | 1.5 |

Total is about 15.5 hours, roughly 2 to 3 weeks at 1 hour a day.

Order: 1, 2, 3, 8 first, so the foundation matches Python before any new features. Then 4, 5, 6, 7, 9, 10.

## 5. Test plan

```bash
node scripts/test-backtest.mjs
# backtest: all checks passed   (hand-computed, costs, warmup, lookahead real=pass peek=caught, sweep, walk-forward folds)

python3 -m venv scripts/.venv && scripts/.venv/bin/pip install pandas numpy   # one time
scripts/.venv/bin/python scripts/crosscheck.py
# AAPL: total, cagr, sharpe, maxDD match within 1e-9
# SPY:  total, cagr, sharpe, maxDD match within 1e-9

npm start   # then type AAPL BT 50 200, open each tab, set cost 0 and 10
```

## 6. Risks and open questions

Risks:
- Yahoo may drop `adjclose` for some symbols. Mitigation: the fallback in task 1, with a visible note.
- Walk-forward with only about 6 folds is noisy. The write-up must say so, not oversell it.
- Stubbing `yfinance` in the cross-check depends on `backtester.py` importing it at the top level. If that file changes, the stub may need updating.

Decisions (answered 2026-10-28):
1. Costs default to 0 bps. The cost input stays available as opt-in, and the table always prints the cost used.
2. Walk-forward windows: 3 years train, 1 year test, stepping 1 year.
3. The best pair is chosen by Sharpe.
4. Yes to a local, git-ignored venv with pandas for the cross-check.
5. Fixtures: AAPL, SPY, and VFC (down about 56% over 10 years). Walgreens (WBA) now returns 404 from Yahoo after going private, which is itself a live example of survivorship bias for the write-up.

## 7. Stretch items (optional, only after section 4)

- Deflated Sharpe ratio, to correct the best-of-20 result for multiple testing.
- A second strategy (momentum or RSI mean-reversion) behind the same interface.
- Position sizing by volatility target instead of all-in or all-out.
- Multi-asset: run the same rule on a basket and report breadth of results.

## First task

Start with task 1: dividend-adjusted closes in `toBars`, with the fallback note. About 1 hour.
