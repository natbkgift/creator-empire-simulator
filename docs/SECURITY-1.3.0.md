# Security Contract v1.3.0

## Secrets

- API keys are not persisted in SQLite.
- Persistent credentials are read from `OPENAI_API_KEY` / `GEMINI_API_KEY` environment variables.
- Keys entered in Settings live only in Python process memory and disappear when the local server exits.
- Browser endpoints return configured state, source and masked preview only.
- The v1.2 `ai_secrets` table is dropped during database initialization.

## Network boundary

- Default bind is `127.0.0.1`.
- Non-loopback binding exits unless `CREATOR_EMPIRE_ALLOW_REMOTE=1` is explicitly set.

## AI requests

- OpenAI Responses uses `store=false`.
- Server clamps max output tokens and timeout.
- Retry is limited to transient errors with exponential backoff.
- Daily/monthly budgets are enforced server-side.
- AI run ledger stores metadata/tokens/estimated cost, not prompt/response bodies or API keys.

## Repository hygiene

Runtime data, build outputs and environment files are ignored and checked in CI.
