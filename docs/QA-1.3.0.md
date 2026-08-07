# QA Plan — Creator Empire Simulator v1.3.0

This document describes executable release gates. The PR is not ready to merge until CI proves them.

## Build / domain

```bash
npm ci
npm test
python tests/server-v1.3.py
```

## Browser

`tests/browser-v1.3.py` verifies:

- five persistent navigation destinations
- Today / Next Mission first-use path
- Calendar exact publish datetime and capacity UI
- AI Assisted credential/budget UI
- newer IndexedDB revision reconciles into SQLite
- app boots from IndexedDB while SQLite API is unavailable
- offline work reconciles after server recovery
- mobile navigation and horizontal-overflow sanity
- console error gate

## Server/data safety

`tests/server-v1.3.py` verifies:

- no `ai_secrets` SQLite table
- monotonic revisions
- workspace history backup
- restore creates a new revision
- session API keys do not persist
- mocked AI run records tokens/cost
- `store=false`, max-output and retry contract
- restart retains durable data but clears transient secrets

## Windows

`tests/windows-startup-v1.3.ps1` starts `START-HERE-WINDOWS.bat` without opening a browser, polls `/api/storage`, verifies SQLite creation, then shuts down the process tree.

## Repository hygiene

CI fails if any of these are tracked:

- `dist/`
- `data/`
- `.sqlite`
- `.sqlite-wal`
- `.sqlite-shm`

## Merge gate

All three CI jobs must pass. Any failure blocks merge until fixed and rerun on the exact PR head.
