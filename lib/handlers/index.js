// On-demand data endpoints served through the single /api/data function (Vercel free plan caps function count).
// Each handler: async (query) => ({ body, status?, cache? }). Call as /api/data?fn=<name>&...
// Add one import and one map entry per handler. Handlers must validate every query value.
import quotes from './quotes.js';
import search from './search.js';

export const handlers = { quotes, search };
