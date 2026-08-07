# Creator Empire Simulator v1.2.0

ระบบวางแผนและผลิตวิดีโอหลายช่องแบบ Mission-based workflow พร้อมฐานข้อมูล SQLite และโหมด Manual/Automatic AI

## เปิดใช้งานบน Windows

1. แตกไฟล์ ZIP
2. ดับเบิลคลิก `START-HERE-WINDOWS.bat`
3. เปิด URL:

```text
http://127.0.0.1:4173
```

ระบบใช้ Python 3 local server เพื่อเก็บข้อมูลจริงใน SQLite:

```text
data/creator_empire.sqlite
```

## โหมดการทำงาน

### Manual Mode

- ไม่ต้องใช้ API key
- Copy Prompt จาก Prompt Studio
- วางใน ChatGPT/Gemini เอง
- Paste JSON กลับเข้าระบบ
- ระบบบันทึก Artifact และเลื่อน Pipeline ให้

### Automatic Mode

- ต้องเปิด Settings → Workflow Mode = Automatic
- เลือก OpenAI หรือ Gemini
- ใส่ API key ในหน้า Settings ของแอปเท่านั้น
- คีย์เก็บใน SQLite ฝั่ง local server ไม่ส่งกลับมาที่ Browser
- Prompt Studio จะเปลี่ยนจาก `Copy to ChatGPT` เป็น `Generate with OpenAI/Gemini`

## ฐานข้อมูล

ตารางหลัก:

- `workspace` — ข้อมูลช่อง, โปรเจกต์, Calendar, Pipeline, Analytics, Settings
- `ai_secrets` — API key และ model server-side
- `ai_runs` — ประวัติ metadata ของการเรียก AI

## Workflow หลัก

```text
Channel Focus
→ Active Project
→ Calendar Mission
→ Prompt Studio
→ Parse / Save Artifact
→ Advance Pipeline
→ CapCut / Editing
→ QA
→ Upload / Published
→ Analytics Review
→ Repurpose
```

คลิปถือว่าเสร็จเมื่อมี Publication URL และสถานะเป็น `Published`

## เอกสารสำคัญ

- `docs/USER-GUIDE-TH-1.2.0.md`
- `docs/RELEASE-NOTES-1.2.0.md`
- `docs/QA-1.2.0.md`
