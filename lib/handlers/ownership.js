// 5% holders from Schedule 13D/13G filings and an insider net-trading summary:
// /api/data?fn=ownership&s=AAPL[&view=insider].
import { tickerToCik, getSubmissions } from '../edgar.js';
import filings from './filings.js';

const UA = process.env.EDGAR_UA || 'OpenTerm/0.1 (open-source terminal)';
const CACHE = 'public, max-age=0, s-maxage=43200, stale-while-revalidate=86400';
const FORM = /^(SC |SCHEDULE )13[DG](\/A)?$/;
const MAX_FILINGS = 24; // keeps the request inside the 10 s function limit
const MAX_AGE = 3 * 365 * 864e5;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (x, n) => x.match(new RegExp(`<(?:\\w+:)?${n}>\\s*([^<]*?)\\s*</`, 'i'))?.[1] ?? null;
const toNum = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

// Structured XML (Schedule 13D/G since late 2024): first reporting person only.
function parseXml(x) {
  const name = tag(x, 'reportingPersonName');
  if (!name) return null;
  return {
    holder: decode(name),
    shares: toNum(tag(x, 'reportingPersonBeneficiallyOwnedAggregateNumberOfShares') ?? tag(x, 'aggregateAmountOwned')),
    pct: toNum(tag(x, 'classPercent') ?? tag(x, 'percentOfClass')),
  };
}

// Older HTML/text cover pages: first reporting person, best-effort regexes.
export function parseText(html) {
  const t = decode(html.slice(0, 400000).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  let name = t.match(/NAMES? OF REPORTING PERSONS?\.?\s*(?:\(?1\)?)?\s*(?:I\.?R\.?S\.? IDENTIFICATION NOS?\.? OF ABOVE PERSONS?\s*\(?(?:ENTITIES ONLY)?\)?\.?)?\s*(.{2,120}?)\s*(?:\(?2\)?\s*)?CHECK (?:THE )?APPROPRIATE/i)?.[1] ?? null;
  if (name) name = name.replace(/\s*\b\d{2}-\d{7}\b.*$/, '').replace(/^[:.\s]+|[\s:.]+$/g, '') || null;
  if (name) name = name.replace(/\s+\d{1,2}$/, '');
  const sh = t.match(/AGGREGATE AMOUNT BENEFICIALLY OWNED BY EACH REPORTING PERSON[^0-9]{0,160}?(\d[\d,]{3,})/i)?.[1];
  const pc = t.match(/PERCENT OF CLASS REPRESENTED BY AMOUNT IN ROW\s*\(?\d+\)?[^0-9]{0,40}?(\d{1,3}(?:\.\d+)?)\s*%/i)?.[1];
  return { holder: name, shares: toNum(sh), pct: toNum(pc) };
}

const names = new Map();
async function filerName(prefix) {
  if (!names.has(prefix)) names.set(prefix, getSubmissions(prefix).then((s) => s?.name ?? null, () => null));
  return names.get(prefix);
}

async function doc(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`sec ${r.status}`);
  return r.text();
}

async function holder(f) {
  let p = null;
  try {
    const x = await doc(f.raw);
    p = /<edgarSubmission|<reportingPersonName/i.test(x.slice(0, 3000)) || /<reportingPersonName/i.test(x) ? parseXml(x) : parseText(x);
  } catch { /* fall back to the filer id below */ }
  const prefix = parseInt(f.acc.slice(0, 10), 10);
  const name = p?.holder || (await filerName(prefix)) || `CIK ${prefix}`;
  return { holder: name, form: f.form, date: f.date, shares: p?.shares ?? null, pct: p?.pct ?? null, url: f.url };
}

async function holders(s, co) {
  const sub = await getSubmissions(co.cik);
  if (!sub) return { status: 404, body: { error: 'no filings' }, cache: CACHE };
  const f = sub.filings?.recent ?? {};
  const n = parseInt(co.cik, 10);
  const cutoff = new Date(Date.now() - MAX_AGE).toISOString().slice(0, 10);
  const cand = [];
  (f.form ?? []).forEach((form, i) => {
    if (!FORM.test(form) || f.filingDate[i] < cutoff || cand.length >= MAX_FILINGS) return;
    const acc = f.accessionNumber[i], doc = f.primaryDocument?.[i];
    if (!doc) return;
    const base = `https://www.sec.gov/Archives/edgar/data/${n}/${acc.replaceAll('-', '')}`;
    cand.push({ form, date: f.filingDate[i], acc, url: `${base}/${doc}`, raw: `${base}/${doc.split('/').pop()}` });
  });
  // staggered starts keep us under ~7 requests a second while documents download in parallel
  const rows = await Promise.all(cand.map(async (c, i) => { await wait(i * 150); return holder(c); }));
  const seen = new Set();
  const out = [];
  for (const r of rows) { // newest first: first row per holder is its latest filing
    const k = r.holder.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (seen.has(k)) continue;
    seen.add(k);
    if (r.shares === 0 || (r.pct != null && r.pct < 5)) continue; // exit filing: holder fell below 5%
    out.push(r);
  }
  out.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const top = out.slice(0, 25);
  const knownPct = +top.reduce((t, r) => t + (r.pct ?? 0), 0).toFixed(2);
  return { body: { s, name: sub.name, rows: top, knownPct, scanned: cand.length }, cache: CACHE };
}

async function insider(s) {
  const r = await filings({ s, view: 'insider' });
  if (r.status && r.status !== 200) return r;
  const by = new Map();
  for (const t of r.body.rows) {
    if (!t.owner) continue;
    const o = by.get(t.owner) ?? { owner: t.owner, role: t.role, bought: 0, sold: 0, buys: 0, sells: 0, last: t.filed };
    if (!o.role && t.role) o.role = t.role;
    if (t.filed > o.last) o.last = t.filed;
    if (t.code === 'P' && t.shares) { o.bought += t.shares; o.buys++; }
    if (t.code === 'S' && t.shares) { o.sold += t.shares; o.sells++; }
    by.set(t.owner, o);
  }
  const rows = [...by.values()].map((o) => ({ ...o, net: o.bought - o.sold })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return { body: { s, name: r.body.name, parsed: r.body.parsed, filings: r.body.filings, rows }, cache: CACHE };
}

export default async function ownership(q) {
  const s = String(q.s || '').toUpperCase();
  const view = String(q.view || 'holders');
  if (!/^[A-Z.\-]{1,10}$/.test(s) || !/^(holders|insider)$/.test(view)) return { status: 400, body: { error: 'bad params' } };
  const co = await tickerToCik(s);
  if (!co) return { status: 404, body: { error: 'unknown ticker' }, cache: CACHE };
  return view === 'insider' ? insider(s) : holders(s, co);
}
