# Creator Empire Simulator v1.4.0 — Release Notes

Status: **IMPLEMENTED ON RELEASE BRANCH — LOCAL VALIDATION REQUIRED BEFORE READY/MERGE**

## Editorial Creator OS

v1.4 applies the frozen Figma Editorial Dark design to the existing production architecture without replacing the validated TypeScript/CSS + Python/SQLite runtime.

Highlights:

- exactly five persistent areas: Today, Channels, Production, Calendar, Insights
- mission-first Today experience
- Global Command Header with Channel/Active Video context, search, AI status, Settings and storage status
- `Ctrl+K` / `Cmd+K` global command palette
- Channel Portfolio → Channel Workspace
- restored Channel Blueprint, Originality & Sources, Monetization and 30-Day Content Plan
- real Content Plan idea → VideoProject → Calendar Planner workflow
- seven-group Production Flow while retaining detailed workflow states
- `Published + URL = VIDEO COMPLETE · 100%`
- separate Growth Loop
- simplified Insights with two featured KPIs and a dominant chart
- single-day mobile Calendar
- Editorial Dark design tokens and Thai/English typography system

## Preserved v1.3 contracts

No intentional changes were made to the core durable-storage/security architecture:

- SQLite revision/checksum/history
- transactional writes
- IndexedDB offline reconciliation
- environment/session-only API credentials
- AI request budgets/output limits/cost ledger
- OpenAI `store=false`
- Calendar capacity logic
- Policy completion gates
- repository hygiene guard
- Windows startup contract
- no GitHub Actions dependency

## Validation

Required before marking the PR Ready:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-local.ps1 -Browser
```

This runs both the v1.3 data/recovery browser regression and the v1.4 frozen-design browser acceptance.

Do not merge until the exact current PR head passes the full local gate and receives final visual/regression review.
