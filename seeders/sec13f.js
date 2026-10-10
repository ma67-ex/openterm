// Latest 13F-HR for a list of funds: top holdings by issuer, mapped to tickers by normalized company name.
import { readFileSync } from 'node:fs';
import { getSubmissions } from '../lib/edgar.js';
import { FUNDS } from './funds-list.js';

const UA = process.env.EDGAR_UA || 'OpenTerm/0.1 (open-source terminal)';
const GAP = 160;
const MAX_BYTES = 6e6; // skip information tables bigger than this (index giants) so a run stays short
const MAX_JSON = 28000; // snapshot budget is ~30 KB
let last = 0;
async function www(url) {
  const w = last + GAP - Date.now();
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  last = Date.now();
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`sec ${r.status}`);
  if (+(r.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('table too large');
  return r;
}

const ABBR = { FINL: 'FINANCIAL', TECHNOLOGIES: 'TECH', TECHNOLOGY: 'TECH', INTL: 'INTERNATIONAL', MFG: 'MANUFACTURING', PPTYS: 'PROPERTIES', PHARMACEUTICALS: 'PHARMA', PHARMACEUTICAL: 'PHARMA', LABS: 'LABORATORIES', RES: 'RESOURCES', BANCORP: 'BANCORP', ENTMT: 'ENTERTAINMENT', SVCS: 'SERVICES', COMMUNICATIONS: 'COMM', COMMUNICATION: 'COMM', SYS: 'SYSTEMS', INDS: 'INDUSTRIES', INDUSTRIAL: 'INDUSTRIES', AMERN: 'AMERICAN', NATL: 'NATIONAL', GLOBL: 'GLOBAL', ENERGY: 'ENERGY', PRODS: 'PRODUCTS', MKTS: 'MARKETS', MGMT: 'MANAGEMENT', HLDGS: '', HLDNGS: '', HLDG: '', HLDNG: '', AMER: 'AMERICA', PETE: 'PETROLEUM', MATLS: 'MATERIALS', COS: '', INCORPORATED: '', SEMICONDUCTOR: 'SEMI', SEMICONDUCTORS: 'SEMI', HOLDINGS: '', HOLDING: '', GROUP: '', GRP: '' };
const DROP = new Set(['INC', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'LLC', 'LP', 'NV', 'SA', 'AG', 'THE', 'COM', 'NEW', 'ORD', 'SHS', 'ADR', 'ADS', 'COMMON', 'STOCK', 'STK', 'CAP', 'CL', 'CLASS', 'A', 'B', 'C', 'SER', 'SERIES', 'DEL', 'DE', 'OF', 'DEL', 'NEW', 'REIT']);
export function norm(name) {
  return String(name).toUpperCase().replace(/\/[A-Z0-9]{1,5}\/?/g, ' ').replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => (w in ABBR ? ABBR[w] : w)).filter((w) => w && !DROP.has(w)).join(' ');
}

// normalized name -> first ticker in data/tickers.json
const byName = new Map();
for (const [t, [, n]] of Object.entries(JSON.parse(readFileSync(new URL('../data/tickers.json', import.meta.url), 'utf8')))) {
  const k = norm(n);
  if (k && !byName.has(k)) byName.set(k, t);
}

const tag = (x, n) => x.match(new RegExp(`<(?:\\w+:)?${n}>\\s*([^<]*?)\\s*</`, 'i'))?.[1] ?? null;
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

export function parseTable(xml) {
  const by = new Map();
  for (const [, x] of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi)) {
    if (tag(x, 'putCall') || (tag(x, 'sshPrnamtType') ?? 'SH') !== 'SH') continue;
    const cusip = tag(x, 'cusip'), name = unesc(tag(x, 'nameOfIssuer') ?? '');
    const v = +tag(x, 'value'), sh = +tag(x, 'sshPrnamt');
    if (!cusip || !(v >= 0)) continue;
    const e = by.get(cusip) ?? { issuer: name, shares: 0, value: 0 };
    e.shares += sh || 0; e.value += v;
    by.set(cusip, e);
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

async function one([name, cik]) {
  const sub = await getSubmissions(cik);
  const f = sub?.filings?.recent;
  const i = f?.form.findIndex((x) => x === '13F-HR');
  if (!f || i < 0) throw new Error('no 13F-HR');
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accessionNumber[i].replaceAll('-', '')}`;
  const idx = await (await www(`${base}/index.json`)).json();
  const doc = idx.directory.item.find((x) => /\.xml$/i.test(x.name) && !/primary_doc/i.test(x.name));
  if (!doc) throw new Error('no info table');
  const rows = parseTable(await (await www(`${base}/${doc.name}`)).text());
  // a few filers still report value in thousands: implied price of the top rows would be far below $1
  const head = rows.slice(0, 5), px = head.reduce((s, r) => s + r.value, 0) / (head.reduce((s, r) => s + r.shares, 0) || 1);
  if (px < 1) for (const r of rows) r.value *= 1000;
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const top = rows.slice(0, 40).map((r) => [byName.get(norm(r.issuer)) ?? null, r.issuer.slice(0, 24), r.shares, r.value]);
  return { name, cik, period: f.reportDate[i], filed: f.filingDate[i], totalValue, top, n: rows.length };
}

export async function fetchFunds(log = () => {}) {
  const out = [];
  for (const fund of FUNDS) {
    try { out.push(await one(fund)); } catch (e) { log(`${fund[0]}: skipped (${e.message})`); }
  }
  // trim holdings per fund until the snapshot fits
  let keep = 40;
  const pack = () => out.map(({ n, ...x }) => ({ ...x, top: x.top.slice(0, keep) }));
  while (keep > 10 && JSON.stringify(pack()).length > MAX_JSON) keep--;
  return pack();
}
