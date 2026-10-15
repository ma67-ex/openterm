// CONG: US Congress stock trades (House + Senate periodic transaction reports, STOCK Act). Seeded snapshot, filter by ticker or name.
import { esc, msg, registerCommand, registerWidget, openWidget, runCommand, useSnap, loadCSS } from '../core.js';
loadCSS(new URL('./holders.css', import.meta.url));

let snap = null;
const waiting = new Set();
useSnap(['congress'], (d) => {
  if (!d.congress?.rows?.length) return;
  const first = !snap;
  snap = d.congress;
  if (first) { [...waiting].forEach((f) => f()); waiting.clear(); }
});

// stored link id -> filing URL (House PDF is under the filing year, Senate is an eFD report page)
const url = (r) => (r[1] === 'H' ? `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${r[8].slice(0, 4)}/${r[10]}.pdf` : `https://efdsearch.senate.gov/search/view/ptr/${r[10]}/`);
const TYPE = { P: ['BUY', 'up'], S: ['SELL', 'dn'], E: ['EXCH', ''] };
const OWN = { SP: 'spouse', JT: 'joint', DC: 'child' };

function table(rows) {
  if (!rows.length) return msg('NO MATCHING TRADES');
  return `<table class="holders-tbl"><thead><tr><th>Traded</th><th>Politician</th><th>Ticker</th><th>Asset</th><th>Side</th><th>Amount</th><th>Filed</th><th></th></tr></thead><tbody>${rows.map((r) => {
    const [t, c] = TYPE[r[6]] ?? ['--', ''];
    return `<tr><td class="holders-t">${esc(r[7])}</td><td class="holders-l holders-sym" data-who="${esc(r[0])}">${esc(r[0])}<span class="holders-t"> ${r[1] === 'H' ? 'House' : 'Senate'}${r[2] ? ' ' + esc(r[2]) : ''}${OWN[r[3]] ? ' (' + OWN[r[3]] + ')' : ''}</span></td><td class="holders-l holders-sym" data-s="${esc(r[4])}">${esc(r[4])}</td><td class="holders-l">${esc(r[5])}</td><td class="${c}">${t}</td><td class="holders-t">${esc(r[9])}</td><td class="holders-t">${esc(r[8])}</td><td class="holders-l"><a href="${esc(url(r))}" target="_blank" rel="noopener noreferrer">filing</a></td></tr>`;
  }).join('')}</tbody></table>`;
}

registerWidget('cong', {
  title: (a) => `CONG  Congress trades ${a.join(' ')}`.trim(), hint: 'CONG AAPL',
  render(box, args) {
    const draw = () => {
      if (!box.isConnected) return;
      if (!snap) { box.innerHTML = msg('CONGRESS SNAPSHOT PENDING: run npm run seed'); waiting.add(draw); return; }
      const q = args.join(' ').toUpperCase();
      const rows = q ? snap.rows.filter((r) => r[4] === q || r[0].toUpperCase().includes(q)) : snap.rows;
      box.innerHTML = `<div class="holders-head"><b>US Congress trades</b>${q ? ` matching ${esc(q)}` : ''} (${rows.length})</div>${table(rows.slice(0, 150))}`
        + `<div class="holders-note">Source: House Clerk and Senate eFD periodic transaction reports. Trades are disclosed up to 45 days late and amounts are ranges. Equities with a ticker only, latest filings. Click a name or ticker to filter. Updated ${esc(snap.asOf?.slice(0, 16).replace('T', ' ') ?? '')} UTC.</div>`;
    };
    box.onclick = (e) => {
      const d = e.target.dataset ?? {};
      if (d.who) runCommand(`CONG ${d.who}`);
      else if (d.s) runCommand(`CONG ${d.s}`);
    };
    draw();
  },
});
const cong = (a) => openWidget('cong', a);
registerCommand('CONG', { help: 'CONG [ticker|name]  US Congress stock trades', run: cong });
