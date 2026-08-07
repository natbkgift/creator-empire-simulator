# Architecture v1.3.0

```text
Browser UI
  ├─ Today / Channels / Calendar / Production / Insights
  ├─ IndexedDB offline mirror
  └─ contextual Prompt / CapCut / Policy tools
          │ localhost only
          ▼
Python local server
  ├─ SQLite transactional workspace
  ├─ bounded revision history + recovery
  ├─ environment/session-only credentials
  ├─ OpenAI / Gemini proxy with guardrails
  └─ AI metadata/cost ledger
```

## Source of truth

SQLite is the durable source of truth when available. IndexedDB is a mirrored offline copy. Revision reconciliation prevents a stale SQLite copy from overwriting newer offline work after reconnect.

## Security boundary

The browser never receives full provider keys. Session keys live in process memory; persistent keys live outside the application database in environment variables.

## Workflow boundary

Production ends at Published. Growth Loop work is related to the same project but is excluded from production progress/WIP.
