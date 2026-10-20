// WIRE: live market news wire, Bloomberg TOP LIVE style. WIRE scopes to the market; WIRE <ticker> scopes to one symbol.
// Polls while mounted (every 45s), pauses while the cursor is over the list so it doesn't yank text out from under you.
import { esc, hhmm, msg, getJSON, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';
loadCSS(new URL('./wire.css', import.meta.url));

const POLL_MS = 45000;
const sym = (args) => (args[0] && /^[A-Z0-9.\-]{1,10}$/.test(args[0]) ? args[0].toUpperCase() : null);
const feedUrl = (s) => (s ? `/api/data?fn=news&s=${encodeURIComponent(s)}` : '/api/data?fn=wire');

async function load(box, seen, first) {
  try {
    const d = await getJSON(box.dataset.url);
    if (!box.isConnected) return;
    const rows = d.rows ?? [];
    if (!rows.length) { box.innerHTML = msg('NO DATA'); return; }
    box.innerHTML = `<div class="wire-list">${rows.map((r) => {
      const fresh = !first && !seen.has(r.u) ? ' wire-new' : '';
      seen.add(r.u);
      return `<div class="wire-row${fresh}"><i class="wire-t">${esc(hhmm(r.ts))}</i><b class="wire-src">${esc(r.s)}</b><a class="wire-h" href="${esc(r.u)}" target="_blank" rel="noopener noreferrer">${esc(r.t)}</a></div>`;
    }).join('')}</div>`;
  } catch (e) {
    if (box.isConnected) box.innerHTML = msg(`UNAVAILABLE (${e.message})`);
  }
}

registerWidget('wire', {
  title: (a) => `WIRE  Live News Wire${sym(a) ? ` ${sym(a)}` : ''}`,
  hint: 'WIRE [ticker]',
  render(box, args = []) {
    const root = box;
    root.dataset.url = feedUrl(sym(args));
    const seen = new Set();
    let hover = false;
    root.innerHTML = msg('LOADING...');
    root.addEventListener('pointerenter', () => { hover = true; });
    root.addEventListener('pointerleave', () => { hover = false; });
    load(root, seen, true);
    const id = setInterval(() => {
      if (!root.isConnected) return clearInterval(id);
      if (!document.hidden && !hover) load(root, seen, false);
    }, POLL_MS);
  },
});
registerCommand('WIRE', { help: 'WIRE [ticker]  live news wire, market-wide or scoped to one symbol', run: (args) => openWidget('wire', args) });
