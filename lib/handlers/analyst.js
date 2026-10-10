// Analyst rating counts and price target for one ticker: /api/data?fn=analyst&s=AAPL (Nasdaq public JSON, unofficial)
import { nasdaq } from './earningsdetail.js';

const LONG = 'public, max-age=0, s-maxage=43200, stale-while-revalidate=86400';
const MISS = 'public, max-age=0, s-maxage=300';
const n = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);

export default async function analyst(q) {
  const s = String(q.s || '').toUpperCase();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(s)) return { status: 400, body: { error: 'bad symbol' } };
  const e = encodeURIComponent(s);
  const tp = await nasdaq(`analyst/${e}/targetprice`, 12 * 3600e3);
  const rt = await nasdaq(`analyst/${e}/ratings`, 12 * 3600e3).catch(() => null);
  const c = tp?.consensusOverview;
  if (!c || (c.priceTarget == null && c.buy == null)) return { status: 404, body: { error: 'no analyst coverage' }, cache: MISS };
  const history = (tp.historicalConsensus ?? []).map((h) => ({ date: h.z?.date, buy: n(h.z?.buy), hold: n(h.z?.hold), sell: n(h.z?.sell), target: n(h.y) })).slice(-13);
  return {
    body: {
      s, rating: rt?.meanRatingType ?? null, summary: rt?.ratingsSummary ?? null,
      buy: n(c.buy), hold: n(c.hold), sell: n(c.sell),
      target: { high: n(c.highPriceTarget), mean: n(c.priceTarget), low: n(c.lowPriceTarget) }, history,
    },
    cache: LONG,
  };
}
