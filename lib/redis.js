// Redis wrapper. Uses Upstash REST when configured, otherwise a local JSON file so dev needs no account.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch {} // no .env: fall back to local store
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const FILE = fileURLToPath(new URL('../cache/store.json', import.meta.url));
export const usingUpstash = Boolean(URL_ && TOKEN);
export const stats = { commands: 0 }; // commands issued by this process, flushed to a daily counter by the seeder

async function cmd(...args) {
  stats.commands++;
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}

const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; } };
const save = (d) => { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(d)); };

export async function mget(keys) {
  if (!keys.length) return [];
  if (usingUpstash) return (await cmd('MGET', ...keys)).map((v) => (v ? JSON.parse(v) : null));
  stats.commands++;
  const d = load();
  return keys.map((k) => d[k] ?? null);
}

export async function set(key, value, ttlSec) {
  if (usingUpstash) return cmd('SET', key, JSON.stringify(value), 'EX', ttlSec);
  stats.commands++;
  const d = load(); d[key] = value; save(d);
}

export async function incrBy(key, n, ttlSec) {
  if (usingUpstash) { await cmd('INCRBY', key, n); return cmd('EXPIRE', key, ttlSec); }
  const d = load(); d[key] = (d[key] || 0) + n; save(d);
}

export async function getNum(key) {
  if (usingUpstash) return Number(await cmd('GET', key)) || 0;
  return Number(load()[key]) || 0;
}
