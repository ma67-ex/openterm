// GP: price chart for a ticker.
import { registerCommand, workspace, canvas, getJSON, msg } from '../core.js';

async function drawChart(sym) {
  const box = workspace(`GP  ${sym}`, msg('LOADING'));
  try {
    const d = await getJSON(`/api/chart?s=${encodeURIComponent(sym)}&range=6mo`);
    const closes = d.chart.result[0].indicators.quote[0].close.filter((x) => x != null);
    const { g, W, H } = canvas(box);
    const lo = Math.min(...closes), hi = Math.max(...closes);
    g.strokeStyle = closes.at(-1) >= closes[0] ? '#2ecc71' : '#ff4d4d'; g.lineWidth = 1.5; g.beginPath();
    closes.forEach((v, i) => { const x = (i / (closes.length - 1)) * (W - 52), y = H - 12 - ((v - lo) / (hi - lo || 1)) * (H - 24); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke(); g.fillStyle = '#888'; g.font = '11px monospace';
    g.fillText(hi.toFixed(2), W - 50, 14); g.fillText(lo.toFixed(2), W - 50, H - 4);
  } catch { workspace(`GP  ${sym}`, msg(`NO DATA FOR ${sym}`)); }
}

registerCommand('GP', { help: 'AAPL  price chart', run: ([sym]) => sym && drawChart(sym) });
