// SMA-crossover backtest (pure math, no DOM). Same method as ma67-ex/stock-backtester:
// the signal computed on day t is traded on day t+1, so it never uses information it could not have had.
import { sma, returns, stdev } from './chartlib.js';

export const DAYS = 252;

const growth = (r) => { let e = 1; return r.map((x) => (e *= 1 + x)); };

// returns r (daily) + equity eq (growth of 1) -> headline stats; risk-free rate 0, Sharpe annualized
export function stats(r, eq) {
  const n = r.length, last = eq[n - 1];
  const mean = r.reduce((s, v) => s + v, 0) / n, sd = stdev(r);
  let peak = -Infinity, mdd = 0;
  for (const e of eq) { peak = Math.max(peak, e); mdd = Math.min(mdd, e / peak - 1); }
  return {
    total: last - 1,
    cagr: n >= 2 ? last ** (DAYS / n) - 1 : null,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(DAYS) : null,
    maxDD: mdd,
  };
}

// closes: daily closing prices. fast/slow: SMA windows. Long when fast SMA > slow SMA, else cash.
export function backtest(closes, fast = 50, slow = 200) {
  const f = sma(closes, fast), s = sma(closes, slow);
  const mkt = [0, ...returns(closes)];
  const sig = closes.map((_, i) => (f[i] != null && s[i] != null && f[i] > s[i] ? 1 : 0));
  const pos = sig.map((_, i) => (i ? sig[i - 1] : 0));
  const strat = mkt.map((r, i) => pos[i] * r);
  const eqS = growth(strat), eqH = growth(mkt);
  return {
    f, s, pos, eqS, eqH,
    strategy: stats(strat, eqS),
    hold: stats(mkt, eqH),
    trades: pos.reduce((t, p, i) => t + (i && p !== pos[i - 1] ? 1 : 0), 0),
  };
}
