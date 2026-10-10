// Central bank policy rates from FRED. Some are market proxies where FRED has no policy series.
import { fredObs, at, back, daysAgo, r3 } from './macro.js';

const BANKS = [
  ['Fed', 'Fed funds target (upper)', 'DFEDTARU'],
  ['ECB', 'Main refinancing rate', 'ECBMRRFR'],
  ['BoE', 'SONIA overnight (proxy)', 'IUDSOIA'],
  ['BoJ', 'Call money rate (proxy)', 'IRSTCI01JPM156N'],
  ['SNB', '3M interbank (proxy)', 'IR3TIB01CHM156N'],
  ['BoC', 'Call money rate (proxy)', 'IRSTCI01CAM156N'],
  ['RBA', 'Interbank rate (proxy)', 'IRSTCI01AUM156N'],
];

export default {
  key: 'cbrates', when: 'always', hours: [7],
  async fetch() {
    const res = await Promise.allSettled(BANKS.map(([, , id]) => fredObs(id, daysAgo(220))));
    return BANKS.flatMap(([b, n, id], i) => {
      const rows = res[i].status === 'fulfilled' ? res[i].value : [];
      if (!rows.length) return [];
      const [d, v] = rows.at(-1), p = at(rows, back(d, 91));
      return [{ b, n, id, v: r3(v), d, c3: p ? r3(v - p[1]) : null }];
    });
  },
};
