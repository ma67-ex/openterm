// Famous 13F filers: latest quarterly top holdings. Quarterly data, so it runs once a day and hash-skips unchanged filings.
import { fetchFunds } from '../sec13f.js';

export default { key: 'funds', when: 'always', hours: [3], fetch: () => fetchFunds((m) => console.log(`funds: ${m}`)) };
