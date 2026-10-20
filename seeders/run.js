// Seeder runner: fetch each group, skip the write if unchanged, count commands against the daily budget.
import { createHash } from 'node:crypto';
import { mget, set, incrBy, getNum, stats, usingUpstash } from '../lib/redis.js';
import { GROUPS, SNAP_TTL, DAILY_BUDGET } from './config.js';
import { fetchRows } from './yahoo.js';
import { fetchCurve, fetchCalendar } from './fred.js';
import { fetchNews } from './news.js';

const FETCH = { yahoo: (c) => fetchRows(c.rows), 'fred-curve': fetchCurve, 'fred-calendar': fetchCalendar, news: fetchNews };

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
  let old;
  if (hours) {
    // GitHub's scheduled cron drifts by hours, not the configured 10 min, so a single narrow per-hour
    // window gets missed almost every day. Run once per hour-threshold reached instead of once per exact hour:
    // any run from that hour onward (same UTC day) catches up, and multi-hour groups still get one attempt
    // per threshold crossed (not collapsed into a single once-a-day run).
    const due = hours.filter((h) => h <= now.getUTCHours());
    [old] = await mget([`snap:${key}`]);
    const doneThru = old?.asOf?.slice(0, 10) === day && old.asOf.slice(11, 13) >= String(Math.max(...due)).padStart(2, '0');
    if (!force && (!due.length || doneThru)) continue;
  }
  // slot [n, of]: run only in the n-th 10-minute slot of every `of` slots, so shards spread across the hour
  if (!force && cfg.slot && Math.floor(now.getUTCMinutes() / 10) % cfg.slot[1] !== cfg.slot[0]) continue;
  if (!force && cfg.everyMin && now.getUTCMinutes() % cfg.everyMin >= 10) continue;
  if (overBudget && !['indices', 'watchlist'].includes(key)) continue;
  let data;
  try { data = await (cfg.fetch ?? FETCH[cfg.source])(cfg); } catch (e) { console.log(`${key}: ${e.message}`); continue; }
  if (!data.length) { console.log(`${key}: no data`); continue; }
  const hash = createHash('sha1').update(JSON.stringify(data)).digest('hex');
  if (old === undefined) [old] = await mget([`snap:${key}`]);
  if (old?.hash === hash) { console.log(`${key}: unchanged, no write`); continue; }
  await set(`snap:${key}`, { asOf: now.toISOString(), hash, rows: data }, SNAP_TTL);
  console.log(`${key}: wrote ${data.length} rows`);
}
await incrBy(counterKey, stats.commands, 2 * 86400);
console.log(`done, ${stats.commands} commands (${usingUpstash ? 'upstash' : 'local file'})`);
