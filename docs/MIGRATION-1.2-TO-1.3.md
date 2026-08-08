# Migration v1.2 → v1.3

- Workspace schema migrates to v4 in memory and on the next durable save.
- Existing date-only deadlines become `publishAt` at the configured/default evening publish time.
- Existing datetime deadlines preserve their time component.
- Existing published projects with a publication URL gain `productionCompletedAt` and remain production-complete even if Growth Loop work continues.
- Existing SQLite databases are upgraded in place with revision/checksum columns and `workspace_history`.
- Legacy `ai_secrets` is dropped. Reconfigure persistent keys through environment variables or use a session-only key.
- IndexedDB is retained as a mirror and participates in revision reconciliation.

Back up the v1.2 workspace JSON before first launch if the database contains important production data.
