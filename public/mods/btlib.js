// SMA-crossover backtest lab (pure math, no DOM). Same method as ma67-ex/stock-backtester:
// the signal computed on close t-1 sets the position held over day t, so it never uses information it could not have had.
import { sma, returns, stdev } from './chartlib.js';

export const DAYS = 252;
export const FASTS = [10, 20, 30, 50, 100];
export const SLOWS = [50, 100, 150, 200, 250];

// Daily closes (and their timestamps) from a Yahoo chart result. Uses the dividend-adjusted series when Yahoo
// sends it, which is what yfinance auto_adjust=True gives the Python backtester.
export function closesFrom(res) {
  const raw = res.indicators?.quote?.[0]?.close ?? [], adj = res.indicators?.adjclose?.[0]?.adjclose;
  const adjusted = adj?.length === raw.length, src = adjusted ? adj : raw, ts = res.timestamp ?? [];
  const c = [], t = [];
  src.forEach((x, i) => { if (x != null && Number.isFinite(x)) { c.push(x); t.push(ts[i] ?? null); } });
  return { c, t, adjusted };
}

// Log-scale chart helpers. Pixel y for value v when [lo, hi] spans height H (top = hi): equal ratios get
// equal distances, so a doubling looks the same in year 1 and year 10.
export const logY = (v, lo, hi, H) => H - (Math.log(v / lo) / (Math.log(hi / lo) || 1)) * H;
// gridline values for a growth-of-1 chart: powers of 2 inside [lo, hi]
export function logTicks(lo, hi) {
  const out = [];
  for (let k = Math.ceil(Math.log2(lo)); 2 ** k <= hi; k++) out.push(2 ** k);
  return out;
}

const growth = (r) => { let e = 1; return r.map((x) => (e *= 1 + x)); };

// daily returns r -> headline stats; risk-free rate 0, Sharpe annualized with 252 days
export function stats(r) {
  const n = r.length, eq = growth(r), last = eq[n - 1] ?? 1;
  const mean = r.reduce((s, v) => s + v, 0) / n, sd = n > 1 ? stdev(r) : 0;
  let peak = 1, mdd = 0; // starting equity counts as a peak, so a first-day loss is a drawdown
  for (const e of eq) { peak = Math.max(peak, e); mdd = Math.min(mdd, e / peak - 1); }
  return {
    total: last - 1,
    cagr: n >= 2 ? last ** (DAYS / n) - 1 : null,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(DAYS) : null,
    maxDD: mdd,
  };
}

// Full-length daily series for one fast/slow pair. Index i is the return from close i-1 to close i.
// cost is charged in basis points per side on every day the position changes.
export function run(closes, fast, slow, cost = 0) {
  const f = sma(closes, fast), s = sma(closes, slow);
  const sig = closes.map((_, i) => (f[i] != null && s[i] != null && f[i] > s[i] ? 1 : 0));
  const pos = sig.map((_, i) => (i ? sig[i - 1] : 0));
  const mkt = [0, ...returns(closes)];
  const strat = mkt.map((r, i) => pos[i] * r - (cost / 1e4) * Math.abs(pos[i] - (i ? pos[i - 1] : 0)));
  return { f, s, sig, pos, mkt, strat };
}

// One backtest, measured from day `from` on. By default that is the first day a position can exist (slow),
// so the forced-cash warmup does not dilute CAGR and Sharpe. from: 0 reproduces the Python backtester exactly.
export function backtest(closes, fast = 50, slow = 200, { cost = 0, from = slow } = {}) {
  const x = run(closes, fast, slow, cost), rs = x.strat.slice(from), rh = x.mkt.slice(from);
  return {
    ...x, from, eqS: growth(rs), eqH: growth(rh),
    strategy: stats(rs), hold: stats(rh),
    trades: x.pos.reduce((n, p, i) => n + (i >= Math.max(from, 1) && p !== x.pos[i - 1] ? 1 : 0), 0),
  };
}

const pairs = (fasts, slows) => fasts.flatMap((f) => slows.filter((s) => f < s).map((s) => [f, s]));
// b == null: the first candidate always wins, so a best pair exists even when every Sharpe is null
const better = (a, b) => b == null || (a.sharpe ?? -Infinity) > (b.sharpe ?? -Infinity);

// Every fast/slow pair on one common window (from the largest slow on), so the pairs are comparable.
export function sweep(closes, { fasts = FASTS, slows = SLOWS, cost = 0 } = {}) {
  const from = Math.max(...slows);
  const cells = pairs(fasts, slows).map(([fast, slow]) => ({ fast, slow, ...stats(run(closes, fast, slow, cost).strat.slice(from)) }));
  const best = cells.reduce((b, c) => (better(c, b) ? c : b), null);
  return { cells, best, tried: cells.length, from, hold: stats([0, ...returns(closes)].slice(from)) };
}

// Rolling walk-forward: pick the best pair by Sharpe on each train window, then score it only on the
// next unseen test window. The test windows are stitched into one out-of-sample (OOS) series that starts
// flat; switching pairs between folds is charged as a trade. `hindsight` is the best single pair over
// the same OOS days, chosen after seeing them, so the gap to `oos` compares like with like.
export function walkForward(closes, { fasts = FASTS, slows = SLOWS, cost = 0, train = 3 * DAYS, test = DAYS } = {}) {
  const runs = pairs(fasts, slows).map(([fast, slow]) => ({ fast, slow, ...run(closes, fast, slow, cost) }));
  const mkt = runs[0]?.mkt ?? [], start = Math.max(...slows), folds = [], oosPos = [], oos = [], oosHold = [];
  let held = 0;
  for (let a = start; a + train + test <= closes.length; a += test) {
    const b = a + train, e = b + test;
    const pick = runs.reduce((p, r) => { const st = stats(r.strat.slice(a, b)); return better(st, p?.st) ? { r, st } : p; }, null);
    const rs = [];
    for (let i = b; i < e; i++) {
      const p = pick.r.pos[i];
      rs.push(p * mkt[i] - (cost / 1e4) * Math.abs(p - held));
      oosPos.push(p); held = p;
    }
    const rh = mkt.slice(b, e);
    oos.push(...rs); oosHold.push(...rh);
    folds.push({ trainFrom: a, testFrom: b, testTo: e, fast: pick.r.fast, slow: pick.r.slow, trainSharpe: pick.st.sharpe, test: stats(rs), hold: stats(rh) });
  }
  if (!folds.length) return { folds, oos: null, oosHold: null, hindsight: null, oosPos, oosRet: oos, days: 0 };
  const from = folds[0].testFrom, to = folds.at(-1).testTo;
  const hindsight = runs.map((r) => ({ fast: r.fast, slow: r.slow, ...stats(r.strat.slice(from, to)) })).reduce((p, c) => (better(c, p) ? c : p), null);
  return { folds, oos: stats(oos), oosHold: stats(oosHold), hindsight, oosPos, oosRet: oos, days: oos.length };
}
