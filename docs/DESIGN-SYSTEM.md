# Creator Empire Simulator v1.2.0 — Design System

## Direction

Professional creator-studio command center with restrained game language. It should feel like operating a production facility, not using a generic SaaS dashboard and not playing a children’s game.

## Design principles

1. Work surface before decoration.
2. One obvious next action per screen.
3. Compact HUD; no large permanent game overlays.
4. Real metrics and game metrics are visually separated.
5. Actual, Estimated, and Demo data are always labeled.
6. Information required for decisions remains visible without hover.
7. Motion is reserved for reward, state transition, warning, and onboarding.
8. Mobile keeps production actions usable rather than merely shrinking desktop cards.

## Tokens

- Background (`--bg`): `#07101B`
- Primary surface (`--surface`): `#111D2C`
- Secondary surface (`--surface-2`): `#152436`
- Tertiary surface (`--surface-3`): `#0C1825`
- Primary text (`--text`): `#EFF7FF`
- Muted text (`--muted`): `#91A7BA`
- Dim text (`--dim`): `#627A8F`
- Line (`--line`): `rgba(145, 167, 186, 0.17)`
- Strong line (`--line-strong`): `rgba(145, 167, 186, 0.32)`
- Primary action / progress (`--cyan`): `#67E6DF`
- Attention / schedule (`--amber`): `#FFB85C`
- Simulation / estimate (`--violet`): `#A695FF`
- Healthy / pass (`--green`): `#64DDA4`
- Risk / blocked (`--red`): `#FF7182`
- Info / link (`--blue`): `#5FA8FF`
- Shadow (`--shadow`): `0 18px 50px rgba(0, 0, 0, 0.28)`
- Border radius (`--radius`): `16px`
- Sidebar width (`--sidebar`): `238px`
- Topbar height (`--topbar`): `72px`

## Server Modes (v1.2.0+)

The application operates in two distinct modes, visually distinguished to the user:
- **Manual Mode:** Standard operation where the user performs actions manually.
- **Automatic AI Mode:** AI agent takes control, with clear indications of autonomous operation.

## Typography

- UI: Inter / Noto Sans Thai / Segoe UI fallback stack
- Document and schema views: system monospace
- Tight, high-contrast headings; calm supporting text
- Deliberately sized controls; no browser-default typography

## Component families

- Slim navigation rail
- Compact top HUD
- Mission deck
- Channel lane table
- Production tickets
- Kanban columns
- Prompt document editor
- Policy risk indicators
- Direct-labeled SVG charts
- Capacity and credit meters
- Mobile bottom navigation
- SQLite storage status indicator
- AI provider selector
- Workflow mode selector / toggle
- Command palette (Ctrl+K)
- Focus picker dialog
- AI secret manager

## Motion

- Default sound off
- Reduced motion honored
- No ambient floating particles or constant decorative movement
- Reward animation ≤ 900 ms and dismissible
- Critical warnings do not rely on motion or color alone
