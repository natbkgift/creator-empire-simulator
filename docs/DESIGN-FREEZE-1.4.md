# Creator Empire Simulator v1.4 — Design Freeze

Status: **FROZEN FOR PRODUCTION IMPLEMENTATION**

Figma Make source of truth:

`https://www.figma.com/make/HJy88JXDP65nGPBiDzHCZH/Enhance-Professional-Design?t=a4xLmDxuZ865imyd-1`

## Product question

> What should I work on next to get this video published?

## Persistent information architecture

Exactly five persistent destinations:

1. Today — Execute
2. Channels — Strategy
3. Production — Produce
4. Calendar — Plan
5. Insights — Learn

Prompt Studio, CapCut Lab, Policy Shield, Settings, Monetization, Simulator and Backup/Recovery stay contextual/global and must not become persistent navigation items.

## Frozen visual direction

Editorial Dark:

- background `#080c14`
- content `#0f1420`
- surface `#161d2e`
- secondary surface `#1c2538`
- primary text `#f0ead8`
- secondary text `#9ca6b8`
- muted `#69758a`
- accent `#6b5bd7`
- accent hover `#8071e5`
- warning `#d98218`
- success `#4eaa7a`
- danger `#d75f6b`

Typography:

- English display: DM Serif Display
- Thai display: Noto Serif Thai
- English UI/body: Instrument Sans
- Thai UI/body: Noto Sans Thai
- Technical/numeric metadata: JetBrains Mono

Avoid neon glow, glassmorphism, dense KPI walls and generic equal-card SaaS layouts.

## Frozen interaction contracts

### Today

Today is the default destination. Next Mission is the dominant first-viewport element. Analytics is secondary.

### Global Command Header

Desktop header owns:

- Channel Focus / Portfolio
- Active Video
- detailed stage
- next publish datetime
- Search / Command Palette
- AI mode status
- Settings
- storage/recovery status

`Ctrl+K` / `Cmd+K` opens Global Search.

### Channels

Channels has two levels inside the same persistent destination:

`Portfolio → Channel Workspace`

Channel Workspace contains Blueprint, Positioning, Target Audience, Content Pillars, Language/Format, Publishing Targets, Originality & Sources, Monetization, 30-Day Content Plan and Current Videos.

30-Day plan actions create real production work using the existing workspace and Calendar Planner rather than mock-only state.

### Production

Seven visual groups:

`Idea → Research → Script → Production → Edit → Release → Growth`

These are visual groupings only; the detailed v1.3 workflow states and completion gates remain authoritative.

### Completion semantics

`Published + real publication URL = VIDEO COMPLETE · 100%`

Growth Loop is separate and must never reduce production completion below 100%.

### Calendar

Desktop uses a capacity-aware week schedule. Mobile uses a single-day schedule. Reschedule persists through the existing data contract and safely rebuilds the affected production plan.

### Contextual tools

Stage recommendation:

- Idea / Research / Hook / Script → Prompt Studio
- Storyboard / Assets / CapCut Draft / Editing → CapCut Lab
- QA / Scheduled → Policy Shield

### Mobile

- no desktop sidebar
- compact context header
- exactly five bottom destinations
- Mission first
- single-day Calendar
- horizontally readable Production Flow
- no document-level horizontal overflow

## Architecture freeze

Figma Make is a visual/interaction reference only. Production remains the existing TypeScript/CSS + Python/SQLite architecture.

Must preserve:

- SQLite transactional durable storage
- revision/checksum/history
- IndexedDB offline mirror/reconciliation
- secret non-persistence
- AI Assisted budgets/output limits/cost ledger
- Calendar Planner v2
- mandatory Policy gates
- Windows launcher
- local validation release gate
- no GitHub Actions dependency

Any later visual change that modifies the contracts above requires a new design decision rather than silent drift during implementation.
