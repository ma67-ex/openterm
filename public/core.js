// Shared helpers, command registry and snapshot hooks. Feature modules in mods/ import from here.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n, d = 2) => (n == null ? '--' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'dn' : '');
export const sgn = (n, d = 2) => (n == null ? '--' : (n > 0 ? '+' : '') + fmt(n, d));
export const vol = (v) => (v == null ? '--' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v);
export const hhmm = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
export const msg = (t) => `<div class="chart-wrap"><div class="empty">${esc(t)}</div></div>`;

export async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return r.json();
}

export const status = (text, bad = false) => { $('sbdata').textContent = text; $('sbdata').classList.toggle('dn', bad); };

// The big center panel (panel 2): commands render their view here.
export function workspace(title, html) {
  const p = document.querySelector('.panel:nth-child(2)');
  p.querySelector('h2').textContent = title;
  const box = p.querySelector('.pb');
  if (html != null) box.innerHTML = html;
  return box;
}

// Any panel by number (1-8 on the Home page).
export function panelBody(n, title) {
  const p = document.querySelector(`.panel:nth-child(${n})`);
  if (title) p.querySelector('h2').textContent = title;
  return p.querySelector('.pb');
}

// Canvas sized to its box, ready to draw (device-pixel-ratio aware).
export function canvas(box) {
  box.innerHTML = '<canvas style="width:100%;height:100%"></canvas>';
  const c = box.querySelector('canvas'), r = c.getBoundingClientRect(), k = devicePixelRatio || 1;
  c.width = r.width * k; c.height = r.height * k;
  const g = c.getContext('2d'); g.scale(k, k);
  return { c, g, W: r.width, H: r.height };
}

// ---- commands: registerCommand('FA', { help: 'AAPL FA  financials', run(args) {...} }) ----
// `args` are the remaining upper-cased tokens. `AAPL FA` and `FA AAPL` both call run(['AAPL']).
export const commands = new Map();
export const registerCommand = (name, def) => commands.set(name.toUpperCase(), def);

export function runCommand(line) {
  const t = line.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!t.length) return;
  let name, args;
  if (commands.has(t[0])) [name, args] = [t[0], t.slice(1)];
  else if (t[1] && commands.has(t[1])) [name, args] = [t[1], [t[0], ...t.slice(2)]];
  else if (commands.has('GP')) [name, args] = ['GP', t]; // bare ticker draws a chart
  else return status(`Unknown command: ${t[0]}`, true);
  Promise.resolve(commands.get(name).run(args)).catch((e) => status(`${name}: ${e.message}`, true));
}

// ---- snapshots: modules ask for extra /api/snap keys and get called after every refresh ----
export const snapKeys = new Set();
const snapHandlers = [];
export function useSnap(keys, handler) { keys.forEach((k) => snapKeys.add(k)); snapHandlers.push(handler); }
export const dispatchSnap = (data) => snapHandlers.forEach((h) => { try { h(data); } catch (e) { console.error(e); } });

// ---- widgets: reusable views that can render in any panel box (pages and commands both use them) ----
// registerWidget('curve', { title: 'GC  Yield Curve', hint: 'GC', render(box, args) {...} })
export const widgets = new Map();
export const registerWidget = (id, def) => widgets.set(id, def);
export function mountWidget(box, id, args = []) {
  const w = widgets.get(id);
  if (!w) { box.innerHTML = msg(`NO WIDGET ${id}`); return; }
  return w.render(box, args);
}
// Open a widget in the center workspace (what most commands do).
export function openWidget(id, args = []) {
  const w = widgets.get(id);
  const box = workspace(typeof w?.title === 'function' ? w.title(args) : w?.title ?? id, '');
  return mountWidget(box, id, args);
}

// Load a module's stylesheet once: loadCSS(new URL('./screener.css', import.meta.url)).
const loaded = new Set();
export function loadCSS(url) {
  const href = String(url);
  if (loaded.has(href)) return;
  loaded.add(href);
  document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${href}">`);
}
