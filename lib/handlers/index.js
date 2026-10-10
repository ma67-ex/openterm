// On-demand data endpoints served through the single /api/data function (Vercel free plan caps function count).
// Each handler: async (query) => ({ body, status?, cache? }). Call as /api/data?fn=<name>&...
// Add one import and one map entry per handler. Handlers must validate every query value.
import quotes from './quotes.js';
import search from './search.js';

import earnings from './earnings.js';
import history from './history.js';
import fredseries, { curvehist } from './fredseries.js';
import news from './news.js';
import filings from './filings.js';
import halal from './halal.js';
export const handlers = { earnings, history, quotes, search, fredseries, curvehist, news, filings, halal };
