// MOST, MAP, EQS and EVTS: equity analytics over the seeded `universe` snapshot and the earnings handler.
import { esc, fmt, cls, sgn, vol, msg, getJSON, canvas, status, registerCommand, registerWidget, openWidget, runCommand, loadCSS } from '../core.js';
loadCSS(new URL('./equities.css', import.meta.url));

let rows = null, loaded = false;
const views = new Set();
// The S&P 500 snapshot is split into 5 keys; load them only when a view opens (not on the global refresh loop).
const KEYS = ['universe', 'universe2', 'universe3', 'universe4', 'universe5'];
let lastLoad = 0;
async function loadUniverse() {
  try {
    const d = await getJSON(`/api/snap?keys=${KEYS.join(',')}`);
    const all = KEYS.flatMap((k) => d[k]?.rows ?? []);
    rows = all.length ? all : null;
  } catch { /* keep previous rows */ }
  loaded = true;
  views.forEach((v) => { if (v.box.isConnected) v.draw(); else { v.stop?.(); views.delete(v); } });
}

// register a view; draw() must handle the no-data case itself
function attach(box, draw, stop) {
  const v = { box, stop, draw };
  views.add(v);
  draw();
  if (Date.now() - lastLoad > 300000) { lastLoad = Date.now(); loadUniverse(); }
  return v;
}
// clicking a ticker cell opens the chart
const wireSyms = (el) => el.addEventListener('click', (e) => {
  const s = e.target.closest?.('[data-s]')?.dataset.s;
  if (s && /^[A-Z0-9.\-]{1,10}$/.test(s)) runCommand(`GP ${s}`);
});
const sym = (s) => `<span class="eq-sym" data-s="${esc(s)}">${esc(s)}</span>`;
const hiPct = (r) => (r.h52 ? ((r.p - r.h52) / r.h52) * 100 : null);
const loPct = (r) => (r.l52 ? ((r.p - r.l52) / r.l52) * 100 : null);

// ---- MOST ----
const TABS = [
  ['Gainers', (a, b) => b.pc - a.pc, (r) => r.pc >= 0], ['Losers', (a, b) => a.pc - b.pc, (r) => r.pc < 0],
  ['Most Active', (a, b) => (b.v ?? 0) * b.p - (a.v ?? 0) * a.p], ['52w Highs', (a, b) => hiPct(b) - hiPct(a)], ['52w Lows', (a, b) => loPct(a) - loPct(b)],
];
registerWidget('most', {
  title: 'MOST  Movers', hint: 'MOST',
  render(box) {
    let tab = 0;
    box.innerHTML = `<div class="eq-tabs">${TABS.map((t, i) => `<button data-t="${i}">${t[0]}</button>`).join('')}</div><div class="eq-body"></div>`;
    const body = box.querySelector('.eq-body');
    box.querySelector('.eq-tabs').addEventListener('click', (e) => { const t = e.target.dataset?.t; if (t != null) { tab = +t; draw(); } });
    wireSyms(body);
    const draw = () => {
      box.querySelectorAll('.eq-tabs button').forEach((b, i) => b.classList.toggle('on', i === tab));
      if (!rows) return void (body.innerHTML = msg(loaded ? 'NO DATA YET: SEEDER PENDING' : 'LOADING'));
      const [, sort, keep] = TABS[tab];
      const list = rows.filter(keep || (() => true)).sort(sort).slice(0, 15);
      body.innerHTML = `<table><thead><tr><th>#</th><th>Ticker</th><th>Name</th><th>Last</th><th>%Chg</th><th>Volume</th><th>vs 52w H</th><th>vs 52w L</th></tr></thead><tbody>${list.map((r, i) =>
        `<tr><td class="eq-txt">${i + 1}</td><td>${sym(r.s)}</td><td class="eq-txt">${esc(r.n)}</td><td>${fmt(r.p)}</td><td class="${cls(r.pc)}">${sgn(r.pc)}%</td><td>${vol(r.v)}</td><td class="${cls(hiPct(r))}">${sgn(hiPct(r), 1)}%</td><td class="${cls(loPct(r))}">${sgn(loPct(r), 1)}%</td></tr>`).join('') || `<tr><td colspan="8" class="eq-txt">NONE</td></tr>`}</tbody></table>`;
    };
    attach(box, draw);
  },
});
registerCommand('MOST', { help: 'MOST  gainers, losers, most active, 52w highs/lows', run: () => openWidget('most') });

// ---- MAP ----
// squarified treemap: items [{w,...}] into rect, returns items with x,y,w,h
function treemap(items, x, y, w, h) {
  const out = [], tot = items.reduce((a, i) => a + i.w, 0);
  if (!tot || w <= 0 || h <= 0) return out;
  const list = items.map((i) => ({ ...i, a: (i.w / tot) * w * h })).sort((a, b) => b.a - a.a);
  const worst = (row, side) => { const s = row.reduce((a, i) => a + i.a, 0); return Math.max(...row.map((i) => Math.max((side * side * i.a) / (s * s), (s * s) / (side * side * i.a)))); };
  while (list.length) {
    const side = Math.min(w, h), row = [list.shift()];
    while (list.length && worst([...row, list[0]], side) <= worst(row, side)) row.push(list.shift());
    const s = row.reduce((a, i) => a + i.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; row.forEach((i) => { const ih = i.a / cw; out.push({ ...i, x, y: cy, w: cw, h: ih }); cy += ih; }); x += cw; w -= cw; }
    else { const ch = s / w; let cx = x; row.forEach((i) => { const iw = i.a / ch; out.push({ ...i, x: cx, y, w: iw, h: ch }); cx += iw; }); y += ch; h -= ch; }
  }
  return out;
}
function color(pc) {
  const t = Math.max(-1, Math.min(1, (pc ?? 0) / 3)), k = Math.abs(t);
  const [r, g, b] = t >= 0 ? [46, 204, 113] : [255, 77, 77];
  const m = (c, base) => Math.round(base + (c * 0.75 - base) * k);
  return `rgb(${m(r, 40)},${m(g, 40)},${m(b, 40)})`;
}
registerWidget('map', {
  title: 'MAP  Sector Heatmap', hint: 'MAP',
  render(box) {
    let tiles = [], ro;
    const draw = () => {
      if (!rows) return void (box.innerHTML = msg(loaded ? 'NO DATA YET: SEEDER PENDING' : 'LOADING'));
      box.innerHTML = '<div class="eq-map"></div>';
      const host = box.firstChild, { c, g, W, H } = canvas(host);
      host.insertAdjacentHTML('beforeend', '<div class="eq-tip"></div>');
      const tip = host.querySelector('.eq-tip');
      const bySec = {};
      rows.forEach((r) => { (bySec[r.sec] ??= []).push({ ...r, w: Math.max((r.v ?? r.av ?? 1) * r.p, 1) }); });
      const secs = Object.entries(bySec).map(([sec, list]) => ({ sec, list, w: list.reduce((a, i) => a + i.w, 0) }));
      tiles = [];
      g.font = '11px monospace'; g.textBaseline = 'top';
      treemap(secs, 0, 0, W, H).forEach((S) => {
        const hd = S.h > 40 && S.w > 60 ? 13 : 0;
        treemap(S.list, S.x + 1, S.y + 1 + hd, S.w - 2, S.h - 2 - hd).forEach((t) => {
          tiles.push(t);
          g.fillStyle = color(t.pc); g.fillRect(t.x, t.y, t.w - 1, t.h - 1);
          if (t.w > 34 && t.h > 24) { g.fillStyle = '#fff'; g.fillText(t.s, t.x + 3, t.y + 3, t.w - 6); g.fillText(`${sgn(t.pc, 1)}%`, t.x + 3, t.y + 15, t.w - 6); }
        });
        if (hd) { g.fillStyle = '#ff9f1a'; g.fillText(S.sec.toUpperCase(), S.x + 3, S.y + 2, S.w - 6); }
      });
      const hit = (e) => { const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return tiles.find((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h); };
      c.addEventListener('mousemove', (e) => {
        const t = hit(e);
        if (!t) { tip.style.display = 'none'; return; }
        tip.innerHTML = `${esc(t.s)} ${esc(t.n)}<br>${esc(t.sec)}<br>${fmt(t.p)}  <span class="${cls(t.pc)}">${sgn(t.pc)}%</span>`;
        tip.style.display = 'block';
        const r = c.getBoundingClientRect();
        tip.style.left = `${Math.min(e.clientX - r.left + 12, W - 150)}px`; tip.style.top = `${Math.min(e.clientY - r.top + 12, H - 50)}px`;
      });
      c.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
      c.addEventListener('click', (e) => { const t = hit(e); if (t) runCommand(`GP ${t.s}`); });
    };
    const v = attach(box, draw, () => ro?.disconnect());
    let lastW = box.clientWidth, lastH = box.clientHeight;
    ro = new ResizeObserver(() => { if (box.clientWidth !== lastW || box.clientHeight !== lastH) { lastW = box.clientWidth; lastH = box.clientHeight; v.draw(); } });
    ro.observe(box);
  },
});
registerCommand('MAP', { help: 'MAP  sector heatmap of US large caps', run: () => openWidget('map') });

// ---- EQS ----
const COLS = [['s', 'Ticker'], ['n', 'Name'], ['sec', 'Sector'], ['p', 'Last'], ['pc', '%Chg'], ['v', 'Volume'], ['rv', 'RVol'], ['hi', 'vs 52w H'], ['m1', '1M %'], ['ytd', 'YTD %']];
const NUMF = ['pmin', 'pmax', 'cmin', 'cmax', 'acmin', 'vmin', 'rvmin', 'hi', 'lo', 'ytdmin', 'ytdmax', 'm1min', 'm1max', 'cap', 'sectop'];
const SORTS = new Set(['s', 'n', 'sec', 'p', 'pc', 'v', 'rv', 'hi', 'lo', 'm1', 'ytd', 'apc']);
const rvol = (r) => (r.av > 0 && r.v != null ? r.v / r.av : null);
const val = (r, k) => (k === 'hi' ? hiPct(r) : k === 'lo' ? loPct(r) : k === 'rv' ? rvol(r) : k === 'apc' ? (r.pc == null ? null : Math.abs(r.pc)) : r[k]);
const ge = (v, m) => m == null || (v != null && v >= m);
const le = (v, m) => m == null || (v != null && v <= m);

// Pure filter over snapshot rows. st: sec, near, and the numeric keys in NUMF (vmin in millions; hi/lo are % distance from 52w high/low).
export function screen(all, st) {
  const hi = st.hi ?? (st.near ? 5 : null);
  let out = all;
  if (st.cap) {
    const top = new Set(all.filter((r) => r.av > 0 && r.p > 0).sort((a, b) => b.p * b.av - a.p * a.av).slice(0, st.cap));
    out = out.filter((r) => top.has(r));
  }
  out = out.filter((r) => (!st.sec || r.sec === st.sec) && ge(r.p, st.pmin) && le(r.p, st.pmax) && ge(r.pc, st.cmin) && le(r.pc, st.cmax)
    && ge(val(r, 'apc'), st.acmin) && (st.vmin == null || (r.v ?? 0) >= st.vmin * 1e6) && ge(rvol(r), st.rvmin)
    && ge(hiPct(r), hi == null ? null : -hi) && le(loPct(r), st.lo) && ge(r.ytd, st.ytdmin) && le(r.ytd, st.ytdmax) && ge(r.m1, st.m1min) && le(r.m1, st.m1max));
  if (st.sectop) {
    const seen = {};
    out = [...out].sort((a, b) => (b.pc ?? -Infinity) - (a.pc ?? -Infinity)).filter((r) => (seen[r.sec] = (seen[r.sec] ?? 0) + 1) <= st.sectop);
  }
  return out;
}

// Built-in screens as data: st is the filter state, sort is [column, direction].
export const PRESETS = [
  { name: 'Big Gainers', desc: 'Up 3% or more today on volume above 1.5x average', st: { cmin: 3, rvmin: 1.5 }, sort: ['pc', -1] },
  { name: 'Big Losers', desc: 'Down 3% or more today', st: { cmax: -3 }, sort: ['pc', 1] },
  { name: 'Near 52w High', desc: 'Within 2% of the 52-week high', st: { hi: 2 }, sort: ['hi', -1] },
  { name: 'Near 52w Low', desc: 'Within 5% of the 52-week low', st: { lo: 5 }, sort: ['lo', 1] },
  { name: '52w Breakouts', desc: 'Within 1% of the 52-week high on volume above 1.3x average', st: { hi: 1, rvmin: 1.3 }, sort: ['rv', -1] },
  { name: 'Oversold Bounce', desc: 'Down more than 15% YTD but up over 1.5% today', st: { ytdmax: -15, cmin: 1.5 }, sort: ['pc', -1] },
  { name: 'Momentum Leaders', desc: '1-month gain above 10% and YTD above 20%', st: { m1min: 10, ytdmin: 20 }, sort: ['m1', -1] },
  { name: 'Laggards', desc: '1-month loss worse than 10%', st: { m1max: -10 }, sort: ['m1', 1] },
  { name: 'High Volume', desc: 'Volume above 2x the average', st: { rvmin: 2 }, sort: ['rv', -1] },
  { name: 'Mega Cap Movers', desc: 'Top 50 by price x average volume (size proxy) moving more than 1.5%', st: { cap: 50, acmin: 1.5 }, sort: ['apc', -1] },
  { name: 'Sector Leaders', desc: 'Top 3 by %chg in each sector', st: { sectop: 3 }, sort: ['sec', 1] },
];
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

// custom presets: localStorage when available, in-memory otherwise
const SKEY = 'openterm.eqs.presets';
let custom = [];
function clean(p) {
  const name = String(p?.name ?? '').trim().slice(0, 40);
  if (!name || !p.st || typeof p.st !== 'object') return null;
  const st = {};
  if (typeof p.st.sec === 'string' && p.st.sec) st.sec = p.st.sec.slice(0, 40);
  if (p.st.near === true) st.near = true;
  NUMF.forEach((k) => { if (p.st[k] != null && p.st[k] !== '' && Number.isFinite(+p.st[k])) st[k] = +p.st[k]; });
  const [k, d] = Array.isArray(p.sort) ? p.sort : [];
  return { name, st, sort: [SORTS.has(k) ? k : 'pc', d === 1 ? 1 : -1], custom: true };
}
try { const j = JSON.parse(localStorage.getItem(SKEY) || '[]'); if (Array.isArray(j)) custom = j.map(clean).filter(Boolean); } catch { /* storage unavailable */ }
const persist = () => { try { localStorage.setItem(SKEY, JSON.stringify(custom)); } catch { /* keep in memory */ } };

// fuzzy name match: upper-cased, spaces and punctuation ignored; exact, prefix, substring, then any word prefix
export function findPreset(tokens) {
  const q = norm(tokens.join(''));
  if (!q) return null;
  const all = [...PRESETS, ...custom];
  const words = (p) => p.name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return all.find((p) => norm(p.name) === q) || all.find((p) => norm(p.name).startsWith(q)) || all.find((p) => norm(p.name).includes(q))
    || all.find((p) => words(p).some((w) => w.startsWith(q))) || null;
}

registerWidget('eqs', {
  title: 'EQS  Equity Screener', hint: 'EQS',
  render(box, args = []) {
    let key = 'pc', dir = -1, active = null, pendingSec = '';
    const secs = rows ? [...new Set(rows.map((r) => r.sec))].sort() : [];
    const num = (id, label, step = 'any') => `<label>${label} <input type="number" data-f="${id}" step="${step}"></label>`;
    box.innerHTML = `<div class="eq-pre"></div><div class="eq-io" hidden><textarea rows="4" spellcheck="false" placeholder="Custom presets as JSON"></textarea><div><button data-io="export">Export</button><button data-io="import">Import</button><span class="eq-iomsg"></span></div></div>
      <div class="eq-ctl eq-flt">
      <label>Sector <select data-f="sec"><option value="">All</option>${secs.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
      <label>Price <input type="number" data-f="pmin" placeholder="min"><input type="number" data-f="pmax" placeholder="max"></label>
      <label>%Chg >= <input type="number" data-f="cmin" step="0.1"></label>
      <label>Vol (M) >= <input type="number" data-f="vmin" step="0.5"></label>
      <label><input type="checkbox" data-f="near"> within 5% of 52w high</label></div>
      <div class="eq-ctl eq-flt">${num('cmax', '%Chg <=')}${num('acmin', '|%Chg| >=')}${num('rvmin', 'RVol >=')}${num('hi', 'Within % of 52w H')}${num('lo', 'Within % of 52w L')}${num('ytdmin', 'YTD >=')}${num('ytdmax', 'YTD <=')}${num('m1min', '1M >=')}${num('m1max', '1M <=')}${num('cap', 'Top N size')}${num('sectop', 'Top N per sector')}</div>
      <div class="eq-cnt"></div><div class="eq-body"></div>`;
    const body = box.querySelector('.eq-body'), cnt = box.querySelector('.eq-cnt'), bar = box.querySelector('.eq-pre'), io = box.querySelector('.eq-io');
    const f = (n) => box.querySelector(`[data-f=${n}]`);
    const num_ = (n) => (f(n).value === '' ? null : +f(n).value);
    wireSyms(body);
    const getState = () => {
      const st = {};
      if (f('sec').value) st.sec = f('sec').value;
      if (f('near').checked) st.near = true;
      NUMF.forEach((k) => { const v = num_(k); if (v != null) st[k] = v; });
      return st;
    };
    const setState = (st) => {
      pendingSec = st.sec ?? '';
      f('sec').value = pendingSec;
      f('near').checked = !!st.near;
      NUMF.forEach((k) => { f(k).value = st[k] ?? ''; });
    };
    const drawBar = () => {
      const b = (p, id, extra = '') => `<span class="eq-chip${active === p ? ' on' : ''}"><button data-p="${id}" title="${esc(p.desc ?? 'Custom preset')}">${esc(p.name)}</button>${extra}</span>`;
      bar.innerHTML = `${PRESETS.map((p, i) => b(p, `b${i}`)).join('')}${custom.map((p, i) => b(p, `c${i}`, `<button data-del="${i}" title="Delete preset">×</button>`)).join('')}
        <input class="eq-pname" placeholder="preset name" maxlength="40"><button data-save>Save as preset</button><button data-ioT>Export/Import</button>`;
    };
    const draw = () => {
      if (!rows) { cnt.textContent = ''; return void (body.innerHTML = msg(loaded ? 'NO DATA YET: SEEDER PENDING' : 'LOADING')); }
      const hits = screen(rows, getState());
      hits.sort((a, b) => {
        const x = val(a, key) ?? -Infinity, y = val(b, key) ?? -Infinity;
        const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
        return (c || (key === 'sec' ? (b.pc ?? 0) - (a.pc ?? 0) : 0)) * (c ? dir : 1);
      });
      cnt.textContent = `${active ? `${active.name}: ` : ''}${hits.length} of ${rows.length} match${hits.length > 50 ? ', showing 50' : ''}`;
      const rv = (r) => (rvol(r) == null ? '--' : `${fmt(rvol(r), 1)}x`);
      body.innerHTML = `<table><thead><tr>${COLS.map(([k, l]) => `<th class="eq-sort${k === key ? ' on' : ''}" data-k="${k}">${l}${k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${hits.slice(0, 50).map((r) =>
        `<tr><td>${sym(r.s)}</td><td class="eq-txt">${esc(r.n)}</td><td class="eq-txt">${esc(r.sec)}</td><td>${fmt(r.p)}</td><td class="${cls(r.pc)}">${sgn(r.pc)}%</td><td>${vol(r.v)}</td><td>${rv(r)}</td><td class="${cls(hiPct(r))}">${sgn(hiPct(r), 1)}%</td><td class="${cls(r.m1)}">${sgn(r.m1, 1)}</td><td class="${cls(r.ytd)}">${sgn(r.ytd, 1)}</td></tr>`).join('') || '<tr><td colspan="10" class="eq-txt">NO MATCHES</td></tr>'}</tbody></table>`;
    };
    const apply = (p) => { setState(p.st); [key, dir] = p.sort; active = p; drawBar(); draw(); };
    box.querySelectorAll('.eq-flt').forEach((el) => el.addEventListener('input', () => { if (active) { active = null; drawBar(); } draw(); }));
    body.addEventListener('click', (e) => {
      const k = e.target.closest?.('[data-k]')?.dataset.k;
      if (k) { dir = k === key ? -dir : (k === 's' || k === 'n' || k === 'sec' ? 1 : -1); key = k; draw(); }
    });
    const iomsg = (t) => { box.querySelector('.eq-iomsg').textContent = t; };
    bar.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset?.p) { const i = +t.dataset.p.slice(1); apply((t.dataset.p[0] === 'b' ? PRESETS : custom)[i]); return; }
      if (t.dataset?.del != null) { custom.splice(+t.dataset.del, 1); persist(); if (active && !custom.includes(active) && active.custom) active = null; drawBar(); draw(); return; }
      if (t.dataset?.save != null) {
        const name = bar.querySelector('.eq-pname').value.trim().slice(0, 40);
        if (!name) return void bar.querySelector('.eq-pname').focus();
        const p = clean({ name, st: getState(), sort: [key, dir] });
        const i = custom.findIndex((c) => c.name === name);
        if (i >= 0) custom[i] = p; else custom.push(p);
        persist(); active = p; drawBar(); draw();
      }
      if (t.dataset?.iot != null) io.hidden = !io.hidden;
    });
    io.addEventListener('click', (e) => {
      const m = e.target.dataset?.io, ta = io.querySelector('textarea');
      if (m === 'export') { ta.value = JSON.stringify(custom.map(({ name, st, sort }) => ({ name, st, sort })), null, 1); iomsg(`${custom.length} preset(s)`); }
      if (m === 'import') {
        try {
          const j = JSON.parse(ta.value), list = (Array.isArray(j) ? j : [j]).map(clean).filter(Boolean);
          if (!list.length) throw new Error('none');
          list.forEach((p) => { const i = custom.findIndex((c) => c.name === p.name); if (i >= 0) custom[i] = p; else custom.push(p); });
          persist(); drawBar(); iomsg(`imported ${list.length}`);
        } catch { iomsg('invalid JSON'); }
      }
    });
    drawBar();
    if (args.length) {
      const p = findPreset(args);
      if (p) apply(p); else status(`EQS: no preset matches ${args.join(' ')}`, true);
    }
    // snapshot refresh keeps filter inputs; only the sector list may arrive late
    attach(box, () => {
      if (f('sec').options.length === 1 && rows) {
        [...new Set(rows.map((r) => r.sec))].sort().forEach((s) => f('sec').insertAdjacentHTML('beforeend', `<option>${esc(s)}</option>`));
        if (pendingSec) f('sec').value = pendingSec;
      }
      draw();
    });
  },
});
registerCommand('EQS', { help: 'EQS [preset]  equity screener; EQS BREAKOUT, EQS GAINERS runs a preset', run: (args) => openWidget('eqs', args) });

registerWidget('presets', {
  title: 'PRESETS  Screener Presets', hint: 'PRESETS',
  render(box) {
    const all = [...PRESETS, ...custom];
    box.innerHTML = `<table><thead><tr><th>Preset</th><th>Description</th></tr></thead><tbody>${all.map((p, i) =>
      `<tr class="eq-run" data-i="${i}"><td class="eq-sym">${esc(p.name)}</td><td class="eq-txt">${esc(p.desc ?? 'Custom preset')}</td></tr>`).join('')}</tbody></table><div class="eq-cnt">Click a row to run it in EQS. Type EQS followed by part of a name.</div>`;
    box.addEventListener('click', (e) => { const i = e.target.closest?.('[data-i]')?.dataset.i; if (i != null) openWidget('eqs', [all[+i].name]); });
  },
});
registerCommand('PRESETS', { help: 'PRESETS  list screener presets, click to run', run: () => openWidget('presets') });

// ---- EVTS ----
// weekday dates starting today, same rule as the handler
function weekdays(n) {
  const out = [], d = new Date();
  while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const EV_FILTERS = [['all', 'All'], ['sp', 'S&P 500 only'], ['BMO', 'Before open'], ['AMC', 'After close']];
const EV_RANGES = [['7', '7 days', 0, 7], ['w1', 'This week', 0, 5], ['w2', 'Next week', 5, 10]];
registerWidget('evts', {
  title: 'EVTS  Earnings Calendar', hint: 'EVTS',
  render(box) {
    let flt = 'sp', rng = '7';
    const data = {};
    box.innerHTML = `<div class="eq-btns"></div><div class="eq-body"></div>`;
    const bar = box.querySelector('.eq-btns'), body = box.querySelector('.eq-body');
    const btn = (g, id, l, on) => `<button data-g="${g}" data-v="${id}"${on ? ' class="on"' : ''}>${esc(l)}</button>`;
    const draw = () => {
      bar.innerHTML = EV_FILTERS.map(([id, l]) => btn('f', id, l, id === flt)).join('') + '<span class="eq-cnt">|</span>' + EV_RANGES.map(([id, l]) => btn('r', id, l, id === rng)).join('');
    };
    const load = async () => {
      const mode = flt === 'all' ? 'all' : 'sp';
      body.innerHTML = msg('LOADING');
      try {
        data[mode] ??= (await getJSON(`/api/data?fn=earnings&days=10${mode === 'all' ? '&all=1' : ''}`)).rows ?? [];
      } catch { return void (body.innerHTML = msg('EARNINGS CALENDAR UNAVAILABLE')); }
      if (!box.isConnected) return;
      const [, , a, b] = EV_RANGES.find((r) => r[0] === rng), days = new Set(weekdays(10).slice(a, b));
      const list = data[mode].filter((r) => days.has(r.d) && (flt === 'all' || flt === 'sp' || r.time === flt));
      if (!list.length) return void (body.innerHTML = msg('NO EARNINGS FOR THIS SELECTION'));
      let last = '';
      const tr = list.map((r) => {
        const head = r.d !== last ? `<tr class="eq-day"><td colspan="4">${esc(new Date(`${r.d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }))}</td></tr>` : '';
        last = r.d;
        return `${head}<tr class="eq-run" data-e="${esc(r.s)}"><td><span class="eq-sym">${esc(r.s)}</span></td><td class="eq-txt">${esc(r.n)}</td><td>${esc(r.time)}</td><td>${esc(r.epsFcst ?? '--')}</td></tr>`;
      }).join('');
      body.innerHTML = `<table><thead><tr><th>Ticker</th><th>Name</th><th>Time</th><th>EPS Est.</th></tr></thead><tbody>${tr}</tbody></table><div class="eq-cnt">Source: Nasdaq earnings calendar (unofficial). BMO before open, AMC after close. Click a row for ERN. "All" shows the 25 largest reporters per day.</div>`;
    };
    bar.addEventListener('click', (e) => {
      const { g, v } = e.target.dataset ?? {};
      if (!g) return;
      if (g === 'f') flt = v; else rng = v;
      draw(); load();
    });
    body.addEventListener('click', (e) => {
      const s = e.target.closest?.('[data-e]')?.dataset.e;
      if (s && /^[A-Z0-9.\-]{1,10}$/.test(s)) runCommand(`ERN ${s}`);
    });
    draw(); load();
  },
});
registerCommand('EVTS', { help: 'EVTS  upcoming earnings: S&P 500, before/after market, this/next week', run: () => openWidget('evts') });
