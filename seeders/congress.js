// US Congress stock trades (STOCK Act periodic transaction reports): House Clerk XML index + PDFs, Senate eFD search + HTML reports.
// Official sources, no key. House PDFs need poppler's pdftotext (present on ubuntu runners and macOS brew).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UA = 'Mozilla/5.0 (OpenTerm open-source terminal)';
const MAX_FILINGS = 40; // newest N filings per chamber per run
const MAX_JSON = 28000; // snapshot budget is ~30 KB
const GAP = 250;
let last = 0;
async function get(url, opt = {}) {
  const w = last + GAP - Date.now();
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  last = Date.now();
  const r = await fetch(url, { ...opt, headers: { 'User-Agent': UA, ...opt.headers }, signal: AbortSignal.timeout(30000), redirect: opt.redirect ?? 'follow' });
  if (!r.ok && r.status !== 302) throw new Error(`${new URL(url).host} ${r.status}`);
  return r;
}
const iso = (d) => { const m = String(d).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const TICK = /^[A-Z][A-Z0-9.\-]{0,5}$/;

// ---- House ----
const ANCHOR = /(\S.*?)?\s{2,}(P|S|S \(partial\)|E)\s+(\d\d\/\d\d\/\d{4})\s+(\d\d\/\d\d\/\d{4})\s+(\$[\d,]+(?:\s*-\s*(?:\$[\d,]+)?)?)/;
export function parseHouse(text, who) {
  const lines = text.split('\n'), rows = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ANCHOR);
    if (!m) continue;
    const tcol = lines[i].indexOf(m[2], (m[1] ?? '').length) ?? 0;
    let asset = m[1] ?? '', amt = m[5];
    // continuation lines up to the "F S : New" marker carry the asset tail (left of the type column) and amount tail (right)
    for (let j = i + 1; j < lines.length && !/^\s*F\s+S\s*:/.test(lines[j]) && !ANCHOR.test(lines[j]) && j < i + 6; j++) {
      asset += ' ' + lines[j].slice(0, tcol);
      const tail = lines[j].slice(tcol + 40).trim();
      if (/^\$[\d,]+$/.test(tail) && /-$/.test(amt.trim())) amt = amt.trim() + ' ' + tail;
    }
    const owner = asset.match(/^\s*(SP|JT|DC)\b/)?.[1] ?? '';
    asset = asset.replace(/^\s*(SP|JT|DC)\b/, '').replace(/\s+/g, ' ').trim();
    const t = asset.match(/\(([A-Z][A-Z0-9.\-]{0,5})\)/)?.[1];
    const code = asset.match(/\[([A-Z]{2})\]/)?.[1] ?? '';
    rows.push({ ...who, owner, ticker: t && TICK.test(t) ? t : null, asset: asset.replace(/\s*\[[A-Z]{2}\]/, '').replace(/\s*\([A-Z0-9.\-]{1,6}\)/, ''), code, type: m[2][0], tx: iso(m[3]), amount: amt.replace(/\s+/g, ' ').replace(/\s*-\s*$/, '') });
  }
  return rows;
}

export async function house(log) {
  const year = new Date().getUTCFullYear();
  const xml = await (await get(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.xml`)).text();
  const tag = (x, n) => x.match(new RegExp(`<${n}>([^<]*)</${n}>`))?.[1]?.trim() ?? '';
  const filings = [...xml.matchAll(/<Member>([\s\S]*?)<\/Member>/g)].map((m) => m[1]).filter((m) => tag(m, 'FilingType') === 'P')
    .map((m) => ({ name: unesc(`${tag(m, 'First')} ${tag(m, 'Last')} ${tag(m, 'Suffix')}`), st: tag(m, 'StateDst'), filed: iso(tag(m, 'FilingDate')), id: tag(m, 'DocID') }))
    .filter((f) => f.id && f.filed).sort((a, b) => b.filed.localeCompare(a.filed)).slice(0, MAX_FILINGS);
  const dir = mkdtempSync(join(tmpdir(), 'cong-'));
  const out = [];
  for (const f of filings) {
    try {
      const url = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${f.id}.pdf`;
      writeFileSync(join(dir, 'p.pdf'), Buffer.from(await (await get(url)).arrayBuffer()));
      const text = execFileSync('pdftotext', ['-layout', join(dir, 'p.pdf'), '-'], { encoding: 'utf8', maxBuffer: 1e7 });
      out.push(...parseHouse(text, { who: f.name, ch: 'H', st: f.st, filed: f.filed, url: f.id }));
    } catch (e) { log(`house ${f.id}: ${e.message}`); }
  }
  rmSync(dir, { recursive: true, force: true });
  return out;
}

// ---- Senate ----
const jar = {};
const eat = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [k, v] = c.split(';')[0].split('='); jar[k] = v; } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const SB = 'https://efdsearch.senate.gov';

export function parseSenate(html, who) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => unesc(c[1].replace(/<div[\s\S]*?<\/div>/g, ' ').replace(/<[^>]+>/g, ' '))))
    .filter((c) => c.length >= 8).map((c) => {
      const tk = c[3].toUpperCase();
      return { ...who, owner: { Spouse: 'SP', Joint: 'JT', Child: 'DC' }[c[2]] ?? '', ticker: TICK.test(tk) ? tk : null, asset: c[4], code: c[5], type: c[6][0] === 'P' ? 'P' : c[6][0] === 'S' ? 'S' : 'E', tx: iso(c[1]), amount: c[7] };
    });
}

async function senate(log) {
  let r = await get(`${SB}/search/home/`); eat(r);
  const tok = (await r.text()).match(/csrfmiddlewaretoken" value="([^"]+)/)?.[1];
  if (!tok) throw new Error('senate: no csrf token');
  r = await get(`${SB}/search/home/`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie(), Referer: `${SB}/search/home/`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ prohibition_agreement: '1', csrfmiddlewaretoken: tok }) });
  eat(r);
  const tok2 = jar.csrftoken;
  const since = new Date(Date.now() - 120 * 86400e3);
  const sd = `${String(since.getUTCMonth() + 1).padStart(2, '0')}/${String(since.getUTCDate()).padStart(2, '0')}/${since.getUTCFullYear()} 00:00:00`;
  r = await get(`${SB}/search/report/data/`, { method: 'POST', headers: { Cookie: cookie(), Referer: `${SB}/search/`, 'X-CSRFToken': tok2, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ start: '0', length: String(MAX_FILINGS), report_types: '[11]', filer_types: '[]', submitted_start_date: sd, submitted_end_date: '', candidate_state: '', senator_state: '', office_id: '', first_name: '', last_name: '', 'order[0][column]': '4', 'order[0][dir]': 'desc', csrfmiddlewaretoken: tok2 }) });
  const list = (await r.json()).data ?? [];
  const out = [];
  for (const [first, lastN, , link, date] of list) {
    const path = link.match(/href="(\/search\/view\/ptr\/[^"]+)"/)?.[1];
    if (!path) continue; // paper filings are scanned images
    try {
      const html = await (await get(SB + path, { headers: { Cookie: cookie() } })).text();
      out.push(...parseSenate(html, { who: unesc(`${first} ${lastN}`), ch: 'S', st: '', filed: iso(date), url: path.split('/').filter(Boolean).pop() }));
    } catch (e) { log(`senate ${path}: ${e.message}`); }
  }
  return out;
}

export async function fetchCongress(log = () => {}) {
  const all = [];
  for (const f of [house, senate]) { try { all.push(...await f(log)); } catch (e) { log(`${f.name}: ${e.message}`); } }
  // equities and tickered assets only, newest first per chamber; compact arrays [who, chamber, state, owner, ticker, asset, type, tx, filed, amount, filing id]
  // the id rebuilds the link: House ptr-pdfs/<filed year>/<id>.pdf, Senate /search/view/ptr/<id>/
  const by = (ch) => all.filter((x) => x.ch === ch && x.ticker && x.tx).sort((a, b) => b.tx.localeCompare(a.tx) || b.filed.localeCompare(a.filed))
    .map((x) => [x.who, x.ch, x.st, x.owner, x.ticker, x.asset.slice(0, 36), x.type, x.tx, x.filed, x.amount, x.url]);
  const hs = by('H'), ss = by('S');
  let n = Math.max(hs.length, ss.length), rows = [];
  for (; n > 10; n--) { rows = [...hs.slice(0, n), ...ss.slice(0, n)]; if (JSON.stringify(rows).length <= MAX_JSON) break; }
  rows.sort((a, b) => b[7].localeCompare(a[7]));
  return rows;
}

// ---- full history for per-politician portfolios (POL) ----
const tagOf = (x, n) => x.match(new RegExp(`<${n}>([^<]*)</${n}>`))?.[1]?.trim() ?? '';
let filingsP = null;
// every House + Senate trade-report filing from the last `days` days: { ch, who, st, filed, id, year }
export function listFilings(days = 730, log = () => {}) {
  return (filingsP ??= (async () => {
    const cut = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10), out = [];
    const y = new Date().getUTCFullYear();
    for (const year of [y, y - 1, y - 2].filter((v) => v >= +cut.slice(0, 4))) {
      try {
        const xml = await (await get(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.xml`)).text();
        for (const [, m] of xml.matchAll(/<Member>([\s\S]*?)<\/Member>/g)) {
          const f = iso(tagOf(m, 'FilingDate')), id = tagOf(m, 'DocID');
          if (tagOf(m, 'FilingType') === 'P' && id && f && f >= cut) out.push({ ch: 'H', who: unesc(`${tagOf(m, 'First')} ${tagOf(m, 'Last')} ${tagOf(m, 'Suffix')}`), st: tagOf(m, 'StateDst'), filed: f, id, year: f.slice(0, 4) });
        }
      } catch (e) { log(`house list ${year}: ${e.message}`); }
    }
    try {
      let r = await get(`${SB}/search/home/`); eat(r);
      const tok = (await r.text()).match(/csrfmiddlewaretoken" value="([^"]+)/)?.[1];
      r = await get(`${SB}/search/home/`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie(), Referer: `${SB}/search/home/`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ prohibition_agreement: '1', csrfmiddlewaretoken: tok }) });
      eat(r);
      const d = new Date(cut + 'T00:00:00Z'), sd = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()} 00:00:00`;
      for (let start = 0; ; start += 100) {
        r = await get(`${SB}/search/report/data/`, { method: 'POST', headers: { Cookie: cookie(), Referer: `${SB}/search/`, 'X-CSRFToken': jar.csrftoken, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ start: String(start), length: '100', report_types: '[11]', filer_types: '[]', submitted_start_date: sd, submitted_end_date: '', candidate_state: '', senator_state: '', office_id: '', first_name: '', last_name: '', 'order[0][column]': '4', 'order[0][dir]': 'desc', csrfmiddlewaretoken: jar.csrftoken }) });
        const page = (await r.json()).data ?? [];
        for (const [first, lastN, , link, date] of page) {
          const id = link.match(/\/search\/view\/ptr\/([^/"]+)/)?.[1];
          if (id) out.push({ ch: 'S', who: unesc(`${first} ${lastN}`), st: '', filed: iso(date), id, year: '' });
        }
        if (page.length < 100) break;
      }
    } catch (e) { log(`senate list: ${e.message}`); }
    return out;
  })());
}

// compact rows for one filing; marker row (type N) when it has no tickered trades so it is not refetched
export async function filingRows(f) {
  let rows;
  if (f.ch === 'H') {
    const dir = mkdtempSync(join(tmpdir(), 'cong-'));
    try {
      writeFileSync(join(dir, 'p.pdf'), Buffer.from(await (await get(`https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${f.year}/${f.id}.pdf`)).arrayBuffer()));
      rows = parseHouse(execFileSync('pdftotext', ['-layout', join(dir, 'p.pdf'), '-'], { encoding: 'utf8', maxBuffer: 1e7 }), { who: f.who, ch: 'H', st: f.st, filed: f.filed, url: f.id });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  } else {
    rows = parseSenate(await (await get(`${SB}/search/view/ptr/${f.id}/`, { headers: { Cookie: cookie() } })).text(), { who: f.who, ch: 'S', st: '', filed: f.filed, url: f.id });
  }
  const out = rows.filter((x) => x.ticker && x.tx).map((x) => [x.who, x.ch, x.st, x.owner, x.ticker, x.asset.slice(0, 28), x.type, x.tx, x.filed, x.amount, x.url]);
  return out.length ? out : [[f.who, f.ch, f.st, '', '', '', 'N', f.filed, f.filed, '', f.id]];
}
