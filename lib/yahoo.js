// One way to talk to Yahoo's unofficial endpoints: retry with backoff, alternate between its two hosts, stay inside
// a time budget, and never launch hundreds of requests at once. Yahoo throttles shared cloud addresses (Vercel,
// GitHub Actions) in bursts, so a single attempt on a single host fails far more often than it needs to.

export const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA = { 'User-Agent': 'Mozilla/5.0 openterm' }; // a full Chrome UA string gets 429 from Yahoo, the short one does not
// Yahoo answers a throttled or blocked address with 429, and sometimes 401 or 403; the other host often still works.
// Anything else (200, 404 for an unknown symbol, 400 for a bad request) is a final answer: retrying would not change it.
const RETRY = new Set([401, 403, 408, 429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// What this process has learned about Yahoo (one serverless instance, or one seeder run), kept per host:
//  hostFails  consecutive failed attempts on each host; any answer from that host resets its count
// Hosts are tried healthiest first, so a blocked host stops being the first stop for every request. When BOTH hosts
// have failed TRIP_AFTER times in a row, Yahoo is skipped for COOLDOWN, so a real outage costs one short burst instead of
// seconds of retries per symbol. One blocked host never trips it: the other still answers.
const TRIP_AFTER = 3;
const COOLDOWN = 20_000;
const state = { hostFails: HOSTS.map(() => 0), openUntil: 0 };
export const resetYahoo = () => Object.assign(state, { hostFails: HOSTS.map(() => 0), openUntil: 0 });
const order = () => HOSTS.map((_, k) => k).sort((a, b) => state.hostFails[a] - state.hostFails[b] || a - b); // ties: query1 first

function open(now) {
  if (state.openUntil && now >= state.openUntil) { // cooldown over: let one probe through, which re-trips on a single failure per host
    state.openUntil = 0;
    state.hostFails.fill(TRIP_AFTER - 1);
  }
  return now < state.openUntil;
}

// fetch https://<host><path>, trying the hosts in turn. Returns the Response of the first final answer.
// Throws the last error when every try failed or the budget (ms, for all tries together) ran out.
export async function yahooFetch(path, { tries = 4, timeout = 8000, budget = 9000, fetchFn = fetch, sleep = wait, random = Math.random, now = Date.now, circuit = true } = {}) {
  const deadline = now() + budget;
  let last, lastHost = -1;
  for (let i = 0; i < tries; i++) {
    if (circuit && open(now())) { last = new Error('yahoo: backing off after repeated failures'); break; }
    const left = deadline - now();
    if (left <= 0) break;
    const o = order();
    const h = o[0] !== lastHost ? o[0] : o[1]; // the healthiest host, but never the one that just failed this request
    lastHost = h;
    try {
      const r = await fetchFn(`https://${HOSTS[h]}${path}`, { headers: UA, signal: AbortSignal.timeout(Math.min(timeout, left)) });
      if (!RETRY.has(r.status)) { state.hostFails[h] = 0; return r; }
      last = new Error(`yahoo ${r.status}`);
    } catch (e) {
      last = e; // a network error or timeout: same treatment as a throttle
    }
    state.hostFails[h]++;
    if (circuit && state.hostFails.every((n) => n >= TRIP_AFTER)) state.openUntil = now() + COOLDOWN;
    const pause = Math.min(400 * 2 ** i + random() * 200, deadline - now()); // 400, 800, 1600 ms plus jitter, never past the budget
    if (i < tries - 1 && pause > 0 && !(circuit && state.openUntil > now())) await sleep(pause); // no point waiting once the breaker has tripped
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
  const chunks = [];
  for (let i = 0; i < pairs.length; i += 20) chunks.push(pairs.slice(i, i + 20));
  const done = await mapLimit(chunks, 2, async (chunk) => {
    const r = await yahooFetch(`/v8/finance/spark?symbols=${chunk.map(([s]) => encodeURIComponent(s)).join(',')}&range=5d&interval=1d`, opts);
    if (!r.ok) return [];
    const d = await r.json();
    const out = [];
    for (const [s, n] of chunk) {
      const v = d?.[s];
      if (v && Number.isFinite(v.fulldayPrice) && Number.isFinite(v.fulldayChange)) {
        out.push({ s, n, p: v.fulldayPrice, c: +v.fulldayChange.toFixed(4), pc: +(v.fulldayChangePercent ?? 0).toFixed(2), v: null });
      }
    }
    return out;
  });
  return done.flatMap((o) => (o.status === 'fulfilled' ? o.value : [])); // a failed chunk stays missing; the others still count
}
