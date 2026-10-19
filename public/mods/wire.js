// WIRE: live market news wire, Bloomberg TOP LIVE style. Polls /api/data?fn=wire while its panel is open.
import { esc, hhmm, msg, getJSON, registerCommand, registerWidget, openWidget, loadCSS } from '../core.js';
loadCSS(new URL('./wire.css', import.meta.url));

const POLL_MS = 45000;

async function load(box, seen, first) {
  try {
    const d = await getJSON('/api/data?fn=wire');
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
  title: 'WIRE  Live News Wire',
  hint: 'WIRE',
  render(box) {
    const root = box;
    const seen = new Set();
    box.innerHTML = msg('LOADING...');
    load(root, seen, true);
    const id = setInterval(() => { if (!root.isConnected) clearInterval(id); else if (!document.hidden) load(root, seen, false); }, POLL_MS);
  },
});
registerCommand('WIRE', { help: 'WIRE  live scrolling market news wire', run: () => openWidget('wire') });
