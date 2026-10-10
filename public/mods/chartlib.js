// Indicator math (pure, arrays of numbers with null for "not defined yet") and a dependency-free canvas chart renderer.
const nn = (x) => x != null && Number.isFinite(x);
const pad = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const UP = '#2ecc71', DN = '#ff4d4d', AMBER = '#ff9f1a';
export const PALETTE = ['#ff9f1a', '#3aa0ff', '#2ecc71', '#e056fd', '#f1c40f', '#1abc9c'];

// ---- math ----
export function sma(a, n) {
  const o = Array(a.length).fill(null);
  let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; }
  return o;
}

// Leading nulls are allowed; seeded with the SMA of the first n defined values.
export function ema(a, n) {
  const o = Array(a.length).fill(null), k = 2 / (n + 1);
  let st = a.findIndex(nn);
  if (st < 0 || st + n > a.length) return o;
  let e = 0;
  for (let i = st; i < st + n; i++) e += a[i];
  e /= n; o[st + n - 1] = e;
  for (let i = st + n; i < a.length; i++) { e = a[i] * k + e * (1 - k); o[i] = e; }
  return o;
}

export function bollinger(a, n = 20, k = 2) {
  const m = sma(a, n), u = Array(a.length).fill(null), l = Array(a.length).fill(null);
  for (let i = n - 1; i < a.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2;
    const sd = Math.sqrt(s / n);
    u[i] = m[i] + k * sd; l[i] = m[i] - k * sd;
  }
  return { u, m, l };
}

// Wilder smoothing.
export function rsi(a, n = 14) {
  const o = Array(a.length).fill(null);
  if (a.length <= n) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  const val = () => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  o[n] = val();
  for (let i = n + 1; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    o[i] = val();
  }
  return o;
}

export function macd(a, f = 12, s = 26, sig = 9) {
  const ef = ema(a, f), es = ema(a, s);
  const m = a.map((_, i) => (nn(ef[i]) && nn(es[i]) ? ef[i] - es[i] : null));
  const sg = ema(m, sig);
  return { m, s: sg, h: m.map((v, i) => (nn(v) && nn(sg[i]) ? v - sg[i] : null)) };
}

export function atr(h, l, c, n = 14) {
  const o = Array(c.length).fill(null);
  if (c.length < n) return o;
  const tr = c.map((_, i) => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]));
  let e = 0;
  for (let i = 0; i < n; i++) e += tr[i];
  e /= n; o[n - 1] = e;
  for (let i = n; i < c.length; i++) { e = (e * (n - 1) + tr[i]) / n; o[i] = e; }
  return o;
}

export const returns = (c) => c.slice(1).map((v, i) => v / c[i] - 1);
export const stdev = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
export function pearson(x, y) {
  const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// Yahoo chart result -> clean bars (rows without a close are dropped, missing o/h/l fall back to the close).
export function toBars(res) {
  const q = res.indicators.quote[0], ts = res.timestamp || [], b = { t: [], o: [], h: [], l: [], c: [], v: [], meta: res.meta || {} };
  for (let i = 0; i < ts.length; i++) {
    const c = q.close[i];
    if (!nn(c)) continue;
    b.t.push(ts[i]); b.c.push(c);
    b.o.push(nn(q.open[i]) ? q.open[i] : c); b.h.push(nn(q.high[i]) ? q.high[i] : c); b.l.push(nn(q.low[i]) ? q.low[i] : c);
    b.v.push(nn(q.volume[i]) ? q.volume[i] : 0);
  }
  return b;
}

// Join {t, c} series on a shared time axis (by UTC day when daily). fill=true carries values forward; false leaves nulls.
export function align(list, daily = true, fill = true) {
  const key = (t) => (daily ? Math.floor(t / 86400) : t);
  const keys = [...new Set(list.flatMap((s) => s.t.map(key)))].sort((x, y) => x - y);
  const t = keys.map((k) => (daily ? k * 86400 : k));
  const series = list.map((s) => {
    const m = new Map(s.t.map((x, i) => [key(x), s.c[i]]));
    let last = null;
    return keys.map((k) => { if (m.has(k)) last = m.get(k); return fill ? last : (m.get(k) ?? null); });
  });
  return { t, series };
}

export const rebase = (a, mode = 'rebase') => {
  const b = a.find(nn);
  return a.map((v) => (nn(v) ? (mode === 'pct' ? (v / b - 1) * 100 : (v / b) * 100) : null));
};

// ---- helpers ----
export function niceTicks(lo, hi, cnt = 5) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / cnt, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p, out = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) out.push(+(k * step).toPrecision(12));
  return out;
}
export function logTicks(lo, hi) {
  const gen = (ms) => { const o = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of ms) { const v = m * 10 ** e; if (v >= lo && v <= hi) o.push(v); } return o; };
  let t = gen([1, 2, 5]);
  if (t.length > 8) t = gen([1]);
  return t.length < 3 ? niceTicks(lo, hi) : t;
}
const volTxt = (v) => (v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v)));
const priceTxt = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));
const parts = (t, off = 0) => { const d = new Date((t + off) * 1000); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
export const fmtDate = (t, off, intra) => { const p = parts(t, off), s = `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`; return intra ? `${s} ${pad(p.h)}:${pad(p.mi)}` : s; };

function scale(lo, hi, y0, y1, log) {
  const f = log ? Math.log : (v) => v, fi = log ? Math.exp : (v) => v, fl = f(lo), fh = f(hi), k = (y1 - y0) / (fh - fl || 1);
  return { lo, hi, y: (v) => y1 - (f(v) - fl) * k, inv: (y) => fi(fl + (y1 - y) / k) };
}

function path(g, xs, vs, y) {
  g.beginPath();
  let pen = false;
  for (let i = 0; i < vs.length; i++) {
    if (!nn(vs[i])) { pen = false; continue; }
    if (pen) g.lineTo(xs(i), y(vs[i])); else { g.moveTo(xs(i), y(vs[i])); pen = true; }
  }
  g.stroke();
}

// ---- renderer ----
// o: { kind:'bars'|'multi', t, off, intra, from, log,
//   bars: type:'line'|'area'|'candle'|'bar', o,h,l,c,v, volume, overlays:[{name,v,color}], band:{u,m,l}, panes:[{kind:'rsi',v}|{kind:'macd',m,s,h}]
//   multi: series:[{name,color,v}], unit }
function paint(g, W, H, o) {
  const multi = o.kind === 'multi', n = o.t.length, a = Math.min(Math.max(o.from || 0, 0), Math.max(n - 1, 0));
  const L = 4, R = 58, T = 6, B = 16, plotW = W - L - R, m = n - a;
  g.clearRect(0, 0, W, H); g.font = '10px monospace'; g.textBaseline = 'middle'; g.lineWidth = 1;
  if (m < 1 || plotW < 40 || H < 80) return null;
  const step = plotW / m, X = (i) => L + (i - a + 0.5) * step, xs = (i) => X(i + a);
  const subs = [];
  if (!multi && o.volume) subs.push({ kind: 'vol', f: 0.16 });
  for (const p of o.panes || []) subs.push({ kind: p.kind, f: 0.17, p });
  const total = H - T - B, gap = 3, fsum = subs.reduce((s, p) => s + p.f, 0), sc = fsum > 0.55 ? 0.55 / fsum : 1;
  let y = T;
  const mainH = total - subs.reduce((s, p) => s + p.f * sc * total, 0) - gap * subs.length;
  const panes = [{ kind: 'main', y0: y, y1: y + mainH }];
  y += mainH;
  for (const p of subs) { y += gap; p.y0 = y; p.y1 = y + p.f * sc * total; y = p.y1; panes.push(p); }

  // main scale
  let lo = Infinity, hi = -Infinity;
  const take = (v) => { if (nn(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  const ranged = !multi && (o.type === 'candle' || o.type === 'bar');
  for (let i = a; i < n; i++) {
    if (multi) o.series.forEach((s) => take(s.v[i]));
    else {
      if (ranged) { take(o.h[i]); take(o.l[i]); } else take(o.c[i]);
      (o.overlays || []).forEach((s) => take(s.v[i]));
      if (o.band) { take(o.band.u[i]); take(o.band.l[i]); }
    }
  }
  if (lo > hi) return null;
  const log = !!o.log && lo > 0 && !multi;
  if (hi === lo) { hi += Math.abs(hi) * 0.01 || 1; lo -= Math.abs(lo) * 0.01 || 1; }
  if (log) { const p = (Math.log(hi) - Math.log(lo)) * 0.06; lo = Math.exp(Math.log(lo) - p); hi = Math.exp(Math.log(hi) + p); } else { const p = (hi - lo) * 0.06; lo -= p; hi += p; }
  const mp = panes[0];
  mp.sc = scale(lo, hi, mp.y0, mp.y1, log);
  const py = mp.sc.y;

  // grid + price axis
  const ticks = log ? logTicks(lo, hi) : niceTicks(lo, hi, Math.max(2, Math.floor((mp.y1 - mp.y0) / 38)));
  const dec = log || ticks.length < 2 ? null : Math.min(6, Math.max(0, Math.ceil(-Math.log10(ticks[1] - ticks[0]) - 1e-9)));
  const axisTxt = (v) => (multi ? v.toFixed(1) : dec == null ? priceTxt(v) : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  g.fillStyle = '#6d6d6d'; g.textAlign = 'left';
  for (const v of ticks) {
    const yy = Math.round(py(v)) + 0.5;
    g.strokeStyle = '#161616'; g.beginPath(); g.moveTo(L, yy); g.lineTo(L + plotW, yy); g.stroke();
    g.fillText(axisTxt(v), W - R + 4, yy);
  }

  // time axis
  const per = Math.max(1, Math.ceil(m / Math.max(1, Math.floor(plotW / 64))), 1), span = (o.t[n - 1] - o.t[a]) / 86400;
  let prevD = null;
  g.textAlign = 'center';
  for (let i = a + Math.floor(per / 2); i < n; i += per) {
    const p = parts(o.t[i], o.off), xx = Math.round(X(i)) + 0.5;
    const txt = o.intra ? (prevD != null && prevD !== p.d ? `${pad(p.mo + 1)}/${pad(p.d)}` : `${pad(p.h)}:${pad(p.mi)}`)
      : span > 400 ? `${MON[p.mo]} ${String(p.y).slice(2)}` : `${MON[p.mo]} ${p.d}`;
    prevD = p.d;
    if (xx < L + 18 || xx > L + plotW - 18) continue;
    g.strokeStyle = '#121212'; g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, H - B); g.stroke();
    g.fillStyle = '#6d6d6d'; g.fillText(txt, xx, H - B / 2 + 1);
  }
  g.textAlign = 'left';

  // main pane content
  g.save(); g.beginPath(); g.rect(L, mp.y0, plotW, mp.y1 - mp.y0); g.clip();
  const legend = [];
  if (multi) {
    g.lineWidth = 1.5;
    for (const s of o.series) { g.strokeStyle = s.color; path(g, xs, s.v.slice(a), py); legend.push([s.name, s.color]); }
    if (o.base != null) { g.strokeStyle = '#444'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(L, py(o.base)); g.lineTo(L + plotW, py(o.base)); g.stroke(); g.setLineDash([]); }
  } else {
    if (o.band) {
      g.fillStyle = 'rgba(150,150,150,.12)'; g.beginPath();
      for (let i = a; i < n; i++) if (nn(o.band.u[i])) g.lineTo(X(i), py(o.band.u[i]));
      for (let i = n - 1; i >= a; i--) if (nn(o.band.l[i])) g.lineTo(X(i), py(o.band.l[i]));
      g.fill(); g.lineWidth = 1; g.strokeStyle = '#777';
      path(g, xs, o.band.u.slice(a), py); path(g, xs, o.band.l.slice(a), py); g.strokeStyle = '#555'; path(g, xs, o.band.m.slice(a), py);
      legend.push(['BB 20,2', '#777']);
    }
    const bw = Math.max(1, Math.floor(step * 0.7)), px = (i) => Math.round(X(i)) + 0.5;
    if (o.type === 'candle' || o.type === 'bar') {
      const P = { up: new Path2D(), dn: new Path2D() }, Bd = { up: new Path2D(), dn: new Path2D() }, tk = Math.max(1, Math.min(step * 0.4, 6));
      for (let i = a; i < n; i++) {
        const k = o.c[i] >= o.o[i] ? 'up' : 'dn', x = px(i), p = P[k];
        p.moveTo(x, py(o.h[i])); p.lineTo(x, py(o.l[i]));
        if (o.type === 'candle') { const y1 = py(o.o[i]), y2 = py(o.c[i]); Bd[k].rect(x - bw / 2, Math.min(y1, y2), bw, Math.max(1, Math.abs(y1 - y2))); }
        else { p.moveTo(x - tk, py(o.o[i])); p.lineTo(x, py(o.o[i])); p.moveTo(x, py(o.c[i])); p.lineTo(x + tk, py(o.c[i])); }
      }
      for (const k of ['up', 'dn']) { g.strokeStyle = g.fillStyle = k === 'up' ? UP : DN; g.stroke(P[k]); g.fill(Bd[k]); }
    } else {
      g.lineWidth = 1.5; g.strokeStyle = AMBER;
      if (o.type === 'area') {
        g.beginPath();
        for (let i = a; i < n; i++) g.lineTo(X(i), py(o.c[i]));
        g.lineTo(X(n - 1), mp.y1); g.lineTo(X(a), mp.y1); g.closePath();
        const gr = g.createLinearGradient(0, mp.y0, 0, mp.y1); gr.addColorStop(0, 'rgba(255,159,26,.35)'); gr.addColorStop(1, 'rgba(255,159,26,0)');
        g.fillStyle = gr; g.fill();
      }
      path(g, xs, o.c.slice(a), py);
    }
    g.lineWidth = 1;
    for (const s of o.overlays || []) { g.strokeStyle = s.color; path(g, xs, s.v.slice(a), py); legend.push([s.name, s.color]); }
  }
  g.restore();

  // last price tags + dashed line
  const tag = (v, col, txt) => {
    const yy = Math.min(mp.y1 - 6, Math.max(mp.y0 + 6, py(v)));
    g.fillStyle = col; g.fillRect(W - R + 1, yy - 7, R - 1, 14); g.fillStyle = '#000'; g.fillText(txt, W - R + 4, yy);
  };
  if (multi) o.series.forEach((s) => { const v = s.v[n - 1]; if (nn(v)) tag(v, s.color, v.toFixed(1)); });
  else {
    const v = o.c[n - 1], col = n > 1 && v < o.c[n - 2] ? DN : UP;
    g.strokeStyle = col; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(L, Math.round(py(v)) + 0.5); g.lineTo(L + plotW, Math.round(py(v)) + 0.5); g.stroke(); g.setLineDash([]);
    tag(v, col, priceTxt(v));
  }
  let lx = L + 4;
  for (const [name, col] of legend) { g.fillStyle = col; g.fillText(name, lx, mp.y0 + 22); lx += g.measureText(name).width + 10; }

  // sub panes
  for (const p of panes.slice(1)) {
    g.strokeStyle = '#222'; g.beginPath(); g.moveTo(L, p.y0 - 0.5); g.lineTo(L + plotW, p.y0 - 0.5); g.stroke();
    g.save(); g.beginPath(); g.rect(L, p.y0, plotW, p.y1 - p.y0); g.clip();
    g.fillStyle = '#6d6d6d';
    if (p.kind === 'vol') {
      let mx = 0;
      for (let i = a; i < n; i++) if (o.v[i] > mx) mx = o.v[i];
      p.sc = scale(0, mx || 1, p.y0 + 10, p.y1, false);
      const U = new Path2D(), D = new Path2D(), bw = Math.max(1, Math.floor(step * 0.7)), y0 = p.sc.y(0);
      for (let i = a; i < n; i++) (o.c[i] >= o.o[i] ? U : D).rect(Math.round(X(i)) - bw / 2, p.sc.y(o.v[i]), bw, Math.max(0, y0 - p.sc.y(o.v[i])));
      g.fillStyle = 'rgba(46,204,113,.55)'; g.fill(U); g.fillStyle = 'rgba(255,77,77,.55)'; g.fill(D);
      g.restore(); g.fillStyle = '#6d6d6d'; g.fillText('VOL', L + 4, p.y0 + 7); g.fillText(volTxt(mx), W - R + 4, p.y0 + 10);
    } else if (p.kind === 'rsi') {
      p.sc = scale(0, 100, p.y0 + 2, p.y1 - 2, false);
      g.strokeStyle = '#2a2a2a'; g.setLineDash([3, 3]);
      for (const v of [30, 70]) { g.beginPath(); g.moveTo(L, p.sc.y(v)); g.lineTo(L + plotW, p.sc.y(v)); g.stroke(); }
      g.setLineDash([]); g.strokeStyle = '#c678dd'; path(g, xs, p.p.v.slice(a), p.sc.y);
      g.restore(); g.fillStyle = '#6d6d6d'; g.fillText('RSI 14', L + 4, p.y0 + 7); g.fillText('70', W - R + 4, p.sc.y(70)); g.fillText('30', W - R + 4, p.sc.y(30));
    } else {
      let l2 = Infinity, h2 = -Infinity;
      for (let i = a; i < n; i++) for (const s of [p.p.m, p.p.s, p.p.h]) if (nn(s[i])) { if (s[i] < l2) l2 = s[i]; if (s[i] > h2) h2 = s[i]; }
      if (l2 > h2) { l2 = -1; h2 = 1; }
      l2 = Math.min(l2, 0); h2 = Math.max(h2, 0);
      p.sc = scale(l2, h2 === l2 ? l2 + 1 : h2, p.y0 + 10, p.y1 - 2, false);
      const U = new Path2D(), D = new Path2D(), z = p.sc.y(0), bw = Math.max(1, Math.floor(step * 0.7));
      for (let i = a; i < n; i++) if (nn(p.p.h[i])) (p.p.h[i] >= 0 ? U : D).rect(Math.round(X(i)) - bw / 2, Math.min(z, p.sc.y(p.p.h[i])), bw, Math.abs(z - p.sc.y(p.p.h[i])) || 1);
      g.fillStyle = 'rgba(46,204,113,.55)'; g.fill(U); g.fillStyle = 'rgba(255,77,77,.55)'; g.fill(D);
      g.strokeStyle = '#3aa0ff'; path(g, xs, p.p.m.slice(a), p.sc.y); g.strokeStyle = AMBER; path(g, xs, p.p.s.slice(a), p.sc.y);
      g.restore(); g.fillStyle = '#6d6d6d'; g.fillText('MACD 12,26,9', L + 4, p.y0 + 7);
    }
  }
  return { L, R, T, B, W, H, plotW, step, a, n, X, panes, multi };
}

function crosshair(g, geo, o, mx, my) {
  g.clearRect(0, 0, geo.W, geo.H);
  const { L, plotW, T, B, W, H, a, n, step } = geo;
  if (mx < L || mx > L + plotW || my < T || my > H - B) return;
  const i = Math.min(n - 1, a + Math.floor((mx - L) / step)), x = Math.round(geo.X(i)) + 0.5;
  g.font = '10px monospace'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.strokeStyle = '#666'; g.lineWidth = 1; g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.moveTo(L, my); g.lineTo(L + plotW, my); g.stroke(); g.setLineDash([]);
  const box = (txt, bx, by, bg, fg) => { const w = g.measureText(txt).width + 8; g.fillStyle = bg; g.fillRect(bx, by - 7, w, 14); g.fillStyle = fg; g.fillText(txt, bx + 4, by); return w; };
  const p = geo.panes.find((q) => my >= q.y0 && my <= q.y1);
  if (p?.sc) {
    const v = p.sc.inv(my);
    box(p.kind === 'vol' ? volTxt(v) : p.kind === 'main' ? (geo.multi ? v.toFixed(2) : priceTxt(v)) : v.toFixed(p.kind === 'rsi' ? 1 : 3), W - geo.R + 1, my, '#ff9f1a', '#000');
  }
  const ds = fmtDate(o.t[i], o.off, o.intra), dw = g.measureText(ds).width + 8;
  box(ds, Math.min(Math.max(L, x - dw / 2), W - geo.R - dw), H - B / 2, '#ff9f1a', '#000');
  // readout
  let rx = L + 4;
  const ry = T + 8, put = (txt, col) => { g.fillStyle = '#050505'; g.fillRect(rx - 2, ry - 7, g.measureText(txt).width + 4, 14); g.fillStyle = col; g.fillText(txt, rx, ry); rx += g.measureText(txt).width + 8; };
  put(ds, '#cfcfcf');
  if (geo.multi) o.series.forEach((s) => { if (nn(s.v[i])) put(`${s.name} ${s.v[i].toFixed(2)}`, s.color); });
  else {
    const prev = i > 0 ? o.c[i - 1] : o.o[i], ch = (o.c[i] / prev - 1) * 100;
    put(`O ${priceTxt(o.o[i])}`, '#cfcfcf'); put(`H ${priceTxt(o.h[i])}`, '#cfcfcf'); put(`L ${priceTxt(o.l[i])}`, '#cfcfcf'); put(`C ${priceTxt(o.c[i])}`, '#cfcfcf');
    put(`V ${volTxt(o.v[i])}`, '#cfcfcf'); put(`${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`, ch >= 0 ? UP : DN);
  }
}

// makeCanvas is core's canvas(box). Returns { set(opts), destroy() }; redraws on resize.
export function mountChart(box, makeCanvas, init) {
  let o = init, geo = null, ov = null, raf = 0, ro = null;
  const draw = () => {
    if (!box.isConnected) { ro?.disconnect(); return; }
    const cv = makeCanvas(box);
    if (!cv.W || !cv.H) return;
    geo = paint(cv.g, cv.W, cv.H, o);
    const e = document.createElement('canvas'), k = devicePixelRatio || 1;
    e.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
    e.width = cv.W * k; e.height = cv.H * k; box.appendChild(e);
    ov = e.getContext('2d'); ov.scale(k, k);
    cv.c.addEventListener('mousemove', (ev) => {
      if (!geo) return;
      const r = cv.c.getBoundingClientRect();
      crosshair(ov, geo, o, ev.clientX - r.left, ev.clientY - r.top);
    });
    cv.c.addEventListener('mouseleave', () => ov.clearRect(0, 0, cv.W, cv.H));
  };
  ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
  ro.observe(box);
  draw();
  return { set(next) { o = next; draw(); }, destroy() { ro.disconnect(); cancelAnimationFrame(raf); } };
}
