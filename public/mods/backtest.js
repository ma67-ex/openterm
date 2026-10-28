// BT: moving-average crossover backtest vs buy & hold, drawn from the same daily history GP uses.
import { esc, cls, msg, getJSON, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';
import { backtest, closesFrom } from './btlib.js';

if (typeof document !== 'undefined') loadCSS(new URL('./backtest.css', import.meta.url));

const sym = (a) => (a[0] && /^[A-Z0-9.\-]{1,10}$/.test(a[0]) ? a[0] : null);
const pct = (v) => (v == null ? '--' : `${(v * 100).toFixed(1)}%`);
const dec = (v) => (v == null ? '--' : v.toFixed(2));

// windows from args: BT AAPL [fast slow], default 50/200; fast must be below slow
export function windows(a) {
  const f = Number(a[1] ?? 50), s = Number(a[2] ?? 200);
  return Number.isInteger(f) && Number.isInteger(s) && f >= 2 && f < s && s <= 400 ? [f, s] : null;
}

function curves(a, b) {
  const W = 800, H = 220, all = [...a, ...b], lo = Math.min(...all), hi = Math.max(...all);
  const pts = (v) => v.map((y, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - ((y - lo) / (hi - lo || 1)) * H).toFixed(1)}`).join(' ');
  return `<svg class="bt-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline class="bt-h" points="${pts(b)}"/><polyline class="bt-s" points="${pts(a)}"/></svg>`;
}

registerWidget('bt', {
  title: (a) => `BT  Backtest${sym(a) ? ` ${a[0]}` : ''}`, hint: 'AAPL BT 50 200',
  async render(box, args = []) {
    const s = sym(args), w = windows(args);
    if (!s || !w) { box.innerHTML = msg('USAGE: AAPL BT [fast slow]   e.g. AAPL BT 50 200 (fast below slow, slow up to 400)'); return; }
    box.innerHTML = msg('LOADING...');
    try {
      const j = await getJSON(`/api/chart?s=${encodeURIComponent(s)}&range=10y&interval=1d`);
      const res = j.chart?.result?.[0];
      if (!res) throw new Error('no data');
      const { c, adjusted } = closesFrom(res);
      if (!box.isConnected) return;
      if (c.length <= w[1] + 1) { box.innerHTML = msg(`NOT ENOUGH HISTORY FOR ${s} (${c.length} days, need more than ${w[1] + 1})`); return; }
      const r = backtest(c, w[0], w[1]);
      const row = (k, f) => `<tr><td class="bt-l">${k}</td><td class="${cls(r.strategy[f])}">${f === 'sharpe' ? dec(r.strategy[f]) : pct(r.strategy[f])}</td><td class="${cls(r.hold[f])}">${f === 'sharpe' ? dec(r.hold[f]) : pct(r.hold[f])}</td></tr>`;
      box.innerHTML = `<div class="bt-head"><b>${esc(s)}</b> SMA ${w[0]}/${w[1]} <span class="bt-mu">${c.length} daily closes, ${r.trades} trades</span></div>`
        + `<div class="bt-chart">${curves(r.eqS, r.eqH)}</div><div class="bt-note"><i class="bt-k s"></i>strategy <i class="bt-k h"></i>buy &amp; hold, growth of 1</div>`
        + `<table class="bt-tbl"><thead><tr><th class="bt-l">Metric</th><th>Strategy</th><th>Buy &amp; Hold</th></tr></thead><tbody>${row('Total return', 'total')}${row('CAGR', 'cagr')}${row('Sharpe', 'sharpe')}${row('Max drawdown', 'maxDD')}</tbody></table>`
        + `<div class="bt-note">${adjusted ? 'Dividend-adjusted closes.' : 'Raw closes, NOT dividend-adjusted (Yahoo sent no adjusted series), so buy &amp; hold is understated.'} Signal on day t trades on day t+1 (no lookahead). No fees or slippage. Past results do not predict future returns.</div>`;
    } catch (e) { if (box.isConnected) box.innerHTML = msg(`NO BACKTEST FOR ${s}: ${e.message}`); }
  },
});
registerCommand('BT', { help: 'AAPL BT 50 200  moving-average crossover backtest vs buy & hold', run(args) { return openWidget('bt', sym(args) ? args : []); } });
