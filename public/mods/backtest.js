// BT: moving-average crossover backtest lab. Single run, parameter sweep, and walk-forward, from the same daily
// history GP uses. The math lives in btlib.js so node can test it.
import { esc, cls, msg, getJSON, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';
import { backtest, sweep, walkForward, closesFrom, logY, logTicks, FASTS, SLOWS } from './btlib.js';

if (typeof document !== 'undefined') loadCSS(new URL('./backtest.css', import.meta.url));

const sym = (a) => (a[0] && /^[A-Z0-9.\-]{1,10}$/.test(a[0]) ? a[0] : null);
const pct = (v) => (v == null ? '--' : `${(v * 100).toFixed(1)}%`);
const dec = (v) => (v == null ? '--' : v.toFixed(2));
const day = (t) => (t == null ? '--' : new Date(t * 1000).toISOString().slice(0, 10));
const TABS = [['single', 'Single'], ['sweep', 'Sweep'], ['wf', 'Walk-forward']];

// windows from args: BT AAPL [fast slow], default 50/200; fast must be below slow
export function windows(a) {
  const f = Number(a[1] ?? 50), s = Number(a[2] ?? 200);
  return Number.isInteger(f) && Number.isInteger(s) && f >= 2 && f < s && s <= 400 ? [f, s] : null;
}

// Equity curves on a log scale (linear only if a value is not positive). Labels are HTML, not SVG text,
// because the SVG stretches to fit the panel and would distort text.
function curves(a, b) {
  const W = 800, H = 220, lo = Math.min(...a, ...b), hi = Math.max(...a, ...b), log = lo > 0;
  const y = (v) => (log ? logY(v, lo, hi, H) : H - ((v - lo) / (hi - lo || 1)) * H);
  const pts = (v) => v.map((p, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const ticks = log ? logTicks(lo, hi) : [];
  return `<svg class="bt-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ticks.map((t) => `<line class="bt-grid-l" x1="0" x2="${W}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join('')}`
    + `<polyline class="bt-h" points="${pts(b)}"/><polyline class="bt-s" points="${pts(a)}"/></svg>`
    + ticks.map((t) => { const top = (y(t) / H) * 100; return `<span class="bt-tick${top < 10 ? ' below' : ''}" style="top:${top.toFixed(1)}%">${t}x</span>`; }).join('');
}

const metrics = (a, b, la = 'Strategy', lb = 'Buy &amp; Hold') => {
  const row = (k, f, fmt) => `<tr><td class="bt-l">${k}</td><td class="${cls(a?.[f])}">${fmt(a?.[f])}</td><td class="${cls(b?.[f])}">${fmt(b?.[f])}</td></tr>`;
  return `<table class="bt-tbl"><thead><tr><th class="bt-l">Metric</th><th>${la}</th><th>${lb}</th></tr></thead><tbody>`
    + `${row('Total return', 'total', pct)}${row('CAGR', 'cagr', pct)}${row('Sharpe', 'sharpe', dec)}${row('Max drawdown', 'maxDD', pct)}</tbody></table>`;
};

function single(d, w, cost) {
  const r = backtest(d.c, w[0], w[1], { cost });
  return `<div class="bt-head"><b>${esc(d.s)}</b> SMA ${w[0]}/${w[1]} <span class="bt-mu">${day(d.t[r.from])} to ${day(d.t.at(-1))}, ${r.eqS.length} days, ${r.trades} trades</span></div>`
    + `<div class="bt-chart">${curves(r.eqS, r.eqH)}</div><div class="bt-note"><i class="bt-k s"></i>strategy <i class="bt-k h"></i>buy &amp; hold, growth of 1 (log scale)</div>`
    + metrics(r.strategy, r.hold)
    + `<div class="bt-note">Measured from day ${w[1]}, the first day a position can exist, for both columns.</div>`;
}

function sweepView(d, cost) {
  const sw = sweep(d.c, { cost }), at = (f, s) => sw.cells.find((x) => x.fast === f && x.slow === s);
  const shade = (v) => (v == null ? '' : `background:rgba(${v >= 0 ? '46,204,113' : '255,77,77'},${(Math.min(Math.abs(v) / 1.5, 1) * 0.55).toFixed(2)})`);
  const head = `<tr><th class="bt-l">fast \\ slow</th>${SLOWS.map((s) => `<th>${s}</th>`).join('')}</tr>`;
  const rows = FASTS.map((f) => `<tr><td class="bt-l">${f}</td>${SLOWS.map((s) => {
    const x = at(f, s);
    if (!x) return '<td class="bt-mu">--</td>';
    const isBest = x === sw.best;
    return `<td class="bt-cell${isBest ? ' bt-best' : ''}" style="${shade(x.sharpe)}" title="${f}/${s}: CAGR ${pct(x.cagr)}, max drawdown ${pct(x.maxDD)}">${dec(x.sharpe)}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="bt-head"><b>${esc(d.s)}</b> Sharpe by SMA pair <span class="bt-mu">${sw.tried} pairs tried, ${day(d.t[sw.from])} to ${day(d.t.at(-1))}</span></div>`
    + `<table class="bt-tbl bt-grid"><thead>${head}</thead><tbody>${rows}</tbody></table>`
    + `<div class="bt-note">Best in-sample: <b>${sw.best.fast}/${sw.best.slow}</b>, Sharpe ${dec(sw.best.sharpe)}. Buy &amp; hold Sharpe ${dec(sw.hold.sharpe)} over the same days.</div>`
    + `<div class="bt-warn">The best of ${sw.tried} pairs, picked after seeing all the data, is an optimistic number. The Walk-forward tab shows how this choice holds up on data it has not seen.</div>`;
}

function wfView(d, cost) {
  const wf = walkForward(d.c, { cost });
  if (!wf.folds.length) return msg(`NOT ENOUGH HISTORY FOR A WALK-FORWARD ON ${d.s} (need ${Math.max(...SLOWS) + 4 * 252} days, have ${d.c.length})`);
  const hs = wf.hindsight;
  const rows = wf.folds.map((f) => `<tr><td class="bt-l">${day(d.t[f.testFrom])} to ${day(d.t[f.testTo - 1])}</td><td>${f.fast}/${f.slow}</td><td>${dec(f.trainSharpe)}</td><td class="${cls(f.test.total)}">${pct(f.test.total)}</td><td class="${cls(f.hold.total)}">${pct(f.hold.total)}</td></tr>`).join('');
  const gap = hs.sharpe != null && wf.oos.sharpe != null ? hs.sharpe - wf.oos.sharpe : null;
  return `<div class="bt-head"><b>${esc(d.s)}</b> Walk-forward <span class="bt-mu">${wf.folds.length} folds: pick the best pair on 3 years, trade it on the next 1 year</span></div>`
    + metrics(wf.oos, wf.oosHold, 'Out-of-sample', 'Buy &amp; Hold')
    + `<div class="bt-note">On these same ${wf.days} days, the best pair picked with hindsight (${hs.fast}/${hs.slow}) had Sharpe ${dec(hs.sharpe)}; picking without hindsight earned ${dec(wf.oos.sharpe)}${gap == null ? '' : ` (a gap of ${dec(gap)})`}. The gap is the cost of not knowing the future.</div>`
    + `<table class="bt-tbl"><thead><tr><th class="bt-l">Test year</th><th>Pair chosen</th><th>Train Sharpe</th><th>Test return</th><th>Hold return</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function draw(box, st) {
  const tabs = TABS.map(([k, l]) => `<button class="chart-btn${st.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('');
  const body = st.tab === 'sweep' ? sweepView(st.d, st.cost) : st.tab === 'wf' ? wfView(st.d, st.cost) : single(st.d, st.w, st.cost);
  box.innerHTML = `<div class="bt-root"><div class="chart-bar">${tabs}<span class="chart-sep"></span><label class="bt-mu">cost bps/side <input class="chart-in bt-cost" value="${st.cost}" size="3"></label></div>`
    + `<div class="bt-body">${body}<div class="bt-note">${st.d.adjusted ? 'Dividend-adjusted closes.' : 'Raw closes, NOT dividend-adjusted (Yahoo sent no adjusted series), so buy &amp; hold is understated.'} Cost ${st.cost} bps per side${st.cost ? '' : ' (none: real trading would do worse)'}. Signal on day t-1 sets the position for day t (no lookahead). Past results do not predict future returns.</div></div></div>`;
  box.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; draw(box, st); }));
  box.querySelector('.bt-cost').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    st.cost = Number.isFinite(v) && v >= 0 && v <= 500 ? v : 0;
    draw(box, st);
  });
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
      const d = { s, ...closesFrom(res) };
      if (!box.isConnected) return;
      if (d.c.length <= Math.max(w[1], ...SLOWS) + 1) { box.innerHTML = msg(`NOT ENOUGH HISTORY FOR ${s} (${d.c.length} days)`); return; }
      draw(box, { d, w, tab: 'single', cost: 0 });
    } catch (e) { if (box.isConnected) box.innerHTML = msg(`NO BACKTEST FOR ${s}: ${e.message}`); }
  },
});
registerCommand('BT', { help: 'AAPL BT 50 200  backtest lab: crossover vs buy & hold, sweep, walk-forward', run(args) { return openWidget('bt', sym(args) ? args : []); } });
