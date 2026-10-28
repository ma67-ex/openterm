# Learnings Index
- [Bloomberg-style terminal on free APIs without hitting the Upstash limit](2026-10-10-free-api-terminal-upstash-safe-architecture.md) — snapshot store plus CDN cache, gated seeders, module registry for parallel agents
- [Congress trades from official House/Senate filings](2026-10-11-congress-trades-from-official-filings.md) — no-key seeder: House Clerk XML + PDF parse, Senate eFD session, CONG widget
- [ECB and crypto-dominance widgets from a reference repo](2026-10-15-ecb-crypto-widgets-from-reference-repo.md) — curl-verify providers before porting, don't duplicate an existing widget, stale ref_N vs real DOM state
- [Live news wire (WIRE) + nested-repo worktree-hook workaround](2026-10-19-live-news-wire-and-nested-repo-worktree-hook.md) — RSS wire widget + how to spot/handle the Edit hook misfiring on an independent repo nested under the worktree's base path
- [GitHub Actions cron drift was silently starving every hours-gated seeder](2026-10-19-github-actions-cron-drift-seeder-fix.md) — read prod Upstash directly to tell "code bug" from "scheduler never ran it" apart, then replaced narrow per-hour windows with an idempotent per-day-threshold check
- [Adding a backtest command (BT) to OpenTerm](2026-10-28-bt-sma-backtest-command.md) — pure JS port of SMA backtest, hand-computed test, no pandas
