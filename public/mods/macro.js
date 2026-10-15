// Macro, rates and fixed income: FRED, WECO, CBR, CRED, YCRV, YAS.
import { esc, fmt, msg, getJSON, canvas, registerCommand, registerWidget, openWidget, runCommand, loadCSS } from '../core.js';
loadCSS(new URL('./macro.css', import.meta.url));

const LOADING = msg('LOADING...');
async function api(fn, params = '') {
  const r = await fetch(`/api/data?fn=${fn}${params}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 503 ? 'FRED KEY NOT CONFIGURED ON THIS SERVER' : d.error || `HTTP ${r.status}`);
  return d;
}
const snapRows = async (key) => (await getJSON(`/api/snap?keys=${key}`))[key];
const num = (v, d = 2) => (v == null ? '--' : fmt(v, d));
const ccls = (v) => (v > 0 ? 'macro-up' : v < 0 ? 'macro-dn' : '');
const asOf = (s) => (s?.asOf ? `<div class="macro-note">Snapshot as of ${esc(new Date(s.asOf).toLocaleString())}</div>` : '');

// ---------- FRED series chart ----------
const ALIAS = {
  GDP: 'GDP', CPI: 'CPIAUCSL', CORE: 'CPILFESL', UNRATE: 'UNRATE', PAYEMS: 'PAYEMS', FEDFUNDS: 'FEDFUNDS', PCE: 'PCEPI', RETAIL: 'RSAFS',
  INDPRO: 'INDPRO', HOUST: 'HOUST', UMCSENT: 'UMCSENT', M2: 'M2SL', WTI: 'DCOILWTICO', DXY: 'DTWEXBGS', TEN2Y: 'T10Y2Y',
};
const RANGES = { '1Y': 1, '5Y': 5, '10Y': 10, MAX: 0 };
const isoYearsAgo = (y) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };

// Percent change vs one year earlier; level-in-percent series use the point difference instead.
function yoy(rows, units) {
  const diff = /^percent/i.test(units || '');
  const out = []; let j = 0;
  for (const [d, v] of rows) {
    const t = new Date(d); t.setUTCFullYear(t.getUTCFullYear() - 1);
    const key = t.toISOString().slice(0, 10);
    while (j + 1 < rows.length && rows[j + 1][0] <= key) j++;
    if (rows[j][0] > key) continue;
    const p = rows[j][1];
    out.push([d, diff ? v - p : p ? ((v - p) / Math.abs(p)) * 100 : null]);
  }
  return out.filter((r) => r[1] != null);
}

function drawLine(box, rows, onHover) {
  const { c, g, W, H } = canvas(box);
  if (rows.length < 2) { box.innerHTML = msg('NOT ENOUGH DATA'); return; }
  const padR = 56, padB = 16, padT = 8, ts = rows.map((r) => Date.parse(r[0])), vs = rows.map((r) => r[1]);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }
  const t0 = ts[0], t1 = ts.at(-1), X = (t) => ((t - t0) / (t1 - t0 || 1)) * (W - padR), Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  g.font = '10px monospace'; g.fillStyle = '#6d6d6d'; g.strokeStyle = '#1e1e1e'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4, y = Y(v);
    g.beginPath(); g.moveTo(0, y); g.lineTo(W - padR, y); g.stroke();
    g.fillText(fmt(v, Math.abs(hi - lo) < 10 ? 2 : 0), W - padR + 4, y + 3);
  }
  const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear(), stepY = Math.max(1, Math.ceil((y1 - y0) / 8));
  for (let y = y0 + 1; y <= y1; y += stepY) { const x = X(Date.UTC(y, 0, 1)); g.fillText(String(y), x - 10, H - 4); }
  g.strokeStyle = vs.at(-1) >= vs[0] ? '#2ecc71' : '#ff4d4d'; g.lineWidth = 1.5; g.beginPath();
  rows.forEach((r, i) => { const x = X(ts[i]), y = Y(vs[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  c.onmousemove = (e) => {
    const x = e.clientX - c.getBoundingClientRect().left, t = t0 + (x / (W - padR)) * (t1 - t0);
    let a = 0, b = ts.length - 1;
    while (a < b) { const m = (a + b) >> 1; ts[m] < t ? (a = m + 1) : (b = m); }
    onHover(rows[Math.max(0, Math.min(rows.length - 1, a))]);
  };
  c.onmouseleave = () => onHover(null);
}

async function renderFred(box, args) {
  const id = ALIAS[args[0]] || args[0];
  if (!id || !/^[A-Z0-9_]{1,30}$/.test(id)) {
    box.innerHTML = msg(`FRED <ID>. ALIASES: ${Object.keys(ALIAS).join(' ')}`);
    return;
  }
  const st = { range: '5Y', yoy: false, data: null };
  box.innerHTML = `<div class="macro-wrap"><div class="macro-head" data-h></div><div class="macro-btns" data-b></div><div class="macro-cv" data-c>${LOADING}</div></div>`;
  const head = box.querySelector('[data-h]'), btns = box.querySelector('[data-b]'), cv = box.querySelector('[data-c]');
  const draw = () => {
    const d = st.data, full = st.yoy ? yoy(d.rows, d.units) : d.rows;
    const cut = RANGES[st.range] ? isoYearsAgo(RANGES[st.range]) : '';
    const rows = full.filter((r) => r[0] >= cut);
    const last = rows.at(-1);
    const unit = st.yoy ? (/^percent/i.test(d.units) ? 'pp YoY' : '% YoY') : d.units;
    const show = (r) => `<span class="macro-last">${r ? esc(num(r[1], Math.abs(r[1]) >= 1000 ? 0 : 2)) : '--'}</span><span class="macro-sub">${r ? esc(r[0]) : ''}</span>`;
    const hdr = (r) => { head.innerHTML = `<span class="macro-title">${esc(id)}  ${esc(d.title)}</span>${show(r)}<span class="macro-sub">${esc(unit)} | ${esc(d.freq)}</span>`; };
    hdr(last);
    if (!rows.length) { cv.innerHTML = msg('NO DATA IN RANGE'); return; }
    cv.innerHTML = '';
    drawLine(cv, rows, (r) => hdr(r || last));
  };
  const bar = () => {
    btns.innerHTML = Object.keys(RANGES).map((k) => `<button data-r="${k}" class="${k === st.range ? 'on' : ''}">${k}</button>`).join('') + `<button data-y="1" class="${st.yoy ? 'on' : ''}">YoY</button>`;
  };
  const load = async () => {
    cv.innerHTML = LOADING;
    try {
      // fetch an extra 13 months so YoY has a base for the first visible point
      const start = RANGES[st.range] ? isoYearsAgo(RANGES[st.range] + 1) : '1900-01-01';
      st.data = await api('fredseries', `&id=${encodeURIComponent(id)}&start=${start}`);
      if (!st.data.rows.length) { cv.innerHTML = msg('NO DATA'); return; }
      draw();
    } catch (e) { head.innerHTML = ''; cv.innerHTML = msg(e.message.startsWith('FRED') ? e.message : `${id}: ${e.message}`.toUpperCase()); }
  };
  btns.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.r) { st.range = b.dataset.r; bar(); load(); } else { st.yoy = !st.yoy; bar(); if (st.data?.rows.length) draw(); }
  };
  bar(); load();
}

registerWidget('fred', { title: (a) => `FRED  ${a[0] ?? ''}`, hint: 'FRED <ID>', render: renderFred });
registerCommand('FRED', { help: 'FRED CPI  FRED series chart (id or alias)', run: (a) => openWidget('fred', a.slice(0, 1)) });
for (const k of Object.keys(ALIAS)) registerCommand(k, { help: `${k}  FRED ${ALIAS[k]}`, run: () => openWidget('fred', [k]) });

// ---------- sortable table helper ----------
// cols: [{ h, get(row) -> sort value, cell(row) -> html, left }]
function sortTable(box, rows, cols, foot = '', init = 0) {
  const st = { i: init, dir: 1 };
  const render = () => {
    const col = cols[st.i], v = (r) => col.get(r);
    const sorted = [...rows].sort((a, b) => { const x = v(a), y = v(b); return x == null ? 1 : y == null ? -1 : (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
    box.innerHTML = `<table class="macro-tbl"><thead><tr>${cols.map((c, i) => `<th class="macro-sort" data-i="${i}">${esc(c.h)}${i === st.i ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${sorted.map((r) => `<tr>${cols.map((c) => `<td class="${c.left ? 'macro-l' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>${foot}`;
  };
  box.onclick = (e) => {
    const th = e.target.closest('th[data-i]'); if (!th) return;
    const i = +th.dataset.i;
    st.dir = i === st.i ? -st.dir : (cols[i].left ? 1 : -1); st.i = i; render();
  };
  render();
}

// ---------- WECO ----------
const WECO_COLS = [
  ['GDP %', 'gdp', (v) => (v > 0 ? 'macro-up' : 'macro-dn')],
  ['CPI %', 'cpi', (v) => (v > 6 ? 'macro-dn' : v > 3 ? 'macro-warn' : v < 0 ? 'macro-warn' : 'macro-up')],
  ['UNEMP %', 'un', (v) => (v > 8 ? 'macro-dn' : v > 5 ? 'macro-warn' : 'macro-up')],
  ['CA %GDP', 'ca', (v) => (v >= 0 ? 'macro-up' : 'macro-dn')],
  ['DEBT %GDP', 'debt', (v) => (v > 100 ? 'macro-dn' : v > 60 ? 'macro-warn' : 'macro-up')],
];
async function renderWeco(box) {
  box.innerHTML = LOADING;
  try {
    const s = await snapRows('weco');
    if (!s?.rows?.length) { box.innerHTML = msg('NO WECO DATA YET. RUN: npm run seed'); return; }
    const cols = [{ h: 'COUNTRY', left: true, get: (r) => r.n, cell: (r) => `${esc(r.c)} <small>${esc(r.n)}</small>` },
      ...WECO_COLS.map(([h, k, f]) => ({ h, get: (r) => r[k]?.[0], cell: (r) => (r[k] ? `<span class="${f(r[k][0])}">${esc(num(r[k][0]))}</span><small>${esc(r[k][1])}</small>` : '--') }))];
    sortTable(box, s.rows, cols, `${asOf(s)}<div class="macro-note">Source: World Bank, latest available year per indicator. Click a header to sort.</div>`);
  } catch (e) { box.innerHTML = msg('WECO UNAVAILABLE'); }
}
registerWidget('weco', { title: 'WECO  World Economies', hint: 'WECO', render: renderWeco });
registerCommand('WECO', { help: 'WECO  world economies monitor (World Bank)', run: () => openWidget('weco') });

// ---------- CBR ----------
async function renderCbr(box) {
  box.innerHTML = LOADING;
  try {
    const s = await snapRows('cbrates');
    if (!s?.rows?.length) { box.innerHTML = msg('NO CBR DATA YET. RUN: npm run seed'); return; }
    const cols = [
      { h: 'BANK', left: true, get: (r) => r.b, cell: (r) => esc(r.b) },
      { h: 'RATE %', get: (r) => r.v, cell: (r) => esc(num(r.v)) },
      { h: '3M CHG', get: (r) => r.c3, cell: (r) => (r.c3 == null ? '--' : `<span class="${ccls(r.c3)}">${esc(num(r.c3))}</span>`) },
      { h: 'AS OF', left: true, get: (r) => r.d, cell: (r) => esc(r.d) },
      { h: 'SERIES', left: true, get: (r) => r.n, cell: (r) => `${esc(r.n)} <small>${esc(r.id)}</small>` },
    ];
    sortTable(box, s.rows, cols, `${asOf(s)}<div class="macro-note">Source: FRED. Proxy rows are market rates close to the policy rate and may lag.</div>`);
  } catch (e) { box.innerHTML = msg('CBR UNAVAILABLE'); }
}
registerWidget('cbrates', { title: 'CBR  Central Bank Rates', hint: 'CBR', render: renderCbr });
registerCommand('CBR', { help: 'CBR  central bank policy rates', run: () => openWidget('cbrates') });

// ---------- CRED ----------
function spark(sp) {
  if (!sp?.length) return '';
  const lo = Math.min(...sp), hi = Math.max(...sp), n = sp.length - 1 || 1;
  const pts = sp.map((v, i) => `${((i / n) * 88 + 1).toFixed(1)},${(18 - ((v - lo) / (hi - lo || 1)) * 16).toFixed(1)}`).join(' ');
  return `<svg class="macro-spark" viewBox="0 0 90 20"><polyline points="${pts}"/></svg>`;
}
async function renderCred(box) {
  box.innerHTML = LOADING;
  try {
    const s = await snapRows('credit');
    if (!s?.rows?.length) { box.innerHTML = msg('NO CREDIT DATA YET. RUN: npm run seed'); return; }
    const ch = (k) => ({ h: { c1: '1D', c5: '1W', c21: '1M' }[k], get: (r) => r[k], cell: (r) => (r[k] == null ? '--' : `<span class="${ccls(r[k])}">${esc(num(r[k]))}</span>`) });
    const cols = [
      { h: 'SERIES', left: true, get: (r) => r.n, cell: (r) => `${esc(r.n)} <small>${esc(r.id)}</small>` },
      { h: 'LAST', get: (r) => r.v, cell: (r) => `${esc(num(r.v))}${esc(r.u)}` },
      ch('c1'), ch('c5'), ch('c21'),
      { h: 'AS OF', left: true, get: (r) => r.d, cell: (r) => esc(r.d) },
      { h: '60 PTS', get: () => null, cell: (r) => spark(r.sp) },
    ];
    sortTable(box, s.rows, cols, `${asOf(s)}<div class="macro-note">Source: FRED. Changes in points (spreads in % points). Sparkline = last 60 observations.</div>`);
  } catch (e) { box.innerHTML = msg('CREDIT UNAVAILABLE'); }
}
registerWidget('credit', { title: 'CRED  Credit and Funding', hint: 'CRED', render: renderCred });
registerCommand('CRED', { help: 'CRED  US credit spreads, breakevens, funding', run: () => openWidget('credit') });

// ---------- YCRV ----------
const CURVE_COLORS = ['#ff9f1a', '#3aa0ff', '#2ecc71', '#b36bff'];
async function renderCurveHist(box) {
  box.innerHTML = LOADING;
  try {
    const d = await api('curvehist');
    box.innerHTML = `<div class="macro-wrap"><div class="macro-legend">${d.curves.map((c, i) => `<span><i style="background:${CURVE_COLORS[i]}"></i>${esc(c.label)} ${esc(c.date)}</span>`).join('')}</div><div class="macro-cv" data-c></div></div>`;
    const { g, W, H } = canvas(box.querySelector('[data-c]'));
    const all = d.curves.flatMap((c) => c.y).filter((v) => v != null), n = d.maturities.length;
    if (!all.length) { box.innerHTML = msg('NO CURVE DATA'); return; }
    const padL = 34, padR = 12, padT = 10, padB = 18;
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi === lo) { hi += 1; lo -= 1; }
    const X = (i) => padL + (i / (n - 1)) * (W - padL - padR), Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    g.font = '10px monospace'; g.fillStyle = '#6d6d6d'; g.strokeStyle = '#1e1e1e'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - padR, Y(v)); g.stroke(); g.fillText(v.toFixed(2), 2, Y(v) + 3); }
    d.maturities.forEach((m, i) => g.fillText(m, X(i) - 8, H - 4));
    d.curves.forEach((c, k) => {
      g.strokeStyle = CURVE_COLORS[k]; g.lineWidth = k ? 1.3 : 2; g.beginPath();
      let pen = false;
      c.y.forEach((v, i) => { if (v == null) { pen = false; return; } pen ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); pen = true; });
      g.stroke();
    });
  } catch (e) { box.innerHTML = msg(e.message.toUpperCase()); }
}
registerWidget('curvehist', { title: 'YCRV  Yield Curve History', hint: 'YCRV', render: renderCurveHist });
registerCommand('YCRV', { help: 'YCRV  US Treasury curve vs 1M, 1Y, 5Y ago', run: () => openWidget('curvehist') });

// ---------- YAS bond calculator ----------
// bond-math:start
// Prices are per 100 par. y is the annual yield (decimal) compounded `f` times a year; settlement on a coupon date.
function bondFlows(cpn, years, f) {
  const n = Math.max(1, Math.round(years * f)), c = (100 * cpn) / f;
  return Array.from({ length: n }, (_, i) => [i + 1, c + (i + 1 === n ? 100 : 0)]);
}
function bondPrice(cpn, years, f, y) {
  return bondFlows(cpn, years, f).reduce((s, [k, cf]) => s + cf / (1 + y / f) ** k, 0);
}
function bondYield(cpn, years, f, price) {
  let lo = -0.5, hi = 3; // price falls as yield rises
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (bondPrice(cpn, years, f, mid) > price) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function bondStats(cpn, years, f, y) {
  const fl = bondFlows(cpn, years, f), r = 1 + y / f;
  const p = fl.reduce((s, [k, cf]) => s + cf / r ** k, 0);
  const mac = fl.reduce((s, [k, cf]) => s + ((k / f) * cf) / r ** k, 0) / p;
  const conv = fl.reduce((s, [k, cf]) => s + (k * (k + 1) * cf) / r ** (k + 2), 0) / (p * f * f);
  const mod = mac / r;
  return { price: p, mac, mod, conv, dv01: mod * p * 1e-4 };
}
// bond-math:end

function renderYas(box) {
  const inp = (id, label, val, extra = '') => `<label>${label}<input id="macro-${id}" value="${val}" inputmode="decimal" ${extra}></label>`;
  box.innerHTML = `<div class="macro-wrap"><div class="macro-form">
    ${inp('face', 'Face value', 1000)}${inp('cpn', 'Coupon %', 5)}${inp('yrs', 'Years to maturity', 10)}
    <label>Frequency<select id="macro-f"><option value="2">Semiannual</option><option value="1">Annual</option><option value="4">Quarterly</option><option value="12">Monthly</option></select></label>
    <label>Solve from<select id="macro-mode"><option value="y">Yield %</option><option value="p">Price (per 100)</option></select></label>
    ${inp('val', 'Yield % / Price', 5)}</div><div class="macro-out" id="macro-out"></div>
    <div class="macro-note">Settlement on a coupon date, clean price = dirty price. Price per 100 par.</div></div>`;
  const q = (id) => box.querySelector(`#macro-${id}`);
  const calc = () => {
    const face = +q('face').value, cpn = +q('cpn').value / 100, yrs = +q('yrs').value, f = +q('f').value, v = +q('val').value, mode = q('mode').value;
    const out = q('out');
    if (![face, yrs, v].every(Number.isFinite) || !Number.isFinite(cpn) || face <= 0 || yrs <= 0 || (mode === 'p' && v <= 0)) { out.innerHTML = '<span>ENTER VALID INPUTS</span>'; return; }
    const y = mode === 'y' ? v / 100 : bondYield(cpn, yrs, f, v);
    const s = bondStats(cpn, yrs, f, y), price = mode === 'p' ? v : s.price;
    const cell = (l, x) => `<div><span>${esc(l)}</span><b>${esc(x)}</b></div>`;
    out.innerHTML = cell('Yield to maturity', `${(y * 100).toFixed(4)}%`) + cell('Price (per 100)', price.toFixed(4)) + cell('Market value', fmt((price * face) / 100, 2))
      + cell('Current yield', `${((cpn * 100 / price) * 100).toFixed(4)}%`) + cell('Macaulay duration', `${s.mac.toFixed(4)} yrs`) + cell('Modified duration', s.mod.toFixed(4))
      + cell('Convexity', s.conv.toFixed(4)) + cell('DV01 (per face)', ((s.dv01 * face) / 100).toFixed(4));
  };
  box.querySelector('.macro-form').oninput = calc;
  calc();
}
registerWidget('yas', { title: 'YAS  Bond Calculator', hint: 'YAS', render: renderYas });
registerCommand('YAS', { help: 'YAS  bond yield, duration, convexity calculator', run: () => openWidget('yas') });

// ---------- ECB ----------
const ECB_CCY = ['USD', 'GBP', 'JPY', 'CHF', 'CNY', 'AUD', 'CAD'];
const ecbKey = (ccy) => `D.${ccy}.EUR.SP00.A`;
const ecbFetch = async (ccy, params) => {
  const r = await fetch(`/api/ecb?flowRef=EXR&key=${encodeURIComponent(ecbKey(ccy))}${params}`);
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
  return d;
};
const ECB_RANGES = { '3M': 0.25, '1Y': 1, '5Y': 5, MAX: 0 };

async function renderEcb(box, args) {
  const ccy = (args[0] || 'USD').toUpperCase();
  if (!ECB_CCY.includes(ccy)) { box.innerHTML = msg(`ECB <CCY>. OPTIONS: ${ECB_CCY.join(' ')}`); return; }
  const st = { range: '1Y', rows: null };
  box.innerHTML = `<div class="macro-wrap"><div class="macro-head" data-h></div><div class="macro-btns" data-b></div><div class="macro-cv" data-c>${LOADING}</div><div class="macro-out" data-s></div></div>`;
  const head = box.querySelector('[data-h]'), btns = box.querySelector('[data-b]'), cv = box.querySelector('[data-c]'), strip = box.querySelector('[data-s]');
  const draw = () => {
    const cut = ECB_RANGES[st.range] ? isoYearsAgo(ECB_RANGES[st.range]) : '';
    const rows = st.rows.filter((r) => r[0] >= cut);
    const last = rows.at(-1);
    const hdr = (r) => { head.innerHTML = `<span class="macro-title">EUR${esc(ccy)}  ECB reference rate</span><span class="macro-last">${r ? esc(num(r[1], 4)) : '--'}</span><span class="macro-sub">${r ? esc(r[0]) : ''} | ECB daily reference, ~16:00 CET</span>`; };
    hdr(last);
    if (!rows.length) { cv.innerHTML = msg('NO DATA IN RANGE'); return; }
    cv.innerHTML = '';
    drawLine(cv, rows, (r) => hdr(r || last));
  };
  const bar = () => { btns.innerHTML = Object.keys(ECB_RANGES).map((k) => `<button data-r="${k}" class="${k === st.range ? 'on' : ''}">${k}</button>`).join(''); };
  btns.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; st.range = b.dataset.r; bar(); draw(); };
  bar();
  try {
    const points = await ecbFetch(ccy, '&lastN=2000');
    st.rows = points.map((p) => [p.date, p.value]);
    if (!st.rows.length) { cv.innerHTML = msg('NO DATA'); return; }
    draw();
  } catch (e) { head.innerHTML = ''; cv.innerHTML = msg(e.message.toUpperCase()); }

  strip.innerHTML = ECB_CCY.map((c) => `<div data-c="${c}"><span>EUR${c}</span><b>...</b></div>`).join('');
  const cells = Object.fromEntries([...strip.children].map((el) => [el.dataset.c, el]));
  Promise.all(ECB_CCY.map((c) => ecbFetch(c, '&latest=1').then((d) => { cells[c].querySelector('b').textContent = d ? num(d.value, 4) : '--'; }).catch(() => { cells[c].querySelector('b').textContent = '--'; })));
  strip.onclick = (e) => { const c = e.target.closest('[data-c]')?.dataset.c; if (c) runCommand(`ECB ${c}`); };
}
registerWidget('ecb', { title: (a) => `ECB  EUR${(a[0] || 'USD').toUpperCase()} reference rate`, hint: 'ECB USD', render: renderEcb });
registerCommand('ECB', { help: `ECB <CCY>  ECB daily EUR reference rate (${ECB_CCY.join(' ')})`, run: (a) => openWidget('ecb', a.slice(0, 1)) });
