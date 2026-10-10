// Page layouts. Each panel is [widget id, col, col span, row, row span, ...widget args] on a 12-column grid.
// The 2nd panel of every page is the workspace that commands (GP, FA, ...) draw into.
import { $, widgets, mountWidget, msg } from './core.js';
import { renderWall } from './mods/wall.js';

export const PAGES = [
  { name: 'Home', rows: 6, panels: [['mon', 1, 3, 1, 3], ['gp', 4, 6, 1, 3, 'AAPL'], ['top', 10, 3, 1, 2], ['wei', 1, 3, 4, 3],
    ['fxc', 4, 3, 4, 3], ['curve', 7, 3, 4, 3], ['eco', 10, 3, 3, 2], ['cmdty', 10, 3, 5, 2]] },
  { name: 'Markets', rows: 6, panels: [['wei', 1, 4, 1, 3], ['sectors', 5, 4, 1, 3], ['map', 9, 4, 1, 3],
    ['futures', 1, 4, 4, 3], ['crypto', 5, 4, 4, 3], ['vix', 9, 4, 4, 3]] },
  { name: 'Equities', rows: 6, panels: [['mon', 1, 3, 1, 3], ['gp', 4, 6, 1, 3, 'AAPL'], ['most', 10, 3, 1, 3],
    ['map', 1, 4, 4, 3], ['evts', 5, 4, 4, 3], ['eqs', 9, 4, 4, 3]] },
  { name: 'Fixed Income', rows: 6, panels: [['curve', 1, 4, 1, 3], ['curvehist', 5, 5, 1, 3], ['cbrates', 10, 3, 1, 3],
    ['credit', 1, 4, 4, 3], ['yas', 5, 4, 4, 3], ['fred', 9, 4, 4, 3, 'DGS10']] },
  { name: 'FX', rows: 6, panels: [['fxc', 1, 4, 1, 3], ['fxm', 5, 8, 1, 3], ['gp', 1, 6, 4, 3, 'EURUSD=X'],
    ['cbrates', 7, 3, 4, 3], ['eco', 10, 3, 4, 3]] },
  { name: 'Commodities', rows: 6, panels: [['cmdty', 1, 4, 1, 3], ['cmdty2', 5, 8, 1, 3], ['gp', 1, 6, 4, 3, 'CL=F'],
    ['top', 7, 3, 4, 3], ['eco', 10, 3, 4, 3]] },
  { name: 'Macro', rows: 6, panels: [['weco', 1, 4, 1, 3], ['fred', 5, 4, 1, 3, 'CPIAUCSL'], ['cbrates', 9, 4, 1, 3],
    ['eco', 1, 4, 4, 3], ['fred', 5, 4, 4, 3, 'UNRATE'], ['curve', 9, 4, 4, 3]] },
  { name: 'News', rows: 6, panels: [['top', 1, 5, 1, 6], ['nws', 6, 4, 1, 3, 'AAPL'], ['fil', 10, 3, 1, 3, 'AAPL'],
    ['insider', 6, 4, 4, 3, 'AAPL'], ['eco', 10, 3, 4, 3]] },
  { name: 'Portfolio', rows: 6, panels: [['port', 1, 6, 1, 3], ['alrt', 7, 6, 1, 3], ['wl', 1, 4, 4, 3],
    ['halal', 5, 4, 4, 3], ['india', 9, 4, 4, 3]] },
  { name: 'Wall', rows: 1, wall: true, panels: [] },
];

export const slug = (n) => n.toLowerCase().replace(/\s+/g, '-');
export function findPage(q) {
  const s = slug(String(q ?? '').trim().replace(/^#/, ''));
  return s ? PAGES.find((p) => slug(p.name) === s) ?? PAGES.find((p) => slug(p.name).startsWith(s)) : undefined;
}
export const pageFromHash = () => findPage(location.hash.slice(1)) ?? PAGES[0];

let cur = null;
export const currentPage = () => cur;

const fail = (box, id) => { box.innerHTML = msg(`ERROR: ${id}`); };

function mount(el, id, args) {
  const w = widgets.get(id), box = el.querySelector('.pb');
  let title = id.toUpperCase();
  if (w) { try { title = typeof w.title === 'function' ? w.title(args) : w.title ?? title; } catch { /* keep id */ } }
  el.querySelector('h2').textContent = title;
  el.querySelector('.ph span').textContent = w?.hint ?? '';
  if (!w) { box.innerHTML = msg(`NOT INSTALLED: ${id}`); return; }
  try { Promise.resolve(mountWidget(box, id, args)).catch(() => fail(box, id)); } catch { fail(box, id); }
}

// Swap the grid to a page. force re-renders the current page (CLEAR).
export function showPage(q, force = false) {
  const p = findPage(q) ?? PAGES[0];
  if (p.name === cur && !force) return p;
  const first = cur === null;
  cur = p.name;
  if (location.hash.slice(1) !== slug(p.name)) {
    if (first) history.replaceState(null, '', '#' + slug(p.name)); else location.hash = slug(p.name);
  }
  const grid = $('grid');
  grid.style.gridTemplateRows = `repeat(${p.rows}, minmax(0, 1fr))`;
  if (p.wall) { renderWall(grid); [...$('tabs').children].forEach((b) => b.classList.toggle('on', b.dataset.p === slug(p.name))); document.dispatchEvent(new Event('pagechange')); return p; }
  grid.innerHTML = p.panels.map(([, c, cs, r, rs], i) =>
    `<section class="panel" style="grid-column:${c}/span ${cs};grid-row:${r}/span ${rs}"><div class="ph"><b>${i + 1}</b><h2></h2><span></span></div><div class="pb"></div></section>`).join('');
  p.panels.forEach(([id, , , , , ...args], i) => mount(grid.children[i], id, args));
  [...$('tabs').children].forEach((b) => b.classList.toggle('on', b.dataset.p === slug(p.name)));
  document.dispatchEvent(new Event('pagechange'));
  return p;
}
