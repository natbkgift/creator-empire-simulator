# Creator Empire Simulator v1.3.0 — Data-Safe Production Workflow

## Goals closed

- Security cleanup and runtime-data ignore guard
- API keys removed from plaintext SQLite persistence
- SQLite revision/history/checksum + transactional writes
- SQLite ↔ IndexedDB reconciliation and recovery
- Capacity-aware Calendar Planner v2
- Topic + Format + exact Publish datetime + reschedule
- Published = Video Complete; Growth Loop separate
- Five-area UX with Today / Next Mission as default workflow
- AI Assisted budget/output/retry/timeout hardening
- Server/browser/Windows QA expansion

## Security

Persistent OpenAI/Gemini credentials come from environment variables. UI-entered keys are session-only server memory. Existing `ai_secrets` table is dropped during v1.3 database initialization.

OpenAI Responses requests explicitly set `store=false` and enforce server-side output-token limits.

## Data reliability

Every workspace mutation increments a revision. SQLite stores revision, checksum and bounded history snapshots. IndexedDB is always maintained as a browser mirror; startup chooses the newer revision and reconciles it back to the older store.

## Planner

Video creation requires Topic, Shorts/Long-form and exact Publish datetime. The planner derives stage durations by format, allocates work against weekly capacity, marks tasks that cannot fit before publish and supports rescheduling/rebuilding.

## Completion semantics

`Published` with a real publication URL is the production finish line and reports 100% production progress. Analytics/Post-mortem/Repurpose continue as a separate Growth Loop.

## QA gates

- TypeScript build + domain/UI tests
- SQLite revision/history/recovery test
- secret non-persistence test
- mocked AI ledger/cost guardrail test
- browser E2E including dual-storage conflict and outage recovery
- Windows launcher smoke test
- Git tracked-artifact guard
