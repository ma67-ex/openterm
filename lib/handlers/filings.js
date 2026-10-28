// SEC filings list and Form 4 insider transactions: /api/data?fn=filings&s=AAPL[&view=insider]
import { tickerToCik, getSubmissions } from '../edgar.js';

const UA = process.env.EDGAR_UA || 'OpenTerm/0.1 (open-source terminal)';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';
const INSIDER = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';

function recent(s, cik) {
  const f = s.filings?.recent ?? {};
  const n = parseInt(cik, 10);
  return (f.form ?? []).map((form, i) => {
    const acc = f.accessionNumber[i].replaceAll('-', '');
    const doc = f.primaryDocument?.[i];
    return {
      form, date: f.filingDate[i], period: f.reportDate?.[i] || null,
      desc: f.primaryDocDescription?.[i] || '', items: f.items?.[i] || '',
      url: doc ? `https://www.sec.gov/Archives/edgar/data/${n}/${acc}/${doc}` : null,
      raw: doc ? `https://www.sec.gov/Archives/edgar/data/${n}/${acc}/${doc.split('/').pop()}` : null,
    };
  });
}

const tag = (x, name) => x.match(new RegExp(`<${name}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${name}>`, 'i'))?.[1] ?? null;
const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);

// Parse one Form 4 XML into owner, role and non-derivative transactions.
export function parseForm4(xml) {
  const owner = tag(xml, 'rptOwnerName');
  const role = tag(xml, 'officerTitle') || (tag(xml, 'isDirector') && /^(1|true)$/i.test(tag(xml, 'isDirector')) ? 'Director' : /^(1|true)$/i.test(tag(xml, 'isTenPercentOwner') ?? '') ? '10% owner' : null);
  const txs = [...xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)].map(([, x]) => ({
    date: tag(x, 'transactionDate'), code: tag(x, 'transactionCode'), shares: num(tag(x, 'transactionShares')),
    price: num(tag(x, 'transactionPricePerShare')), ad: tag(x, 'transactionAcquiredDisposedCode'), title: tag(x, 'securityTitle'),
  }));
  return { owner, role, txs };
}

async function form4(f) {
  const r = await fetch(f.raw, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`sec ${r.status}`);
  return parseForm4(await r.text());
}

export default async function filings(q) {
  const s = String(q.s || '').toUpperCase();
  const view = String(q.view || 'list');
  if (!/^[A-Z.\-]{1,10}$/.test(s) || !/^(list|insider)$/.test(view)) return { status: 400, body: { error: 'bad params' } };
  const co = await tickerToCik(s);
  if (!co) return { status: 404, body: { error: 'unknown ticker' }, cache: LIST };
  const sub = await getSubmissions(co.cik);
  if (!sub) return { status: 404, body: { error: 'no filings' }, cache: LIST };
  const all = recent(sub, co.cik);
  const name = sub.name;
  if (view === 'list') {
    // insider and 144 forms flood the feed; keep only a few so the other forms stay visible
    const noisy = (x) => /^(3|4|5|144)(\/A)?$/.test(x.form);
    const rows = [...all.filter((x) => !noisy(x)).slice(0, 150), ...all.filter(noisy).slice(0, 30)]
      .sort((a, b) => b.date.localeCompare(a.date)).map(({ raw, ...x }) => x);
    return { body: { s, name, rows }, cache: LIST };
  }
  const fl = all.filter((x) => /^4(\/A)?$/.test(x.form) && x.raw).slice(0, 15);
  const rows = [];
  let parsed = 0;
  // staggered starts keep us under ~7 requests a second while documents download in parallel
  const ps = await Promise.all(fl.map(async (f, i) => {
    await wait(i * 150);
    try { const p = await form4(f); parsed++; return p; } catch { return null; /* degrade to the filing row */ }
  }));
  for (const [i, f] of fl.entries()) {
    const p = ps[i];
    if (p?.txs.length) for (const t of p.txs) rows.push({ filed: f.date, owner: p.owner, role: p.role, ...t, url: f.url });
    else rows.push({ filed: f.date, owner: p?.owner ?? null, role: p?.role ?? null, url: f.url });
  }
  return { body: { s, name, parsed, filings: fl.length, rows }, cache: INSIDER };
}
