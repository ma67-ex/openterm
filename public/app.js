const $ = (id) => document.getElementById(id);
const WATCH = ['^GSPC', '^IXIC', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'BTC-USD', 'EURUSD=X', 'GC=F', 'CL=F'];
let current = 'AAPL';

const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
const status = (m) => ($('status').textContent = m);

async function quote(s) {
  const d = await getJSON(`/api/chart?s=${encodeURIComponent(s)}&range=5d&interval=1d`);
  const m = d.chart.result[0].meta;
  const prev = m.chartPreviousClose ?? m.previousClose;
  return { s, price: m.regularMarketPrice, chg: ((m.regularMarketPrice - prev) / prev) * 100 };
}

async function loadWatch() {
  const rows = await Promise.allSettled(WATCH.map(quote));
  $('watchlist').innerHTML = rows.map((r, i) => {
    if (r.status !== 'fulfilled') return `<div class="row"><span>${WATCH[i]}</span><span>n/a</span></div>`;
    const { s, price, chg } = r.value;
    return `<div class="row" data-s="${s}"><span>${s}</span><span>${price.toFixed(2)} <b class="${chg >= 0 ? 'up' : 'dn'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</b></span></div>`;
  }).join('');
}

async function drawChart(s) {
  current = s;
  $('charttitle').textContent = `CHART  ${s}`;
  const d = await getJSON(`/api/chart?s=${encodeURIComponent(s)}&range=6mo&interval=1d`);
  const closes = d.chart.result[0].indicators.quote[0].close.filter((x) => x != null);
  const c = $('chart'), r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  c.width = r.width * dpr; c.height = r.height * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const W = r.width, H = r.height, min = Math.min(...closes), max = Math.max(...closes);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = closes.at(-1) >= closes[0] ? '#2ecc71' : '#ff4d4d'; g.lineWidth = 1.5; g.beginPath();
  closes.forEach((v, i) => { const x = (i / (closes.length - 1)) * (W - 50), y = H - 10 - ((v - min) / (max - min || 1)) * (H - 20); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = '#888'; g.font = '11px monospace';
  g.fillText(max.toFixed(2), W - 48, 14); g.fillText(min.toFixed(2), W - 48, H - 4);
}

async function loadNews(s) {
  const xml = new DOMParser().parseFromString(await (await fetch(`/api/news?s=${encodeURIComponent(s)}`)).text(), 'text/xml');
  const items = [...xml.querySelectorAll('item')].slice(0, 20);
  $('news').innerHTML = items.map((i) => `<a class="news" target="_blank" rel="noopener" href="${i.querySelector('link').textContent}">${i.querySelector('title').textContent}</a>`).join('') || 'No news.';
}

async function go(s) { try { status(`Loading ${s}...`); await Promise.all([drawChart(s), loadNews(s)]); status(`${s} loaded. Data: free sources, delayed.`); } catch (e) { status(`Error: ${e.message}`); } }

$('cmd').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const [a, b] = e.target.value.trim().toUpperCase().split(/\s+/); e.target.value = '';
  if (!a) return;
  if (a === 'HELP') return status('Commands: <TICKER> | CHART <T> | NEWS <T>');
  const t = ['CHART', 'NEWS', 'QUOTE'].includes(a) ? b : a;
  if (t) go(t);
});
$('watchlist').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r?.dataset.s) go(r.dataset.s); });
setInterval(() => ($('clock').textContent = new Date().toLocaleTimeString()), 1000);
loadWatch(); go(current); setInterval(loadWatch, 60000);
