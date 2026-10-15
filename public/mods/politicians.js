// POL: portfolio of every US politician who trades (House, Senate) plus President Trump and cabinet officials.
// Legislators come as raw trade rows (aggregated here), executive officials arrive pre-aggregated from the seeder.
import { esc, fmt, msg, registerCommand, registerWidget, openWidget, runCommand, loadCSS } from '../core.js';
loadCSS(new URL('./holders.css', import.meta.url));

const KEYS = [...Array.from({ length: 16 }, (_, i) => `pol${i}`), 'polt', 'polx0', 'polx1'];
const TYPE = { P: ['BUY', 'up'], S: ['SELL', 'dn'] };
const usd = (k) => (k == null ? '--' : Math.abs(k) >= 1e6 ? `$${fmt(k / 1e6, 2)}B` : Math.abs(k) >= 1e3 ? `$${fmt(k / 1e3, 1)}M` : `$${fmt(k, 0)}K`); // k = thousands of dollars
const mid = (a) => { const n = String(a).match(/\d[\d,]*/g)?.map((x) => +x.replace(/,/g, '')) ?? []; return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0; };

let people = null, asOf = '', loading = null;
const waiting = new Set();

// raw rows [who,ch,st,owner,ticker,asset,type,tx,filed,amount,id] -> { n, c, st, pos, tr }
function build(snaps) {
  const by = new Map(), out = [];
  for (const k of KEYS) {
    const d = snaps[k];
    if (!d?.rows) continue;
    asOf = asOf < (d.asOf ?? '') ? d.asOf : asOf;
    if (k.startsWith('polt') || k.startsWith('polx')) { out.push(...d.rows.map((p) => ({ ...p, st: p.t ?? '' }))); continue; }
    for (const r of d.rows) {
      if (r[6] === 'N') { if (!by.has(r[0])) by.set(r[0], { n: r[0], c: r[1], st: r[2], pos: new Map(), tr: [] }); continue; }
      const p = by.get(r[0]) ?? { n: r[0], c: r[1], st: r[2], pos: new Map(), tr: [] };
      by.set(r[0], p);
      const e = p.pos.get(r[4]) ?? [r[4], r[5], 0, 0, 0, 0, ''], v = mid(r[9]) / 1000;
      if (r[6] === 'P') { e[2]++; e[4] += v; } else if (r[6] === 'S') { e[3]++; e[5] += v; }
      if (r[7] > e[6]) e[6] = r[7];
      p.pos.set(r[4], e);
      p.tr.push([r[4], r[6], r[7], r[9], r[8], r[10], r[1]]);
    }
  }
  for (const p of by.values()) {
    p.pos = [...p.pos.values()].sort((a, b) => b[4] + b[5] - (a[4] + a[5]));
    p.tr.sort((a, b) => b[2].localeCompare(a[2]));
    out.push(p);
  }
  for (const p of out) {
    p.buy = p.pos.reduce((s, e) => s + e[4], 0); p.sell = p.pos.reduce((s, e) => s + e[5], 0);
    p.nt = p.pos.reduce((s, e) => s + e[2] + e[3], 0);
    p.last = p.pos.reduce((m, e) => (e[6] > m ? e[6] : m), '');
  }
  return out.filter((p) => p.nt).sort((a, b) => b.buy + b.sell - (a.buy + a.sell));
}

function load(cb) {
  if (people) return cb();
  waiting.add(cb);
  loading ??= fetch(`/api/snap?keys=${KEYS.join(',')}`).then((r) => r.json()).then((d) => { people = build(d); }).catch(() => {}).finally(() => { loading = null; [...waiting].forEach((f) => f()); waiting.clear(); });
}

const link = (r) => (r[6] === 'H' ? `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${r[4].slice(0, 4)}/${r[5]}.pdf` : `https://efdsearch.senate.gov/search/view/ptr/${r[5]}/`);
const where = (p) => (p.c === 'H' ? `House ${p.st}` : p.c === 'S' ? 'Senate' : p.st || 'Executive');
const note = (t) => `<div class="holders-note">${esc(t)}</div>`;
const NOTE = 'Built from disclosed trade ranges (midpoints), not from account statements. Net is bought minus sold, so it is an estimate of what was added or cut, not a holdings balance. Congress reports lag up to 45 days; the last two years are covered.';

function directory(rows, title) {
  return `<div class="holders-head"><b>POL</b> ${esc(title)} (${rows.length}), most active first. Click one for the portfolio. <span class="holders-t">POL HOUSE | SENATE | EXEC | name</span></div>`
    + `<table class="holders-tbl"><thead><tr><th>Politician</th><th>Office</th><th>Trades</th><th>Tickers</th><th>Bought</th><th>Sold</th><th>Last trade</th></tr></thead><tbody>${rows.slice(0, 300).map((p) =>
      `<tr class="holders-pick" data-who="${esc(p.n)}"><td class="holders-l holders-sym">${esc(p.n)}</td><td class="holders-t">${esc(where(p))}</td><td>${p.nt}</td><td>${p.pos.length}</td><td class="up">${usd(p.buy)}</td><td class="dn">${usd(p.sell)}</td><td class="holders-t">${esc(p.last)}</td></tr>`).join('')}</tbody></table>${note(NOTE)}`;
}

function portfolio(p) {
  const pos = p.pos.map((e) => {
    const net = e[4] - e[5];
    return `<tr><td class="holders-l${e[0] ? ' holders-sym' : ''}" ${e[0] ? `data-s="${esc(e[0])}"` : ''}>${esc(e[0] || '--')}</td><td class="holders-l">${esc(e[1])}</td><td>${e[2]}</td><td>${e[3]}</td><td class="up">${usd(e[4])}</td><td class="dn">${usd(e[5])}</td><td class="${net >= 0 ? 'up' : 'dn'}">${net >= 0 ? '+' : '-'}${usd(Math.abs(net))}</td><td class="holders-t">${esc(e[6])}</td></tr>`;
  }).join('');
  const tr = p.tr.slice(0, 25).map((r) => {
    const [t, c] = TYPE[r[1]] ?? ['--', ''];
    return `<tr><td class="holders-t">${esc(r[2])}</td><td class="holders-l holders-sym" data-s="${esc(r[0])}">${esc(r[0])}</td><td class="${c}">${t}</td><td class="holders-t">${esc(r[3])}</td><td class="holders-l">${r[5] ? `<a href="${esc(link(r))}" target="_blank" rel="noopener noreferrer">filing</a>` : ''}</td></tr>`;
  }).join('');
  return `<div class="holders-head"><b>${esc(p.n)}</b> ${esc(where(p))}| ${p.nt} trades in ${p.pos.length} names | bought <span class="up">${usd(p.buy)}</span>, sold <span class="dn">${usd(p.sell)}</span> <span class="holders-sym" data-back="1">[all politicians]</span></div>`
    + `<div class="holders-h">PORTFOLIO (by activity)</div><table class="holders-tbl"><thead><tr><th>Ticker</th><th>Asset</th><th>Buys</th><th>Sells</th><th>Bought</th><th>Sold</th><th>Net est.</th><th>Last</th></tr></thead><tbody>${pos}</tbody></table>`
    + (tr ? `<div class="holders-h">LATEST TRADES</div><table class="holders-tbl"><thead><tr><th>Traded</th><th>Ticker</th><th>Side</th><th>Amount</th><th>SEC/House</th></tr></thead><tbody>${tr}</tbody></table>` : '')
    + note(NOTE);
}

registerWidget('pol', {
  title: (a) => `POL  Politician portfolios ${a.join(' ')}`.trim(), hint: 'POL PELOSI',
  render(box, args) {
    const q = args.join(' ').toUpperCase();
    const draw = () => {
      if (!box.isConnected) return;
      if (!people?.length) { box.innerHTML = msg('POLITICIAN SNAPSHOTS PENDING: run npm run seed'); return; }
      const grp = { HOUSE: 'H', SENATE: 'S', EXEC: 'X' }[q];
      if (!q || grp) { box.innerHTML = directory(grp ? people.filter((p) => p.c === grp) : people, grp ? q : 'all politicians'); return; }
      const hit = people.filter((p) => p.n.toUpperCase().includes(q));
      box.innerHTML = hit.length === 1 ? portfolio(hit[0]) : hit.length ? directory(hit, `matching ${q}`) : msg(`NO POLITICIAN MATCHES ${q}`) + directory(people, 'all politicians');
    };
    box.onclick = (e) => {
      const d = e.target.dataset ?? {}, row = e.target.closest?.('[data-who]')?.dataset.who;
      if (d.s) runCommand(`GP ${d.s}`);
      else if (d.back) runCommand('POL');
      else if (row) runCommand(`POL ${row}`);
    };
    box.innerHTML = msg('LOADING...');
    load(draw);
  },
});
const pol = (a) => openWidget('pol', a);
registerCommand('POL', { help: 'POL [name|HOUSE|SENATE|EXEC]  portfolios of Congress, Trump and cabinet', run: pol });
registerCommand('TRUMP', { help: 'TRUMP  President Trump stock portfolio (OGE 278-T)', run: () => pol(['Donald']) });
