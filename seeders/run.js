// Seeder runner: fetch each group, skip the write if unchanged, count commands against the daily budget.
import { createHash } from 'node:crypto';
import { mget, set, incrBy, getNum, stats, usingUpstash } from '../lib/redis.js';
import { GROUPS, SNAP_TTL, DAILY_BUDGET } from './config.js';
import { fetchRows } from './yahoo.js';
import { fetchCurve, fetchCalendar } from './fred.js';

const FETCH = { yahoo: (c) => fetchRows(c.rows), 'fred-curve': fetchCurve, 'fred-calendar': fetchCalendar };

const force = process.argv.includes('--force');
const now = new Date();
const day = now.toISOString().slice(0, 10);
const weekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
const counterKey = `meta:cmds:${day}`;

const used = await getNum(counterKey);
const overBudget = used > DAILY_BUDGET * 0.8; // ponytail: crude throttle, only core groups run when over 80% of budget
if (overBudget) console.log(`budget ${used}/${DAILY_BUDGET}: core groups only`);

for (const [key, cfg] of Object.entries(GROUPS)) {
  const { when, hours } = cfg;
  if (!force && when === 'weekday' && !weekday) { console.log(`${key}: market closed, skip`); continue; }
  // hours-gated groups run in the first 20 minutes of their hours, so a late or skipped cron run still gets a second try
  if (!force && hours && !(hours.includes(now.getUTCHours()) && now.getUTCMinutes() < 20)) continue;
  if (overBudget && !['indices', 'watchlist'].includes(key)) continue;
  let data;
  try { data = await FETCH[cfg.source](cfg); } catch (e) { console.log(`${key}: ${e.message}`); continue; }
  if (!data.length) { console.log(`${key}: no data`); continue; }
  const hash = createHash('sha1').update(JSON.stringify(data)).digest('hex');
  const [old] = await mget([`snap:${key}`]);
  if (old?.hash === hash) { console.log(`${key}: unchanged, no write`); continue; }
  await set(`snap:${key}`, { asOf: now.toISOString(), hash, rows: data }, SNAP_TTL);
  console.log(`${key}: wrote ${data.length} rows`);
}
await incrBy(counterKey, stats.commands, 2 * 86400);
console.log(`done, ${stats.commands} commands (${usingUpstash ? 'upstash' : 'local file'})`);
