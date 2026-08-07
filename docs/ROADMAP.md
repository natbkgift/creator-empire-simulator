# Roadmap after v1.2.0

## v1.2.0 — Delivered

- Reworked UX/UI to a light modern visual system
- Reduced dashboard density and softened panels, navigation, cards, and controls
- Added Workflow Mode selector: Manual or Automatic
- Added AI Provider selector: OpenAI / Gemini
- Added model settings for OpenAI and Gemini
- Added API key setup UI under Settings
- API keys stored in SQLite, not returned to browser
- Prompt Studio shows Manual or Automatic mode
- SQLite storage status in top HUD
- Workspace saves to SQLite when local server running
- IndexedDB fallback
- Local Python server for SQLite + AI proxy

## v1.3 — Production hardening & Secure AI execution

- Rich source-record editor and claim-to-source links
- Calendar date drag/drop with keyboard alternatives
- More component and visual-regression tests
- Browser test runner packaged for Windows
- Full Thai/English UI localization
- Prompt/version diff and response provenance
- Project templates and reusable series rules
- Structured Outputs schemas per Prompt type
- Usage budget and approval gates
- Run history and retry controls

## v1.4 — Platform connectors

- Read-only YouTube Analytics import
- Official Meta/TikTok adapters where supported
- Stale/offline status and last-updated labels
- Scheduled CSV or connector ingestion

## v2 — Collaboration and cloud sync

- Optional Supabase/Postgres sync
- Multi-device workspaces
- Team roles and approval workflows
- Shared asset library
- Audit log

## Deferred game expansion

A Phaser walking map remains optional. It should only be added if playtesting proves it improves task discovery or completion. The current DOM-based Mission Control protects the production surface and is cheaper to maintain.
