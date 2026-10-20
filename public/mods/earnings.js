// ERN (alias EE) earnings detail and ANR analyst ratings, from the earningsdetail and analyst handlers.
import { esc, fmt, cls, sgn, msg, getJSON, canvas, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';
loadCSS(new URL('./earnings.css', import.meta.url));

const sym = (args) => (args[0] && /^[A-Z0-9.\-]{1,10}$/.test(args[0]) ? args[0] : null);
const num = (v, d = 2) => (v == null ? '--' : fmt(v, d));

// short in-memory cache so repeat opens do not refetch
const memo = new Map();
function cached(url) {
  const m = memo.get(url);
  if (m && Date.now() - m.t < 300000) return m.p;
  const p = getJSON(url);
  memo.set(url, { t: Date.now(), p });
  p.catch(() => memo.delete(url));
  return p;
}
async function load(box, url, empty, draw) {
  box.innerHTML = msg('LOADING...');
  try {
    const d = await cached(url);
    if (!box.isConnected) return;
    const html = await draw(d, box);
    if (!box.isConnected) return;
    if (html == null) return;
    box.innerHTML = html;
  } catch (e) {
    if (box.isConnected) box.innerHTML = msg(e.status === 404 ? empty : `UNAVAILABLE (${e.message})`);
  }
}

// ---- ERN ----
const dayName = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const TIMES = { BMO: 'before market open', AMC: 'after market close', '--': 'time not confirmed' };

function drawBars(host, hist) {
  const { g, W, H } = canvas(host);
  const rows = hist.filter((h) => h.eps != null), P = { l: 34, r: 8, t: 14, b: 22 };
  if (!rows.length || W < 60) return;
  const vals = rows.flatMap((h) => [h.eps, h.est ?? h.eps]), hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), span = hi - lo || 1;
  const y = (v) => P.t + ((hi - v) / span) * (H - P.t - P.b);
  const slot = (W - P.l - P.r) / rows.length, bw = Math.min(26, slot / 3);
  g.font = '10px monospace'; g.textBaseline = 'middle'; g.textAlign = 'right';
  g.strokeStyle = '#2b2b2b'; g.fillStyle = '#6d6d6d';
  [hi, (hi + lo) / 2, lo].forEach((v) => { g.beginPath(); g.moveTo(P.l, y(v)); g.lineTo(W - P.r, y(v)); g.stroke(); g.fillText(fmt(v, 2), P.l - 3, y(v)); });
  g.strokeStyle = '#6d6d6d'; g.beginPath(); g.moveTo(P.l, y(0)); g.lineTo(W - P.r, y(0)); g.stroke();
  rows.forEach((h, i) => {
    const cx = P.l + slot * (i + 0.5);
    const bar = (x, v, color) => { g.fillStyle = color; g.fillRect(x, Math.min(y(v), y(0)), bw, Math.max(1, Math.abs(y(v) - y(0)))); };
    if (h.est != null) bar(cx - bw - 1, h.est, '#6d6d6d');
    bar(h.est != null ? cx + 1 : cx - bw / 2, h.eps, h.beat < 0 ? '#ff4d4d' : '#2ecc71');
    g.fillStyle = '#cfcfcf'; g.textAlign = 'center'; g.fillText(String(h.q).slice(0, 8), cx, H - 9);
  });
}

async function loadTranscripts(host, s) {
  try {
    const d = await cached(`/api/data?fn=transcript&s=${s}`);
    if (!host.isConnected) return;
    host.innerHTML = d.rows?.length
      ? `<div class="ern-note">Earnings-call coverage (headlines, not full transcripts -- no free full-transcript source exists)</div><table class="ern-tbl"><tbody>${d.rows.map((r) =>
        `<tr><td class="ern-l">${esc(r.ts.slice(0, 10))}</td><td><a href="${esc(r.u)}" target="_blank" rel="noopener noreferrer">${esc(r.t)}</a></td></tr>`).join('')}</tbody></table>`
      : '';
  } catch { if (host.isConnected) host.innerHTML = ''; }
}

function fcTable(title, list, label) {
  if (!list?.length) return '';
  return `<table class="ern-tbl"><caption>${esc(title)}</caption><thead><tr><th class="ern-l">${esc(label)}</th><th>Consensus</th><th>High</th><th>Low</th><th>Est.</th><th>Rev up</th><th>Rev down</th></tr></thead><tbody>${list.map((r) =>
    `<tr><td class="ern-l">${esc(r.end)}</td><td>${num(r.eps)}</td><td>${num(r.hi)}</td><td>${num(r.lo)}</td><td>${r.n ?? '--'}</td><td class="up">${r.up ?? '--'}</td><td class="dn">${r.down ?? '--'}</td></tr>`).join('')}</tbody></table>`;
}

registerWidget('ern', {
  title: (a) => `ERN  Earnings${sym(a) ? ` ${a[0]}` : ''}`, hint: 'AAPL ERN',
  render(box, args = []) {
    const s = sym(args);
    if (!s) { box.innerHTML = msg('USAGE: AAPL ERN'); return; }
    return load(box, `/api/data?fn=earningsdetail&s=${s}`, `NO EARNINGS DATA FOR ${s}`, (d) => {
      const n = d.next;
      let head;
      if (n) {
        const days = Math.round((new Date(`${n.date}T00:00:00Z`) - Date.now()) / 864e5 + 0.5);
        head = `<b>${esc(s)}</b> next earnings <span class="ern-hi">${esc(dayName(n.date))}</span> ${esc(TIMES[n.time] ?? '')}<span class="ern-asof">${days >= 0 ? ` in ${days} day${days === 1 ? '' : 's'}` : ''}${n.fiscalQtr ? ` | quarter ${esc(n.fiscalQtr)}` : ''}${n.epsEst != null ? ` | est. EPS ${fmt(n.epsEst)}` : ''}${n.analysts ? ` (${n.analysts} analysts)` : ''}</span>`;
      } else head = `<b>${esc(s)}</b> next earnings date not available`;
      const h = d.history ?? [];
      const hist = h.length ? `<table class="ern-tbl"><caption>EPS ${d.source === 'edgar' ? 'history (SEC filings)' : 'actual vs consensus'}</caption><thead><tr><th class="ern-l">Quarter</th><th>Reported</th><th>EPS</th><th>Consensus</th><th>Surprise</th><th>Result</th></tr></thead><tbody>${[...h].reverse().map((r) =>
        `<tr><td class="ern-l">${esc(r.q)}</td><td>${esc(r.date ?? '--')}</td><td>${num(r.eps)}</td><td>${num(r.est)}</td><td class="${cls(r.surp)}">${r.surp == null ? '--' : `${sgn(r.surp, 1)}%`}</td><td class="${r.beat > 0 ? 'up' : r.beat < 0 ? 'dn' : ''}">${r.beat == null ? '--' : r.beat > 0 ? 'BEAT' : r.beat < 0 ? 'MISS' : 'MET'}</td></tr>`).join('')}</tbody></table>` : '';
      const rv = d.revenue?.groups?.length ? `<table class="ern-tbl"><caption>Revenue by fiscal quarter</caption><thead><tr><th class="ern-l">Quarter</th>${d.revenue.years.map((y) => `<th>${esc(y)}</th>`).join('')}</tr></thead><tbody>${d.revenue.groups.map((g) =>
        `<tr><td class="ern-l">${esc(g.q)}</td>${d.revenue.years.map((_, i) => `<td>${esc(g.rev[i] ?? '--')}${g.eps[i] ? `<span class="ern-asof"> EPS ${esc(String(g.eps[i]).split(' ')[0])}</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
      const note = d.note ? `<div class="ern-note">${esc(d.note)}</div>` : '';
      box.innerHTML = `<div class="ern-head">${head}</div>${note}${h.some((r) => r.eps != null) ? '<div class="ern-chart"></div><div class="ern-note">Bars: grey consensus, green beat, red miss.</div>' : ''}${hist}${fcTable('Consensus EPS forecast, quarterly', d.forecast?.quarterly, 'Fiscal quarter')}${fcTable('Consensus EPS forecast, annual', d.forecast?.yearly, 'Fiscal year')}${rv}<div class="ern-note">Source: ${d.source === 'edgar' ? 'SEC EDGAR' : 'Nasdaq (unofficial)'}. Consensus and revisions are delayed.</div><div data-tr></div>`;
      const host = box.querySelector('.ern-chart');
      if (host) drawBars(host, h);
      const trHost = box.querySelector('[data-tr]');
      if (trHost) loadTranscripts(trHost, s);
      return null;
    });
  },
});
registerCommand('ERN', { help: 'AAPL ERN  earnings date, surprises, consensus forecast', run(args) { if (!sym(args)) return void openWidget('ern', []); return openWidget('ern', [args[0]]); } });
registerCommand('EE', { help: 'AAPL EE  alias of ERN', run: (args) => openWidget('ern', sym(args) ? [args[0]] : []) });

// ---- ANR ----
registerWidget('anr', {
  title: (a) => `ANR  Analysts${sym(a) ? ` ${a[0]}` : ''}`, hint: 'AAPL ANR',
  render(box, args = []) {
    const s = sym(args);
    if (!s) { box.innerHTML = msg('USAGE: AAPL ANR'); return; }
    return load(box, `/api/data?fn=analyst&s=${s}`, `NO ANALYST COVERAGE FOR ${s}`, async (d) => {
      let px = null;
      try { px = (await cached(`/api/data?fn=quotes&s=${s}`)).rows?.[0]?.p ?? null; } catch { /* target card still works without price */ }
      const tot = (d.buy ?? 0) + (d.hold ?? 0) + (d.sell ?? 0), t = d.target ?? {};
      const seg = (k, c) => (tot && d[k] ? `<div class="ern-seg ${c}" style="width:${(d[k] / tot) * 100}%">${d[k]}</div>` : '');
      const bar = tot ? `<div class="ern-rate">${seg('buy', 'up')}${seg('hold', 'hd')}${seg('sell', 'dn')}</div><div class="ern-note">Buy ${d.buy ?? 0} | Hold ${d.hold ?? 0} | Sell ${d.sell ?? 0}${d.summary ? ` | ${esc(d.summary)}` : ''}</div>` : '';
      let range = '';
      if (t.low != null && t.high != null && t.high > t.low) {
        const lo = Math.min(t.low, px ?? t.low), hi = Math.max(t.high, px ?? t.high), pos = (v) => `${(((v - lo) / (hi - lo || 1)) * 100).toFixed(2)}%`;
        range = `<div class="ern-rng"><div class="ern-span" style="left:${pos(t.low)};width:calc(${pos(t.high)} - ${pos(t.low)})"></div>${t.mean != null ? `<div class="ern-mk" style="left:${pos(t.mean)}" title="Mean target"></div>` : ''}${px != null ? `<div class="ern-mk px" style="left:${pos(px)}" title="Price"></div>` : ''}</div>
          <div class="ern-lbl"><span>Low ${fmt(t.low)}</span><span>Mean ${num(t.mean)}</span><span>High ${fmt(t.high)}</span></div>`;
      }
      const up = px && t.mean != null ? (t.mean / px - 1) * 100 : null;
      const hist = d.history?.length ? `<table class="ern-tbl"><caption>Monthly consensus history</caption><thead><tr><th class="ern-l">Date</th><th>Buy</th><th>Hold</th><th>Sell</th><th>Mean target</th></tr></thead><tbody>${[...d.history].reverse().map((r) =>
        `<tr><td class="ern-l">${esc(r.date)}</td><td>${r.buy ?? '--'}</td><td>${r.hold ?? '--'}</td><td>${r.sell ?? '--'}</td><td>${num(r.target)}</td></tr>`).join('')}</tbody></table>` : '';
      return `<div class="ern-head"><b>${esc(s)}</b> consensus <span class="ern-hi">${esc(d.rating ?? '--')}</span><span class="ern-asof">${px != null ? ` | price ${fmt(px)}` : ''}${t.mean != null ? ` | mean target ${fmt(t.mean)}` : ''}</span>${up != null ? ` <span class="${cls(up)}">${sgn(up, 1)}% implied</span>` : ''}</div>${bar}${range}${hist}<div class="ern-note">Source: Nasdaq (unofficial). Counts and targets are delayed.</div>`;
    });
  },
});
registerCommand('ANR', { help: 'AAPL ANR  analyst ratings and price target', run: (args) => openWidget('anr', sym(args) ? [args[0]] : []) });
