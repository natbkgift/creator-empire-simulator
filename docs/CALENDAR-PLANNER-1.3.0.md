# Calendar Planner v2

Each video has an exact production contract:

- Topic/title
- Format: Shorts or Long-form
- `publishAt` datetime

The planner uses format-specific stage durations and available weekly hours to allocate tasks. Existing manual tasks consume daily capacity.

Auto-generated production tasks are marked with:

- source/target workflow stage
- template kind (`shorts`, `long`, `growth`)
- priority
- capacity conflict flag/reason

The Upload mission is anchored to the exact publication date/time. Production work scheduled after that target is flagged as a conflict.

Rescheduling changes `publishAt`, records a workflow event and rebuilds only that video's auto-generated plan, preserving manual tasks.
