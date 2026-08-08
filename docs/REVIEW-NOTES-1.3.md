# Review Notes v1.3

Review order:

1. `creator_server.py` — secret/storage/AI boundary
2. `src/db/storage.ts` + `src/app/store.ts` — dual-store revisions
3. `src/domain/workflow.ts` — planner/release semantics
4. `src/features/calendar.ts` — user-facing planner
5. `src/app/navigation.ts` + `src/app/shell.ts` + `src/features/hq.ts` — simplified UX
6. `styles/professional-v1.3.css` — professional visual system and responsive hierarchy
7. tests + local validation scripts

Do not merge on documentation or static review alone. Exact PR head must pass the selected local validation tier. GitHub Actions is intentionally not part of the validation architecture.
