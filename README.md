# Creator Empire Simulator v1.4.1

ระบบวางแผนและผลิตวิดีโอหลายช่องแบบ **Channel Strategy → Today Mission → Calendar Plan → Production → Publish → Growth** โดยใช้ SQLite แบบ revisioned เป็น durable store, IndexedDB เป็น offline mirror และรองรับทั้ง Manual กับ AI Assisted (OpenAI / Gemini)

## เปิดใช้งานบน Windows

```text
1. npm ci
2. npm run build
3. ดับเบิลคลิก START-HERE-WINDOWS.bat
4. เปิด http://127.0.0.1:4173
```

Local server bind เฉพาะ `127.0.0.1` โดยค่าเริ่มต้น

## UX/UI v1.4 — Editorial Creator OS

v1.4 ใช้ Figma Design Freeze เป็น visual/interaction source of truth แต่ **ยังคง production architecture เดิม**: TypeScript/CSS + Python/SQLite ไม่ได้ย้าย production app ไป React/Vite/Tailwind

Visual direction:

- Editorial Dark
- Deep navy ground `#080c14`
- Content `#0f1420`
- Elevated surface `#161d2e`
- Electric indigo `#6b5bd7`
- Warm cream text `#f0ead8`
- Thai typography: Noto Serif Thai / Noto Sans Thai
- English typography: DM Serif Display / Instrument Sans
- Technical metadata: JetBrains Mono

Persistent navigation มี **5 พื้นที่เท่านั้น**:

1. **Today** — Execute: Next Mission เป็นสิ่งที่เด่นที่สุด
2. **Channels** — Strategy: Portfolio → Channel Workspace → Blueprint → 30-Day Content Plan
3. **Production** — Produce: 7-group Production Flow
4. **Calendar** — Plan: Capacity-aware schedule + Reschedule
5. **Insights** — Learn: 2 featured KPIs + dominant chart + Recent Publishes

Prompt Studio, CapCut Lab, Policy Shield, Settings, Monetization และ Backup/Recovery เป็น contextual/global surfaces ไม่ใช่ persistent navigation

## Global Command Header

Desktop header เป็น control plane สำหรับ:

- Channel Focus / Portfolio
- Active Video
- Detailed production stage
- Next publish datetime
- Global Search / Command Palette
- AI mode status
- Settings
- Storage / recovery status

ใช้ `Ctrl+K` / `Cmd+K` เพื่อเปิด Global Command Palette

Mobile ใช้ compact context header + bottom navigation 5 รายการ

## Channels — Strategy Home

Channels มีสองระดับ:

```text
Channel Portfolio
→ Channel Workspace
```

Channel Workspace เก็บ:

- Positioning / Channel Promise
- Target Audience
- Content Pillars
- Language & Format
- Publishing Targets
- Originality & Sources
- Monetization paths
- 30-Day Content Plan
- Current Videos

### 30-Day Content Plan → Real Production

แต่ละ idea สามารถแก้:

- Topic / Title
- Shorts / Long-form
- Objective
- Content Pillar
- Suggested Hook
- Publish date & time

จากนั้นกด **Create Video & Plan Calendar** เพื่อสร้าง `VideoProject` จริงใน workspace แล้วใช้ Calendar Planner เดิมสร้าง workflow ตาม capacity

```text
Idea
→ Create Video
→ Selected
→ Calendar Planner
→ Production Missions
```

ไม่ใช่ mock UI-only state

## Production Flow v1.4

UI รวม workflow ที่ละเอียดเป็น 7 visual groups โดยไม่ลบ detailed stage เดิม:

```text
Idea
  Idea Backlog → Selected

Research
  Researching → Sources Verified

Script
  Hook Ready → Script Draft → Script Approved

Production
  Storyboard → Assets Needed → CapCut Draft

Edit
  Editing

Release
  QA → Scheduled → Published

Growth
  Analytics Review → Repurpose → Archived
```

Production Flow เป็น visual grouping เท่านั้น Completion Gates และ detailed workflow contracts เดิมยังคงทำงาน

## Production Complete semantics

```text
Published + real publication URL
= ✅ VIDEO COMPLETE · 100%
```

หลัง Published ระบบแยกเป็น Growth Loop:

```text
Actual Analytics → Post-mortem → Repurpose → Learning Complete
```

Analytics ไม่ทำให้ Production progress ลดจาก 100%

## Calendar Planner v2

เมื่อสร้างวิดีโอ ให้กำหนด:

- Topic
- Shorts / Long-form
- วันและเวลา Publish

ระบบสร้าง Production Plan ตามความจุเวลาที่ตั้งไว้ (`weeklyHoursAvailable`) และใช้ duration template ที่ต่างกันระหว่าง Shorts กับ Long-form หากงานเกินวัน Publish จะขึ้น Capacity Conflict และสามารถ Reschedule เพื่อคำนวณแผนใหม่ได้

Desktop ใช้ 7-day production schedule ส่วน mobile ใช้ single-day view พร้อม previous/next day

## Manual / AI Assisted

### Manual

- ไม่ต้องใช้ API key
- Copy Prompt ไป ChatGPT/Gemini
- Paste structured JSON กลับ
- Pipeline และ Calendar เดินต่อเหมือนเดิม

### AI Assisted

- เลือก OpenAI หรือ Gemini
- Prompt Studio เรียก Local Server เมื่อผู้ใช้กด Generate
- มี output token limit, request timeout, retry/backoff, daily/monthly budget และ AI run cost ledger
- OpenAI Responses request ใช้ `store=false`
- Gemini ใช้ structured response schema ครบทั้ง 16 Prompt Studio workflows
- Niche/Topic/Fact-check/Competitor research ใช้ Google Search grounding เมื่อ Gemini 3 รองรับ และบันทึกจำนวน search query ลง cost ledger
- คำตอบ Gemini ที่ถูกตัดกลาง JSON จะ compact-retry ได้หนึ่งครั้ง โดยนับ token และต้นทุนของทั้งสองคำขอ
- ค่าเริ่มต้นใช้ `gemini-3.5-flash`; สามารถเลือก Gemini รุ่นอื่นที่บัญชี Google AI เปิดใช้งานได้ใน Settings

> AI Assisted ยังไม่ใช่ unattended/full-auto publishing ผู้ใช้ยังเป็นผู้อนุมัติขั้นตอนสำคัญ

ทดสอบ Google AI แบบ isolated database โดยไม่พิมพ์ key หรือ response body:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-ai-live-coverage.ps1
```

การทดสอบครอบคลุม contract, persistence destination, token/search/cost ledger และ quality signals ของทั้ง 16 workflow แหล่งข้อมูลจาก provider ที่ไม่มี Search grounding จะถูกเก็บเป็นคำแนะนำให้ตรวจและไม่ผ่าน Evidence Gate อัตโนมัติ ผู้ใช้ยังต้องเปิดตรวจแหล่งอ้างอิงที่ grounded ก่อนอนุมัติ

## API key security

**v1.4 ไม่เก็บ API key ใน SQLite**

Persistent key ให้ตั้งผ่าน environment:

```text
OPENAI_API_KEY
GEMINI_API_KEY
```

หรือใส่ Session-only key ใน Settings ซึ่งอยู่ใน memory ของ Local Server และหายเมื่อปิด server

Browser เห็นเพียง configured status + masked preview เท่านั้น

ดูตัวอย่างที่ `.env.example`

Production ควรเก็บ key ใน root-only environment file, bind Python server ที่ loopback, วาง TLS/reverse proxy และ authentication ไว้หน้าแอป พร้อมตั้ง `CREATOR_EMPIRE_MAX_DAILY_USD` และ `CREATOR_EMPIRE_MAX_MONTHLY_USD` เป็น hard ceiling ที่หน้า Settings เพิ่มเกินไม่ได้

## Data Reliability v2

SQLite file ค่าเริ่มต้น:

```text
data/creator_empire.sqlite
```

ไฟล์นี้และ `-wal/-shm` ถูก ignore จาก Git

Data contract:

- SQLite transactional writes (`BEGIN IMMEDIATE`, `synchronous=full`)
- monotonic workspace `revision`
- SHA-256 checksum
- `workspace_history` สำหรับ recovery snapshots
- IndexedDB mirror สำหรับ offline/crash recovery
- เปิดแอปแล้วเปรียบเทียบ revision; copy ที่ใหม่กว่าจะ reconcile กลับอีกฝั่ง
- Restore history จะสร้าง revision ใหม่ ไม่ rewind counter

ตาราง SQLite หลัก:

- `workspace`
- `workspace_history`
- `ai_runs`

ไม่มี `ai_secrets` table

## Release Gate

Policy Shield แยก Mandatory กับ Conditional checks โดย Mandatory ต้องผ่านครบก่อน QA → Scheduled:

- Original script
- Sources present
- Claims classified
- AI disclosure reviewed
- Music / footage licensed
- Template/repetitious-content risk reviewed

## Validation — ไม่ใช้ GitHub Actions

Repository นี้ **ไม่ใช้ GitHub Actions เป็น dependency ของ build, test หรือ release gate**

Windows core validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-local.ps1
```

รวม Browser regression + v1.4 acceptance:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-local.ps1 -Browser
```

macOS / Linux:

```bash
bash scripts/validate-local.sh
bash scripts/validate-local.sh --browser
```

Local validation ครอบคลุม:

- TypeScript build + domain/UI tests
- SQLite revision/history/checksum/recovery
- IndexedDB outage + dual-storage reconciliation
- secret non-persistence
- mocked AI token/cost guardrails
- Windows launcher startup test
- v1.3 recovery browser regression
- v1.4 frozen-design browser acceptance
- 1440 / 390 responsive checks
- repository hygiene guard ว่า `dist/`, `data/`, SQLite/WAL/SHM และ `.env` ไม่ถูก track

## Runtime files

ห้าม commit:

```text
dist/
data/
*.sqlite
*.sqlite-wal
*.sqlite-shm
.env
.env.local
```
