# PR v1.3 Checklist

## Security
- [ ] runtime/build artifacts are not tracked
- [ ] no plaintext API-key table
- [ ] environment/session key flow verified
- [ ] loopback bind default verified

## Data
- [ ] revision increments
- [ ] history snapshots created
- [ ] restore is monotonic
- [ ] IndexedDB newer copy reconciles into SQLite
- [ ] SQLite outage boots from IndexedDB
- [ ] reconnect preserves offline work

## Planner
- [ ] Topic + Format + Publish datetime
- [ ] Shorts/Long templates
- [ ] capacity conflict detection
- [ ] reschedule rebuild
- [ ] upload anchored to exact publish time

## Product semantics
- [ ] Published + URL = Video Complete / 100%
- [ ] Growth Loop excluded from Production WIP

## UX
- [ ] exactly 5 persistent destinations
- [ ] Today/Next Mission is opening workflow
- [ ] Prompt/CapCut/Policy contextual routes still work

## AI
- [ ] `store=false`
- [ ] output cap
- [ ] timeout/retry
- [ ] daily/monthly budgets
- [ ] run cost ledger

## QA
- [ ] Ubuntu build/domain/server
- [ ] Browser E2E
- [ ] dual-store/outage recovery
- [ ] Windows launcher
