# QA Report — Creator Empire Simulator v1.2.0

## Scope

This QA pass covers the v1.2.0 upgrade:

- Light modern UX override
- Manual / Automatic workflow mode
- OpenAI and Gemini provider settings
- Local SQLite database server
- SQLite workspace persistence
- Server-side API key storage contract
- Prompt Studio automatic generation button
- Domain tests and TypeScript production build

## Checks

| Check | Result |
|---|---:|
| TypeScript production build | PASS |
| Domain tests | 22/22 PASS |
| Schema migration to v3 | PASS |
| SQLite server starts | PASS |
| `GET /api/storage` | PASS |
| `PUT /api/workspace` | PASS |
| Workspace saved to SQLite table | PASS |
| `POST /api/secrets` stores masked status only | PASS |
| `DELETE /api/secrets/openai` clears key | PASS |
| API key full value returned to browser | BLOCKED BY DESIGN |
| Browser Playwright launch | BLOCKED by environment policy |
| Chromium headless screenshot | BLOCKED by environment timeout/policy |

## Evidence

Domain tests passed:

```text
22/22 domain tests passed.
```

SQLite workspace persistence test wrote a schema v3 workspace into:

```text
data/creator_empire.sqlite
```

with row shape:

```text
('default', 3, 123460, '2026-08-07T11:56:28Z')
```

Secret storage test used a dummy key only, confirmed masked status, then cleared the key. Final `ai_secrets` table was empty.

## Browser validation note

The local runtime blocked automated Chromium navigation to `127.0.0.1` with `ERR_BLOCKED_BY_ADMINISTRATOR`, so rendered UI screenshots were not used as final QA evidence in this pass. Static build and server endpoints were still verified.
