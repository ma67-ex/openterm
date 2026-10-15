# Congress stock trades from official filings, no API key

**Date:** 2026-10-11

## Problem
Add a politician / US Congress trades view to openterm that can keep refreshing, using only free sources.

## Approach
1. Probed the usual free feeds. House/Senate Stock Watcher S3 buckets return 403, the Senate GitHub mirror stops in 2021, and Capitol Trades blocks bots (429/503). All dropped.
2. Used the official sources instead. House: Clerk `YYYYFD.xml` index (filter FilingType P) gives member, state, date and DocID, then `ptr-pdfs/<year>/<DocID>.pdf` parsed with `pdftotext -layout`. Senate: efdsearch needs a session. GET /search/home/, POST the agreement form with the csrf token, then POST /search/report/data/ with report_types=[11] and an X-CSRFToken header. Each result links to an HTML report whose table is easy to parse.
3. Added a seeder group (`seeders/congress.js` plus `seeders/groups/congress.js`) and a `CONG` widget (`public/mods/congress.js`) reading the snapshot.

## Why
Official sources are the only ones that will not vanish. The seeder/snapshot pattern already in the repo keeps refreshes cheap and Upstash-safe, so no new endpoint was needed.

## Gotchas
- House XML FilingDate is `7/10/2026` (no zero padding); a two-digit-only regex silently dropped every House filing.
- In the PDF text, an anchor line has the type, tx date, notification date and amount. The asset name and amount wrap onto following lines, so cut continuation lines at the type column.
- Snapshot cap is about 28 KB. Trimming newest-first let Senate rows crowd out House rows, so trim evenly per chamber.
- Store only the filing id per row and rebuild the URL in the browser (House needs the filed year).
- Running `seeders/run.js` with `.env` present writes to the real Upstash. The running server must be restarted to whitelist a new group key.
- Needs `pdftotext` (poppler) on the seed runner.

## Reusable pattern
When free aggregator APIs die, go to the government disclosure site: index XML or search endpoint first, then parse the per-filing document. Test the parser on real samples before wiring the UI.
