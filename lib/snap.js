// Shared by the local server and the Vercel function. Reads only whitelisted snapshot keys.
import { mget } from './redis.js';
import { GROUPS } from '../seeders/config.js';

const ALLOWED = new Set(Object.keys(GROUPS));

export async function readSnaps(keysParam) {
  const keys = [...new Set(String(keysParam || '').split(',').filter((k) => ALLOWED.has(k)))];
  const vals = await mget(keys.map((k) => `snap:${k}`));
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}
