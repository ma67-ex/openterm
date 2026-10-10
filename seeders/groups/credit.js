// US credit, inflation expectations and funding dashboard from FRED, with 60-point sparklines.
import { fredObs, at, back, daysAgo, r3 } from './macro.js';

const SERIES = [
  ['HY OAS', 'BAMLH0A0HYM2', '%'], ['IG OAS', 'BAMLC0A0CM', '%'], ['BBB OAS', 'BAMLC0A4CBBB', '%'],
  ['10Y breakeven', 'T10YIE', '%'], ['5Y5Y fwd infl', 'T5YIFR', '%'], ['SOFR', 'SOFR', '%'],
  ['2s10s', 'T10Y2Y', '%'], ['3m10y', 'T10Y3M', '%'], ['30Y mortgage', 'MORTGAGE30US', '%'], ['VIX', 'VIXCLS', ''],
];

export default {
  key: 'credit', when: 'always', hours: [12, 22],
  async fetch() {
    const res = await Promise.allSettled(SERIES.map(([, id]) => fredObs(id, daysAgo(430))));
    return SERIES.flatMap(([n, id, u], i) => {
      const rows = res[i].status === 'fulfilled' ? res[i].value : [];
      if (rows.length < 2) return [];
      const [d, v] = rows.at(-1);
      const chg = (ref) => (ref ? r3(v - ref[1]) : null);
      return [{ n, id, u, v: r3(v), d, c1: chg(rows.at(-2)), c5: chg(at(rows, back(d, 7))), c21: chg(at(rows, back(d, 30))), sp: rows.slice(-60).map((r) => +r[1].toFixed(2)) }];
    });
  },
};
