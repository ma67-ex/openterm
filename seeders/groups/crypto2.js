// Top-30 crypto monitor (separate from the ticker-tape `crypto` group).
import { fetchCrypto } from '../coingecko.js';

export default { key: 'crypto2', when: 'always', everyMin: 15, fetch: fetchCrypto };
