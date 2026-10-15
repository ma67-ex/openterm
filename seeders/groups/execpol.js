// Trump alone in one snapshot (his 278-T history is huge), the other executive-branch officials split over two. Data changes a few times a month.
import { fetchExec } from '../execpol.js';

const isTrump = (n) => n.startsWith('Trump, Donald');
const h = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
export default [
  { key: 'polt', when: 'always', hours: [2], fetch: () => fetchExec(isTrump, (m) => console.log(`polt: ${m}`)) },
  ...[0, 1].map((i) => ({ key: `polx${i}`, when: 'always', hours: [2], fetch: () => fetchExec((n) => !isTrump(n) && h(n) % 2 === i, () => {}) })),
];
