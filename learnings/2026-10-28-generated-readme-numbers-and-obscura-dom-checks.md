# Generated README numbers, and verifying UI in Obscura

**Date:** 2026-10-28

## Problem
Finish the backtest lab (log-scale chart, README write-up) so every number in the docs is reproducible, and verify the widget without using the user's own Chrome.

## Approach
- `scripts/bt-report.mjs` builds the results table from the stored fixtures and writes it between `<!-- bt-report:start -->` markers in the README. `--check` exits 1 if the README drifts.
- UI verification moved to Obscura (`~/obscura/obscura --allow-private-network serve --port 9333`), driven over CDP: run the command with `import('/core.js').then(m => m.runCommand(...))`, then read the DOM.

## Why
- Hand-typed numbers rot. Generating them, plus a check that fails, keeps the README honest.
- Running `--check` before `--write` and watching it fail proves the guard works.

## Gotchas
- Obscura renders the page shell, but widget bodies and canvases come out blank in `Page.captureScreenshot`. Use it for DOM assertions (tick positions, table text, input changes), not for README images.
- Obscura blocks localhost unless started with `--allow-private-network`.
- Log-scale gridline labels near the top edge collide with the curve. Flip them below the line when top < 10%.
- Labels in a `preserveAspectRatio="none"` SVG get stretched. Put them in HTML positioned by percentage.

## Reusable pattern
Docs numbers come from a script over fixed data with a `--check` mode. Headless UI checks assert on the DOM, not on pixels.
