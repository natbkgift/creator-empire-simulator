# QA Plan — Creator Empire Simulator v1.3.0

This repository does **not** use GitHub Actions as a build/test/release dependency. Release evidence is produced by the local validation runners and attached/reported against the exact commit being reviewed.

## Windows local gate

Core validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-local.ps1
```

Full browser gate:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-local.ps1 -Browser
```

## macOS / Linux local gate

```bash
bash scripts/validate-local.sh
bash scripts/validate-local.sh --browser
```

## Build / domain

The local runners execute:

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
- equal-revision `updatedAt` reconciliation
- app boots from IndexedDB while SQLite API is unavailable
- offline work reconciles after server recovery
- mobile navigation and horizontal-overflow sanity
- console error gate

## Server/data safety

`tests/server-v1.3.py` verifies:

- no `ai_secrets` SQLite table
- legacy secret-table purge contract
- monotonic revisions
- checksum validation
- workspace history backup
- restore creates a new revision
- session API keys do not persist
- mocked AI run records tokens/cost
- `store=false`, max-output and retry contract
- restart retains durable data but clears transient secrets

## Windows

`tests/windows-startup-v1.3.ps1` starts `START-HERE-WINDOWS.bat` without opening a browser, polls `/api/storage`, verifies SQLite creation, then shuts down the process tree. It uses the machine temp directory when no external runner temp variable exists.

## Repository hygiene

Local validation fails if any of these are tracked:

- `dist/`
- `data/`
- `.sqlite`
- `.sqlite-wal`
- `.sqlite-shm`
- `.env`

## Merge gate

Merge only after the **exact PR head** passes the appropriate local validation tier and the resulting evidence is reviewed. A GitHub Actions status is not required and is not part of the architecture.
