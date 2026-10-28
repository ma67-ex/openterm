// Run: node scripts/bt-report.mjs           print the results table from the stored fixtures
//      node scripts/bt-report.mjs --write   put it in README.md between the bt-report markers
//      node scripts/bt-report.mjs --check   exit 1 if README.md does not match the fixtures
import { readFileSync, writeFileSync } from 'node:fs';
import { backtest, sweep, walkForward } from '../public/mods/btlib.js';

const SYMS = ['AAPL', 'SPY', 'VFC'];
const START = '<!-- bt-report:start -->', END = '<!-- bt-report:end -->';
const readme = new URL('../README.md', import.meta.url);
const pct = (v) => `${(v * 100).toFixed(1)}%`, dec = (v) => (v == null ? '--' : v.toFixed(2));

const rows = SYMS.map((s) => {
  const fx = JSON.parse(readFileSync(new URL(`./fixtures/${s}.json`, import.meta.url)));
  const r = backtest(fx.close, 50, 200), sw = sweep(fx.close), wf = walkForward(fx.close);
  return { s, to: fx.dates.at(-1), r, sw, wf };
});
const table = [
  `Stored daily closes, ${rows[0].to} back 10 years, no costs. Regenerate with \`node scripts/bt-report.mjs --write\`.`,
  '',
  '| Ticker | 50/200 Sharpe (CAGR) | Buy & hold Sharpe (CAGR) | Best of 22 pairs, full period | Walk-forward out-of-sample Sharpe (CAGR) | Best pair in hindsight, same days | Buy & hold, same days |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(({ s, r, sw, wf }) => `| ${s} | ${dec(r.strategy.sharpe)} (${pct(r.strategy.cagr)}) | ${dec(r.hold.sharpe)} (${pct(r.hold.cagr)}) | ${sw.best.fast}/${sw.best.slow}: ${dec(sw.best.sharpe)} | ${dec(wf.oos.sharpe)} (${pct(wf.oos.cagr)}) | ${wf.hindsight.fast}/${wf.hindsight.slow}: ${dec(wf.hindsight.sharpe)} | ${dec(wf.oosHold.sharpe)} (${pct(wf.oosHold.cagr)}) |`),
].join('\n');

const mode = process.argv[2];
if (!mode) { console.log(table); process.exit(0); }
const text = readFileSync(readme, 'utf8'), a = text.indexOf(START), b = text.indexOf(END);
if (a < 0 || b < a) { console.error('README.md has no bt-report markers'); process.exit(1); }
const next = `${text.slice(0, a + START.length)}\n${table}\n${text.slice(b)}`;
if (mode === '--write') { writeFileSync(readme, next); console.log('README.md updated'); }
else if (mode === '--check') {
  if (next !== text) { console.error('README.md results are out of date: run node scripts/bt-report.mjs --write'); process.exit(1); }
  console.log('README.md results match the fixtures');
} else { console.error(`unknown option ${mode}`); process.exit(1); }
