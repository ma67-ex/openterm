// FA and DES views, rendered into the center chart panel from /api/fundamentals (SEC EDGAR).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const panel = () => document.querySelector('.panel:nth-child(2)');

function open(title, html) {
  const p = panel();
  p.querySelector('h2').textContent = title;
  p.querySelector('.pb').innerHTML = html;
}
const msg = (t) => `<div class="chart-wrap"><div class="empty">${esc(t)}</div></div>`;

async function load(sym, view) {
  const r = await fetch(`/api/fundamentals?s=${encodeURIComponent(sym)}&view=${view}`);
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

function money(v) {
  if (v == null) return '--';
  const a = Math.abs(v), s = a >= 1e9 ? `${(a / 1e9).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`
    : `${(a / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  return v < 0 ? `(${s})` : s;
}
const pct = (v) => (v == null ? '--' : `${(v * 100).toFixed(1)}%`);
const num = (v) => (v == null ? '--' : v.toFixed(2));
const eps = (v) => (v == null ? '--' : v < 0 ? `(${Math.abs(v).toFixed(2)})` : v.toFixed(2));

const SECTIONS = [
  ['INCOME STATEMENT', [['Revenue', 'revenue', money], ['Cost of revenue', 'cogs', money], ['Gross profit', 'grossProfit', money], ['R&D', 'rnd', money],
    ['Operating income', 'operatingIncome', money], ['Net income', 'netIncome', money], ['EPS diluted', 'eps', eps]]],
  ['BALANCE SHEET', [['Total assets', 'assets', money], ['Total liabilities', 'liabilities', money], ["Shareholders' equity", 'equity', money],
    ['Cash & equivalents', 'cash', money], ['Long-term debt', 'debt', money]]],
  ['CASH FLOW', [['Operating cash flow', 'cfo', money], ['Capex', 'capex', money], ['Free cash flow', 'fcf', money]]],
  ['KEY RATIOS', [['Gross margin', 'grossMargin', pct], ['Operating margin', 'opMargin', pct], ['Net margin', 'netMargin', pct], ['ROE', 'roe', pct],
    ['Debt / equity', 'debtToEquity', num], ['Revenue growth YoY', 'revGrowth', pct], ['FCF margin', 'fcfMargin', pct]]],
];

function faTable(d) {
  const n = d.periods.length;
  const head = `<tr><th>USD</th>${d.periods.map((p) => `<th>FY ${esc(p.slice(0, 7))}</th>`).join('')}</tr>`;
  const body = SECTIONS.map(([t, lines]) => `<tr class="fa-sec"><td colspan="${n + 1}">${t}</td></tr>` + lines.map(([label, key, f]) =>
    `<tr><td>${label}</td>${d.rows[key].map((v) => `<td class="${v < 0 ? 'fa-neg' : 'fa-num'}">${f(v)}</td>`).join('')}</tr>`).join('')).join('');
  return `<table class="fa"><thead>${head}</thead><tbody>${body}</tbody></table>
    <div class="fa-src">Source: SEC EDGAR, fiscal years (10-K). $ in millions/billions. Capex shown as cash paid.</div>`;
}

export async function showFA(sym) {
  open(`FA  ${sym}`, msg('LOADING...'));
  try {
    const d = await load(sym, 'fa');
    if (!d) return open(`FA  ${sym}`, msg(`NO FILINGS FOUND FOR ${sym}`));
    open(`FA  ${sym}  ${d.name ?? ''}`, faTable(d));
  } catch { open(`FA  ${sym}`, msg(`EDGAR UNAVAILABLE FOR ${sym}`)); }
}

const FYE = (s) => (s && s.length === 4 ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+s.slice(0, 2) - 1] ?? ''} ${+s.slice(2)}` : '--');

function desView(d) {
  const kv = [['Name', d.name], ['Ticker', d.tickers.join(', ')], ['Industry (SIC)', d.industry ? `${d.industry} (${d.sic})` : null], ['Exchange', d.exchange],
    ['State of inc.', d.state], ['Fiscal year end', FYE(d.fye)], ['CIK', d.cik], ['Type', d.entityType]];
  const info = kv.map(([k, v]) => `<tr><td>${k}</td><td class="fa-txt">${esc(v ?? '--')}</td></tr>`).join('');
  const fil = d.filings.map((f) => `<tr><td>${esc(f.date)}</td><td class="fa-txt">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.form)}</a>` : esc(f.form)}</td><td>${esc(f.period ?? '')}</td></tr>`).join('');
  return `<table class="fa"><tbody><tr class="fa-sec"><td colspan="2">COMPANY</td></tr>${info}</tbody></table>
    <table class="fa"><thead><tr><th>Filed</th><th>Form</th><th>Period</th></tr></thead><tbody><tr class="fa-sec"><td colspan="3">LATEST FILINGS</td></tr>${fil}</tbody></table>
    <div class="fa-src">Source: SEC EDGAR submissions.</div>`;
}

export async function showDES(sym) {
  open(`DES  ${sym}`, msg('LOADING...'));
  try {
    const d = await load(sym, 'des');
    if (!d) return open(`DES  ${sym}`, msg(`NO FILINGS FOUND FOR ${sym}`));
    open(`DES  ${sym}  ${d.name ?? ''}`, desView(d));
  } catch { open(`DES  ${sym}`, msg(`EDGAR UNAVAILABLE FOR ${sym}`)); }
}
