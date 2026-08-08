# Creator Empire Simulator v1.3.0 — Data-Safe Production Workflow + Professional UI

## Goals closed

- Security cleanup and runtime-data ignore guard
- API keys removed from plaintext SQLite persistence
- SQLite revision/history/checksum + transactional writes
- SQLite ↔ IndexedDB reconciliation and recovery
- Capacity-aware Calendar Planner v2
- Topic + Format + exact Publish datetime + reschedule
- Published = Video Complete; Growth Loop separate
- Five-area UX with Today / Next Mission as default workflow
- Professional Light UI across shell, forms, cards and contextual tools
- AI Assisted budget/output/retry/timeout hardening
- Local server/browser/Windows QA expansion
- GitHub Actions removed from the validation architecture

## Professional UI

The final CSS layer normalizes the older mixed dark/light component set into one professional visual system:

- neutral light workspace and white surfaces
- restrained borders/shadows rather than glow-heavy cards
- readable secondary typography
- one primary action color with semantic status colors
- simplified topbar and desktop HUD
- consistent form controls and keyboard focus states
- mobile visual hierarchy aligned with desktop

Game/progression mechanics remain in the product but are visually secondary to production work.

## Security

Persistent OpenAI/Gemini credentials come from environment variables. UI-entered keys are session-only server memory. Existing `ai_secrets` table is securely purged during v1.3 database initialization.

OpenAI Responses requests explicitly set `store=false` and enforce server-side output-token limits.

## Data reliability

Every workspace mutation increments a revision. SQLite stores revision, checksum and bounded history snapshots. IndexedDB is always maintained as a browser mirror; startup chooses the newer revision and reconciles it back to the older store.

## Planner

Video creation requires Topic, Shorts/Long-form and exact Publish datetime. The planner derives stage durations by format, allocates work against weekly capacity, marks tasks that cannot fit before publish and supports rescheduling/rebuilding.

## Completion semantics

`Published` with a real publication URL is the production finish line and reports 100% production progress. Analytics/Post-mortem/Repurpose continue as a separate Growth Loop.

## Validation — no GitHub Actions

Use the repository-owned local runners:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-local.ps1 -Browser
```

or:

```bash
bash scripts/validate-local.sh
bash scripts/validate-local.sh --browser
```

The validation suite covers TypeScript/domain/UI, SQLite revision/history/recovery, secret non-persistence, mocked AI ledger/cost guardrails, optional browser dual-storage/outage recovery, Windows launcher startup and tracked-artifact hygiene.
