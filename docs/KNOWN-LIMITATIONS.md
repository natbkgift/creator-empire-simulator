# Known Limitations — v1.1.0

## AI execution

- Copy-to-Chat is the production AI path
- Connected AI is disabled until a secure server-side proxy exists
- No API key is accepted or stored in Browser state

## Platform automation

- No direct YouTube, Facebook, TikTok or Instagram OAuth integration
- No automated publishing
- Analytics are manual or CSV import

## Persistence

- Workspace is local to Browser origin
- Changing Browser, host or port creates a separate IndexedDB workspace
- Users should export JSON backups regularly
- No cross-device sync in v1.1

## Calendar

- Generated workflow missions are ordered and lock future stages
- Full critical-path scheduling and dependency editing are not implemented
- Date drag/drop between days remains deferred; keyboard-safe task actions are available

## Prompt application

- Typed JSON parsing recognizes known fields, but is not a full JSON Schema engine for every nested provider response
- The app prevents unrelated Prompt types from advancing the current Pipeline, but users can still save exploratory Prompt results without stage advancement

## Browser coverage

- Release QA uses system Chromium
- Safari and Firefox are not part of the v1.1 release gate

## Game layer

- Studio Map is a navigation surface, not a Phaser walking game
- This is intentional until gameplay proves it improves productive completion

## Revenue estimates

- Simulator output is scenario planning, not a guarantee
- Actual analytics should replace default assumptions after publishing enough videos
