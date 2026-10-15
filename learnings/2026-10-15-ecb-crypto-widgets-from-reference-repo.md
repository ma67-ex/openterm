# Build ECB and crypto-dominance widgets from a reference repo's providers

**Date:** 2026-10-15

## Problem
User pointed at `ErTasselli/OpenTerminal` (a similar Bloomberg-style free-data terminal) and asked to check it for anything usable in openterm, then to build a widget for the crypto/ECB data it surfaced.

## Approach
1. Live-verified each candidate provider endpoint with `curl` before porting anything, rather than trusting the reference repo's code or any third-party doc blindly: `stooq.com/q/d/l/` returned a JS proof-of-work challenge page (not CSV), `api.binance.com` returned a geo-block error from this host, `data-api.ecb.europa.eu` and `api.coingecko.com` both returned real data.
2. Ported only the two verified-working, dependency-free providers (`ecb.ts` -> `lib/ecb.js`, `coingecko.ts` -> `lib/coingecko.js`), skipping Stooq (dead) and Binance (unreliable by region) even though the reference repo's code for both looked clean.
3. Before building a "CRYPTO widget," checked whether one already existed — `public/mods/markets.js` already had a seeded `CRYPTO` command backed by `seeders/coingecko.js`. Diffed what it already showed (top-30, sparklines, 1h/24h/7d) against what the new `/api/crypto` endpoint could add (global market cap, BTC/ETH dominance) and only added the delta to the existing widget's header instead of building a duplicate.
4. Built the `ECB` widget from scratch in `public/mods/macro.js`, reusing the file's existing `drawLine`/`canvas` chart helper and `.macro-wrap`/`.macro-out` CSS classes already used by the `FRED` and `YAS` widgets, instead of adding new CSS.
5. First live check of the new `ECB` widget looked broken (chart stuck on "LOADING...") — before touching the code, re-screenshotted a few seconds later and confirmed it was a redraw race in my own screenshot timing, not an actual bug; the live data had already loaded on the next frame.
6. A real click via the browser tool on a currency-strip row silently failed to switch currencies (title didn't change) while the exact same element, clicked via `element.click()` in `javascript_tool`, worked immediately. Diagnosed via DOM inspection (`querySelectorAll('[data-c]')`, confirmed `onclick` was attached and data was correct) before touching the widget code — the handler was fine; the browser tool's cached `ref_N` had gone stale after the page re-rendered between `find()` and the click.

## Why
The repo being actively maintained and MIT-licensed didn't mean its providers were safe to port as-is — Stooq and Binance both looked identical in code shape to ECB/CoinGecko (plain `fetch`, no deps) but one is now bot-gated and the other is geo-restricted. Code review alone can't catch either; only a live request against the real endpoint can. Likewise, grepping for an existing `CRYPTO` command before building a new one avoided shipping two competing crypto widgets with the same name space.

## Gotchas
- A repo's recent push date (`pushedAt`) is not evidence its provider endpoints still work — OpenTerminal was pushed 9 days prior and its own `stooq.ts` would fail in production right now.
- `curl`'s raw response is the fastest way to resolve a conflict between an unverified third-party doc (api-evangelist's OpenAPI spec claimed Stooq needs a CAPTCHA key) and a reference repo's working-looking code (no key in the URL) — both were wrong/incomplete; the real behavior (JS PoW challenge) matched neither description exactly.
- When a widget appears broken in a screenshot taken immediately after a command, wait and re-screenshot before debugging — async data loads can simply not have painted yet.
- Don't trust a stale `ref_N` from `find()`/`read_page` across a DOM re-render; verify a "click did nothing" symptom with `javascript_tool` DOM inspection (is the handler attached? is the data correct?) before assuming the application code is broken.

## Reusable pattern
Before porting a dependency-free HTTP provider from a reference codebase, curl the live endpoint directly rather than trusting the source's apparent correctness or its doc's claims; before building a new widget for a data source, grep the existing widgets for a matching command name and extend rather than duplicate.
