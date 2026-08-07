# Creator Empire Simulator v1.3.0

ระบบวางแผนและผลิตวิดีโอหลายช่องแบบ **Today → Next Mission → Publish** โดยใช้ SQLite แบบ revisioned เป็น durable store, IndexedDB เป็น offline mirror และรองรับทั้ง Manual กับ AI Assisted (OpenAI / Gemini)

## เปิดใช้งานบน Windows

```text
1. npm ci
2. npm run build
3. ดับเบิลคลิก START-HERE-WINDOWS.bat
4. เปิด http://127.0.0.1:4173
```

Local server bind เฉพาะ `127.0.0.1` โดยค่าเริ่มต้น

## 5 พื้นที่หลัก

- **Today** — Next Mission และงานวันนี้
- **Channels** — Channel Strategy + สร้างวิดีโอจาก Topic / Format / Publish datetime
- **Calendar** — Capacity-aware production plan, conflicts และ reschedule
- **Production** — งานที่ยังต้องปิดก่อน Publish
- **Insights** — Analytics หลัง Publish

Prompt Studio, CapCut Lab และ Policy Shield เป็น contextual tools ที่ Mission เปิดให้ตามขั้นตอน จึงไม่ต้องหาเมนูเอง

## Production semantics

```text
Idea → Research → Fact Check → Hook → Script → Storyboard
→ Assets → CapCut → Edit → QA → Schedule → Upload
→ ✅ Published / VIDEO COMPLETE
```

หลัง Published ระบบแยกเป็น Growth Loop:

```text
Actual Analytics → Post-mortem → Repurpose → Learning Loop Complete
```

Analytics ไม่ทำให้วิดีโอดูเหมือน “ยังผลิตไม่เสร็จ” อีกต่อไป

## Calendar Planner v2

เมื่อสร้างวิดีโอ ให้กำหนด:

- Topic
- Shorts / Long-form
- วันและเวลา Publish

ระบบจะสร้าง Production Plan ตามความจุเวลาที่ตั้งไว้ (`weeklyHoursAvailable`) และใช้ duration template ที่ต่างกันระหว่าง Shorts กับ Long-form หากงานเกินวัน Publish จะขึ้น Capacity conflict และสามารถ Reschedule เพื่อคำนวณแผนใหม่ได้

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

> AI Assisted ยังไม่ใช่ unattended/full-auto publishing ผู้ใช้ยังเป็นผู้อนุมัติขั้นตอนสำคัญ

## API key security

**v1.3 ไม่เก็บ API key ใน SQLite**

Persistent key ให้ตั้งผ่าน environment:

```text
OPENAI_API_KEY
GEMINI_API_KEY
```

หรือใส่ Session-only key ใน Settings ซึ่งอยู่ใน memory ของ Local Server และหายเมื่อปิด server

Browser เห็นเพียง configured status + masked preview เท่านั้น

ดูตัวอย่างที่ `.env.example`

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

ไม่มี `ai_secrets` table ใน v1.3

## Release Gate

Policy Shield แยก Mandatory กับ Conditional checks โดย Mandatory ต้องผ่านครบก่อน QA → Scheduled:

- Original script
- Sources present
- Claims classified
- AI disclosure reviewed
- Music / footage licensed
- Template/repetitious-content risk reviewed

## QA

```bash
npm test
python tests/server-v1.3.py
```

เพิ่มเติมใน CI:

- Browser v1.3 E2E
- SQLite ↔ IndexedDB conflict/recovery
- SQLite outage/reconnect
- secret persistence test
- mocked AI token/cost ledger test
- Windows `START-HERE-WINDOWS.bat` startup test
- guard ว่า `dist/`, `data/`, SQLite/WAL/SHM ไม่ถูก track

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
