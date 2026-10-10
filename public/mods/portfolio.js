// Personal tools kept in the browser (localStorage): WL watchlists, PORT portfolio, ALRT price alerts, NOTE ticker notes.
import { esc, fmt, cls, sgn, vol, hhmm, getJSON, status, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';

if (typeof document !== 'undefined') loadCSS(new URL('./portfolio.css', import.meta.url));

// ---- storage: localStorage with in-memory fallback ----
const mem = {};
const store = {
  get(k, d) {
    try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch {}
    return k in mem ? structuredClone(mem[k]) : d;
  },
  set(k, v) {
    mem[k] = structuredClone(v);
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

// ---- pure helpers ----
export const SYM = /^[A-Z0-9.^=\-]{1,15}$/;
export const num = (x) => {
  const t = String(x ?? '').replace(/[$,]/g, '').trim();
  return t === '' ? NaN : Number(t);
};
const sum = (a, f) => a.reduce((t, x) => t + (f(x) ?? 0), 0);
const fx = (n) => (n == null ? '--' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

// positions [{s, sh, cost, note}] + quote map {SYM: {p, c}} -> rows with value, P&L, weight, plus totals
export function calc(positions, qs) {
  const rows = positions.map((p) => {
    const q = qs[p.s], last = q?.p ?? null, costTot = p.sh * p.cost;
    const mv = last == null ? null : p.sh * last;
    const day = q?.c == null ? null : p.sh * q.c;
    const pl = mv == null ? null : mv - costTot;
    return { ...p, last, costTot, mv, day, pl, plPct: pl == null || !costTot ? null : (pl / Math.abs(costTot)) * 100, w: null };
  });
  const tmv = sum(rows, (r) => r.mv);
  rows.forEach((r) => { r.w = r.mv == null || !tmv ? null : (r.mv / tmv) * 100; });
  const priced = rows.filter((r) => r.mv != null);
  const costPriced = sum(priced, (r) => r.costTot), pl = sum(rows, (r) => r.pl);
  return { rows, tot: { mv: tmv, day: sum(rows, (r) => r.day), pl, cost: sum(rows, (r) => r.costTot), plPct: costPriced ? (pl / Math.abs(costPriced)) * 100 : null } };
}

// add shares to a position, averaging cost; zero shares removes it
export function addPos(list, s, sh, cost, note = '') {
  const i = list.findIndex((p) => p.s === s);
  if (i < 0) { list.push({ s, sh, cost, note }); return list; }
  const p = list[i], t = p.sh + sh;
  if (t === 0) { list.splice(i, 1); return list; }
  p.cost = (p.sh * p.cost + sh * cost) / t;
  p.sh = t;
  if (note) p.note = note;
  return list;
}

// CSV lines SYMBOL,SHARES,COST[,note]; header line and blanks skipped
export function parseCSV(text) {
  const rows = [], errs = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    line = line.trim();
    if (!line) return;
    const [s0, sh0, c0, ...n] = line.split(',');
    const s = String(s0).replace(/["']/g, '').trim().toUpperCase();
    if (!rows.length && !errs.length && s === 'SYMBOL') return;
    const sh = num(sh0), cost = num(c0);
    if (!SYM.test(s) || !Number.isFinite(sh) || sh === 0 || !Number.isFinite(cost) || cost < 0) { errs.push(`line ${i + 1}`); return; }
    rows.push({ s, sh, cost, note: n.join(',').trim().slice(0, 80) });
  });
  return { rows, errs };
}

export const toCSV = (list) => ['SYMBOL,SHARES,COST', ...list.map((p) => `${p.s},${p.sh},${p.cost}${p.note ? ',' + p.note.replace(/[\r\n]/g, ' ') : ''}`)].join('\n');

// `AAPL ABOVE 250` -> alert fields, or null
export function parseAlert(a) {
  const [s, dir, px] = a, n = num(px);
  if (!SYM.test(s || '') || !['ABOVE', 'BELOW'].includes(dir) || !Number.isFinite(n) || n <= 0) return null;
  return { s, dir, px: n };
}
export const hit = (a, price) => price != null && (a.dir === 'ABOVE' ? price >= a.px : price <= a.px);

const COLORS = ['#ff9f1a', '#3aa0ff', '#2ecc71', '#e056fd', '#f9ca24', '#22d1ee', '#ff6b6b', '#a29bfe', '#badc58', '#95afc0'];
// donut slices as % of total absolute value, with stroke-dashoffset starting at 12 o'clock
export function slices(rows) {
  const used = rows.filter((r) => r.mv);
  const t = sum(used, (r) => Math.abs(r.mv));
  let acc = 0;
  return t ? used.map((r, i) => { const f = (Math.abs(r.mv) / t) * 100, o = { s: r.s, f, off: 25 - acc, color: COLORS[i % COLORS.length] }; acc += f; return o; }) : [];
}

// ---- shared bits ----
const flash = (t) => { try { status(t); } catch {} };

async function quotes(syms) {
  const u = [...new Set(syms)], out = {};
  for (let i = 0; i < u.length; i += 40) {
    const d = await getJSON(`/api/data?fn=quotes&s=${u.slice(i, i + 40).map(encodeURIComponent).join(',')}`);
    for (const r of d.rows || []) out[r.s] = r;
  }
  return out;
}

// named sets: { active, sets: { name: [...] } }
function loadSets(key) {
  const s = store.get(key, null);
  const ok = s && typeof s.sets === 'object' && s.sets && !Array.isArray(s.sets);
  const st = ok ? s : { active: 'Main', sets: {} };
  if (!Object.keys(st.sets).length) st.sets = { Main: [] };
  if (!Array.isArray(st.sets[st.active])) st.active = Object.keys(st.sets)[0];
  return st;
}

const barHTML = (st) => `<div class="portfolio-bar"><select data-a="list">${Object.keys(st.sets).map((n) => `<option${n === st.active ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
  <button data-a="new">NEW</button><button data-a="ren">RENAME</button><button data-a="del">DELETE</button></div>`;

// handles list select / new / rename / delete; returns true when state changed
function setAction(st, a, val) {
  const names = Object.keys(st.sets);
  if (a === 'list') {
    if (!Object.hasOwn(st.sets, val)) return false;
    st.active = val;
  } else if (a === 'new' || a === 'ren') {
    const n = (prompt(a === 'new' ? 'New list name' : 'Rename list to', a === 'ren' ? st.active : '') || '').trim().slice(0, 30);
    if (!n || n === '__proto__' || Object.hasOwn(st.sets, n)) return false;
    if (a === 'new') st.sets[n] = [];
    else st.sets = Object.fromEntries(names.map((k) => [k === st.active ? n : k, st.sets[k]]));
    st.active = n;
  } else if (a === 'del') {
    if (!confirm(`Delete list ${st.active}?`)) return false;
    if (names.length < 2) st.sets[st.active] = [];
    else { delete st.sets[st.active]; st.active = Object.keys(st.sets)[0]; }
  } else return false;
  return true;
}

// refresh while the widget root is still in the document
function autoRefresh(root, fn) {
  const t = setInterval(() => { if (!root.isConnected) clearInterval(t); else fn(); }, 60000);
}

const empty = (t) => `<div class="portfolio-empty">${esc(t)}</div>`;

// ---- WL: watchlists ----
const WL_KEY = 'ot.wl';

function wlAdd(sym) {
  const st = loadSets(WL_KEY), l = st.sets[st.active];
  if (!SYM.test(sym)) return false;
  if (!l.includes(sym)) l.push(sym);
  store.set(WL_KEY, st);
  return true;
}

function cleanWL(raw) {
  const out = {};
  const sets = Array.isArray(raw) ? { Imported: raw } : raw?.sets;
  if (!sets || typeof sets !== 'object') return null;
  for (const [name, l] of Object.entries(sets)) {
    if (!Array.isArray(l) || name === '__proto__') continue;
    out[String(name).slice(0, 30)] = [...new Set(l.map((x) => String(x).toUpperCase()).filter((x) => SYM.test(x)))];
  }
  return Object.keys(out).length ? out : null;
}

function drawWL(box) {
  const st = loadSets(WL_KEY), save = () => store.set(WL_KEY, st);
  box.innerHTML = `<div class="portfolio"><div data-r="bar"></div>
    <div class="portfolio-bar"><input data-r="sym" placeholder="Add symbol or company" autocomplete="off" maxlength="40"><button data-a="add">ADD</button></div>
    <div class="portfolio-sug" data-r="sug"></div><div data-r="body"></div>
    <details class="portfolio-io"><summary>EXPORT / IMPORT JSON</summary>
      <textarea data-r="io" rows="5" spellcheck="false"></textarea>
      <div class="portfolio-bar"><button data-a="exp">EXPORT</button><button data-a="imp">IMPORT</button><span class="portfolio-msg" data-r="msg"></span></div></details></div>`;
  const root = box.firstElementChild, r = (n) => root.querySelector(`[data-r="${n}"]`);
  let Q = {}, err = '', drag = null, seq = 0, timer = 0;
  const list = () => st.sets[st.active];

  function table() {
    const l = list();
    if (!l.length) { r('body').innerHTML = empty('EMPTY LIST: type a symbol above, or WL AAPL'); return; }
    r('body').innerHTML = `<table><thead><tr><th>Symbol</th><th>Last</th><th>Chg</th><th>%Chg</th><th>Vol</th><th></th></tr></thead><tbody>${l.map((s, i) => {
      const q = Q[s];
      return `<tr draggable="true" data-i="${i}"><td>${esc(s)}</td><td>${q ? fmt(q.p) : '--'}</td><td class="${cls(q?.c)}">${q ? sgn(q.c) : '--'}</td><td class="${cls(q?.pc)}">${q ? sgn(q.pc) + '%' : '--'}</td><td>${q ? vol(q.v) : '--'}</td>
        <td class="portfolio-act"><button data-a="up" data-i="${i}" title="Move up">&#9650;</button><button data-a="dn" data-i="${i}" title="Move down">&#9660;</button><button data-a="rm" data-i="${i}" title="Remove">X</button></td></tr>`;
    }).join('')}</tbody></table>${err ? `<div class="portfolio-msg">${esc(err)}</div>` : ''}`;
  }
  function bar() { r('bar').innerHTML = barHTML(st); }
  async function refresh() {
    if (!root.isConnected) return;
    const name = st.active, l = list();
    if (!l.length) { Q = {}; return table(); }
    try { const q = await quotes(l); if (name === st.active) { Q = q; err = ''; } } catch { err = 'QUOTES UNAVAILABLE'; }
    if (root.isConnected && name === st.active) table();
  }
  const all = () => { bar(); table(); refresh(); };
  function add(sym) {
    sym = String(sym).trim().toUpperCase();
    if (!SYM.test(sym)) { r('msg').textContent = 'BAD SYMBOL'; return; }
    const l = list();
    if (!l.includes(sym)) l.push(sym);
    save(); r('sym').value = ''; r('sug').innerHTML = '';
    table(); refresh();
  }
  const move = (a, b) => {
    const l = list();
    if (b < 0 || b >= l.length || a === b) return;
    l.splice(b, 0, l.splice(a, 1)[0]);
    save(); table();
  };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.a, i = +b.dataset.i;
    if (a === 'add') add(r('sym').value);
    else if (a === 'pick') add(b.dataset.s);
    else if (a === 'up') move(i, i - 1);
    else if (a === 'dn') move(i, i + 1);
    else if (a === 'rm') { list().splice(i, 1); save(); table(); }
    else if (a === 'exp') r('io').value = JSON.stringify({ active: st.active, sets: st.sets }, null, 1);
    else if (a === 'imp') {
      let sets = null;
      try { sets = cleanWL(JSON.parse(r('io').value)); } catch {}
      if (!sets) { r('msg').textContent = 'INVALID JSON'; return; }
      Object.assign(st.sets, sets);
      if (!Object.hasOwn(sets, st.active)) st.active = Object.keys(sets)[0];
      save(); r('msg').textContent = `IMPORTED ${Object.keys(sets).length} LIST(S)`; all();
    } else if (setAction(st, a)) { save(); all(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.a === 'list' && setAction(st, 'list', e.target.value)) { save(); all(); }
  });
  r('sym').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(e.target.value); });
  r('sym').addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim(), my = ++seq;
    if (!/^[\w .&\-]{1,40}$/.test(q)) { r('sug').innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const d = await getJSON(`/api/data?fn=search&q=${encodeURIComponent(q)}`);
        if (my !== seq || !root.isConnected) return;
        r('sug').innerHTML = (d.rows || []).map((x) => `<button data-a="pick" data-s="${esc(x.s)}">${esc(x.s)} <span>${esc(x.n)} ${esc(x.x)}</span></button>`).join('');
      } catch { if (my === seq) r('sug').innerHTML = ''; }
    }, 250);
  });
  const body = r('body');
  body.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    drag = +tr.dataset.i;
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(drag)); } catch {}
  });
  body.addEventListener('dragover', (e) => { if (drag != null) e.preventDefault(); });
  body.addEventListener('drop', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (drag == null || !tr) return;
    e.preventDefault();
    const from = drag;
    drag = null;
    move(from, +tr.dataset.i);
  });
  body.addEventListener('dragend', () => { drag = null; });

  all();
  autoRefresh(root, refresh);
}

registerWidget('wl', { title: 'WL  Watchlists', hint: 'WL', render: drawWL });
registerCommand('WL', {
  help: 'WL [SYMBOL]  watchlists (add symbol to the open list)',
  run(args) {
    const s = args.find((a) => a !== 'ADD');
    if (s && !wlAdd(s)) return flash(`WL: bad symbol ${s}`);
    openWidget('wl');
  },
});

// ---- PORT: portfolio tracker ----
const PF_KEY = 'ot.port';

function pfCmd(args) {
  const st = loadSets(PF_KEY), l = st.sets[st.active];
  const [op, s, a, b, ...n] = args;
  if (op === 'ADD') {
    const sh = num(a), cost = num(b);
    if (!SYM.test(s || '') || !Number.isFinite(sh) || sh === 0 || !Number.isFinite(cost) || cost < 0) return flash('PORT ADD SYMBOL SHARES COST'), false;
    addPos(l, s, sh, cost, n.join(' ').slice(0, 80));
    flash(`PORT: ${s} updated in ${st.active}`);
  } else if (op === 'DEL') {
    const i = l.findIndex((p) => p.s === s);
    if (i < 0) return flash(`PORT: no position ${s || ''}`), false;
    l.splice(i, 1);
    flash(`PORT: removed ${s}`);
  } else return true;
  store.set(PF_KEY, st);
  return true;
}

function drawPF(box) {
  const st = loadSets(PF_KEY), save = () => store.set(PF_KEY, st);
  box.innerHTML = `<div class="portfolio"><div data-r="bar"></div>
    <form class="portfolio-bar" data-r="form" autocomplete="off">
      <input name="s" placeholder="Symbol" size="8" maxlength="15"><input name="sh" placeholder="Shares" size="8" inputmode="decimal"><input name="c" placeholder="Cost / share" size="10" inputmode="decimal"><input name="n" placeholder="Note (optional)" size="16" maxlength="80">
      <button type="submit" data-r="ok">ADD</button><button type="button" data-a="cancel" data-r="cancel" hidden>CANCEL</button><span class="portfolio-msg" data-r="msg"></span></form>
    <div data-r="body"></div>
    <details class="portfolio-io"><summary>CSV  SYMBOL,SHARES,COST</summary>
      <textarea data-r="io" rows="5" spellcheck="false" placeholder="AAPL,10,150"></textarea>
      <div class="portfolio-bar"><button data-a="exp">EXPORT</button><button data-a="imp">IMPORT</button></div></details></div>`;
  const root = box.firstElementChild, r = (n) => root.querySelector(`[data-r="${n}"]`), f = r('form');
  let Q = {}, err = '', editing = null;
  const list = () => st.sets[st.active];

  function table() {
    const l = list();
    if (!l.length) { r('body').innerHTML = empty('NO POSITIONS: type PORT ADD AAPL 10 150'); return; }
    const { rows, tot } = calc(l, Q);
    const pl = (v, p) => `<td class="${cls(v)}">${v == null ? '--' : sgn(v)}${p == null ? '' : ` (${sgn(p, 1)}%)`}</td>`;
    r('body').innerHTML = `<div class="portfolio-sum">COST ${fmt(tot.cost)}<span>VALUE ${fmt(tot.mv)}</span><span class="${cls(tot.day)}">DAY ${sgn(tot.day)}</span><span class="${cls(tot.pl)}">TOTAL ${sgn(tot.pl)}</span></div>
      <table><thead><tr><th>Symbol</th><th>Shares</th><th>Cost</th><th>Last</th><th>Mkt Value</th><th>Day P&amp;L</th><th>Total P&amp;L</th><th>% Port</th><th></th></tr></thead><tbody>${rows.map((x) =>
        `<tr><td title="${esc(x.note)}">${esc(x.s)}${x.note ? ` <span class="portfolio-note">${esc(x.note)}</span>` : ''}</td><td>${fmt(x.sh, Number.isInteger(x.sh) ? 0 : 4)}</td><td>${fx(x.cost)}</td><td>${fmt(x.last)}</td><td>${fmt(x.mv)}</td>${pl(x.day)}${pl(x.pl, x.plPct)}<td>${x.w == null ? '--' : x.w.toFixed(1) + '%'}</td>
        <td class="portfolio-act"><button data-a="edit" data-s="${esc(x.s)}">EDIT</button><button data-a="rm" data-s="${esc(x.s)}">X</button></td></tr>`).join('')}
      <tr class="portfolio-tot"><td>TOTAL</td><td></td><td></td><td></td><td>${fmt(tot.mv)}</td>${pl(tot.day)}${pl(tot.pl, tot.plPct)}<td>${tot.mv ? '100.0%' : '--'}</td><td></td></tr></tbody></table>
      ${err ? `<div class="portfolio-msg">${esc(err)}</div>` : ''}${alloc(rows)}`;
  }
  function alloc(rows) {
    const sl = slices(rows);
    if (!sl.length) return '';
    return `<div class="portfolio-alloc"><svg viewBox="0 0 42 42" width="130" height="130"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#161616" stroke-width="7"/>${sl.map((s) =>
      `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${s.color}" stroke-width="7" stroke-dasharray="${s.f.toFixed(3)} ${(100 - s.f).toFixed(3)}" stroke-dashoffset="${s.off.toFixed(3)}"/>`).join('')}</svg>
      <div>${sl.map((s) => `<div class="portfolio-leg"><i style="background:${s.color}"></i>${esc(s.s)} <span>${s.f.toFixed(1)}%</span></div>`).join('')}</div></div>`;
  }
  const bar = () => { r('bar').innerHTML = barHTML(st); };
  async function refresh() {
    if (!root.isConnected) return;
    const name = st.active, l = list();
    if (!l.length) { Q = {}; return table(); }
    try { const q = await quotes(l.map((p) => p.s)); if (name === st.active) { Q = q; err = ''; } } catch { err = 'QUOTES UNAVAILABLE'; }
    if (root.isConnected && name === st.active) table();
  }
  const all = () => { bar(); table(); refresh(); };
  function reset() {
    editing = null; f.reset(); f.s.readOnly = false;
    r('ok').textContent = 'ADD'; r('cancel').hidden = true;
  }

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = f.s.value.trim().toUpperCase(), sh = num(f.sh.value), cost = num(f.c.value), note = f.n.value.trim().slice(0, 80);
    if (!SYM.test(s) || !Number.isFinite(sh) || sh === 0 || !Number.isFinite(cost) || cost < 0) { r('msg').textContent = 'NEED SYMBOL, SHARES (not 0), COST (>= 0)'; return; }
    const l = list(), i = l.findIndex((p) => p.s === s);
    if (editing && i >= 0) l[i] = { s, sh, cost, note };
    else addPos(l, s, sh, cost, note);
    save(); r('msg').textContent = ''; reset(); table(); refresh();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.a;
    if (a === 'edit') {
      const p = list().find((x) => x.s === b.dataset.s);
      if (!p) return;
      editing = p.s; f.s.value = p.s; f.s.readOnly = true; f.sh.value = p.sh; f.c.value = p.cost; f.n.value = p.note || '';
      r('ok').textContent = 'SAVE'; r('cancel').hidden = false;
    } else if (a === 'cancel') reset();
    else if (a === 'rm') { const l = list(), i = l.findIndex((x) => x.s === b.dataset.s); if (i >= 0) l.splice(i, 1); save(); table(); refresh(); }
    else if (a === 'exp') r('io').value = toCSV(list());
    else if (a === 'imp') {
      const { rows, errs } = parseCSV(r('io').value);
      rows.forEach((p) => addPos(list(), p.s, p.sh, p.cost, p.note));
      if (rows.length) save();
      r('msg').textContent = `IMPORTED ${rows.length}${errs.length ? `, SKIPPED ${errs.join(' ')}` : ''}`;
      table(); refresh();
    } else if (setAction(st, a)) { save(); reset(); all(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.a === 'list' && setAction(st, 'list', e.target.value)) { save(); reset(); all(); }
  });

  all();
  autoRefresh(root, refresh);
}

registerWidget('port', { title: 'PORT  Portfolio', hint: 'PORT', render: drawPF });
registerCommand('PORT', {
  help: 'PORT [ADD SYMBOL SHARES COST | DEL SYMBOL]  portfolio tracker',
  run(args) { if (pfCmd(args)) openWidget('port'); },
});

// ---- ALRT: price alerts ----
const AL_KEY = 'ot.alerts';
const loadAlerts = () => { const a = store.get(AL_KEY, []); return Array.isArray(a) ? a : []; };
const alertViews = new Set();
const refreshViews = () => alertViews.forEach((v) => { if (v.root.isConnected) v.draw(); else alertViews.delete(v); });

function alertAdd(a) {
  const l = loadAlerts();
  l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...a, on: true, t0: Date.now() });
  store.set(AL_KEY, l);
  tick();
}

let busy = false;
async function tick() {
  if (busy) return;
  const act = loadAlerts().filter((a) => a.on);
  if (!act.length) return;
  busy = true;
  try {
    const q = await quotes(act.map((a) => a.s));
    const l = loadAlerts(), fired = [];
    for (const a of l) {
      const p = q[a.s]?.p;
      if (a.on && hit(a, p)) { a.on = false; a.t1 = Date.now(); a.last = p; fired.push(a); }
    }
    if (fired.length) {
      store.set(AL_KEY, l);
      for (const a of fired) {
        const text = `ALERT ${a.s} ${a.dir} ${a.px} (LAST ${a.last})`;
        flash(text);
        try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(text, { silent: true }); } catch {}
      }
      refreshViews();
    }
  } catch {} finally { busy = false; }
}
const alertTimer = setInterval(tick, 60000);
alertTimer.unref?.();

function drawAL(box) {
  box.innerHTML = `<div class="portfolio"><form class="portfolio-bar" data-r="form" autocomplete="off">
      <input name="s" placeholder="Symbol" size="8" maxlength="15"><select name="d"><option>ABOVE</option><option>BELOW</option></select><input name="p" placeholder="Price" size="10" inputmode="decimal"><button type="submit">ADD ALERT</button>
      <span data-r="notif"></span><span class="portfolio-msg" data-r="msg"></span></form><div data-r="body"></div></div>`;
  const root = box.firstElementChild, r = (n) => root.querySelector(`[data-r="${n}"]`), f = r('form');

  function draw() {
    const l = loadAlerts();
    r('body').innerHTML = l.length ? `<table><thead><tr><th>Symbol</th><th>Condition</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${l.map((a) =>
      `<tr><td>${esc(a.s)}</td><td>${esc(a.dir)} ${fmt(a.px)}</td><td class="${a.on ? '' : 'up'}">${a.on ? 'ACTIVE' : `TRIGGERED ${hhmm(a.t1)} @ ${fmt(a.last)}`}</td><td>${esc(new Date(a.t0).toLocaleDateString())}</td>
      <td class="portfolio-act">${a.on ? '' : `<button data-a="re" data-id="${esc(a.id)}">RE-ARM</button>`}<button data-a="rm" data-id="${esc(a.id)}">X</button></td></tr>`).join('')}</tbody></table>`
      : empty('NO ALERTS: type ALRT AAPL ABOVE 250');
    const n = typeof Notification === 'undefined' ? null : Notification.permission;
    r('notif').innerHTML = n === 'default' ? '<button type="button" data-a="notif">Enable notifications</button>' : n === 'granted' ? '<span class="portfolio-msg">NOTIFICATIONS ON</span>' : n === 'denied' ? '<span class="portfolio-msg">NOTIFICATIONS BLOCKED</span>' : '';
  }
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = parseAlert([f.s.value.trim().toUpperCase(), f.d.value, f.p.value]);
    if (!a) { r('msg').textContent = 'NEED SYMBOL AND PRICE > 0'; return; }
    r('msg').textContent = ''; f.reset();
    alertAdd(a); draw();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const l = loadAlerts();
    if (b.dataset.a === 'rm') store.set(AL_KEY, l.filter((a) => a.id !== b.dataset.id));
    else if (b.dataset.a === 're') { const a = l.find((x) => x.id === b.dataset.id); if (a) { a.on = true; delete a.t1; store.set(AL_KEY, l); tick(); } }
    else if (b.dataset.a === 'notif') { Notification.requestPermission().then(draw, draw); return; }
    draw();
  });
  const view = { root, draw };
  alertViews.add(view);
  draw();
}

registerWidget('alrt', { title: 'ALRT  Price Alerts', hint: 'ALRT', render: drawAL });
registerCommand('ALRT', {
  help: 'ALRT [SYMBOL ABOVE|BELOW PRICE]  price alerts',
  run(args) {
    if (args.length) {
      const a = parseAlert(args);
      if (!a) return status('ALRT SYMBOL ABOVE|BELOW PRICE', true);
      alertAdd(a);
      flash(`ALRT: ${a.s} ${a.dir} ${a.px} set`);
    }
    openWidget('alrt');
  },
});

// ---- NOTE: per-ticker notes ----
const NOTE_KEY = 'ot.notes';
const loadNotes = () => { const n = store.get(NOTE_KEY, {}); return n && typeof n === 'object' && !Array.isArray(n) ? n : {}; };

function drawNote(box, args) {
  const sym = args?.[0];
  if (!sym || !SYM.test(sym)) {
    const n = loadNotes(), keys = Object.keys(n).sort();
    box.innerHTML = `<div class="portfolio"><div class="portfolio-bar"><input data-r="sym" placeholder="Ticker" size="10" maxlength="15"><button data-a="open">OPEN</button></div>
      ${keys.length ? `<table><thead><tr><th>Symbol</th><th>Note</th><th>Edited</th></tr></thead><tbody>${keys.map((k) =>
        `<tr><td><button class="portfolio-link" data-a="go" data-s="${esc(k)}">${esc(k)}</button></td><td class="portfolio-note">${esc(n[k].text.slice(0, 80))}</td><td>${esc(new Date(n[k].t).toLocaleString())}</td></tr>`).join('')}</tbody></table>` : empty('NO NOTES: type NOTE AAPL')}</div>`;
    const root = box.firstElementChild;
    const open = (s) => { s = String(s).trim().toUpperCase(); if (SYM.test(s)) drawNote(box, [s]); };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      open(b.dataset.a === 'go' ? b.dataset.s : root.querySelector('[data-r="sym"]').value);
    });
    root.querySelector('[data-r="sym"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e.target.value); });
    return;
  }
  const cur = loadNotes()[sym];
  box.innerHTML = `<div class="portfolio"><div class="portfolio-bar"><b class="portfolio-sym">${esc(sym)}</b><button data-a="save">SAVE</button><button data-a="all">ALL NOTES</button><span class="portfolio-msg" data-r="msg">${cur ? 'EDITED ' + esc(new Date(cur.t).toLocaleString()) : 'NEW NOTE'}</span></div>
    <textarea class="portfolio-note-area" data-r="text" rows="14" maxlength="20000" placeholder="Notes on ${esc(sym)}">${esc(cur?.text || '')}</textarea></div>`;
  const root = box.firstElementChild, ta = root.querySelector('[data-r="text"]'), m = root.querySelector('[data-r="msg"]');
  const save = () => {
    const n = loadNotes(), text = ta.value;
    if (text.trim()) n[sym] = { text, t: Date.now() }; else delete n[sym];
    store.set(NOTE_KEY, n);
    m.textContent = text.trim() ? `SAVED ${new Date(n[sym].t).toLocaleString()}` : 'EMPTY NOTE REMOVED';
  };
  ta.addEventListener('change', save);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'save') save();
    else if (a === 'all') drawNote(box, []);
  });
}

registerWidget('note', { title: (a) => `NOTE  ${a?.[0] || 'All'}`, hint: 'NOTE', render: drawNote });
registerCommand('NOTE', { help: 'NOTE [TICKER]  personal notes per ticker', run(args) { openWidget('note', args); } });
