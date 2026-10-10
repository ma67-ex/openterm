// Shell: home-panel widgets (mon, wei, fxc, curve, eco, cmdty, top), HELP overlay, PAGE and CLEAR commands.
import { esc, fmt, cls, sgn, vol, hhmm, msg, canvas, registerWidget, registerCommand, commands, useSnap, loadCSS, status } from '../core.js';
import { PAGES, findPage, showPage, currentPage } from '../pages.js';

loadCSS(new URL('./shell.css', import.meta.url));

// Mounted widgets re-run after each snapshot while their marker element is still in the box.
let last = null;
const live = new Set();
function follow(box, sel, update) {
  const run = () => {
    const el = box.isConnected && box.querySelector(sel);
    if (!el) return live.delete(run);
    update(el, last ?? {});
  };
  live.add(run); run();
}
useSnap(['watchlist', 'indices', 'fx', 'cmdty', 'curve', 'calendar', 'news'], (d) => { last = d; live.forEach((f) => f()); });
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => live.forEach((f) => f()), 150); });

// Snapshot-backed table; hot = column indexes colored by the row's change.
const tableWidget = (key, heads, cell, hot) => (box) => {
  box.innerHTML = `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody data-k></tbody></table>`;
  follow(box, 'tbody[data-k]', (tb, d) => {
    const rows = d[key]?.rows;
    tb.innerHTML = rows?.length
      ? rows.map((r) => '<tr>' + cell(r).map((c, i) => `<td class="${hot.includes(i) ? cls(r.c) : i === 1 ? 'px' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('')
      : `<tr><td colspan="${heads.length}">NO DATA</td></tr>`;
  });
};

registerWidget('mon', { title: 'MONITOR  Watchlist', hint: 'MON', render: tableWidget('watchlist', ['Ticker', 'Last', 'Chg', '%Chg', 'Vol'],
  (r) => [r.s, fmt(r.p), sgn(r.c), sgn(r.pc) + '%', vol(r.v)], [2, 3]) });
registerWidget('wei', { title: 'WEI  World Equity Indices', hint: 'WEI', render: tableWidget('indices', ['Index', 'Last', 'Chg', '%Chg'],
  (r) => [r.n, fmt(r.p), sgn(r.c), sgn(r.pc) + '%'], [2, 3]) });
registerWidget('fxc', { title: 'FXC  Currencies', hint: 'FXC', render: tableWidget('fx', ['Pair', 'Last', '%Chg'],
  (r) => [r.n, fmt(r.p, 4), sgn(r.pc) + '%'], [2]) });
registerWidget('cmdty', { title: 'CMDTY  Commodities', hint: 'CMDTY', render: tableWidget('cmdty', ['Name', 'Last', 'Chg', '%Chg'],
  (r) => [r.n, fmt(r.p), sgn(r.c), sgn(r.pc) + '%'], [2, 3]) });

registerWidget('eco', { title: 'ECO  Economic Calendar', hint: 'ECO', render(box) {
  box.innerHTML = '<table><thead><tr><th>Date</th><th>Release</th></tr></thead><tbody data-k></tbody></table>';
  follow(box, 'tbody[data-k]', (tb, d) => {
    const rows = d.calendar?.rows;
    tb.innerHTML = rows?.length
      ? rows.map((r) => `<tr><td>${esc(String(r.d).slice(5))}</td><td class="eco-e" title="${esc(r.e)}">${esc(r.e)}</td></tr>`).join('')
      : '<tr><td colspan="2">NO DATA</td></tr>';
  });
} });

registerWidget('top', { title: 'TOP  Top News', hint: 'TOP', render(box) {
  box.innerHTML = '<div data-k></div>';
  follow(box, '[data-k]', (el, d) => {
    const rows = (d.news?.rows ?? []).filter((r) => /^https?:\/\//i.test(r.u));
    el.innerHTML = rows.length ? rows.map((r) =>
      `<div class="news-line"><i>${hhmm(r.ts)}</i><b>${esc(r.s)}</b><a href="${esc(r.u)}" target="_blank" rel="noopener noreferrer">${esc(r.t)}</a></div>`).join('') : msg('NO DATA');
  });
} });

function drawCurve(el, rows) {
  const { g, W, H } = canvas(el);
  const padL = 30, padR = 16, padB = 16, padT = 10;
  const ys = rows.flatMap((p) => [p.y, p.prev]).filter((v) => v != null);
  const lo = Math.min(...ys) - 0.1, hi = Math.max(...ys) + 0.1;
  const X = (i) => padL + (i / (rows.length - 1)) * (W - padL - padR), Y = (v) => H - padB - ((v - lo) / (hi - lo)) * (H - padB - padT);
  g.font = '10px monospace'; g.fillStyle = '#777'; g.strokeStyle = '#222'; g.lineWidth = 1;
  g.textAlign = 'left';
  for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3, y = Y(v); g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke(); g.fillText(v.toFixed(2), 0, y + 3); }
  g.textAlign = 'center';
  rows.forEach((p, i) => g.fillText(p.m, X(i), H - 3));
  const line = (key, color) => { g.strokeStyle = color; g.lineWidth = 1.5; g.beginPath(); rows.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[key])) : g.moveTo(X(i), Y(p[key])))); g.stroke(); };
  if (rows.every((p) => p.prev != null)) line('prev', '#555');
  line('y', '#ffb000');
}

registerWidget('curve', { title: 'GC  Yield Curve', hint: 'GC', render(box) {
  box.innerHTML = '<div data-k style="height:100%"></div>';
  follow(box, '[data-k]', (el, d) => {
    const rows = d.curve?.rows, h = el.closest('.panel')?.querySelector('h2');
    if (!rows || rows.length < 2) { el.innerHTML = msg('NO DATA'); return; }
    drawCurve(el, rows);
    if (h) h.textContent = `GC  Yield Curve  ${rows[0].date ?? ''}`;
  });
} });

// ---- HELP overlay: every registered command, grouped by first letter ----
let ov = null;
function closeHelp() { ov?.remove(); ov = null; }
function openHelp() {
  if (ov) return closeHelp();
  const groups = new Map();
  [...commands.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([n, d]) => {
    if (!groups.has(n[0])) groups.set(n[0], []);
    groups.get(n[0]).push(`<div class="ov-r"><b>${esc(n)}</b><span>${esc(d.help ?? '')}</span></div>`);
  });
  const body = [...groups].map(([l, rows]) => `<div class="ov-g">${esc(l)}</div>${rows.join('')}`).join('');
  ov = document.createElement('div');
  ov.id = 'ov';
  ov.innerHTML = `<div class="ov-box"><div class="ov-h"><b>COMMANDS</b><span>Esc or click to close</span></div><div class="ov-b">${body}</div>
    <div class="ov-f">Pages: ${PAGES.map((p) => esc(p.name)).join(', ')}  |  PAGE name  |  F1-F12 shortcuts  |  / focus command bar</div></div>`;
  ov.addEventListener('click', closeHelp);
  document.body.appendChild(ov);
}
document.addEventListener('keydown', (e) => { if (ov && e.key === 'Escape') { e.preventDefault(); closeHelp(); } }, true);

registerCommand('HELP', { help: 'HELP  list all commands', run: openHelp });
registerCommand('PAGE', { help: 'PAGE name  switch page (Home, Markets, FX, ...)', run(args) {
  if (!args.length) return status(`Pages: ${PAGES.map((p) => p.name).join(', ')}`);
  const p = findPage(args.join(' '));
  if (p) showPage(p.name); else status(`Unknown page: ${args.join(' ')}`, true);
} });
registerCommand('CLEAR', { help: 'CLEAR  reset the current page layout', run() { showPage(currentPage(), true); status('Layout reset'); } });
