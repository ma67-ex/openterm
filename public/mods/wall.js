// WALL: a tiling page. The screen is split in two again and again (binary space partition); every pane shows any widget.
import { $, esc, widgets, mountWidget, registerCommand, status, loadCSS } from '../core.js';
loadCSS(new URL('./wall.css', import.meta.url));

const KEY = 'openterm.wall.v1';
const leaf = (w, a = []) => ({ t: 'leaf', w, a });
// d 'v' = vertical divider (a left, b right); d 'h' = horizontal divider (a top, b bottom); r = share of the first side
const split = (d, r, a, b) => ({ t: 'split', d, r, a, b });

export const PRESETS = {
  DEFAULT: () => split('v', 0.26, leaf('mon'), split('h', 0.6, split('v', 0.64, leaf('gp', ['AAPL']), leaf('top')), split('v', 0.5, leaf('wei'), leaf('eco')))),
  TRADER: () => split('v', 0.5, split('h', 0.55, leaf('gp', ['AAPL']), leaf('opt', ['AAPL'])), split('h', 0.5, split('v', 0.5, leaf('mon'), leaf('most')), leaf('nws', ['AAPL']))),
  MACRO: () => split('h', 0.5, split('v', 0.5, leaf('fred', ['CPIAUCSL']), leaf('fred', ['UNRATE'])), split('v', 0.34, leaf('curve'), split('v', 0.5, leaf('cbrates'), leaf('eco')))),
  MARKETS: () => split('h', 0.5, split('v', 0.34, leaf('wei'), split('v', 0.5, leaf('sectors'), leaf('crypto'))), split('v', 0.34, leaf('futures'), split('v', 0.5, leaf('fxc'), leaf('vix')))),
};

let mem = null;
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || mem || { saved: {}, tree: null }; } catch { return mem || { saved: {}, tree: null }; }
};
const write = (s) => { mem = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: keep in memory */ } };

let state = read();
if (!state.tree) state.tree = PRESETS.DEFAULT();
let root = null, active = null;
const persist = () => write(state);

const labelOf = (id) => { const w = widgets.get(id); const t = typeof w?.title === 'string' ? w.title.replace(/\s+/g, ' ') : ''; return `${id}${t ? '  ' + t : ''}`; };

// replace `target` inside `tree` with `repl`; returns the new tree
function replace(tree, target, repl) {
  if (tree === target) return repl;
  if (tree.t === 'split') return { ...tree, a: replace(tree.a, target, repl), b: replace(tree.b, target, repl) };
  return tree;
}
// remove a leaf: its parent split is replaced by the sibling
function remove(tree, target) {
  if (tree.t !== 'split') return tree;
  if (tree.a === target) return tree.b;
  if (tree.b === target) return tree.a;
  return { ...tree, a: remove(tree.a, target), b: remove(tree.b, target) };
}
const countLeaves = (n) => (n.t === 'leaf' ? 1 : countLeaves(n.a) + countLeaves(n.b));
const mutate = (fn) => { state.tree = fn(state.tree); persist(); if (root) render(root); };

function mountLeaf(el, node) {
  const box = el.querySelector('.pb');
  try { Promise.resolve(mountWidget(box, node.w, node.a)).catch(() => { box.textContent = `ERROR: ${node.w}`; }); } catch { box.textContent = `ERROR: ${node.w}`; }
}

function buildLeaf(node) {
  const el = document.createElement('section');
  el.className = 'panel wall-leaf';
  const ids = [...widgets.keys()].sort();
  el.innerHTML = `<div class="ph"><select title="widget">${ids.map((id) => `<option value="${esc(id)}"${id === node.w ? ' selected' : ''}>${esc(labelOf(id))}</option>`).join('')}</select>` +
    `<input title="argument, e.g. a ticker" value="${esc((node.a || []).join(' '))}" placeholder="arg"><h2 class="wall-title"></h2><span class="sp"></span>` +
    `<button data-act="v" title="split side by side">&#9707;</button><button data-act="h" title="split top and bottom">&#9636;</button><button data-act="x" title="close pane">&#10005;</button></div><div class="pb"></div>`;
  el.__remount = () => mountLeaf(el, node);
  el.addEventListener('pointerdown', () => setActive(el));
  el.querySelector('select').addEventListener('change', (e) => { node.w = e.target.value; persist(); mountLeaf(el, node); });
  el.querySelector('input').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { node.a = e.target.value.trim().toUpperCase().split(/\s+/).filter(Boolean); persist(); mountLeaf(el, node); }
  });
  el.querySelector('.ph').addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (act === 'x') { if (countLeaves(state.tree) > 1) mutate((t) => remove(t, node)); else status('Last pane cannot be closed'); return; }
    mutate((t) => replace(t, node, split(act, 0.5, node, leaf(node.w === 'gp' ? 'top' : 'gp', node.w === 'gp' ? [] : ['AAPL']))));
  });
  mountLeaf(el, node);
  return el;
}

function build(node) {
  if (node.t === 'leaf') return buildLeaf(node);
  const el = document.createElement('div');
  el.className = `wall-split ${node.d}`;
  const a = build(node.a), b = build(node.b), div = document.createElement('div');
  div.className = 'wall-div';
  const tracks = () => `${node.r}fr 3px ${1 - node.r}fr`;
  const apply = () => { el.style[node.d === 'v' ? 'gridTemplateColumns' : 'gridTemplateRows'] = tracks(); };
  apply();
  el.append(a, div, b);
  div.addEventListener('pointerdown', (e) => {
    e.preventDefault(); div.setPointerCapture(e.pointerId); div.classList.add('drag');
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      const x = node.d === 'v' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
      node.r = Math.min(0.9, Math.max(0.1, +x.toFixed(3)));
      apply();
    };
    const up = () => {
      div.classList.remove('drag'); div.removeEventListener('pointermove', move); div.removeEventListener('pointerup', up);
      persist(); el.querySelectorAll('.wall-leaf').forEach((l) => l.__remount?.()); // canvases redraw at the new size
    };
    div.addEventListener('pointermove', move); div.addEventListener('pointerup', up);
  });
  return el;
}

function setActive(el) {
  root?.querySelectorAll('.wall-leaf').forEach((l) => l.toggleAttribute('data-ws', l === el));
  active = el;
}

export function render(host) {
  root = host;
  host.innerHTML = '';
  const wall = document.createElement('div');
  wall.className = 'wall';
  wall.append(build(state.tree));
  host.append(wall);
  setActive(host.querySelector('.wall-leaf'));
}

// called by pages.js when the Wall tab is shown
export function renderWall(grid) {
  const host = document.createElement('div');
  host.style.cssText = 'grid-column:1/-1;grid-row:1/-1;display:flex;min-width:0;min-height:0';
  grid.innerHTML = '';
  grid.append(host);
  render(host);
}

let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => root?.isConnected && root.querySelectorAll('.wall-leaf').forEach((l) => l.__remount?.()), 300); });

function cmd([sub, ...rest]) {
  const name = rest.join(' ').trim();
  switch (sub) {
    case undefined: case 'OPEN': return import('../pages.js').then((m) => m.showPage('wall'));
    case 'SAVE': if (!name) return status('WALL SAVE <name>', true); state.saved[name] = JSON.parse(JSON.stringify(state.tree)); persist(); return status(`Wall layout saved: ${name}`);
    case 'LOAD': case 'PRESET': {
      const t = state.saved[name] ?? (PRESETS[name] && PRESETS[name]());
      if (!t) return status(`No layout "${name}". WALL LIST`, true);
      state.tree = JSON.parse(JSON.stringify(t)); persist();
      return import('../pages.js').then((m) => { m.showPage('wall', true); status(`Wall layout loaded: ${name}`); });
    }
    case 'DEL': if (!state.saved[name]) return status(`No saved layout "${name}"`, true); delete state.saved[name]; persist(); return status(`Deleted: ${name}`);
    case 'RESET': return cmd(['LOAD', 'DEFAULT']);
    case 'LIST': return status(`Presets: ${Object.keys(PRESETS).join(', ')}  |  Saved: ${Object.keys(state.saved).join(', ') || 'none'}`);
    default: return status('WALL | WALL SAVE <name> | WALL LOAD <name> | WALL LIST | WALL DEL <name> | WALL RESET', true);
  }
}
registerCommand('WALL', { help: 'WALL  tiling layout (WALL SAVE|LOAD|LIST|DEL|RESET <name>)', run: cmd });
