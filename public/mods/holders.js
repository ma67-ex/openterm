// Shareholders: 5% holders from 13G/13D (HDS), insider net trading, and famous 13F funds (FUND). SEC EDGAR data only.
import { esc, fmt, msg, getJSON, registerCommand, registerWidget, openWidget, runCommand, useSnap, loadCSS } from '../core.js';
loadCSS(new URL('./holders.css', import.meta.url));

const sym = (args) => (args[0] && /^[A-Z0-9.\-]{1,10}$/.test(args[0]) ? args[0] : null);
const link = (u, t) => (/^https?:\/\//i.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : esc(t));
const usd = (v) => (v == null ? '--' : v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : fmt(v, 0));
const shares = (v) => (v == null ? '--' : fmt(v, 0));
const note = (t) => `<div class="holders-note">${esc(t)}</div>`;
const head = (t) => `<div class="holders-h">${esc(t)}</div>`;

// seeded 13F snapshot, plus callbacks waiting for it to arrive
let funds = null;
const waiting = new Set();
useSnap(['funds'], (d) => {
  const rows = d.funds?.rows;
  if (!rows?.length) return;
  const first = !funds;
  funds = { rows, asOf: d.funds.asOf };
  if (first) { [...waiting].forEach((f) => f()); waiting.clear(); }
});
const PENDING = 'FUNDS SNAPSHOT PENDING: run npm run seed';

// ---- HDS: 5% holders, insiders, famous investors ----
function holdersTable(d) {
  if (!d.rows?.length) return msg('NO 13G/13D FILINGS FOUND');
  const known = Math.min(100, d.knownPct ?? 0);
  const rows = d.rows.map((r) => `<tr><td class="holders-l">${esc(r.holder)}</td><td class="holders-t">${esc(r.form)}</td><td class="holders-t">${esc(r.date)}</td><td>${shares(r.shares)}</td><td>${r.pct == null ? '--' : `${fmt(r.pct, 2)}%`}</td><td class="holders-l">${link(r.url, 'filing')}</td></tr>`).join('');
  return `<table class="holders-tbl"><thead><tr><th>Holder</th><th>Form</th><th>Filed</th><th>Shares</th><th>% of class</th><th>SEC</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="holders-bar" title="listed 5% holders vs everything else"><div class="holders-seg-known" style="width:${known}%"></div></div>`
    + `<div class="holders-key"><b>${fmt(known, 1)}%</b> in listed 5% holders (sum of each holder's latest filing, may overlap or be stale) | <b>${fmt(100 - known, 1)}%</b> not covered: smaller holders, insiders under 5%, retail. Insider holdings are not included in the bar.</div>`
    + note(`Latest 13G/13D filing per holder, not current holdings. Scanned ${d.scanned} recent filings. Holders that reported under 5% are hidden.`);
}

function insiderTable(d) {
  if (!d.rows?.length) return msg('NO FORM 4 TRANSACTIONS FOUND');
  const rows = d.rows.map((r) => `<tr><td class="holders-l">${esc(r.owner)}</td><td class="holders-l">${esc(r.role ?? '')}</td><td>${shares(r.bought)}</td><td>${shares(r.sold)}</td><td class="${r.net > 0 ? 'up' : r.net < 0 ? 'dn' : ''}">${r.net > 0 ? '+' : ''}${shares(r.net)}</td><td class="holders-t">${esc(r.last)}</td></tr>`).join('');
  return `<table class="holders-tbl"><thead><tr><th>Insider</th><th>Role</th><th>Bought</th><th>Sold</th><th>Net</th><th>Last filed</th></tr></thead><tbody>${rows}</tbody></table>`
    + note(`Open-market buys (code P) and sells (code S) from the latest ${d.parsed}/${d.filings} Form 4 filings. Grants, option exercises and tax withholding are excluded.`);
}

function famousTable(s) {
  if (!funds) { return msg(PENDING); }
  const hits = [];
  for (const f of funds.rows) {
    const h = f.top.find((x) => x[0] === s);
    if (h) hits.push({ f, shares: h[2], value: h[3], w: f.totalValue ? (h[3] / f.totalValue) * 100 : null });
  }
  if (!hits.length) return msg(`${s} IS NOT IN THE TOP HOLDINGS OF ANY TRACKED FUND`);
  hits.sort((a, b) => b.value - a.value);
  return `<table class="holders-tbl"><thead><tr><th>Fund</th><th>Period</th><th>Shares</th><th>Value</th><th>% of fund</th></tr></thead><tbody>${hits.map((h) =>
    `<tr class="holders-pick" data-fund="${esc(h.f.name.toUpperCase())}"><td class="holders-l holders-sym">${esc(h.f.name)}</td><td class="holders-t">${esc(h.f.period)}</td><td>${shares(h.shares)}</td><td>${usd(h.value)}</td><td>${h.w == null ? '--' : `${fmt(h.w, 2)}%`}</td></tr>`).join('')}</tbody></table>`
    + note('13F data is quarterly and delayed up to 45 days after quarter end. Only each fund\'s top holdings are tracked.');
}

registerWidget('hds', {
  title: (a) => `HDS  Holders ${a[0] ?? ''}`, hint: 'AAPL HDS',
  render(box, args) {
    const s = sym(args);
    if (!s) { box.innerHTML = msg('USAGE: AAPL HDS'); return; }
    box.innerHTML = `<div class="holders-head"><b>${esc(s)}</b> shareholders</div>${head('5% HOLDERS (SCHEDULE 13G / 13D)')}<div data-sec="h">${msg('LOADING...')}</div>${head('INSIDER NET BUYING / SELLING (FORM 4)')}<div data-sec="i">${msg('LOADING... (reads up to 15 Form 4 filings)')}</div>${head('FAMOUS INVESTORS HOLDING THIS (13F)')}<div data-sec="f"></div>`;
    const sec = (k) => box.querySelector(`[data-sec="${k}"]`);
    const fill = async (k, view, draw) => {
      try {
        const d = await getJSON(`/api/data?fn=ownership&s=${encodeURIComponent(s)}${view}`);
        if (box.isConnected) sec(k).innerHTML = draw(d);
      } catch (e) {
        if (box.isConnected) sec(k).innerHTML = msg(e.status === 404 ? `NO FILINGS FOUND FOR ${s}` : `UNAVAILABLE (${e.message})`);
      }
    };
    fill('h', '', holdersTable);
    fill('i', '&view=insider', insiderTable);
    const fam = () => { if (box.isConnected) sec('f').innerHTML = famousTable(s); };
    fam();
    if (!funds) waiting.add(fam);
    box.onclick = (e) => {
      const f = e.target.closest?.('[data-fund]')?.dataset.fund;
      if (f) runCommand(`FUND ${f}`);
    };
  },
});
const hds = (a) => openWidget('hds', a);
registerCommand('HDS', { help: 'AAPL HDS  5% holders, insiders, famous funds', run: hds });
registerCommand('OWN', { help: 'AAPL OWN  alias of HDS', run: hds });
registerCommand('HOLDERS', { help: 'AAPL HOLDERS  alias of HDS', run: hds });

// ---- FUND: seeded 13F funds list and per-fund holdings ----
const pickFund = (q) => { const k = q.toUpperCase(); return funds.rows.find((f) => f.name.toUpperCase() === k) ?? funds.rows.find((f) => f.name.toUpperCase().includes(k)); };
const WARN = '13F data is quarterly and delayed up to 45 days after quarter end. Long US equity positions only; options and bonds are excluded.';

function fundList() {
  const rows = [...funds.rows].sort((a, b) => b.totalValue - a.totalValue).map((f) => {
    const t = f.top[0];
    return `<tr class="holders-pick" data-fund="${esc(f.name.toUpperCase())}"><td class="holders-l holders-sym">${esc(f.name)}</td><td class="holders-t">${esc(f.period)}</td><td>${usd(f.totalValue)}</td><td class="holders-l">${t ? esc(t[0] ?? t[1]) : '--'}</td></tr>`;
  }).join('');
  return `<table class="holders-tbl"><thead><tr><th>Fund</th><th>Period</th><th>Portfolio</th><th>Top holding</th></tr></thead><tbody>${rows}</tbody></table>`
    + note(`${WARN} Click a fund, or type FUND <name>.`);
}

function fundView(f) {
  const rows = f.top.map((x, i) => `<tr><td class="holders-t">${i + 1}</td><td class="holders-l">${x[0] ? `<span class="holders-sym" data-s="${esc(x[0])}">${esc(x[0])}</span> ` : ''}${esc(x[1])}</td><td>${shares(x[2])}</td><td>${usd(x[3])}</td><td>${f.totalValue ? fmt((x[3] / f.totalValue) * 100, 2) : '--'}%</td></tr>`).join('');
  return `<div class="holders-head"><b>${esc(f.name)}</b> period ${esc(f.period)}, filed ${esc(f.filed)}, portfolio ${usd(f.totalValue)}</div>`
    + `<table class="holders-tbl"><thead><tr><th>#</th><th>Holding</th><th>Shares</th><th>Value</th><th>% of portfolio</th></tr></thead><tbody>${rows}</tbody></table>`
    + note(`${WARN} Holdings without a ticker could not be matched to a listed company by name.`);
}

registerWidget('fund', {
  title: (a) => `FUND  13F ${a.join(' ')}`.trim(), hint: 'FUND BERKSHIRE',
  render(box, args) {
    const draw = () => {
      if (!box.isConnected) return;
      if (!funds) { box.innerHTML = msg(PENDING); waiting.add(draw); return; }
      if (!args.length) { box.innerHTML = fundList(); return; }
      const f = pickFund(args.join(' '));
      box.innerHTML = f ? fundView(f) : msg(`NO FUND MATCHES ${args.join(' ')}`) + fundList();
    };
    box.onclick = (e) => {
      const s = e.target.dataset?.s;
      if (s) return runCommand(`GP ${s}`);
      const f = e.target.closest?.('[data-fund]')?.dataset.fund;
      if (f) runCommand(`FUND ${f}`);
    };
    draw();
  },
});
const fund = (a) => openWidget('fund', a);
registerCommand('FUND', { help: 'FUND [name]  famous 13F funds and their top holdings', run: fund });
registerCommand('13F', { help: '13F [name]  alias of FUND', run: fund });
