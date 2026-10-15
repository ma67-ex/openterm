// Congress trades (House + Senate periodic transaction reports). Filings land daily, so a few runs a day is plenty.
import { fetchCongress } from '../congress.js';

export default { key: 'congress', when: 'always', hours: [1, 7, 13, 19], fetch: () => fetchCongress((m) => console.log(`congress: ${m}`)) };
