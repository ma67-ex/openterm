// Run: node scripts/test-backtest.mjs
// Checks the BT math against hand-computed values, and checks the lab (sweep, walk-forward) for leaks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backtest, run, stats, sweep, walkForward, closesFrom, logY, logTicks, FASTS, SLOWS } from '../public/mods/btlib.js';

const near = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const fixture = (s) => JSON.parse(readFileSync(new URL(`./fixtures/${s}.json`, import.meta.url))).close;

// seeded noise so a failure is reproducible
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const noisy = (c, t) => [...c.slice(0, t), ...c.slice(t).map(() => 50 + rand() * 100)];

// ---- hand-computed series ----
// closes 10,11,12,11,10,11 with SMA 2/3:
//   fast SMA: -, 10.5, 11.5, 11.5, 10.5, 10.5      slow SMA: -, -, 11, 11.33.., 11, 10.66..
//   signal (fast > slow): 0, 0, 1, 1, 0, 0         position = signal of the day before: 0, 0, 0, 1, 1, 0
const c = [10, 11, 12, 11, 10, 11];

// from 0 reproduces the Python backtester: strategy earns days 3 and 4 only, (11/12) * (10/11) = 10/12
const full = backtest(c, 2, 3, { from: 0 });
assert.deepEqual(full.pos, [0, 0, 0, 1, 1, 0]);
near(full.eqS.at(-1), 10 / 12);
near(full.hold.total, 0.1);
assert.equal(full.trades, 2);

// default window starts at day `slow` (3): warmup is excluded from both strategy and buy & hold
const trimmed = backtest(c, 2, 3);
assert.equal(trimmed.from, 3);
near(trimmed.strategy.total, 10 / 12 - 1);
near(trimmed.hold.total, (11 / 12) * (10 / 11) * (11 / 10) - 1);
assert.equal(trimmed.eqS.length, 3);
assert.equal(trimmed.trades, 2);

// costs: 10 bps per side, charged on the entry (day 3) and the exit (day 5)
const costly = backtest(c, 2, 3, { from: 0, cost: 10 });
near(costly.eqS.at(-1), (11 / 12 - 0.001) * (10 / 11) * (1 - 0.001));
near(backtest(c, 2, 3, { from: 0, cost: 0 }).eqS.at(-1), 10 / 12);

// a flat series never trades and has no Sharpe or drawdown
const flat = backtest(Array(10).fill(5), 2, 3);
assert.equal(flat.trades, 0);
assert.equal(flat.strategy.sharpe, null);
assert.equal(flat.strategy.maxDD, 0);

// ---- lookahead guard ----
// pos[t] is held over day t, so it may only use closes up to t-1. Replace closes t.. with noise:
// pos[0..t] must not move. The real strategy must pass; a variant that trades the same-day signal must be caught.
function leaks(posOf, closes) {
  const base = posOf(closes);
  for (let t = 1; t < closes.length; t += 37) {
    const p = posOf(noisy(closes, t));
    for (let i = 0; i <= t; i++) if (p[i] !== base[i]) return true;
  }
  return false;
}
const aapl = fixture('AAPL');
assert.equal(leaks((x) => run(x, 50, 200).pos, aapl), false, 'real strategy must not look ahead');
assert.equal(leaks((x) => run(x, 50, 200).sig, aapl), true, 'peeking variant must be caught');

// ---- sweep ----
const sw = sweep(aapl);
const expected = FASTS.flatMap((f) => SLOWS.filter((s) => f < s)).length;
assert.equal(sw.tried, expected);
assert.ok(sw.cells.every((x) => x.fast < x.slow));
assert.ok(sw.cells.every((x) => (x.sharpe ?? -Infinity) <= sw.best.sharpe));
// every pair is scored on the same window, so they are comparable
near(sw.cells[0].total, backtest(aapl, sw.cells[0].fast, sw.cells[0].slow, { from: sw.from }).strategy.total);

// ---- walk-forward ----
const wf = walkForward(aapl);
const start = Math.max(...SLOWS), train = 3 * 252, test = 252;
assert.equal(wf.folds.length, Math.floor((aapl.length - start - train) / test));
wf.folds.forEach((f, i) => {
  assert.equal(f.testFrom, f.trainFrom + train, 'test starts right after its own train window');
  assert.equal(f.testTo - f.testFrom, test);
  if (i) assert.equal(f.testFrom, wf.folds[i - 1].testTo, 'test windows are back to back, never overlapping');
});
assert.equal(wf.days, wf.folds.length * test);
// the pair chosen for each fold must not depend on any price from its test window on
wf.folds.forEach((f, k) => {
  const leaked = walkForward(noisy(aapl, f.testFrom)).folds[k];
  assert.deepEqual([leaked.fast, leaked.slow, leaked.trainSharpe], [f.fast, f.slow, f.trainSharpe], `fold ${k} leaks`);
});
// hindsight is scored on exactly the OOS days, and with hindsight you can only do as well or better
assert.ok(wf.hindsight.sharpe >= wf.oos.sharpe);

// costs in walk-forward: the stitched series starts flat and every position change, including a switch
// between folds, is charged once: r = pos * mkt - cost * |pos - previous pos|
const C = 50, wfc = walkForward(aapl, { cost: C }), mkt = run(aapl, 50, 200).mkt;
let prev = 0;
wfc.oosRet.forEach((r, k) => {
  const i = wfc.folds[0].testFrom + k, p = wfc.oosPos[k];
  near(r, p * mkt[i] - (C / 1e4) * Math.abs(p - prev), 1e-15);
  prev = p;
});

// an asset that only falls never goes long: every Sharpe is null, but sweep and walk-forward must still work
const falling = Array.from({ length: 1400 }, (_, i) => 100 * 0.999 ** i);
assert.ok(sweep(falling).best, 'sweep picks a pair even when every Sharpe is null');
const wff = walkForward(falling);
assert.ok(wff.folds.length > 0 && wff.hindsight);
assert.equal(wff.oos.total, 0);

// drawdown counts a loss on the very first day: starting equity is the first peak
near(stats([-0.1, -0.1]).maxDD, 0.9 * 0.9 - 1);
near(stats([-0.5, 0]).maxDD, -0.5);
assert.equal(walkForward(aapl.slice(0, 1000)).oos, null, 'too little data: no folds, no crash');

// ---- log-scale chart helpers ----
// on a 1x..4x axis 100px tall, 2x sits exactly halfway: each doubling gets the same height
near(logY(1, 1, 4, 100), 100);
near(logY(2, 1, 4, 100), 50);
near(logY(4, 1, 4, 100), 0);
near(logY(3, 1, 9, 90), 45);
assert.deepEqual(logTicks(0.7, 9.5), [1, 2, 4, 8]);
assert.deepEqual(logTicks(0.3, 0.9), [0.5]);
assert.deepEqual(logTicks(1.1, 1.9), []);

// ---- closesFrom ----
// prefers the dividend-adjusted series, drops nulls, falls back to raw closes
const yres = (adj) => ({ timestamp: [1, 2, 3], indicators: { quote: [{ close: [10, null, 12] }], ...(adj && { adjclose: [{ adjclose: adj }] }) } });
assert.deepEqual(closesFrom(yres([9, null, 11])), { c: [9, 11], t: [1, 3], adjusted: true });
assert.deepEqual(closesFrom(yres()), { c: [10, 12], t: [1, 3], adjusted: false });
assert.deepEqual(closesFrom(yres([9, 11])), { c: [10, 12], t: [1, 3], adjusted: false }); // length mismatch: do not trust it

console.log('backtest: all checks passed');
