# Creator Empire Simulator v1.1.0 — Architecture

## Runtime stack

- TypeScript compiled to browser-native ES modules
- Dependency-free DOM feature layer
- Hash routing
- Native IndexedDB local-first persistence
- Workspace schema migration
- Versioned JSON import/export with runtime validation
- Direct-labelled SVG/HTML charts
- Deterministic seeded simulation
- PWA manifest and service worker
- Node.js static server included in the artifact

## Architectural intent

The accepted product architecture originally selected React + TypeScript. The production artifact uses dependency-free TypeScript components so the ZIP can run without downloading runtime packages. The rendering layer can later move to React while preserving Domain, Focus, Workflow, Migration, IndexedDB and import/export contracts.

## Directory boundaries

```text
src/
  main.ts                  application entry and delegated interactions
  app/
    navigation.ts          route metadata
    router.ts              hash parsing and navigation
    runtime.ts             render registration
    selectors.ts           focus-aware derived workspace state
    shell.ts               HUD, global Channel/Project selectors, navigation
    store.ts               immutable local state + migration + save queue
  domain/
    types.ts               canonical schema v2 contract
    focus.ts               Channel Focus, Portfolio Focus and Active Project
    workflow.ts            17 stages, recommendations, gates and missions
    migration.ts           schema 1 → 2 migration
    scoring.ts             language and niche scoring
    blueprint.ts           deterministic channel strategy
    prompts.ts             16 prompt workflows and structured contracts
    simulator.ts           deterministic scenario model
    progression.ts         XP and achievements tied to real work
    validation.ts          import and AI-response validation
  db/
    indexeddb.ts           local persistence repository
  features/
    mission.ts             Video Mission Control
    prompts.ts             Pipeline-driven Prompt Studio
    calendar.ts            Calendar-driven missions and focused Gantt
    pipeline.ts            focus-aware Kanban and project actions
    capcut.ts              project-aware cost ledger
    policy.ts              completion gate for scheduling
    analytics.ts           focused Actual analytics
    ...                    remaining product surfaces
  charts/                  accessible direct-labelled charts
  seed/                    50 ideas, policies and demo workspace
  ui/                      shared controls, icons, toast and dialogs
styles/app.css             tokens, responsive layout and focus/mission UI
public/sw.js               v1.1 PWA cache
```

## State ownership

`Workspace` is the single local source of truth.

`updateWorkspace()`:

1. Deep-clones current state
2. Applies a domain mutation
3. Normalizes Focus
4. Ensures a current workflow mission exists
5. Recomputes progression where needed
6. Queues an IndexedDB save
7. Notifies the renderer

## Focus contract

```text
FocusState
  mode: portfolio | channel
  activeChannelId?: string
  activeProjectId?: string
  activeTaskId?: string
  updatedAt: ISO timestamp
```

Rules:

- Project focus owns Channel focus
- Channel focus chooses a live Project when needed
- Portfolio mode removes Channel filtering but preserves the last Active Project
- Invalid imported focus IDs are normalized

## Workflow contract

`workflowRecommendation(workspace, project)` returns:

- current status
- target status
- mission title and detail
- prompt type or route
- estimated minutes
- XP
- calendar task type

`workflowReadiness()` prevents stage advancement until required artifacts exist.

`syncNextWorkflowMission()` marks past missions complete and creates/selects the current mission.

## Prompt orchestration

Prompt Studio does not advance a Project merely because JSON is valid.

It requires:

1. Prompt type compatible with Current Stage
2. Parsed fields applied to the Active Project
3. Target stage matching the recommendation
4. Completion Gate passing

This prevents accidental stage skipping from unrelated Prompt output.

## Persistence contract

- Database: IndexedDB
- Workspace key: `default`
- Schema version: `2`
- First load: seed workspace
- Subsequent load: migrated saved workspace
- Export: complete versioned JSON
- Import: validate and migrate before replacement
- Secrets: never included

## PWA contract

Cache `creator-empire-v1.1.0` includes all Focus, Workflow, Migration and Mission modules. Old caches are deleted during service-worker activation.

## Security boundary

- No provider secret is stored in Browser state
- Connected AI remains disabled without a secure server-side proxy
- Import requires schema validation
- User-generated text is escaped before HTML rendering
