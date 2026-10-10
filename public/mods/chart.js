// GP / GIP price charts, COMP overlay, CORR matrix and HP price table. Math and canvas drawing live in chartlib.js.
import { esc, fmt, sgn, vol, msg, getJSON, canvas, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';
import { sma, ema, bollinger, rsi, macd, toBars, align, rebase, returns, stdev, pearson, fmtDate, mountChart, PALETTE } from './chartlib.js';

loadCSS(new URL('./chart.css', import.meta.url));

const SYM = /^[A-Z0-9.^=\-]{1,15}$/;
const syms = (args, max) => [...new Set(args.filter((a) => SYM.test(a)))].slice(0, max);
const cls = (n) => (n > 0 ? 'chart-up' : n < 0 ? 'chart-dn' : '');
const store = (k, v) => {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem(k)) || {};
    localStorage.setItem(k, JSON.stringify(v));
  } catch { /* storage blocked */ }
  return {};
};

// range key -> Yahoo range/interval. mo/ytd ranges fetch 2y of daily bars so long studies have history, then show the tail.
const PLANS = {
  '1D': { r: '1d', i: '5m' }, '5D': { r: '5d', i: '15m' }, '1M': { r: '1mo', i: '30m' },
  '3M': { r: '2y', i: '1d', mo: 3 }, '6M': { r: '2y', i: '1d', mo: 6 }, 'YTD': { r: '2y', i: '1d', ytd: 1 }, '1Y': { r: '2y', i: '1d', mo: 12 },
  '5Y': { r: '5y', i: '1wk' }, 'MAX': { r: 'max', i: '1mo' }, '1 MIN': { r: '1d', i: '1m' }, '5 MIN': { r: '1d', i: '5m' },
};
const TYPES = [['line', 'Line'], ['area', 'Area'], ['candle', 'Candle'], ['bar', 'Bar']];
const STUDIES = [['SMA20', 'SMA 20'], ['SMA50', 'SMA 50'], ['SMA200', 'SMA 200'], ['EMA20', 'EMA 20'], ['BB', 'Bollinger'], ['RSI', 'RSI'], ['MACD', 'MACD']];
const chartUrl = (s, p) => `/api/chart?s=${encodeURIComponent(s)}&range=${p.r}&interval=${p.i}`;
const sep = '<span class="chart-sep"></span>';
const btn = (g, v, label, on) => `<button class="chart-btn${on ? ' on' : ''}" data-g="${g}" data-v="${esc(v)}">${esc(label)}</button>`;

async function quote(sym) {
  const r = (await getJSON(chartUrl(sym, { r: '5d', i: '1d' }))).chart.result[0], m = r.meta, b = toBars(r), n = b.c.length;
  const price = m.regularMarketPrice ?? b.c[n - 1];
  const same = m.regularMarketTime - b.t[n - 1] < 86400;
  const prev = same && n > 1 ? b.c[n - 2] : same ? m.chartPreviousClose : b.c[n - 1];
  return { name: m.shortName || m.longName || sym, price, ch: price - prev, pc: ((price - prev) / prev) * 100, lo: m.regularMarketDayLow, hi: m.regularMarketDayHigh };
}

const headHtml = (sym, q) => `<span class="chart-sym">${esc(sym)}</span>` + (q
  ? `<span class="chart-mu">${esc(q.name)}</span><span class="chart-px">${fmt(q.price)}</span><span class="${cls(q.ch)}">${sgn(q.ch)} (${sgn(q.pc)}%)</span><span class="chart-mu">Day ${fmt(q.lo)} - ${fmt(q.hi)}</span>`
  : '');

function chartOpts(b, st, plan) {
  const ov = [], has = (id) => st.studies.includes(id);
  if (has('SMA20')) ov.push({ name: 'SMA 20', v: sma(b.c, 20), color: '#f1c40f' });
  if (has('SMA50')) ov.push({ name: 'SMA 50', v: sma(b.c, 50), color: '#3aa0ff' });
  if (has('SMA200')) ov.push({ name: 'SMA 200', v: sma(b.c, 200), color: '#e056fd' });
  if (has('EMA20')) ov.push({ name: 'EMA 20', v: ema(b.c, 20), color: '#1abc9c' });
  const panes = [];
  if (has('RSI')) panes.push({ kind: 'rsi', v: rsi(b.c) });
  if (has('MACD')) panes.push({ kind: 'macd', ...macd(b.c) });
  let from = 0;
  if (plan.mo || plan.ytd) {
    const d = new Date(b.t[b.t.length - 1] * 1000);
    let cut;
    if (plan.ytd) cut = Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
    else { d.setUTCMonth(d.getUTCMonth() - plan.mo); cut = d / 1000; }
    from = Math.max(0, b.t.findIndex((t) => t >= cut));
  }
  return { kind: 'bars', t: b.t, off: b.meta.gmtoffset || 0, intra: /^\d+m$/.test(plan.i), from, log: st.log, type: st.type, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, volume: true, overlays: ov, band: has('BB') ? bollinger(b.c) : null, panes };
}

// Shared by GP and GIP: toolbar, header and chart. cfg: { key, ranges, def, refresh }
function chartView(box, sym, cfg) {
  const st = { range: cfg.ranges[cfg.def], type: 'candle', log: false, studies: [], ...store(cfg.key) };
  if (!cfg.ranges.includes(st.range)) st.range = cfg.ranges[cfg.def];
  if (!TYPES.some((t) => t[0] === st.type)) st.type = 'candle';
  if (!Array.isArray(st.studies)) st.studies = [];
  box.innerHTML = '<div class="chart-root"><div class="chart-bar"></div><div class="chart-head"></div><div class="chart-box"></div></div>';
  const root = box.firstElementChild, bar = root.children[0], head = root.children[1], cb = root.children[2];
  let bars = null, chart = null, seq = 0;

  const drawBar = () => {
    bar.innerHTML = cfg.ranges.map((r) => btn('range', r, r, st.range === r)).join('') + sep
      + TYPES.map(([v, l]) => btn('type', v, l, st.type === v)).join('') + sep + btn('log', '', 'LOG', st.log) + sep
      + STUDIES.map(([v, l]) => btn('study', v, l, st.studies.includes(v))).join('');
  };
  const paint = () => {
    if (!bars) return;
    const o = chartOpts(bars, st, PLANS[st.range]);
    if (chart) chart.set(o); else chart = mountChart(cb, canvas, o);
  };
  async function load(silent) {
    const my = ++seq;
    if (!silent) cb.innerHTML = msg('LOADING');
    try {
      const [d, q] = await Promise.all([getJSON(chartUrl(sym, PLANS[st.range])), quote(sym).catch(() => null)]);
      if (my !== seq) return;
      const b = toBars(d.chart.result[0]);
      if (b.c.length < 2) throw new Error('empty');
      bars = b; head.innerHTML = headHtml(sym, q); paint();
    } catch { if (my === seq && !silent) { bars = null; cb.innerHTML = msg(`NO DATA FOR ${sym}`); } }
  }
  bar.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const { g, v } = b.dataset;
    if (g === 'range') st.range = v;
    else if (g === 'type') st.type = v;
    else if (g === 'log') st.log = !st.log;
    else st.studies = st.studies.includes(v) ? st.studies.filter((x) => x !== v) : [...st.studies, v];
    store(cfg.key, st); drawBar();
    if (g === 'range') load(); else paint();
  };
  if (cfg.refresh) {
    const id = setInterval(() => { if (!root.isConnected) clearInterval(id); else if (!document.hidden) load(true); }, cfg.refresh);
  }
  drawBar(); load();
}

const symOf = (args) => syms(args, 1)[0] || store('openterm.sym').s || 'SPY';
const rememberSym = (s) => store('openterm.sym', { s });

registerWidget('gp', {
  title: (args) => `GP  ${symOf(args)}`, hint: 'AAPL GP',
  render(box, args) { const s = symOf(args); rememberSym(s); chartView(box, s, { key: 'openterm.gp', ranges: ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'], def: 4 }); },
});
registerWidget('gip', {
  title: (args) => `GIP  ${symOf(args)}  intraday`, hint: 'AAPL GIP',
  render(box, args) { const s = symOf(args); rememberSym(s); chartView(box, s, { key: 'openterm.gip', ranges: ['1 MIN', '5 MIN'], def: 1, refresh: 60000 }); },
});

// ---- history fetch for several symbols (one request through /api/data) ----
async function history(list, range, interval) {
  const d = await getJSON(`/api/data?fn=history&s=${list.map(encodeURIComponent).join(',')}&range=${range}&interval=${interval}`);
  const out = {};
  for (const s of list) {
    if (!d[s]) continue;
    const t = [], c = [];
    d[s].t.forEach((x, i) => { if (d[s].c[i] != null) { t.push(x); c.push(d[s].c[i]); } });
    if (c.length > 1) out[s] = { t, c };
  }
  return out;
}

// ---- COMP ----
const COMP_R = { '1M': ['1mo', '1d'], '3M': ['3mo', '1d'], '6M': ['6mo', '1d'], 'YTD': ['ytd', '1d'], '1Y': ['1y', '1d'], '5Y': ['5y', '1wk'] };
registerWidget('comp', {
  title: (args) => `COMP  ${syms(args, 6).join(' ')}`, hint: 'COMP AAPL MSFT NVDA',
  render(box, args) {
    const saved = store('openterm.comp');
    const st = { range: args.find((a) => COMP_R[a]) || saved.range || '1Y', pct: args.includes('PCT') || (!args.includes('REBASE') && !!saved.pct), list: syms(args.filter((a) => !COMP_R[a] && a !== 'PCT' && a !== 'REBASE'), 6) };
    if (!COMP_R[st.range]) st.range = '1Y';
    box.innerHTML = '<div class="chart-root"><div class="chart-bar"></div><div class="chart-head"></div><div class="chart-box"></div></div>';
    const [bar, head, cb] = box.firstElementChild.children;
    let chart = null, seq = 0, data = null;
    const drawBar = () => {
      bar.innerHTML = Object.keys(COMP_R).map((r) => btn('range', r, r, st.range === r)).join('') + sep
        + btn('mode', 'rebase', 'Rebased 100', !st.pct) + btn('mode', 'pct', '% Change', st.pct) + sep
        + `<input class="chart-in" value="${esc(st.list.join(' '))}" spellcheck="false" placeholder="AAPL MSFT NVDA">`;
    };
    const paint = () => {
      if (!data) return;
      const list = st.list.filter((s) => data[s]);
      const al = align(list.map((s) => data[s]), true, true);
      const f = al.series[0].map((_, i) => al.series.every((x) => x[i] != null)).indexOf(true);
      if (f < 0) { cb.innerHTML = msg('NO OVERLAPPING DATES'); return; }
      const mode = st.pct ? 'pct' : 'rebase';
      const series = list.map((s, k) => ({ name: s, color: PALETTE[k % PALETTE.length], v: rebase(al.series[k].slice(f), mode) }));
      head.innerHTML = series.map((s) => { const v = s.v[s.v.length - 1], ch = st.pct ? v : v - 100; return `<span class="chart-leg"><i style="background:${s.color}"></i>${esc(s.name)} <b class="${cls(ch)}">${sgn(ch)}%</b></span>`; }).join('')
        + st.list.filter((s) => !data[s]).map((s) => `<span class="chart-mu">${esc(s)} no data</span>`).join('');
      const o = { kind: 'multi', t: al.t.slice(f), off: 0, intra: false, from: 0, series, base: st.pct ? 0 : 100 };
      if (chart) chart.set(o); else chart = mountChart(cb, canvas, o);
    };
    async function load() {
      const my = ++seq;
      if (!st.list.length) { cb.innerHTML = msg('COMP AAPL MSFT NVDA'); return; }
      cb.innerHTML = msg('LOADING');
      try {
        const [r, i] = COMP_R[st.range], d = await history(st.list, r, i);
        if (my !== seq) return;
        if (!Object.keys(d).length) throw new Error('empty');
        data = d; paint();
      } catch { if (my === seq) { data = null; head.innerHTML = ''; cb.innerHTML = msg('NO DATA'); } }
    }
    bar.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.g === 'range') st.range = b.dataset.v; else st.pct = b.dataset.v === 'pct';
      store('openterm.comp', { range: st.range, pct: st.pct }); drawBar();
      if (b.dataset.g === 'range') load(); else paint();
    };
    bar.onkeydown = (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input')) return;
      st.list = syms(e.target.value.toUpperCase().split(/[\s,]+/), 6); drawBar(); load();
    };
    drawBar(); load();
  },
});

// ---- CORR ----
const heat = (r) => (r == null ? '' : `background:${r >= 0 ? `rgba(46,204,113,${(r * 0.65).toFixed(3)})` : `rgba(255,77,77,${(-r * 0.65).toFixed(3)})`}`);
registerWidget('corr', {
  title: (args) => `CORR  ${syms(args, 8).join(' ')}  1Y`, hint: 'CORR AAPL MSFT NVDA GOOGL',
  async render(box, args) {
    const list = syms(args, 8);
    if (list.length < 2) { box.innerHTML = msg('CORR AAPL MSFT NVDA GOOGL'); return; }
    box.innerHTML = msg('LOADING');
    try {
      const d = await history(list, '1y', '1d'), have = list.filter((s) => d[s]);
      if (have.length < 2) throw new Error('empty');
      const al = align(have.map((s) => d[s]), true, false);
      const rows = al.t.map((_, i) => i).filter((i) => al.series.every((x) => x[i] != null));
      const rets = al.series.map((x) => returns(rows.map((i) => x[i])));
      const vols = have.map((s) => stdev(returns(d[s].c)) * Math.sqrt(252) * 100);
      const head = have.map((s) => `<th>${esc(s)}</th>`).join('');
      const body = have.map((s, i) => `<tr><td>${esc(s)}</td>${have.map((_, j) => { const r = i === j ? 1 : pearson(rets[i], rets[j]); return `<td class="chart-cell" style="${heat(r)}">${r == null ? '--' : r.toFixed(2)}</td>`; }).join('')}<td>${vols[i].toFixed(1)}%</td></tr>`).join('');
      const miss = list.filter((s) => !d[s]);
      box.innerHTML = `<div class="chart-scroll"><table class="chart-tbl"><thead><tr><th></th>${head}<th>Vol (ann.)</th></tr></thead><tbody>${body}</tbody></table>`
        + `<div class="chart-note">Daily returns, ${rows.length - 1} common days over 1Y. Volatility = stdev of daily returns x sqrt(252).${miss.length ? ` No data: ${esc(miss.join(', '))}.` : ''}</div></div>`;
    } catch { box.innerHTML = msg('NO DATA'); }
  },
});

// ---- HP ----
registerWidget('hp', {
  title: (args) => `HP  ${symOf(args)}`, hint: 'AAPL HP',
  async render(box, args) {
    const sym = symOf(args);
    rememberSym(sym);
    box.innerHTML = msg('LOADING');
    try {
      const r = (await getJSON(chartUrl(sym, { r: '2y', i: '1d' }))).chart.result[0], b = toBars(r), off = r.meta.gmtoffset || 0;
      if (b.c.length < 2) throw new Error('empty');
      const rows = b.t.map((t, i) => ({ d: fmtDate(t, off, false), o: b.o[i], h: b.h[i], l: b.l[i], c: b.c[i], v: b.v[i], p: i ? (b.c[i] / b.c[i - 1] - 1) * 100 : null })).slice(-250).reverse();
      box.innerHTML = `<div class="chart-root"><div class="chart-bar"><button class="chart-btn" data-csv="1">Download CSV</button><span class="chart-mu">${rows.length} rows, newest first</span></div><div class="chart-scroll"><table class="chart-tbl"><thead><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th>% Chg</th></tr></thead><tbody>`
        + rows.map((x) => `<tr><td>${esc(x.d)}</td><td>${fmt(x.o)}</td><td>${fmt(x.h)}</td><td>${fmt(x.l)}</td><td>${fmt(x.c)}</td><td>${esc(vol(x.v))}</td><td class="${cls(x.p)}">${x.p == null ? '--' : sgn(x.p) + '%'}</td></tr>`).join('')
        + '</tbody></table></div></div>';
      box.querySelector('[data-csv]').onclick = () => {
        const csv = 'date,open,high,low,close,volume,pct_change\n' + rows.map((x) => [x.d, x.o, x.h, x.l, x.c, x.v, x.p == null ? '' : x.p.toFixed(4)].join(',')).join('\n');
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = `${sym}_history.csv`;
        a.click();
      };
    } catch { box.innerHTML = msg(`NO DATA FOR ${sym}`); }
  },
});

registerCommand('GP', { help: 'AAPL GP  price chart', run: (args) => openWidget('gp', args) });
registerCommand('GIP', { help: 'AAPL GIP  intraday chart', run: (args) => openWidget('gip', args) });
registerCommand('COMP', { help: 'COMP AAPL MSFT  compare', run: (args) => openWidget('comp', args) });
registerCommand('CORR', { help: 'CORR AAPL MSFT NVDA  correlation', run: (args) => openWidget('corr', args) });
registerCommand('HP', { help: 'AAPL HP  price table', run: (args) => openWidget('hp', args) });
