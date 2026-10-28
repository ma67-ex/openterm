// Run: node scripts/test-backtest.mjs
// Checks the BT math against hand-computed values on a tiny synthetic price series.
import assert from 'node:assert/strict';
import { backtest, closesFrom } from '../public/mods/btlib.js';

const near = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// closes 10,11,12,11,10,11 with SMA 2/3:
//   fast SMA: -, 10.5, 11.5, 11.5, 10.5, 10.5      slow SMA: -, -, 11, 11.33.., 11, 10.66..
//   signal (fast > slow): 0, 0, 1, 1, 0, 0         position = signal shifted one day: 0, 0, 0, 1, 1, 0
const c = [10, 11, 12, 11, 10, 11];
const r = backtest(c, 2, 3);
assert.deepEqual(r.pos, [0, 0, 0, 1, 1, 0]);
// strategy earns days 3 and 4 only: (11/12 - 1) then (10/11 - 1); equity = 11/12 * 10/11 = 10/12
near(r.eqS[5], 10 / 12);
near(r.strategy.total, 10 / 12 - 1);
// buy & hold: 11/10 at the end
near(r.hold.total, 0.1);
assert.equal(r.trades, 2);

// lookahead guard: making only the LAST price jump must not change any earlier position
const jumped = backtest([...c.slice(0, -1), 1000], 2, 3);
assert.deepEqual(jumped.pos.slice(0, -1), r.pos.slice(0, -1));

// a flat series never trades and has zero Sharpe/drawdown
const flat = backtest(Array(10).fill(5), 2, 3);
assert.equal(flat.trades, 0);
assert.equal(flat.strategy.sharpe, null);
assert.equal(flat.strategy.maxDD, 0);

// closesFrom prefers the dividend-adjusted series, drops nulls, and falls back to raw closes
const yres = (adj) => ({ indicators: { quote: [{ close: [10, null, 12] }], ...(adj && { adjclose: [{ adjclose: adj }] }) } });
assert.deepEqual(closesFrom(yres([9, null, 11])), { c: [9, 11], adjusted: true });
assert.deepEqual(closesFrom(yres()), { c: [10, 12], adjusted: false });
assert.deepEqual(closesFrom(yres([9, 11])), { c: [10, 12], adjusted: false }); // length mismatch: do not trust it

console.log('backtest: all checks passed');
