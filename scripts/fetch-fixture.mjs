// Run: node scripts/fetch-fixture.mjs AAPL SPY VFC
// Saves 10 years of daily dividend-adjusted closes to scripts/fixtures/<SYM>.json so backtest numbers
// in the README and the Python cross-check are reproducible instead of changing every day.
import { mkdirSync, writeFileSync } from 'node:fs';
import { yahoo } from '../lib/handlers/history.js';
import { closesFrom } from '../public/mods/btlib.js';

const dir = new URL('./fixtures/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const sym of process.argv.slice(2)) {
  const res = JSON.parse(await yahoo(sym, '10y', '1d')).chart.result[0];
  const { c, t, adjusted } = closesFrom(res);
  if (!adjusted) throw new Error(`${sym}: Yahoo sent no adjusted closes`);
  // drop today's bar: during market hours it is a live, still-changing price, not a close
  const today = new Date().toISOString().slice(0, 10);
  const all = t.map((s) => new Date(s * 1000).toISOString().slice(0, 10));
  const keep = all.map((d) => d < today);
  const dates = all.filter((_, i) => keep[i]), close = c.filter((_, i) => keep[i]);
  writeFileSync(new URL(`${sym}.json`, dir), JSON.stringify({ symbol: sym, fetched: new Date().toISOString(), adjusted, dates, close }));
  console.log(`${sym}: ${close.length} days, ${dates[0]} to ${dates.at(-1)}`);
}
