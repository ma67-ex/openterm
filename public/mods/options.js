// OPT option chain (aliases OMON, CHAIN) and IVS implied volatility smile + term structure (alias SKEW), from CBOE delayed quotes.
import { esc, fmt, vol, msg, getJSON, canvas, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';
loadCSS(new URL('./options.css', import.meta.url));

const SYM = /^[A-Z.\-]{1,6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE = 'CBOE delayed quotes, about 15 minutes, greeks are vendor model values';
const pct = (v, d = 1) => (v == null ? '--' : `${(v * 100).toFixed(d)}%`);
const n2 = (v, d = 2) => (v == null ? '--' : fmt(v, d));
const cnt = (v) => (v ? vol(v) : '--');
const ratio = (v) => (v == null ? '--' : v.toFixed(2));

const memo = new Map();
function cached(url) {
  const m = memo.get(url);
  if (m && Date.now() - m.t < 300000) return m.p;
  const p = getJSON(url);
  memo.set(url, { t: Date.now(), p });
  p.catch(() => memo.delete(url));
  return p;
}

// args: [SYM, optional YYYY-MM-DD or 1-based expiry index]
function parseArgs(args) {
  const sym = SYM.test(args[0] ?? '') ? args[0] : null;
  const rest = args.slice(1);
  return { sym, exp: rest.find((a) => DATE.test(a)) ?? null, idx: rest.find((a) => /^\d{1,2}$/.test(a)) ?? null };
}

async function fetchChain(sym, exp, idx) {
  const url = (e) => `/api/data?fn=options&s=${encodeURIComponent(sym)}${e ? `&exp=${e}` : ''}`;
  let d = await cached(url(exp));
  if (!exp && idx != null) {
    const e = d.expirations[+idx - 1];
    if (e && e.date !== d.exp) d = await cached(url(e.date));
  }
  return d;
}

// shared loader: fetches, guards against stale renders, draws header + expiry bar + body
function mount(box, args, view) {
  const { sym, exp, idx } = parseArgs(args);
  if (!sym) { box.innerHTML = msg(`USAGE: AAPL ${view.cmd} [2026-10-16 | expiry #]`); return; }
  const st = { exp, idx, greeks: false };
  const go = async () => {
    const token = (box._optReq = (box._optReq ?? 0) + 1);
    box.innerHTML = msg('LOADING...');
    let d;
    try { d = await fetchChain(sym, st.exp, st.idx); } catch (e) {
      if (box.isConnected && token === box._optReq) box.innerHTML = msg(e.status === 404 ? `NO LISTED OPTIONS FOR ${sym}` : `UNAVAILABLE (${e.message})`);
      return;
    }
    if (!box.isConnected || token !== box._optReq) return;
    st.idx = null;
    st.exp = d.exp;
    st.d = d;
    draw(d);
  };
  const draw = (d) => {
    box.innerHTML = `<div class="opt-wrap">${header(d)}${expBar(d)}<div class="opt-body">${view.html(d, st)}</div><div class="opt-note">${esc(NOTE)}</div></div>`;
    view.after?.(box, d, st);
  };
  box.onclick = (e) => {
    const b = e.target.closest?.('[data-exp]');
    if (b && DATE.test(b.dataset.exp)) { st.exp = b.dataset.exp; go(); return; }
    if (e.target.closest?.('[data-greeks]')) {
      st.greeks = !st.greeks;
      if (st.d) draw(st.d);
    }
  };
  go();
}

function header(d) {
  const s = d.summary, em = s.expectedMove;
  const cell = (k, v, c = '') => `<div><span>${esc(k)}</span><b class="${c}">${esc(v)}</b></div>`;
  return `<div class="opt-head"><span class="opt-sym">${esc(d.sym)}</span>
    <div class="opt-strip">${cell('SPOT', n2(d.spot))}${cell('ATM IV', pct(s.atmIV))}
    ${cell(`EXP MOVE ${d.exp}`, em == null ? '--' : `+/-${n2(s.expectedMoveUsd)} (${pct(em)})`)}
    ${cell('P/C VOL', ratio(s.putCallVolRatio))}${cell('P/C OI', ratio(s.putCallOIRatio))}${cell('MAX PAIN', n2(s.maxPain))}</div>
    <span class="opt-asof">${esc(d.asOf)} ET</span></div>`;
}

function expBar(d) {
  const btn = (e, i) => `<button type="button" data-exp="${esc(e.date)}" class="${e.date === d.exp ? 'on' : ''}" title="${esc(`${e.date}  #${i + 1}  OI ${fmt(e.callOI + e.putOI, 0)}`)}">${esc(e.date.slice(2))} <i>${e.dte}d</i> <i>${esc(vol(e.callOI + e.putOI))}</i></button>`;
  return `<div class="opt-exps">${d.expirations.map(btn).join('')}</div>`;
}

// ---- OPT ----
const COLS = {
  std: [['Bid', 'bid', (v) => n2(v)], ['Ask', 'ask', (v) => n2(v)], ['Last', 'last', (v) => n2(v)], ['IV', 'iv', (v) => pct(v)], ['Delta', 'delta', (v) => n2(v)], ['Vol', 'vol', cnt], ['OI', 'oi', cnt]],
  greeks: [['Bid', 'bid', (v) => n2(v)], ['Ask', 'ask', (v) => n2(v)], ['IV', 'iv', (v) => pct(v)], ['Delta', 'delta', (v) => n2(v)], ['Gamma', 'gamma', (v) => n2(v, 4)], ['Theta', 'theta', (v) => n2(v, 3)], ['Vega', 'vega', (v) => n2(v, 3)]],
};

function chainHtml(d, st) {
  const cols = st.greeks ? COLS.greeks : COLS.std;
  if (!d.rows.length) return '<div class="opt-empty">NO STRIKES NEAR SPOT FOR THIS EXPIRY</div>';
  let atm = d.rows[0].k;
  for (const r of d.rows) if (Math.abs(r.k - d.spot) < Math.abs(atm - d.spot)) atm = r.k;
  const cell = (leg, [, key, f], itm) => `<td class="${itm ? 'opt-itm' : ''}">${leg ? f(leg[key]) : '--'}</td>`;
  const body = d.rows.map((r) => `<tr class="${r.k === atm ? 'opt-atm' : ''}">${cols.map((c) => cell(r.c, c, r.k < d.spot)).join('')}<td class="opt-k">${n2(r.k)}</td>${[...cols].reverse().map((c) => cell(r.p, c, r.k > d.spot)).join('')}</tr>`).join('');
  const th = (arr) => arr.map(([h]) => `<th>${h}</th>`).join('');
  return `<div class="opt-bar"><button type="button" data-greeks="1" class="${st.greeks ? 'on' : ''}">GREEKS</button><span>${esc(d.exp)}  ${d.dte}d  ${d.rows.length} strikes</span></div>
    <div class="opt-scroll"><table class="opt-tbl"><thead><tr><th class="opt-h" colspan="${cols.length}">CALLS</th><th></th><th class="opt-h" colspan="${cols.length}">PUTS</th></tr>
    <tr>${th(cols)}<th>Strike</th>${th([...cols].reverse())}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function scrollToAtm(box) {
  const sc = box.querySelector('.opt-scroll'), row = box.querySelector('.opt-atm');
  if (sc && row) sc.scrollTop = Math.max(0, row.offsetTop - sc.clientHeight / 2);
}

// ---- IVS ----
const IVS_HTML = () => '<div class="opt-ivs"><div class="opt-cap">IV SMILE (strike)</div><div class="opt-chart" id="opt-smile"></div><div class="opt-cap">ATM IV TERM STRUCTURE (days to expiry)</div><div class="opt-chart" id="opt-term"></div></div>';

// line chart with hover readout. series: [{name, color, pts:[[x,y]]}]; vline: optional x marker
function lineChart(el, series, { vline, xfmt }) {
  const pts = series.flatMap((s) => s.pts);
  if (!pts.length) { el.innerHTML = '<div class="opt-empty">NO DATA</div>'; return; }
  const { c, g, W, H } = canvas(el);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), yLo = Math.min(...ys), yHi = Math.max(...ys);
  const yPad = (yHi - yLo) * 0.1 || 0.01, y0 = Math.max(0, yLo - yPad), y1 = yHi + yPad;
  const L = 44, R = 10, T = 18, B = 18;
  const X = (v) => L + (x1 === x0 ? (W - L - R) / 2 : ((v - x0) / (x1 - x0)) * (W - L - R));
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const draw = (hx) => {
    g.clearRect(0, 0, W, H);
    g.font = '10px monospace';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = y0 + ((y1 - y0) * i) / 4, y = Y(v);
      g.strokeStyle = '#1c1c1c'; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
      g.fillStyle = '#6d6d6d'; g.textAlign = 'right'; g.fillText(pct(v, 0), L - 4, y + 3);
    }
    g.textAlign = 'center'; g.fillStyle = '#6d6d6d';
    for (let i = 0; i <= 4; i++) { const v = x0 + ((x1 - x0) * i) / 4; g.fillText(xfmt(v), X(v), H - 5); }
    if (vline != null && vline >= x0 && vline <= x1) {
      g.strokeStyle = '#a86400'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(vline), T); g.lineTo(X(vline), H - B); g.stroke(); g.setLineDash([]);
    }
    series.forEach((s) => {
      g.strokeStyle = s.color; g.lineWidth = 1.5; g.beginPath();
      s.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      g.stroke();
      if (s.pts.length < 40) { g.fillStyle = s.color; s.pts.forEach((p) => g.fillRect(X(p[0]) - 1.5, Y(p[1]) - 1.5, 3, 3)); }
    });
    let lx = L;
    g.textAlign = 'left';
    series.forEach((s) => { g.fillStyle = s.color; g.fillText(s.name, lx, 11); lx += s.name.length * 6 + 10; });
    if (hx != null) {
      g.strokeStyle = '#555'; g.beginPath(); g.moveTo(X(hx), T); g.lineTo(X(hx), H - B); g.stroke();
      const txt = [xfmt(hx), ...series.map((s) => { const p = s.pts.find((q) => q[0] === hx); return p ? `${s.name} ${pct(p[1])}` : null; }).filter(Boolean)].join('   ');
      g.fillStyle = '#cfcfcf'; g.textAlign = 'right'; g.fillText(txt, W - R, 11);
    }
  };
  const allX = [...new Set(xs)].sort((a, b) => a - b);
  c.onmousemove = (e) => {
    const mx = e.clientX - c.getBoundingClientRect().left;
    let best = allX[0];
    for (const v of allX) if (Math.abs(X(v) - mx) < Math.abs(X(best) - mx)) best = v;
    draw(best);
  };
  c.onmouseleave = () => draw(null);
  draw(null);
}

function ivsAfter(box, d) {
  const smile = box.querySelector('#opt-smile'), term = box.querySelector('#opt-term');
  if (!smile || !term) return;
  lineChart(smile, [
    { name: 'CALLS', color: '#2ecc71', pts: d.skew.filter((p) => p.ivCall != null).map((p) => [p.k, p.ivCall]) },
    { name: 'PUTS', color: '#ff4d4d', pts: d.skew.filter((p) => p.ivPut != null).map((p) => [p.k, p.ivPut]) },
  ], { vline: d.spot, xfmt: (v) => n2(v, v % 1 ? 1 : 0) });
  const dte = new Map(d.expirations.map((e) => [e.date, e.dte]));
  lineChart(term, [{ name: 'ATM IV', color: '#ff9f1a', pts: d.termStructure.filter((t) => dte.has(t.date)).map((t) => [dte.get(t.date), t.atmIV]) }], { xfmt: (v) => `${Math.round(v)}d` });
}

registerWidget('opt', {
  title: (a) => `${a[0] ?? ''} OPT  option chain`.trim(),
  hint: 'AAPL OPT',
  render: (box, args) => mount(box, args, { cmd: 'OPT', html: chainHtml, after: scrollToAtm }),
});
registerWidget('ivs', {
  title: (a) => `${a[0] ?? ''} IVS  implied vol smile + term structure`.trim(),
  hint: 'AAPL IVS',
  render: (box, args) => mount(box, args, { cmd: 'IVS', html: IVS_HTML, after: ivsAfter }),
});

for (const name of ['OPT', 'OMON', 'CHAIN']) registerCommand(name, { help: 'AAPL OPT [2026-10-16]  option chain, calls | strike | puts', run: (a) => openWidget('opt', a) });
for (const name of ['IVS', 'SKEW']) registerCommand(name, { help: 'AAPL IVS  implied vol smile and ATM term structure', run: (a) => openWidget('ivs', a) });
