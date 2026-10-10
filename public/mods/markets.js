// Cross-asset monitors: CRYPTO, FXM, CMDTY2, SECT, FUT, VOL, ETF. Data from seeded groups crypto2, xasset, mkt2.
import { esc, fmt, cls, sgn, vol, hhmm, msg, registerCommand, registerWidget, openWidget, useSnap, loadCSS } from '../core.js';
loadCSS(new URL('./markets.css', import.meta.url));

const KEYS = ['crypto2', 'xasset', 'mkt2'];
let S = null;
const live = new Set();

const rowsOf = (key, g) => (S?.[key]?.rows ?? []).filter((r) => !g || r.g === g);
const pct = (v) => `<td class="${cls(v)}">${v == null ? '--' : sgn(v) + '%'}</td>`;
const money = (v) => (v == null ? '--' : v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : (v / 1e6).toFixed(1) + 'M');
const px = (v) => (v == null ? '--' : fmt(v, v < 1 ? 4 : 2));
const spark = (a, w = 80, h = 18) => {
  if (!a || a.length < 2) return '';
  const lo = Math.min(...a), hi = Math.max(...a), k = hi > lo ? h - 2 : 0;
  const pts = a.map((v, i) => `${((i / (a.length - 1)) * w).toFixed(1)},${(hi > lo ? h - 1 - ((v - lo) / (hi - lo)) * k : h / 2).toFixed(1)}`).join(' ');
  return `<svg class="mk-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${a.at(-1) >= a[0] ? '#2ecc71' : '#ff4d4d'}" stroke-width="1.2" points="${pts}"/></svg>`;
};
const asOf = (key) => (S?.[key]?.asOf ? `<span>as of ${esc(hhmm(S[key].asOf))}</span>` : '');

// Sortable table. cols: {h, v(r) sort value, f(r) cell html}. groups: [[title|null, rows]]
function table(cols, groups, st) {
  const c = cols[st.sort ?? 0] ?? cols[0], dir = st.dir ?? 1;
  const head = cols.map((x, i) => `<th data-sort="${i}"${i === (st.sort ?? 0) ? ' class="mk-on"' : ''}>${esc(x.h)}${i === (st.sort ?? 0) ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const body = groups.map(([t, rows]) => {
    const sorted = st.sort == null ? rows : [...rows].sort((a, b) => {
      const x = c.v(a), y = c.v(b);
      return (x == null) - (y == null) || (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
    return (t ? `<tr class="mk-sec"><td colspan="${cols.length}">${esc(t)}</td></tr>` : '') + sorted.map((r) => `<tr>${cols.map((x) => x.f(r)).join('')}</tr>`).join('');
  }).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// Register a widget plus its repaint hook. draw(rows-source, st) returns inner html.
function widget(id, title, hint, draw) {
  registerWidget(id, {
    title, hint,
    render(box) {
      const e = { box, st: {}, paint() {
        if (!S) box.innerHTML = msg('LOADING...');
        else box.innerHTML = draw(e.st) || msg('NO DATA YET: SEEDER PENDING');
      } };
      box.onclick = (ev) => {
        const t = ev.target.closest('[data-sort],[data-per]');
        if (!t) return;
        if (t.dataset.per) e.st.per = t.dataset.per;
        else { const i = +t.dataset.sort; e.st.dir = e.st.sort === i ? -(e.st.dir ?? 1) : (i === 0 ? 1 : -1); e.st.sort = i; }
        e.paint();
      };
      live.add(e);
      e.paint();
    },
  });
}
useSnap(KEYS, (d) => {
  S = d;
  for (const e of live) { if (e.box.isConnected) e.paint(); else live.delete(e); }
});
const cmd = (name, id, help) => registerCommand(name, { help, run: () => openWidget(id) });

// ---- CRYPTO ----
widget('crypto', 'CRYPTO  Top 30 by Market Cap', 'CRYPTO', (st) => {
  const rows = rowsOf('crypto2').map((r, i) => ({ ...r, i: i + 1 }));
  if (!rows.length) return '';
  const total = rows.reduce((a, r) => a + (r.mc || 0), 0);
  const cols = [
    { h: '#', v: (r) => r.i, f: (r) => `<td>${r.i}</td>` },
    { h: 'SYM', v: (r) => r.s, f: (r) => `<td>${esc(r.s)}</td>` },
    { h: 'NAME', v: (r) => r.n, f: (r) => `<td class="mk-l">${esc(r.n)}</td>` },
    { h: 'PRICE', v: (r) => r.p, f: (r) => `<td>${px(r.p)}</td>` },
    { h: '1H', v: (r) => r.c1h, f: (r) => pct(r.c1h) },
    { h: '24H', v: (r) => r.c24h, f: (r) => pct(r.c24h) },
    { h: '7D', v: (r) => r.c7d, f: (r) => pct(r.c7d) },
    { h: 'MKT CAP', v: (r) => r.mc, f: (r) => `<td>${money(r.mc)}</td>` },
    { h: 'VOL 24H', v: (r) => r.v, f: (r) => `<td>${money(r.v)}</td>` },
    { h: 'CHART', v: (r) => r.c24h, f: (r) => `<td>${spark(r.spark)}</td>` },
  ];
  return `<div class="mk"><div class="mk-hd"><b>TOP 30 MKT CAP $${esc(money(total))}</b>${asOf('crypto2')}</div>${table(cols, [[null, rows]], st)}</div>`;
});
cmd('CRYPTO', 'crypto', 'CRYPTO  top 30 crypto by market cap');
cmd('CCRV', 'crypto', 'CCRV  alias of CRYPTO');

// ---- FXM ----
const FXC = ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD'];
const FXS = { EUR: 'EURUSD=X', JPY: 'JPY=X', GBP: 'GBPUSD=X', CHF: 'CHF=X', AUD: 'AUDUSD=X', CAD: 'CAD=X', NZD: 'NZDUSD=X' };
widget('fxm', 'FXM  FX Cross Rates', 'FXM', () => {
  const fx = rowsOf('xasset', 'fx');
  const by = Object.fromEntries(fx.map((r) => [r.s, r]));
  // usd[c] = USD per 1 unit of c, now and one day ago
  const usd = { USD: [1, 1] }, inv = ['JPY', 'CHF', 'CAD'];
  for (const [c, s] of Object.entries(FXS)) {
    const r = by[s];
    if (!r || !r.p) continue;
    const prev = r.p / (1 + r.pc / 100);
    usd[c] = inv.includes(c) ? [1 / r.p, 1 / prev] : [r.p, prev];
  }
  if (Object.keys(usd).length < 2) return '';
  const cell = (a, b) => {
    if (a === b) return '<td class="mk-diag">--</td>';
    if (!usd[a] || !usd[b]) return '<td class="mk-cell">n/a</td>';
    const x = usd[a][0] / usd[b][0], ch = (x / (usd[a][1] / usd[b][1]) - 1) * 100;
    const al = Math.min(Math.abs(ch) / 1, 1) * 0.55;
    return `<td class="mk-cell" style="background:rgba(${ch >= 0 ? '46,204,113' : '255,77,77'},${al.toFixed(2)})" title="${esc(sgn(ch))}%">${fmt(x, x >= 100 ? 2 : x >= 10 ? 3 : 4)}</td>`;
  };
  const dx = by['DX-Y.NYB'];
  const head = `<tr><th></th>${FXC.map((c) => `<th>${c}</th>`).join('')}</tr>`;
  const body = FXC.map((a) => `<tr><td>${a}</td>${FXC.map((b) => cell(a, b)).join('')}</tr>`).join('');
  const dxy = dx ? `<div class="mk-hd"><b>DXY</b> ${fmt(dx.p)} <span class="${cls(dx.pc)}">${sgn(dx.pc)}%</span></div>` : '';
  return `<div class="mk mk-fx"><div class="mk-hd"><b>1 ROW CCY = X COLUMN CCY</b>${asOf('xasset')}</div><table><thead>${head}</thead><tbody>${body}</tbody></table>${dxy}<div class="mk-hd">Cell color = 1-day move of row currency vs column currency</div></div>`;
});
cmd('FXM', 'fxm', 'FXM  FX cross-rate matrix (8 majors)');

// ---- generic quote tables ----
const quoteCols = (withVol = true) => [
  { h: 'SYM', v: (r) => r.s, f: (r) => `<td>${esc(r.s)}</td>` },
  { h: 'NAME', v: (r) => r.n, f: (r) => `<td class="mk-l">${esc(r.n)}</td>` },
  { h: 'LAST', v: (r) => r.p, f: (r) => `<td>${fmt(r.p, r.p < 10 ? 3 : 2)}</td>` },
  { h: 'CHG', v: (r) => r.c, f: (r) => `<td class="${cls(r.c)}">${sgn(r.c, r.p < 10 ? 3 : 2)}</td>` },
  { h: '%CHG', v: (r) => r.pc, f: (r) => pct(r.pc) },
  ...(withVol ? [{ h: 'VOLUME', v: (r) => r.v, f: (r) => `<td>${r.v ? vol(r.v) : '--'}</td>` }] : []),
];

widget('cmdty2', 'CMDTY2  Commodities', 'CMDTY2', (st) => {
  const rows = rowsOf('mkt2', 'cm');
  if (!rows.length) return '';
  const groups = ['Energy', 'Metals', 'Agri'].map((k) => [k.toUpperCase(), rows.filter((r) => r.k === k)]).filter(([, a]) => a.length);
  return `<div class="mk"><div class="mk-hd"><b>COMMODITY FUTURES</b>${asOf('mkt2')}</div>${table(quoteCols(), groups, st)}</div>`;
});
cmd('CMDTY2', 'cmdty2', 'CMDTY2  energy, metals, agriculture futures');
cmd('CMDS', 'cmdty2', 'CMDS  alias of CMDTY2');

widget('futures', 'FUT  Index & Rate Futures', 'FUT', (st) => {
  const rows = rowsOf('xasset', 'fut');
  if (!rows.length) return '';
  return `<div class="mk"><div class="mk-hd"><b>INDEX & RATE FUTURES</b>${asOf('xasset')}</div>${table(quoteCols(), [['EQUITY INDEX', rows.filter((r) => /^(ES|NQ|YM|RTY)=/.test(r.s))], ['TREASURY', rows.filter((r) => /^Z[TFNB]=/.test(r.s))]].filter(([, a]) => a.length), st)}</div>`;
});
cmd('FUT', 'futures', 'FUT  index and Treasury futures');

widget('etf', 'ETF  Popular ETFs', 'ETF', (st) => {
  const rows = rowsOf('mkt2', 'etf');
  if (!rows.length) return '';
  return `<div class="mk"><div class="mk-hd"><b>ETF MONITOR</b>${asOf('mkt2')}</div>${table(quoteCols(), [[null, rows]], st)}</div>`;
});
cmd('ETF', 'etf', 'ETF  popular ETF monitor');

// ---- SECT ----
const PER = [['d1', '1D'], ['w1', '1W'], ['m1', '1M'], ['ytd', 'YTD']];
widget('sectors', 'SECT  US Sector Performance', 'SECT', (st) => {
  const rows = rowsOf('mkt2', 'sec');
  if (!rows.length) return '';
  const per = PER.some(([k]) => k === st.per) ? st.per : 'd1';
  const list = rows.filter((r) => r[per] != null).sort((a, b) => b[per] - a[per]);
  const max = Math.max(0.01, ...list.map((r) => Math.abs(r[per])));
  const btns = PER.map(([k, l]) => `<button class="mk-btn${k === per ? ' mk-on' : ''}" data-per="${k}">${l}</button>`).join(' ');
  const bars = list.map((r) => {
    const v = r[per], w = (Math.abs(v) / max) * 50;
    return `<div class="mk-bar"><span><b>${esc(r.s)}</b>${esc(r.n)}</span><em><i class="${cls(v) || 'up'}" style="width:${w.toFixed(1)}%;left:${(v >= 0 ? 50 : 50 - w).toFixed(1)}%"></i></em><u class="${cls(v)}">${sgn(v)}%</u></div>`;
  }).join('');
  return `<div class="mk"><div class="mk-hd">${btns}${asOf('mkt2')}</div><div class="mk-bars">${bars}</div></div>`;
});
cmd('SECT', 'sectors', 'SECT  US sector ETF performance (1D 1W 1M YTD)');

// ---- VOL ----
widget('vix', 'VOL  Volatility Dashboard', 'VOL', (st) => {
  const rows = rowsOf('xasset', 'vol');
  if (!rows.length) return '';
  const by = Object.fromEntries(rows.map((r) => [r.s, r]));
  const strip = ['^VIX9D', '^VIX', '^VIX3M', '^VIX6M'].filter((s) => by[s]);
  const a = by['^VIX9D'] ?? by['^VIX'], b = by['^VIX3M'] ?? by['^VIX6M'];
  const shape = a && b && a !== b ? (b.p >= a.p ? 'CONTANGO' : 'BACKWARDATION') : '';
  const cards = strip.map((s) => `<div><small>${esc(by[s].n)}</small><b>${fmt(by[s].p)}</b><small class="${cls(by[s].pc)}">${sgn(by[s].pc)}%</small></div>`).join('');
  const cols = [
    { h: 'SYM', v: (r) => r.s, f: (r) => `<td>${esc(r.s)}</td>` },
    { h: 'NAME', v: (r) => r.n, f: (r) => `<td class="mk-l">${esc(r.n)}</td>` },
    { h: 'LAST', v: (r) => r.p, f: (r) => `<td>${fmt(r.p)}</td>` },
    { h: 'CHG', v: (r) => r.c, f: (r) => `<td class="${cls(r.c)}">${sgn(r.c)}</td>` },
    { h: '%CHG', v: (r) => r.pc, f: (r) => pct(r.pc) },
    { h: '3M', v: (r) => r.pc, f: (r) => `<td>${spark(r.sp, 110, 20)}</td>` },
  ];
  return `<div class="mk"><div class="mk-hd"><b>VIX TERM STRUCTURE ${esc(shape)}</b>${asOf('xasset')}</div><div class="mk-strip">${cards}</div>${table(cols, [[null, rows]], st)}</div>`;
});
cmd('VOL', 'vix', 'VOL  volatility dashboard (VIX term, VVIX, SKEW, MOVE)');
