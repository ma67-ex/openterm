// Offline tests for the Treasury and crypto fallbacks: fake fetch, no network. Run: node scripts/test-fallbacks.mjs
import assert from 'node:assert/strict';
import { parseCurveCsv, latestCurve, curveSince, COLS } from '../lib/treasury.js';
import { cryptoRows } from '../lib/crypto-fallback.js';
import { fetchRows } from '../seeders/yahoo.js';
import { curvehist } from '../lib/handlers/fredseries.js';
import { fetchCurve } from '../seeders/fred.js';

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const t = async (name, fn) => { await fn(); console.log('ok  ', name); };
const HEAD = 'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"';
const row = (date, ten) => `${date},4.06,4.08,4.17,4.18,4.21,4.28,4.42,4.61,4.73,4.78,4.87,${ten},5.35,5.32`;

await t('Treasury CSV: dates become ISO, rows sort oldest first, maturities map, blanks are null', () => {
  const rows = parseCurveCsv([HEAD, row('10/29/2026', 4.98), row('10/28/2026', 5.05), 'garbage line', '10/27/2026,,,,,,,,,,,,,,'].join('\n'));
  assert.deepEqual(rows.map((r) => r.date), ['2026-10-27', '2026-10-28', '2026-10-29']);
  assert.equal(rows[2].y['10Y'], 4.98);
  assert.equal(rows[2].y['1M'], 4.06);
  assert.equal(rows[0].y['10Y'], null);
  assert.deepEqual(Object.keys(rows[2].y), Object.keys(COLS));
  assert.deepEqual(parseCurveCsv(HEAD), []);
});

const thisYear = new Date().getUTCFullYear();
const mmddyyyy = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
// a Treasury that answers any year: two fixed dates, plus today's row in the current year
const treasury = (calls = []) => async (url) => {
  const u = String(url);
  if (!u.includes('home.treasury.gov')) return res(500, 'no');
  const y = +/rates\.csv\/(\d{4})\//.exec(u)[1];
  calls.push(y);
  const rows = [row(`01/05/${y}`, y - 2000), row(`06/15/${y}`, y - 2000 + 0.5)];
  if (y === thisYear) rows.push(row(mmddyyyy(new Date()), 4.98));
  return res(200, [HEAD, ...rows].join('\n'));
};

await t('latestCurve returns the latest and previous value per maturity', async () => {
  const out = await latestCurve(treasury());
  assert.equal(out.length, 11);
  const ten = out.find((o) => o.m === '10Y');
  assert.deepEqual([ten.y, ten.prev], [4.98, thisYear - 2000 + 0.5]);
  assert.equal(ten.date, new Date().toISOString().slice(0, 10));
});

await t('latestCurve reaches back a year when the new year has barely started', async () => {
  const calls = [];
  const f = async (url) => {
    const y = +/rates\.csv\/(\d{4})\//.exec(String(url))[1];
    calls.push(y);
    return res(200, [HEAD, y === thisYear ? row(`01/02/${y}`, 4.5) : row(`12/31/${y}`, 4.4)].join('\n'));
  };
  const ten = (await latestCurve(f)).find((o) => o.m === '10Y');
  assert.deepEqual([ten.y, ten.prev], [4.5, 4.4]);
  assert.deepEqual(calls.sort(), [thisYear - 1, thisYear]);
});

await t('curveSince fetches one file per year', async () => {
  const calls = [];
  const rows = await curveSince(thisYear - 2, treasury(calls));
  assert.deepEqual(calls.sort(), [thisYear - 2, thisYear - 1, thisYear]);
  assert.equal(rows.length, 7);
});

const withEnv = async (env, fn) => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  for (const k of Object.keys(env)) if (env[k] === undefined) delete process.env[k];
  try { return await fn(); } finally { process.env = saved; globalThis.fetch = realFetch; }
};

await t('curvehist without a FRED key serves the curve from the Treasury', async () => {
  await withEnv({ FRED_API_KEY: undefined }, async () => {
    globalThis.fetch = treasury();
    const out = await curvehist();
    assert.equal(out.status, undefined);
    assert.equal(out.body.maturities.length, 11);
    assert.deepEqual(out.body.curves.map((c) => c.label), ['TODAY', '1M AGO', '1Y AGO', '5Y AGO']);
    assert.equal(out.body.curves[0].y[out.body.maturities.indexOf('10Y')], 4.98);
    assert.ok(out.body.curves[3].y.every((v) => v != null));
  });
});

await t('curvehist falls back to the Treasury when FRED is failing', async () => {
  await withEnv({ FRED_API_KEY: 'k' }, async () => {
    const tr = treasury();
    globalThis.fetch = async (url, o) => (String(url).includes('stlouisfed') ? res(500, {}) : tr(url, o));
    const out = await curvehist();
    assert.equal(out.body.curves[0].y[out.body.maturities.indexOf('10Y')], 4.98);
  });
});

await t('fetchCurve (seeder) uses the Treasury with no key, or when FRED returns nothing', async () => {
  for (const key of [undefined, 'k']) {
    await withEnv({ FRED_API_KEY: key }, async () => {
      const tr = treasury();
      globalThis.fetch = async (url, o) => (String(url).includes('stlouisfed') ? res(500, {}) : tr(url, o));
      const out = await fetchCurve();
      assert.equal(out.length, 11);
      assert.equal(out.find((o) => o.m === '10Y').y, 4.98);
    });
  }
});

const krakenOk = (pair = 'XXBTZUSD') => res(200, { error: [], result: { [pair]: { c: ['78000.0', '1'], o: '77000.0', v: ['100', '2500.5'] } } });

await t('cryptoRows: Kraken first, with its own names (BTC is XBT) and the math from open to last', async () => {
  const asked = [];
  const f = async (url) => { asked.push(String(url)); return krakenOk(); };
  const [r] = await cryptoRows([['BTC-USD', 'Bitcoin']], { fetchFn: f });
  assert.deepEqual(r, { s: 'BTC-USD', n: 'Bitcoin', p: 78000, c: 1000, pc: 1.3, v: 2500.5 });
  assert.ok(asked[0].includes('pair=XBTUSD'));
  assert.equal(asked.length, 1);
});

await t('cryptoRows: Binance.US when Kraken has nothing; skipped when neither does; non-crypto ignored', async () => {
  const f = async (url) => {
    const u = String(url);
    if (u.includes('kraken')) return res(200, { error: ['EQuery:Unknown asset pair'], result: {} });
    if (u.includes('symbol=ETHUSD')) return res(200, { lastPrice: '2500.10', priceChange: '-25.5', priceChangePercent: '-1.01', volume: '900' });
    return res(400, { code: -1121 });
  };
  const rows = await cryptoRows([['ETH-USD', 'Ether'], ['NOPE-USD', 'Nope'], ['AAPL', 'Apple'], ['BTC-EUR', 'x']], { fetchFn: f });
  assert.deepEqual(rows, [{ s: 'ETH-USD', n: 'Ether', p: 2500.1, c: -25.5, pc: -1.01, v: 900 }]);
});

await t('fetchRows: a crypto pair Yahoo cannot answer is priced by Kraken', async () => {
  const f = async (url) => {
    const u = String(url);
    if (u.includes('kraken')) return krakenOk();
    return res(429, {}); // every Yahoo call is throttled, spark too
  };
  const rows = await fetchRows([['BTC-USD', 'Bitcoin'], ['AAPL', 'Apple']], { fetchFn: f, sleep: async () => {} });
  assert.deepEqual(rows.map((r) => r.s), ['BTC-USD']); // AAPL is not crypto, so nobody else prices it
  assert.equal(rows[0].p, 78000);
});

console.log('fallbacks: all checks passed');
