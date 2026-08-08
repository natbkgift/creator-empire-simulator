# Data Recovery v1.3.0

## Durable state

SQLite stores the current workspace with:

- `revision`
- `checksum`
- `updated_at`

Before replacing the current row, the previous revision is copied into `workspace_history`. History is bounded to the most recent 80 revisions.

## Browser mirror

IndexedDB is always written as an offline/crash mirror. It is not a separate user-selected database mode.

At startup:

1. Load SQLite and IndexedDB independently.
2. Compare `revision` first and `updatedAt` as tie-breaker.
3. Use the newer valid workspace.
4. If IndexedDB is newer, write it back transactionally to SQLite.
5. If SQLite is newer, mirror it into IndexedDB.

If SQLite is unavailable, work continues from IndexedDB. Reconnect/reload reconciles the newer revision back into SQLite.

## Restore

`GET /api/workspace/history` lists recent recovery points.

`POST /api/recovery/restore` with `{ "revision": N }` restores the selected snapshot as a **new revision**, preserving monotonic history.
