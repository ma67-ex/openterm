// On-demand data endpoints served through the single /api/data function (Vercel free plan caps function count).
// Each handler: async (query) => ({ body, status?, cache? }). Call as /api/data?fn=<name>&...
// Add one import and one map entry per handler. Handlers must validate every query value.
import quotes from './quotes.js';
import search from './search.js';

import earnings from './earnings.js';
import history from './history.js';
import fredseries, { curvehist } from './fredseries.js';
import news from './news.js';
import wire from './wire.js';
import transcript from './transcript.js';
import filings from './filings.js';
import halal from './halal.js';
import company from './company.js';
import dividends from './dividends.js';
import ownership from './ownership.js';
import earningsdetail from './earningsdetail.js';
import analyst from './analyst.js';
import options from './options.js';
export const handlers = { earnings, history, quotes, search, fredseries, curvehist, news, wire, transcript, filings, halal, company, dividends, ownership, options, earningsdetail, analyst };
