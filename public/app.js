// UI skeleton only: no data is fetched yet. Panels render empty placeholder rows.
const $ = (id) => document.getElementById(id);

const FKEYS = ['HELP', 'PANEL', 'MONITOR', 'NEWS', 'EQUITY', 'CORP', 'GOVT', 'CMDTY', 'CURNCY', 'MTGE', 'INDX', 'MENU'];
$('fkeys').innerHTML = FKEYS.map((k, i) => `<button class="${i % 2 ? 'alt' : ''}">F${i + 1} ${k}</button>`).join('');


const TABS = ['Home', 'Markets', 'Equities', 'Fixed Income', 'FX', 'Commodities', 'Macro', 'News', 'Portfolio'];
$('tabs').innerHTML = TABS.map((t, i) => `<button class="${i ? '' : 'on'}">${t}</button>`).join('');
$('tabs').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  [...$('tabs').children].forEach((b) => b.classList.toggle('on', b === e.target));
});

const dash = (n) => Array.from({ length: n }, () => '<td>--</td>').join('');
const table = (cols, rows, names) => `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
  Array.from({ length: rows }, (_, i) => `<tr><td>${names?.[i] ?? '--'}</td>${dash(cols.length - 1)}</tr>`).join('')}</tbody></table>`;
const news = (n) => Array.from({ length: n }, () => '<div class="news-line"><i>--:--</i><div class="skel"></div></div>').join('');
const chart = (msg) => `<div class="chart-wrap"><div class="chart-area"></div><div class="empty">${msg}</div></div>`;

// [num, title, hint, col start, col span, row start, row span, body]
const PANELS = [
  ['1', 'MONITOR  Watchlist', 'MON', 1, 3, 1, 3, table(['Ticker', 'Last', 'Chg', '%Chg', 'Vol'], 14, ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM'])],
  ['2', 'GP  Price Chart', 'GP', 4, 6, 1, 3, chart('NO DATA')],
  ['3', 'TOP  Top News', 'TOP', 10, 3, 1, 2, news(10)],
  ['4', 'WEI  World Equity Indices', 'WEI', 1, 3, 4, 3, table(['Index', 'Last', 'Chg', '%Chg'], 12, ['SPX', 'INDU', 'CCMP', 'RTY', 'UKX', 'DAX', 'CAC', 'NKY', 'HSI', 'SHCOMP', 'SENSEX', 'NIFTY'])],
  ['5', 'FXC  Currencies', 'FXC', 4, 3, 4, 3, table(['Pair', 'Bid', 'Ask', '%Chg'], 6, ['EURUSD', 'USDJPY', 'GBPUSD', 'USDCHF', 'AUDUSD', 'USDCAD'])],
  ['6', 'GC  Yield Curve', 'GC', 7, 3, 4, 3, chart('NO DATA')],
  ['7', 'ECO  Economic Calendar', 'ECO', 10, 3, 3, 2, table(['Event', 'Actual', 'Survey', 'Prior'], 8)],
  ['8', 'CMDTY  Commodities', 'CMDTY', 10, 3, 5, 2, table(['Name', 'Last', 'Chg', '%Chg', 'YTD%'], 5, ['CL1 Crude', 'CO1 Brent', 'NG1 Natgas', 'GC1 Gold', 'HG1 Copper'])],
];
$('grid').innerHTML = PANELS.map(([n, title, hint, c, cs, r, rs, body]) =>
  `<section class="panel" style="grid-column:${c}/span ${cs};grid-row:${r}/span ${rs}"><div class="ph"><b>${n}</b><h2>${title}</h2><span>${hint}</span></div><div class="pb">${body}</div></section>`).join('');

const tick = () => { const t = new Date().toLocaleTimeString([], { hour12: false }); $('clock').textContent = t; $('sbclock').textContent = t; };
tick(); setInterval(tick, 1000);
$('cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });

// ---- live data: one /api/snap call fills every panel ----
const KEYS = ['watchlist', 'indices', 'fx', 'cmdty', 'crypto'];
const fmt = (n, d = 2) => (n == null ? '--' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'dn' : '');
const sgn = (n, d = 2) => (n == null ? '--' : (n > 0 ? '+' : '') + fmt(n, d));
const vol = (v) => (v == null ? '--' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v);
const dec = (r) => (Math.abs(r.p) < 20 ? 4 : 2);

const COLS = {
  watchlist: (r) => [r.s, fmt(r.p), sgn(r.c), sgn(r.pc) + '%', vol(r.v)],
  indices: (r) => [r.n, fmt(r.p), sgn(r.c), sgn(r.pc) + '%'],
  fx: (r) => [r.n, fmt(r.p, 4), '--', sgn(r.pc) + '%'],
  cmdty: (r) => [r.n, fmt(r.p), sgn(r.c), sgn(r.pc) + '%', '--'],
};
const PANEL_OF = { watchlist: 1, indices: 4, fx: 5, cmdty: 8 };

function fillPanel(key, snap) {
  const body = document.querySelector(`.panel:nth-child(${PANEL_OF[key]}) tbody`);
  if (!body || !snap) return;
  body.innerHTML = snap.rows.map((r) => {
    const cells = COLS[key](r);
    return '<tr>' + cells.map((c, i) => `<td class="${i >= 2 && i <= 3 ? cls(r.c) : i === 1 ? 'px' : ''}">${c}</td>`).join('') + '</tr>';
  }).join('');
}

function fillTape(data) {
  const rows = ['indices', 'fx', 'cmdty', 'crypto'].flatMap((k) => data[k]?.rows ?? []);
  if (!rows.length) return;
  const t = rows.map((r) => `<span>${r.n.split(' ')[0]} ${fmt(r.p, dec(r))}<i class="${cls(r.c)}">${sgn(r.pc)}%</i></span>`).join('');
  $('tape-track').innerHTML = t + t;
}

async function refresh() {
  try {
    const data = await (await fetch(`/api/snap?keys=${KEYS.join(',')}`)).json();
    Object.keys(PANEL_OF).forEach((k) => fillPanel(k, data[k]));
    fillTape(data);
    const times = KEYS.map((k) => data[k]?.asOf).filter(Boolean).sort();
    const oldest = times[0];
    $('sbdata').textContent = oldest ? `Data as of ${new Date(oldest).toLocaleString()} (free sources, delayed)` : 'No snapshots yet. Run: npm run seed';
    const stale = oldest && Date.now() - new Date(oldest) > 36 * 3600e3;
    $('sbdata').classList.toggle('dn', Boolean(stale));
  } catch { $('sbdata').textContent = 'Data unavailable'; }
}
refresh(); setInterval(refresh, 60000);

// ---- chart panel: type a ticker in the command bar ----
const chartPanel = () => document.querySelector('.panel:nth-child(2)');
async function drawChart(sym) {
  const p = chartPanel();
  p.querySelector('h2').textContent = `GP  ${sym}`;
  const box = p.querySelector('.pb');
  box.innerHTML = '<canvas style="width:100%;height:100%"></canvas>';
  try {
    const d = await (await fetch(`/api/chart?s=${encodeURIComponent(sym)}&range=6mo`)).json();
    const closes = d.chart.result[0].indicators.quote[0].close.filter((x) => x != null);
    const c = box.querySelector('canvas'), r = c.getBoundingClientRect(), k = devicePixelRatio || 1;
    c.width = r.width * k; c.height = r.height * k;
    const g = c.getContext('2d'); g.scale(k, k);
    const W = r.width, H = r.height, lo = Math.min(...closes), hi = Math.max(...closes);
    g.strokeStyle = closes.at(-1) >= closes[0] ? '#2ecc71' : '#ff4d4d'; g.lineWidth = 1.5; g.beginPath();
    closes.forEach((v, i) => { const x = (i / (closes.length - 1)) * (W - 52), y = H - 12 - ((v - lo) / (hi - lo || 1)) * (H - 24); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke(); g.fillStyle = '#888'; g.font = '11px monospace';
    g.fillText(hi.toFixed(2), W - 50, 14); g.fillText(lo.toFixed(2), W - 50, H - 4);
  } catch { box.innerHTML = '<div class="chart-wrap"><div class="empty">NO DATA FOR ' + sym + '</div></div>'; }
}
$('go').addEventListener('click', () => {
  const sym = $('cmd').value.trim().toUpperCase().split(/\s+/)[0];
  $('cmd').value = '';
  if (sym && sym !== 'HELP') drawChart(sym);
});
