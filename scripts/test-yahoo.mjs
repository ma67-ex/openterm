// Offline tests for lib/yahoo.js: fake fetch and sleep, no network. Run: node scripts/test-yahoo.mjs
import assert from 'node:assert/strict';
import { yahooFetch, mapLimit, sparkRows, HOSTS } from '../lib/yahoo.js';
import { fetchRows } from '../seeders/yahoo.js';

const res = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });
// a fetch that answers from a script and records the host of every call
const scripted = (...answers) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(new URL(url).hostname);
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return a;
  };
  fn.calls = calls;
  return fn;
};
const sleeps = () => { const s = []; const fn = async (ms) => { s.push(ms); }; fn.s = s; return fn; };
const t = async (name, fn) => { await fn(); console.log('ok  ', name); };

await t('a throttled first host is retried on the second host', async () => {
  const f = scripted(res(429), res(200, { ok: 1 })), sl = sleeps();
  const r = await yahooFetch('/x', { fetchFn: f, sleep: sl, random: () => 0 });
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls, [HOSTS[0], HOSTS[1]]);
  assert.deepEqual(sl.s, [400]);
});

await t('network errors and server errors are retried too', async () => {
  const f = scripted(new Error('ECONNRESET'), res(503), res(200)), sl = sleeps();
  assert.equal((await yahooFetch('/x', { fetchFn: f, sleep: sl, random: () => 0 })).status, 200);
  assert.deepEqual(f.calls, [HOSTS[0], HOSTS[1], HOSTS[0]]);
  assert.deepEqual(sl.s, [400, 800]); // backs off
});

await t('a 404 or 400 is a final answer: one call, no retry', async () => {
  for (const code of [404, 400]) {
    const f = scripted(res(code)), sl = sleeps();
    assert.equal((await yahooFetch('/x', { fetchFn: f, sleep: sl })).status, code);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(sl.s, []);
  }
});

await t('every try failing throws the last error after all tries, alternating hosts', async () => {
  const f = scripted(res(429)), sl = sleeps();
  await assert.rejects(yahooFetch('/x', { fetchFn: f, sleep: sl, random: () => 0 }), /yahoo 429/);
  assert.deepEqual(f.calls, [HOSTS[0], HOSTS[1], HOSTS[0], HOSTS[1]]);
  assert.deepEqual(sl.s, [400, 800, 1600]); // no pause after the last try
});

await t('the time budget stops the loop before it starts another try', async () => {
  const f = scripted(res(200));
  await assert.rejects(yahooFetch('/x', { fetchFn: f, budget: 0 }), /out of time/);
  assert.equal(f.calls.length, 0);
});

await t('mapLimit never exceeds the limit, keeps order, and reports failures instead of throwing', async () => {
  let live = 0, peak = 0;
  const out = await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async (i) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 2));
    live--;
    if (i === 7) throw new Error('boom');
    return i * 2;
  });
  assert.equal(peak, 3);
  assert.deepEqual(out.map((o) => o.status === 'fulfilled' ? o.value : 'x'), Array.from({ length: 20 }, (_, i) => (i === 7 ? 'x' : i * 2)));
  assert.equal(out[7].reason.message, 'boom');
  assert.deepEqual(await mapLimit([], 4, async () => 1), []);
});

const spark = (syms) => Object.fromEntries(syms.map((s, i) => [s, { fulldayPrice: 100 + i, fulldayChange: 1.5, fulldayChangePercent: 1.4999 }]));

await t('spark batches at most 20 symbols per request and maps the fields', async () => {
  const syms = Array.from({ length: 45 }, (_, i) => `S${i}`);
  const sizes = [];
  const f = async (url) => {
    const asked = new URL(url).searchParams.get('symbols').split(',');
    sizes.push(asked.length);
    return res(200, spark(asked));
  };
  const rows = await sparkRows(syms.map((s) => [s, `N-${s}`]), { fetchFn: f });
  assert.deepEqual(sizes, [20, 20, 5]);
  assert.equal(rows.length, 45);
  assert.deepEqual(rows[0], { s: 'S0', n: 'N-S0', p: 100, c: 1.5, pc: 1.5, v: null });
});

await t('spark skips symbols it did not return and a failed chunk does not stop the rest', async () => {
  let n = 0;
  const f = async (url) => {
    n++;
    if (n === 1) return res(400);
    const asked = new URL(url).searchParams.get('symbols').split(',');
    return res(200, spark(asked.filter((s) => s !== 'S25')));
  };
  const rows = await sparkRows(Array.from({ length: 30 }, (_, i) => [`S${i}`, `S${i}`]), { fetchFn: f, sleep: async () => {} });
  assert.equal(rows.length, 9); // chunk one (20) failed; chunk two had 10 and lacked S25
  assert.ok(!rows.some((r) => r.s === 'S25'));
});

await t('fetchRows: a symbol whose chart request keeps failing is recovered through spark, order kept', async () => {
  const chart = (price) => res(200, { chart: { result: [{ meta: { regularMarketPrice: price, regularMarketTime: 1000, regularMarketVolume: 5 }, timestamp: [100, 1000], indicators: { quote: [{ close: [90, price] }] } }] } });
  const f = async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/spark')) return res(200, spark(u.searchParams.get('symbols').split(',')));
    return u.pathname.endsWith('/BAD') ? res(429) : chart(u.pathname.endsWith('/AAA') ? 50 : 70);
  };
  const rows = await fetchRows([['AAA', 'A'], ['BAD', 'B'], ['CCC', 'C']], { fetchFn: f, sleep: async () => {} });
  assert.deepEqual(rows.map((r) => r.s), ['AAA', 'BAD', 'CCC']);
  assert.equal(rows[0].p, 50);
  assert.equal(rows[1].v, null); // the spark fallback has no volume
  assert.equal(rows[2].v, 5);
});

await t('fetchRows: a symbol nobody can price is left out, not an error', async () => {
  const f = async () => res(404);
  assert.deepEqual(await fetchRows([['ZZZZ', 'z']], { fetchFn: f, sleep: async () => {} }), []);
});

await t('quotes: nothing priced answers 502 with no cache headers, so an outage is not cached as an empty 200', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => res(404); // every symbol unknown: a final answer, so no retries and no waiting
  try {
    const { default: quotes } = await import('../lib/handlers/quotes.js');
    const out = await quotes({ s: 'ZZZZ,YYYY' });
    assert.equal(out.status, 502);
    assert.equal(out.cache, undefined);
    assert.equal((await quotes({ s: '' })).status, 400);
  } finally { globalThis.fetch = real; }
});

console.log('yahoo: all checks passed');
