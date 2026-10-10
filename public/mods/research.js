// Research tools: ticker news (N), SEC filings (FIL), insider Form 4 (INSIDER), Sharia screen (HALAL), India dashboard (INDIA).
import { esc, fmt, cls, sgn, vol, msg, getJSON, registerCommand, registerWidget, openWidget, runCommand, useSnap, loadCSS } from '../core.js';
loadCSS(new URL('./research.css', import.meta.url));

const sym = (args) => (args[0] && /^[A-Z0-9.\-]{1,10}$/.test(args[0]) ? args[0] : null);
const link = (u, t) => (/^https?:\/\//i.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : esc(t));
const when = (iso) => { const d = new Date(iso), t = Date.now() - d; return t < 864e5 ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : iso.slice(5, 10); };
const money = (v) => (v == null ? '--' : Math.abs(v) >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : `${(v / 1e6).toFixed(1)}M`);
const pct = (v, d = 1) => (v == null ? '--' : `${(v * 100).toFixed(d)}%`);

// Shared fetch-and-render with loading, empty and error states. `draw(data)` returns html or '' for empty.
async function load(box, url, empty, draw) {
  box.innerHTML = msg('LOADING...');
  try {
    const d = await getJSON(url);
    if (!box.isConnected) return;
    const html = draw(d);
    box.innerHTML = html || msg(empty);
  } catch (e) {
    if (box.isConnected) box.innerHTML = msg(e.status === 404 ? empty : `UNAVAILABLE (${e.message})`);
  }
}
const usage = (box, t) => { box.innerHTML = msg(t); };

// ---- N: ticker news ----
registerWidget('nws', {
  title: (a) => `N  News ${a[0] ?? ''}`, hint: 'AAPL N',
  render(box, args) {
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL N');
    load(box, `/api/data?fn=news&s=${encodeURIComponent(s)}`, `NO NEWS FOR ${s}`, (d) => d.rows?.length
      ? `<table class="research-tbl research-news"><tbody>${d.rows.map((r) => `<tr><td class="research-t">${esc(when(r.ts))}</td><td class="research-src">${esc(r.s)}</td><td class="research-l">${link(r.u, r.t)}</td></tr>`).join('')}</tbody></table>` : '');
  },
});
const news = (a) => openWidget('nws', a);
registerCommand('N', { help: 'AAPL N  ticker news', run: news });
registerCommand('CN', { help: 'AAPL CN  ticker news', run: news });

// ---- FIL: SEC filings with form filter ----
const FORMS = ['ALL', '10-K', '10-Q', '8-K', 'DEF 14A', 'S-1', '13F-HR', '4', 'SC 13D/G'];
const formMatch = (f, form) => form === 'ALL' || (form === 'SC 13D/G' ? /^(SC )?(SCHEDULE )?13[DG]/.test(f) : form === '4' ? /^4(\/A)?$/.test(f) : f === form || f.startsWith(`${form}/`));
registerWidget('fil', {
  title: (a) => `FIL  Filings ${a[0] ?? ''}`, hint: 'AAPL FIL',
  render(box, args) {
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL FIL');
    let rows = [], form = 'ALL';
    const draw = () => {
      const list = rows.filter((r) => formMatch(r.form, form));
      box.innerHTML = `<div class="research-bar">${FORMS.map((f) => `<button data-f="${esc(f)}" class="${f === form ? 'on' : ''}">${esc(f)}</button>`).join('')}</div>`
        + (list.length ? `<table class="research-tbl"><thead><tr><th>Filed</th><th>Form</th><th>Period</th><th>Description</th></tr></thead><tbody>${list.map((r) =>
          `<tr><td class="research-t">${esc(r.date)}</td><td class="research-form">${link(r.url, r.form)}</td><td class="research-t">${esc(r.period ?? '')}</td><td class="research-l">${esc([r.desc, r.items && `items ${r.items}`].filter(Boolean).join('  '))}</td></tr>`).join('')}</tbody></table>`
          : msg(`NO ${form} FILINGS`));
    };
    box.onclick = (e) => { const f = e.target.dataset?.f; if (f) { form = f; draw(); } };
    load(box, `/api/data?fn=filings&s=${encodeURIComponent(s)}`, `NO FILINGS FOR ${s}`, (d) => { rows = d.rows ?? []; if (!rows.length) return ''; draw(); return box.innerHTML; });
  },
});
registerCommand('FIL', { help: 'AAPL FIL  SEC filings', run: (a) => openWidget('fil', a) });

// ---- INSIDER: Form 4 transactions ----
const CODES = { P: 'Buy', S: 'Sell', A: 'Grant', M: 'Exercise', F: 'Tax withheld', G: 'Gift', D: 'Disposed', C: 'Convert', X: 'Exercise', J: 'Other' };
registerWidget('insider', {
  title: (a) => `INSIDER  Form 4 ${a[0] ?? ''}`, hint: 'AAPL INSIDER',
  render(box, args) {
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL INSIDER');
    box.innerHTML = msg('LOADING... (reads up to 15 Form 4 filings, takes a few seconds)');
    const tx = (r) => (r.code
      ? `<td class="${r.ad === 'A' ? 'up' : r.ad === 'D' ? 'dn' : ''}">${esc(r.code)} ${esc(CODES[r.code] ?? '')}</td><td>${r.shares == null ? '--' : fmt(r.shares, 0)}</td><td>${r.price == null ? '--' : fmt(r.price)}</td><td class="research-t">${esc(r.date ?? '')}</td>`
      : '<td colspan="4" class="research-t">not parsed, open filing</td>');
    const row = (r) => `<tr><td class="research-t">${link(r.url, r.filed)}</td><td class="research-l">${esc(r.owner ?? '--')}</td><td class="research-l">${esc(r.role ?? '')}</td>${tx(r)}</tr>`;
    load(box, `/api/data?fn=filings&view=insider&s=${encodeURIComponent(s)}`, `NO FORM 4 FILINGS FOR ${s}`, (d) => (!d.rows?.length ? '' :
      `<table class="research-tbl"><thead><tr><th>Filed</th><th>Owner</th><th>Role</th><th>Code</th><th>Shares</th><th>Price</th><th>Trade date</th></tr></thead><tbody>${d.rows.map(row).join('')}</tbody></table>`
      + `<div class="research-note">${d.parsed}/${d.filings} Form 4 filings parsed. Codes: P buy, S sell, A grant, M option exercise, F tax withholding. Price blank when reported only in a footnote.</div>`));
  },
});
registerCommand('INSIDER', { help: 'AAPL INSIDER  Form 4 insider transactions', run: (a) => openWidget('insider', a) });

// ---- HALAL: Sharia screen ----
const ST = { PASS: 'up', FAIL: 'dn', REVIEW: 'research-rev' };
const badge = (s) => `<span class="research-badge ${ST[s] ?? ''}">${esc(s)}</span>`;
function halalCard(d) {
  const i = d.inputs;
  const tests = d.tests.map((t) => `<tr><td class="research-l">${esc(t.label)}${t.approx ? ' <i>(approx.)</i>' : ''}</td><td>${pct(t.ratio, 2)}</td><td>&lt; ${pct(t.max, 0)}</td><td>${badge(t.status)}</td></tr>`).join('');
  return `<div class="research-card">
    <div class="research-head"><b>${esc(d.s)}</b> ${esc(d.name ?? '')} ${badge(d.overall)}</div>
    <div class="research-warn">${esc(d.disclaimer)}</div>
    <div class="research-bar">${Object.entries(d.rulesets).map(([k, v]) => `<button data-r="${esc(k)}" class="${k === d.ruleset ? 'on' : ''}">${esc(v)}</button>`).join('')}</div>
    <table class="research-tbl"><thead><tr><th>Test</th><th>Ratio</th><th>Limit</th><th>Result</th></tr></thead><tbody>
      <tr><td class="research-l">Business activity (SIC ${esc(d.sic ?? '--')} ${esc(d.industry ?? '')})</td><td colspan="2" class="research-l">${esc(d.business.reasons.join('; ') || 'no flags')}</td><td>${badge(d.business.status)}</td></tr>${tests}</tbody></table>
    <div class="research-note">${esc(d.business.heuristic)}</div>
    <div class="research-note">Purification estimate: ${d.purification == null ? 'n/a (interest income not reported)' : `${d.purification.toFixed(2)}% of dividends (interest income / revenue, approximate)`}</div>
    <div class="research-note">Inputs (FY ending ${esc(d.fiscalEnd)}): market cap ${money(i.mcap)} (${fmt(d.shares, 0)} sh x ${fmt(d.price)}; ${esc(d.sharesSrc ?? '')}), total assets ${money(i.assets)}, debt ${money(i.debt)}, cash + securities ${money(i.cash)}, receivables ${money(i.recv)}, interest income ${money(i.interest)}, revenue ${money(i.revenue)}.</div>
    <div class="research-note">${esc(d.rulesNote)}</div></div>`;
}

const SCAN = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM'];
const cacheKey = (s) => `research.halal.${s}`;
const cached = (s) => { try { return JSON.parse(sessionStorage.getItem(cacheKey(s))); } catch { return null; } };
const fetchHalal = async (s) => {
  const c = cached(s);
  if (c) return c;
  const d = await getJSON(`/api/data?fn=halal&s=${encodeURIComponent(s)}`);
  try { sessionStorage.setItem(cacheKey(s), JSON.stringify(d)); } catch { /* storage full or blocked */ }
  return d;
};
const scanRow = (s, d) => d
  ? `<tr><td class="research-sym" data-s="${esc(s)}">${esc(s)}</td><td>${badge(d.overall)}</td><td>${badge(d.business.status)}</td>${d.tests.map((t) => `<td>${pct(t.ratio, 1)} ${badge(t.status)}</td>`).join('')}<td>${d.purification == null ? '--' : `${d.purification.toFixed(2)}%`}</td></tr>`
  : `<tr><td class="research-sym" data-s="${esc(s)}">${esc(s)}</td><td colspan="7" class="research-t">unavailable</td></tr>`;

async function scan(box) {
  box.innerHTML = msg('SCANNING 8 NAMES (2 at a time)...');
  const res = new Map();
  const queue = [...SCAN];
  const worker = async () => { for (let s; (s = queue.shift());) { try { res.set(s, await fetchHalal(s)); } catch { res.set(s, null); } } };
  await Promise.all([worker(), worker()]);
  if (!box.isConnected) return;
  box.innerHTML = `<div class="research-card"><div class="research-warn">${esc('Screening aid only, not religious advice or a fatwa. S&P Shariah style rules, SEC filings, approximations.')}</div>
    <table class="research-tbl"><thead><tr><th>Ticker</th><th>Overall</th><th>Business</th><th>Debt / mcap</th><th>Cash / mcap</th><th>Recv / mcap</th><th>Interest / rev</th><th>Purif.</th></tr></thead><tbody>${SCAN.map((s) => scanRow(s, res.get(s))).join('')}</tbody></table></div>`;
}

registerWidget('halal', {
  title: (a) => (a[0] === 'SCAN' ? 'HALAL  Scan' : `HALAL  ${a[0] ?? ''}`), hint: 'AAPL HALAL',
  render(box, args) {
    box.onclick = (e) => { const s = e.target.dataset?.s; if (s) runCommand(`${s} HALAL`); };
    if (args[0] === 'SCAN') return scan(box);
    const s = sym(args);
    if (!s) return usage(box, 'USAGE: AAPL HALAL  or  HALAL SCAN');
    const go = (rules) => load(box, `/api/data?fn=halal&s=${encodeURIComponent(s)}${rules ? `&rules=${encodeURIComponent(rules)}` : ''}`, `NO SEC 10-K DATA FOR ${s} (US filers only)`, halalCard);
    box.onclick = (e) => { const r = e.target.dataset?.r; if (r) go(r); };
    go();
  },
});
registerCommand('HALAL', { help: 'AAPL HALAL  Sharia screen  |  HALAL SCAN  home watchlist', run: (a) => openWidget('halal', a) });

// ---- INDIA / NSE dashboard ----
const wait = (t) => `<div class="chart-wrap research-wait"><div class="empty">${esc(t)}</div></div>`;
let india = null, sortKey = 'pc', sortDir = -1, live = null;
const MAJOR = ['^NSEI', '^NSEBANK', '^BSESN', '^CNXIT', '^INDIAVIX', 'INR=X'];
const short = (s) => s.replace('.NS', '');
const tick = (r) => `<span class="research-sym" data-s="${esc(r.s)}">${esc(short(r.s))}</span>`;
function drawIndia(box) {
  if (!india) return;
  const idx = MAJOR.map((s) => india.find((r) => r.s === s)).filter(Boolean);
  const st = india.filter((r) => !r.k);
  const byPc = [...st].sort((a, b) => b.pc - a.pc);
  const mini = (list) => list.map((r) => `<tr><td>${tick(r)}</td><td class="research-l">${esc(r.n)}</td><td>${fmt(r.p)}</td><td class="${cls(r.pc)}">${sgn(r.pc)}%</td></tr>`).join('');
  const secs = {};
  for (const r of st) (secs[r.sec] ??= []).push(r);
  const sec = Object.entries(secs).map(([k, v]) => [k, v.reduce((a, r) => a + r.pc, 0) / v.length, v.length]).sort((a, b) => b[1] - a[1]);
  const cols = [['s', 'Ticker'], ['n', 'Name'], ['sec', 'Sector'], ['p', 'Last'], ['pc', '%Chg'], ['v', 'Vol']];
  const rows = [...st].sort((a, b) => (typeof a[sortKey] === 'string' ? a[sortKey].localeCompare(b[sortKey]) : (a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)) * sortDir);
  box.innerHTML = `<div class="research-strip">${idx.map((r) => `<div><span>${esc(r.n)}</span><b>${fmt(r.p)}</b><i class="${cls(r.pc)}">${sgn(r.pc)}%</i></div>`).join('')}</div>
    <div class="research-two"><table class="research-tbl"><caption>TOP GAINERS</caption><tbody>${mini(byPc.slice(0, 5))}</tbody></table>
    <table class="research-tbl"><caption>TOP LOSERS</caption><tbody>${mini(byPc.slice(-5).reverse())}</tbody></table></div>
    <table class="research-tbl"><caption>SECTORS (avg %chg)</caption><tbody>${sec.map(([k, v, n]) => `<tr><td class="research-l">${esc(k)} (${n})</td><td class="${cls(v)}">${sgn(v)}%</td></tr>`).join('')}</tbody></table>
    <table class="research-tbl"><caption>NIFTY 50</caption><thead><tr>${cols.map(([k, t]) => `<th data-k="${k}" class="research-sort">${esc(t)}${k === sortKey ? (sortDir > 0 ? ' ^' : ' v') : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${tick(r)}</td><td class="research-l">${esc(r.n)}</td><td class="research-l">${esc(r.sec)}</td><td>${fmt(r.p)}</td><td class="${cls(r.pc)}">${sgn(r.pc)}%</td><td>${vol(r.v)}</td></tr>`).join('')}</tbody></table>`;
}
registerWidget('india', {
  title: 'INDIA  Nifty 50 / NSE', hint: 'INDIA',
  render(box) {
    live = box;
    box.onclick = (e) => {
      const k = e.target.dataset?.k, s = e.target.dataset?.s;
      if (k) { sortDir = k === sortKey ? -sortDir : (k === 's' || k === 'n' || k === 'sec' ? 1 : -1); sortKey = k; drawIndia(box); }
      else if (s) runCommand(s);
    };
    if (india) drawIndia(box); else box.innerHTML = wait('LOADING... (snapshot refreshes every 30 min on weekdays)');
  },
});
useSnap(['india'], (d) => {
  india = d.india?.rows?.length ? d.india.rows : null;
  if (live?.isConnected && live.querySelector('.research-strip, .research-wait')) { if (india) drawIndia(live); else live.innerHTML = wait('NO INDIA DATA YET, SEED PENDING'); }
});
const openIndia = () => openWidget('india');
registerCommand('INDIA', { help: 'INDIA  Nifty 50 dashboard', run: openIndia });
registerCommand('NSE', { help: 'NSE  Nifty 50 dashboard', run: openIndia });
