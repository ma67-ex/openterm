// One way to talk to Yahoo's unofficial endpoints: retry with backoff, alternate between its two hosts, stay inside
// a time budget, and never launch hundreds of requests at once. Yahoo throttles shared cloud addresses (Vercel,
// GitHub Actions) in bursts, so a single attempt on a single host fails far more often than it needs to.

export const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' }; // a full Chrome UA string gets 429 from Yahoo, the short one does not
// Yahoo answers a throttled or blocked address with 429, and sometimes 401 or 403; the other host often still works.
// Anything else (200, 404 for an unknown symbol, 400 for a bad request) is a final answer: retrying would not change it.
const RETRY = new Set([401, 403, 408, 429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch https://<host><path>, trying the hosts in turn. Returns the Response of the first final answer.
// Throws the last error when every try failed or the budget (ms, for all tries together) ran out.
export async function yahooFetch(path, { tries = 4, timeout = 8000, budget = 9000, fetchFn = fetch, sleep = wait, random = Math.random } = {}) {
  const deadline = Date.now() + budget;
  let last;
  for (let i = 0; i < tries; i++) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    try {
      const r = await fetchFn(`https://${HOSTS[i % HOSTS.length]}${path}`, { headers: UA, signal: AbortSignal.timeout(Math.min(timeout, left)) });
      if (!RETRY.has(r.status)) return r;
      last = new Error(`yahoo ${r.status}`);
    } catch (e) {
      last = e; // a network error or timeout: same treatment as a throttle
    }
    const pause = Math.min(400 * 2 ** i + random() * 200, deadline - Date.now()); // 400, 800, 1600 ms plus jitter, never past the budget
    if (i < tries - 1 && pause > 0) await sleep(pause);
  }
  throw last ?? new Error('yahoo: out of time');
}

// Run fn over items with at most `limit` in flight. Like Promise.allSettled, but 500 symbols no longer means 500 requests at once.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { status: 'fulfilled', value: await fn(items[i], i) }; } catch (reason) { out[i] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Yahoo's spark endpoint prices up to 20 symbols in one request (21 or more is a 400). Slower to build, far gentler on
// rate limits: a second chance for symbols whose own chart request kept failing. No volume in this response.
export async function sparkRows(pairs, opts = {}) {
  const out = [];
  for (let i = 0; i < pairs.length; i += 20) {
    const chunk = pairs.slice(i, i + 20);
    try {
      const r = await yahooFetch(`/v8/finance/spark?symbols=${chunk.map(([s]) => encodeURIComponent(s)).join(',')}&range=5d&interval=1d`, opts);
      if (!r.ok) continue;
      const d = await r.json();
      for (const [s, n] of chunk) {
        const v = d?.[s];
        if (v && Number.isFinite(v.fulldayPrice) && Number.isFinite(v.fulldayChange)) {
          out.push({ s, n, p: v.fulldayPrice, c: +v.fulldayChange.toFixed(4), pc: +(v.fulldayChangePercent ?? 0).toFixed(2), v: null });
        }
      }
    } catch { /* this chunk stays missing; the others are still tried */ }
  }
  return out;
}
