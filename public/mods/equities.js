// MOST, MAP, EQS and EVTS: equity analytics over the seeded `universe` snapshot and the earnings handler.
import { esc, fmt, cls, sgn, vol, msg, getJSON, canvas, registerCommand, registerWidget, openWidget, runCommand, loadCSS } from '../core.js';
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
const COLS = [['s', 'Ticker'], ['n', 'Name'], ['sec', 'Sector'], ['p', 'Last'], ['pc', '%Chg'], ['v', 'Volume'], ['hi', 'vs 52w H'], ['m1', '1M %'], ['ytd', 'YTD %']];
registerWidget('eqs', {
  title: 'EQS  Equity Screener', hint: 'EQS',
  render(box) {
    let key = 'pc', dir = -1;
    const secs = rows ? [...new Set(rows.map((r) => r.sec))].sort() : [];
    box.innerHTML = `<div class="eq-ctl">
      <label>Sector <select data-f="sec"><option value="">All</option>${secs.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
      <label>Price <input type="number" data-f="pmin" placeholder="min"><input type="number" data-f="pmax" placeholder="max"></label>
      <label>%Chg >= <input type="number" data-f="cmin" step="0.1"></label>
      <label>Vol (M) >= <input type="number" data-f="vmin" step="0.5"></label>
      <label><input type="checkbox" data-f="near"> within 5% of 52w high</label></div>
      <div class="eq-cnt"></div><div class="eq-body"></div>`;
    const body = box.querySelector('.eq-body'), cnt = box.querySelector('.eq-cnt');
    const f = (n) => box.querySelector(`[data-f=${n}]`);
    const num = (n) => (f(n).value === '' ? null : +f(n).value);
    wireSyms(body);
    const val = (r, k) => (k === 'hi' ? hiPct(r) : r[k]);
    const draw = () => {
      if (!rows) { cnt.textContent = ''; return void (body.innerHTML = msg(loaded ? 'NO DATA YET: SEEDER PENDING' : 'LOADING')); }
      const sec = f('sec').value, pmin = num('pmin'), pmax = num('pmax'), cmin = num('cmin'), vmin = num('vmin'), near = f('near').checked;
      const hits = rows.filter((r) => (!sec || r.sec === sec) && (pmin == null || r.p >= pmin) && (pmax == null || r.p <= pmax)
        && (cmin == null || r.pc >= cmin) && (vmin == null || (r.v ?? 0) >= vmin * 1e6) && (!near || hiPct(r) >= -5));
      hits.sort((a, b) => { const x = val(a, key) ?? -Infinity, y = val(b, key) ?? -Infinity; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
      cnt.textContent = `${hits.length} of ${rows.length} match${hits.length > 50 ? ', showing 50' : ''}`;
      body.innerHTML = `<table><thead><tr>${COLS.map(([k, l]) => `<th class="eq-sort${k === key ? ' on' : ''}" data-k="${k}">${l}${k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${hits.slice(0, 50).map((r) =>
        `<tr><td>${sym(r.s)}</td><td class="eq-txt">${esc(r.n)}</td><td class="eq-txt">${esc(r.sec)}</td><td>${fmt(r.p)}</td><td class="${cls(r.pc)}">${sgn(r.pc)}%</td><td>${vol(r.v)}</td><td class="${cls(hiPct(r))}">${sgn(hiPct(r), 1)}%</td><td class="${cls(r.m1)}">${sgn(r.m1, 1)}</td><td class="${cls(r.ytd)}">${sgn(r.ytd, 1)}</td></tr>`).join('') || '<tr><td colspan="9" class="eq-txt">NO MATCHES</td></tr>'}</tbody></table>`;
    };
    box.querySelector('.eq-ctl').addEventListener('input', draw);
    body.addEventListener('click', (e) => {
      const k = e.target.closest?.('[data-k]')?.dataset.k;
      if (k) { dir = k === key ? -dir : (k === 's' || k === 'n' || k === 'sec' ? 1 : -1); key = k; draw(); }
    });
    // snapshot refresh keeps filter inputs; only the sector list may arrive late
    attach(box, () => {
      if (f('sec').options.length === 1) rows && [...new Set(rows.map((r) => r.sec))].sort().forEach((s) => f('sec').insertAdjacentHTML('beforeend', `<option>${esc(s)}</option>`));
      draw();
    });
  },
});
registerCommand('EQS', { help: 'EQS  equity screener (sector, price, %chg, volume, 52w high)', run: () => openWidget('eqs') });

// ---- EVTS ----
registerWidget('evts', {
  title: 'EVTS  Earnings Calendar', hint: 'EVTS',
  async render(box) {
    box.innerHTML = msg('LOADING');
    try {
      const d = await getJSON('/api/data?fn=earnings');
      if (!d.rows?.length) return void (box.innerHTML = msg('NO UNIVERSE EARNINGS IN THE NEXT 7 WEEKDAYS'));
      let last = '';
      const tr = d.rows.map((r) => {
        const head = r.d !== last ? `<tr class="eq-day"><td colspan="4">${esc(new Date(`${r.d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }))}</td></tr>` : '';
        last = r.d;
        return `${head}<tr><td>${sym(r.s)}</td><td class="eq-txt">${esc(r.n)}</td><td>${esc(r.time)}</td><td>${esc(r.epsFcst ?? '--')}</td></tr>`;
      }).join('');
      box.innerHTML = `<table><thead><tr><th>Ticker</th><th>Name</th><th>Time</th><th>EPS Est.</th></tr></thead><tbody>${tr}</tbody></table><div class="eq-cnt">Source: Nasdaq earnings calendar (unofficial). BMO before open, AMC after close.</div>`;
      wireSyms(box);
    } catch { box.innerHTML = msg('EARNINGS CALENDAR UNAVAILABLE'); }
  },
});
registerCommand('EVTS', { help: 'EVTS  upcoming earnings for US large caps', run: () => openWidget('evts') });
