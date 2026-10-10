// UI skeleton only: no data is fetched yet. Panels render empty placeholder rows.
const $ = (id) => document.getElementById(id);

const FKEYS = ['HELP', 'PANEL', 'MONITOR', 'NEWS', 'EQUITY', 'CORP', 'GOVT', 'CMDTY', 'CURNCY', 'MTGE', 'INDX', 'MENU'];
$('fkeys').innerHTML = FKEYS.map((k, i) => `<button class="${i % 2 ? 'alt' : ''}">F${i + 1} ${k}</button>`).join('');

const TAPE = ['SPX', 'INDU', 'CCMP', 'UKX', 'DAX', 'NKY', 'HSI', 'SHCOMP', 'SENSEX', 'EURUSD', 'USDJPY', 'GBPUSD', 'XAU', 'CL1', 'BTC', 'US10Y', 'VIX'];
const tape = TAPE.map((s) => `<span>${s}<i>--</i></span>`).join('');
$('tape-track').innerHTML = tape + tape;

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
$('go').addEventListener('click', () => { $('cmd').value = ''; $('cmd').focus(); });
$('cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
