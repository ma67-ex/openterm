// Shell: tabs, function keys, command bar and the shared snapshot refresh loop. Panels live in pages.js and mods/shell.js.
import { $, esc, fmt, cls, sgn, status, runCommand, snapKeys, dispatchSnap, commands } from './core.js';
import './mods/shell.js';
import './mods/index.js';
import { PAGES, showPage, currentPage, pageFromHash, slug } from './pages.js';

const go = (name, hint) => () => { showPage(name); if (hint) status(hint); };
const cycle = () => showPage(PAGES[(PAGES.findIndex((p) => p.name === currentPage()) + 1) % PAGES.length].name);
const FKEYS = [
  ['HELP', () => runCommand('HELP')], ['PANEL', cycle], ['MONITOR', go('Home')], ['NEWS', go('News')],
  ['EQUITY', go('Equities')], ['CORP', go('Equities', 'CORP: type TICKER FA for financials, TICKER DES for description')],
  ['GOVT', go('Fixed Income')], ['CMDTY', go('Commodities')], ['CURNCY', go('FX')], ['MTGE', go('Macro')],
  ['INDX', go('Markets')], ['MENU', go('Portfolio')],
];
$('fkeys').innerHTML = FKEYS.map(([k], i) => `<button data-f="${i}" class="${i % 2 ? 'alt' : ''}">F${i + 1} ${k}</button>`).join('');
$('fkeys').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) FKEYS[b.dataset.f][1](); });

$('tabs').innerHTML = PAGES.map((p) => `<button data-p="${slug(p.name)}">${esc(p.name)}</button>`).join('');
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showPage(b.dataset.p); });
addEventListener('hashchange', () => showPage(pageFromHash().name));
showPage(pageFromHash().name);

const tick = () => { const t = new Date().toLocaleTimeString([], { hour12: false }); $('clock').textContent = t; $('sbclock').textContent = t; };
tick(); setInterval(tick, 1000);

// ---- live data: one /api/snap call; widgets get the data through dispatchSnap ----
['indices', 'fx', 'cmdty', 'crypto'].forEach((k) => snapKeys.add(k));
const dec = (r) => (Math.abs(r.p) < 20 ? 4 : 2);
let lastData = null;

function fillTape(data) {
  const rows = ['indices', 'fx', 'cmdty', 'crypto'].flatMap((k) => data[k]?.rows ?? []);
  if (!rows.length) return;
  const t = rows.map((r) => `<span>${esc(r.n.split(' ')[0])} ${fmt(r.p, dec(r))}<i class="${cls(r.c)}">${sgn(r.pc)}%</i></span>`).join('');
  $('tape-track').innerHTML = t + t;
}

async function refresh() {
  try {
    const data = await (await fetch(`/api/snap?keys=${[...snapKeys].join(',')}`)).json();
    lastData = data;
    fillTape(data);
    dispatchSnap(data);
    const times = ['watchlist', 'indices', 'fx', 'cmdty'].map((k) => data[k]?.asOf).filter(Boolean).sort();
    const oldest = times[0];
    const stale = oldest && Date.now() - new Date(oldest) > 36 * 3600e3;
    status(oldest ? `Data as of ${new Date(oldest).toLocaleString()} (free sources, delayed)` : 'No snapshots yet. Run: npm run seed', Boolean(stale));
  } catch { status('Data unavailable', true); }
}
refresh(); setInterval(refresh, 60000);
// Widgets that use useSnap get the latest data again whenever the page changes.
document.addEventListener('pagechange', () => lastData && dispatchSnap(lastData));

// ---- command bar: history, autocomplete (commands + symbol search) ----
const cmd = $('cmd'), ac = $('ac');
const hist = (() => { try { return JSON.parse(localStorage.getItem('ot-hist')) || []; } catch { return []; } })();
let hi = -1, draft = '', items = [], sel = -1, ctl = null, timer = 0;

function draw() {
  ac.hidden = !items.length;
  ac.innerHTML = items.map((it, i) => `<div class="ac-i${i === sel ? ' on' : ''}" data-i="${i}"><b>${esc(it.t)}</b><span>${esc(it.sub)}</span></div>`).join('');
}

// Token being typed, how many whole tokens precede it, and the first of those.
function token() {
  const v = cmd.value, tok = /\S*$/.exec(v)[0], head = v.slice(0, v.length - tok.length).trim();
  return { tok: tok.toUpperCase(), start: v.length - tok.length, idx: head ? head.split(/\s+/).length : 0, first: head.split(/\s+/)[0].toUpperCase() };
}

function suggest() {
  clearTimeout(timer); ctl?.abort(); ctl = null; sel = -1;
  const { tok, idx, first } = token(), firstIsCmd = commands.has(first);
  items = [];
  if (idx === 0 || (idx === 1 && !firstIsCmd)) {
    items = [...commands].filter(([n]) => n.startsWith(tok) && n !== tok && (tok || idx === 1)).slice(0, 8)
      .map(([n, d]) => ({ t: n, sub: d.help ?? '', cmd: true }));
  }
  draw();
  if (!/^[A-Z0-9.&-]+$/.test(tok) || !(idx === 0 || (idx === 1 && firstIsCmd))) return;
  timer = setTimeout(async () => {
    const mine = ctl = new AbortController();
    try {
      const r = await fetch(`/api/data?fn=search&q=${encodeURIComponent(tok)}`, { signal: mine.signal });
      if (!r.ok) return;
      const rows = (await r.json()).rows ?? [];
      if (mine !== ctl || token().tok !== tok) return;
      items = [...items.filter((i) => i.cmd), ...rows.slice(0, 8).map((x) => ({ t: x.s, sub: [x.n, x.x].filter(Boolean).join('  ') }))];
      sel = -1; draw();
    } catch { /* aborted or offline */ }
  }, 250);
}

function pick(i) {
  const it = items[i];
  if (!it) return;
  cmd.value = cmd.value.slice(0, token().start) + it.t + ' ';
  cmd.focus(); suggest();
}

function submit() {
  const v = cmd.value.trim();
  clearTimeout(timer); ctl?.abort();
  cmd.value = ''; items = []; draw(); hi = -1;
  if (!v) return;
  if (hist.at(-1) !== v) { hist.push(v); hist.splice(0, hist.length - 50); try { localStorage.setItem('ot-hist', JSON.stringify(hist)); } catch { /* private mode */ } }
  runCommand(v);
}

// d = -1 older, +1 newer
function historyStep(d) {
  if (!hist.length) return;
  if (hi < 0) { if (d > 0) return; draft = cmd.value; hi = hist.length; }
  hi += d;
  if (hi >= hist.length) { hi = -1; cmd.value = draft; return; }
  hi = Math.max(0, hi);
  cmd.value = hist[hi];
}

cmd.addEventListener('input', () => { hi = -1; suggest(); });
cmd.addEventListener('blur', () => { items = []; draw(); });
cmd.addEventListener('keydown', (e) => {
  const open = !ac.hidden;
  if (e.key === 'Enter') { e.preventDefault(); if (open && sel >= 0) pick(sel); else submit(); }
  else if (e.key === 'Tab' && open) { e.preventDefault(); pick(sel >= 0 ? sel : 0); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const d = e.key === 'ArrowDown' ? 1 : -1;
    if (open) { sel = sel < 0 ? (d > 0 ? 0 : items.length - 1) : (sel + d + items.length) % items.length; draw(); }
    else historyStep(d);
  } else if (e.key === 'Escape') cmd.blur();
});
ac.addEventListener('mousedown', (e) => { e.preventDefault(); const r = e.target.closest('.ac-i'); if (r) pick(+r.dataset.i); });
$('go').addEventListener('click', submit);

// ---- keyboard: F1-F12 act as the bar buttons, / focuses the command bar ----
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const m = /^F(\d+)$/.exec(e.key);
  if (m && FKEYS[m[1] - 1]) { e.preventDefault(); FKEYS[m[1] - 1][1](); return; }
  if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) { e.preventDefault(); cmd.focus(); cmd.select(); }
});
