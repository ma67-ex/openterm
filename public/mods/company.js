// CO company profile + key stats + peers, DVD dividends, SPLT splits, VAL valuation snapshot.
import { esc, fmt, cls, sgn, msg, getJSON, canvas, registerCommand, registerWidget, openWidget, runCommand, loadCSS } from '../core.js';
loadCSS(new URL('./company.css', import.meta.url));

const sym = (args) => (args[0] && /^[A-Z0-9.\-]{1,10}$/.test(args[0]) ? args[0] : null);
const money = (v) => (v == null ? '--' : `${v < 0 ? '-' : ''}${Math.abs(v) >= 1e12 ? `${(Math.abs(v) / 1e12).toFixed(2)}T` : Math.abs(v) >= 1e9 ? `${(Math.abs(v) / 1e9).toFixed(2)}B` : `${(Math.abs(v) / 1e6).toFixed(1)}M`}`);
const pct = (v, d = 1) => (v == null ? '--' : `${(v * 100).toFixed(d)}%`);
const x = (v) => (v == null ? '--' : `${fmt(v, 2)}x`);
const usd = (v) => (v == null ? '--' : fmt(v, 2));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fye = (s) => (s && s.length === 4 ? `${MONTHS[+s.slice(0, 2) - 1] ?? ''} ${+s.slice(2)}` : '--');

// fetch with a short in-memory cache so CO, VAL and DVD do not refetch the same ticker
const memo = new Map();
function cached(url) {
  const m = memo.get(url);
  if (m && Date.now() - m.t < 300000) return m.p;
  const p = getJSON(url);
  memo.set(url, { t: Date.now(), p });
  p.catch(() => memo.delete(url));
  return p;
}
const KEYS = ['universe', 'universe2', 'universe3', 'universe4', 'universe5'];
let uni = null;
async function universe() {
  if (uni && Date.now() - uni.t < 300000) return uni.rows;
  try {
    const d = await getJSON(`/api/snap?keys=${KEYS.join(',')}`);
    const rows = KEYS.flatMap((k) => d[k]?.rows ?? []);
    if (rows.length) uni = { t: Date.now(), rows };
  } catch { /* peers are optional */ }
  return uni?.rows ?? [];
}

async function load(box, url, empty, draw) {
  box.innerHTML = msg('LOADING...');
  try {
    const d = await cached(url);
    if (!box.isConnected) return;
    const html = await draw(d);
    if (!box.isConnected) return;
    box.innerHTML = html || msg(empty);
  } catch (e) {
    if (box.isConnected) box.innerHTML = msg(e.status === 404 ? empty : `UNAVAILABLE (${e.message})`);
  }
}
const wireSyms = (box) => { box.onclick = (e) => { const s = e.target.closest?.('[data-s]')?.dataset.s; if (s && /^[A-Z0-9.\-]{1,10}$/.test(s)) runCommand(`GP ${s}`); }; };
const usage = (box, t) => { box.innerHTML = msg(t); };

// ---- CO ----
const GROUPS = [
  ['VALUATION', [['Market cap', 'mcap', money], ['Enterprise value', 'ev', money], ['P/E (diluted)', 'pe', x], ['P/B', 'pb', x], ['EV / revenue', 'evRev', x]]],
  ['PROFITABILITY', [['Revenue', 'revenue', money], ['Revenue growth', 'revGrowth', pct], ['Net income', 'netIncome', money], ['Net margin', 'netMargin', pct], ['ROE', 'roe', pct], ['Free cash flow', 'fcf', money]]],
  ['BALANCE SHEET', [['Cash + ST investments', 'cash', money], ['Debt', 'debt', money], ["Stockholders' equity", 'equity', money], ['Debt / equity', 'debtEquity', x]]],
  ['PER SHARE', [['EPS diluted', 'eps', usd], ['Book value / share', 'bvps', usd], ['Dividend / share (12m)', 'dps', usd], ['Dividend yield', 'yield', (v) => pct(v, 2)], ['Payout ratio', 'payout', pct]]],
];
const statRow = (st, [label, key, f]) => {
  const s = st[key] ?? {};
  return `<tr title="${esc(s.note ?? '')}"><td class="co-l">${esc(label)}</td><td>${f(s.v)}</td><td class="co-asof">${esc(s.asOf ?? '')}</td></tr>`;
};

function profileCard(d) {
  const p = d.profile, pr = d.price, sh = d.shares;
  const range = pr?.lo52 != null && pr?.hi52 != null ? `${fmt(pr.lo52)} - ${fmt(pr.hi52)}` : '--';
  const kv = [['Industry (SIC)', p.industry ? `${p.industry} (${p.sic})` : null], ['Exchange', p.exchange], ['State of inc.', p.state], ['Fiscal year end', fye(p.fye)], ['CIK', d.cik],
    ['Website', p.website], ['Employees', p.employees == null ? null : fmt(p.employees, 0)], ['Shares out', sh ? `${money(sh.n)} (${sh.asOf})` : null]];
  const site = (v) => (/^https?:\/\//i.test(v ?? '') ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v));
  return `<div class="co-card"><div class="co-head"><b>${esc(d.s)}</b> ${esc(d.name)}
    <span class="co-px">${pr?.last == null ? '--' : fmt(pr.last)} ${esc(pr?.currency ?? '')}</span> <span class="co-asof">52w ${range}${pr?.asOf ? `, as of ${esc(pr.asOf)}` : ''}</span></div>
    <table class="co-tbl co-kv"><tbody>${kv.map(([k, v]) => `<tr><td class="co-l">${esc(k)}</td><td class="co-l">${k === 'Website' ? site(v) : esc(v ?? '--')}</td></tr>`).join('')}</tbody></table>
    ${d.notes ? `<div class="co-note">${esc(d.notes)}</div>` : ''}
    <div class="co-grid">${GROUPS.map(([t, rows]) => `<table class="co-tbl"><caption>${t}</caption><tbody>${rows.map((r) => statRow(d.stats, r)).join('')}</tbody></table>`).join('')}</div>
    <div class="co-note">Sources: SEC EDGAR company facts (TTM = latest fiscal year plus current year-to-date minus prior-year year-to-date; falls back to the latest fiscal year), Yahoo chart for price and dividends. Hover a value for its definition. Market cap uses cover-page shares, so multi-class issuers can differ from vendor figures.</div></div>`;
}

function peerTable(me, rows) {
  const peers = rows.filter((r) => r.sec === me.sec && r.s !== me.s).sort((a, b) => (b.av ?? 0) * b.p - (a.av ?? 0) * a.p).slice(0, 10);
  if (!peers.length) return '';
  const tr = (r, self) => `<tr${self ? ' class="co-self"' : ''}><td class="co-l"><span class="co-sym" data-s="${esc(r.s)}">${esc(r.s)}</span></td><td class="co-l">${esc(r.n)}</td><td>${fmt(r.p)}</td><td class="${cls(r.pc)}">${sgn(r.pc)}%</td><td class="${cls(r.m1)}">${r.m1 == null ? '--' : `${sgn(r.m1)}%`}</td><td class="${cls(r.ytd)}">${r.ytd == null ? '--' : `${sgn(r.ytd)}%`}</td></tr>`;
  return `<table class="co-tbl"><caption>PEERS: ${esc(me.sec)} (S&amp;P 500 universe, by dollar volume)</caption><thead><tr><th class="co-l">Ticker</th><th class="co-l">Name</th><th>Last</th><th>%Chg</th><th>1M</th><th>YTD</th></tr></thead><tbody>${tr(me, true)}${peers.map((r) => tr(r)).join('')}</tbody></table>`;
}

registerWidget('co', {
  title: (a) => `CO  Company ${a[0] ?? ''}`, hint: 'AAPL CO',
  render(box, args) {
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL CO');
    wireSyms(box);
    load(box, `/api/data?fn=company&s=${encodeURIComponent(s)}`, `NO SEC DATA FOR ${s} (US filers only)`, async (d) => {
      const all = await universe(), me = all.find((r) => r.s === s);
      return profileCard(d) + (me ? peerTable(me, all) : '');
    });
  },
});
const co = (a) => openWidget('co', a);
registerCommand('CO', { help: 'AAPL CO  company profile, key stats, peers', run: co });
registerCommand('PROFILE', { help: 'AAPL PROFILE  alias of CO', run: co });

// ---- DVD / SPLT ----
const splitTable = (d) => (d.splits?.length
  ? `<table class="co-tbl"><caption>SPLITS</caption><thead><tr><th class="co-l">Date</th><th>Ratio (new:old)</th></tr></thead><tbody>${[...d.splits].reverse().map((r) => `<tr><td class="co-l">${esc(r.date)}</td><td>${esc(r.ratio)}</td></tr>`).join('')}</tbody></table>`
  : '<div class="co-note">No stock splits on record.</div>');

function drawBars(box, annual) {
  const { g, W, H } = canvas(box);
  const cs = getComputedStyle(document.documentElement);
  const col = cs.getPropertyValue('--amber').trim() || '#ffb000', mute = cs.getPropertyValue('--mute').trim() || '#888';
  const rows = annual.slice(-25), max = Math.max(...rows.map((r) => r.total)), padB = 16, padT = 12, bw = W / rows.length;
  g.font = '10px monospace'; g.textAlign = 'center';
  rows.forEach((r, i) => {
    const h = max ? ((H - padB - padT) * r.total) / max : 0;
    g.globalAlpha = r.partial ? 0.45 : 1;
    g.fillStyle = col; g.fillRect(i * bw + 2, H - padB - h, Math.max(bw - 4, 1), h);
    g.globalAlpha = 1; g.fillStyle = mute;
    if (rows.length <= 14 || i % 2 === 0) g.fillText(String(r.year).slice(rows.length > 14 ? 2 : 0), i * bw + bw / 2, H - 3);
    if (rows.length <= 14) g.fillText(r.total.toFixed(2), i * bw + bw / 2, H - padB - h - 3);
  });
}

function dvdHtml(box, d) {
  const none = !d.rows.length;
  const html = `<div class="co-card"><div class="co-head"><b>${esc(d.s)}</b> dividends <span class="co-asof">${esc(d.currency ?? '')}</span></div>
    ${none ? '<div class="co-note">No dividends on record for this ticker.</div>' : `<div class="co-strip">
      <div><span>12m dividend</span><b>${usd(d.ttm)}</b></div><div><span>Yield</span><b>${pct(d.yield, 2)}</b></div>
      <div><span>Increase streak</span><b>${d.streak} yr</b></div><div><span>5y CAGR${d.cagrYears ? ` ${d.cagrYears[0]}-${d.cagrYears[1]}` : ''}</span><b>${pct(d.cagr5, 1)}</b></div></div>
    <div class="co-chart"></div>
    <div class="co-two"><table class="co-tbl"><caption>HISTORY (newest first)</caption><thead><tr><th class="co-l">Date</th><th>Amount</th></tr></thead><tbody>${[...d.rows].reverse().slice(0, 60).map((r) => `<tr><td class="co-l">${esc(r.date)}</td><td>${fmt(r.amount, 4)}</td></tr>`).join('')}</tbody></table>
    <table class="co-tbl"><caption>ANNUAL TOTALS</caption><thead><tr><th class="co-l">Year</th><th>Total</th></tr></thead><tbody>${[...d.annual].reverse().map((r) => `<tr><td class="co-l">${r.year}${r.partial ? ' (partial)' : ''}</td><td>${fmt(r.total, 4)}</td></tr>`).join('')}</tbody></table></div>`}
    ${splitTable(d)}<div class="co-note">${esc(d.note)} Source: Yahoo chart (unofficial).</div></div>`;
  if (d.annual.length) requestAnimationFrame(() => { const c = box.querySelector('.co-chart'); if (c) drawBars(c, d.annual); });
  return html;
}

registerWidget('dvd', {
  title: (a) => `DVD  Dividends ${a[0] ?? ''}`, hint: 'AAPL DVD',
  render(box, args) {
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL DVD');
    load(box, `/api/data?fn=dividends&s=${encodeURIComponent(s)}`, `NO PRICE HISTORY FOR ${s}`, (d) => dvdHtml(box, d));
  },
});
registerCommand('DVD', { help: 'AAPL DVD  dividend history, yield, streak, splits', run: (a) => openWidget('dvd', a) });

registerWidget('splt', {
  title: (a) => `SPLT  Splits ${a[0] ?? ''}`, hint: 'AAPL SPLT',
  render(box, args) {
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL SPLT');
    load(box, `/api/data?fn=dividends&s=${encodeURIComponent(s)}`, `NO PRICE HISTORY FOR ${s}`, (d) => `<div class="co-card"><div class="co-head"><b>${esc(d.s)}</b> splits</div>${splitTable(d)}</div>`);
  },
});
registerCommand('SPLT', { help: 'AAPL SPLT  stock split history', run: (a) => openWidget('splt', a) });

// ---- VAL ----
const median = (xs) => { const v = xs.filter((n) => n != null && Number.isFinite(n)).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const fromHigh = (r) => (r.h52 ? ((r.p - r.h52) / r.h52) * 100 : null);
const MOM = [['% from 52w high', fromHigh], ['1M change %', (r) => r.m1], ['YTD change %', (r) => r.ytd], ['Day change %', (r) => r.pc]];

registerWidget('val', {
  title: (a) => `VAL  Valuation ${a[0] ?? ''}`, hint: 'AAPL VAL',
  render(box, args) {
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL VAL');
    load(box, `/api/data?fn=company&s=${encodeURIComponent(s)}`, `NO SEC DATA FOR ${s} (US filers only)`, async (d) => {
      const all = await universe(), me = all.find((r) => r.s === s);
      const peers = me ? all.filter((r) => r.sec === me.sec && r.s !== s) : [];
      const st = d.stats;
      const own = [['P/E (diluted)', 'pe', x], ['P/B', 'pb', x], ['EV / revenue', 'evRev', x]].map(([l, k, f]) => `<tr title="${esc(st[k].note)}"><td class="co-l">${l}</td><td>${f(st[k].v)}</td><td class="co-asof">${esc(st[k].asOf ?? '')}</td></tr>`).join('');
      const mom = me ? MOM.map(([l, f]) => { const a = f(me), m = median(peers.map(f)); return `<tr><td class="co-l">${l}</td><td class="${cls(a)}">${a == null ? '--' : sgn(a)}</td><td class="${cls(m)}">${m == null ? '--' : sgn(m)}</td><td>${a == null || m == null ? '--' : sgn(a - m)}</td></tr>`; }).join('') : '';
      return `<div class="co-card"><div class="co-head"><b>${esc(d.s)}</b> ${esc(d.name)} <span class="co-px">${d.price?.last == null ? '--' : fmt(d.price.last)}</span></div>
        <table class="co-tbl"><caption>OWN MULTIPLES</caption><tbody>${own}</tbody></table>
        ${me ? `<table class="co-tbl"><caption>VS SECTOR: ${esc(me.sec)} (median of ${peers.length} S&amp;P 500 peers)</caption><thead><tr><th class="co-l">Metric</th><th>${esc(s)}</th><th>Sector median</th><th>Diff</th></tr></thead><tbody>${mom}</tbody></table>`
          : '<div class="co-note">Not in the S&amp;P 500 universe snapshot, no sector comparison.</div>'}
        <div class="co-note">Sector comparison uses price momentum only. Fundamentals comparison (P/E, P/B vs sector) needs paid data, so the multiples above are the ticker's own and are not ranked against peers.</div></div>`;
    });
  },
});
registerCommand('VAL', { help: 'AAPL VAL  valuation snapshot vs sector momentum', run: (a) => openWidget('val', a) });
