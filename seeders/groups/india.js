// India snapshot: Nifty 50 names plus indices, VIX and USDINR. Rows: {s,n,p,pc,v,sec?,k?}; k='i' marks an index/macro row.
import { INDIA, INDIA_INDICES } from '../india-list.js';
import { fetchRows } from '../yahoo.js';

export default {
  key: 'india', when: 'weekday', everyMin: 30,
  async fetch() {
    const meta = new Map(INDIA.map((x) => [x.s, x]));
    const all = [...INDIA_INDICES, ...INDIA.map((x) => [x.s, x.n])];
    const out = [];
    for (let i = 0; i < all.length; i += 20) {
      const rows = await fetchRows(all.slice(i, i + 20));
      for (const r of rows) {
        const m = meta.get(r.s);
        out.push({ s: r.s, n: r.n, p: +r.p.toFixed(2), pc: r.pc, v: r.v, ...(m ? { sec: m.sec } : { k: 'i' }) });
      }
    }
    return out;
  },
};
