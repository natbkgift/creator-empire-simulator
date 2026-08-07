# คู่มือใช้งาน Creator Empire Simulator v1.1.0

## เป้าหมายของระบบ

ระบบนี้พาคุณทำงาน **ทีละช่องและทีละคลิป** ไม่ใช่เพียงเก็บไอเดียหรือสร้าง Prompt แบบแยกส่วน

ทุกครั้งให้คิดตามลำดับ:

```text
ช่องไหน → คลิปไหน → อยู่ขั้นไหน → ภารกิจถัดไปคืออะไร → ต้องสร้าง Artifact อะไร
```

## 1. เลือก Channel Focus

ด้านบนของระบบมี `Channel Focus`

- เลือก `History Lab` เพื่อทำเฉพาะงานของช่อง History
- เลือก `FlowBiz AI Minute` เพื่อทำเฉพาะงาน AI ภาษาไทย
- เลือก `Portfolio · ทุกช่อง` เมื่อต้องการมองภาพรวม

เมื่ออยู่ใน Channel Focus:

- Active Project แสดงเฉพาะคลิปในช่องนั้น
- Board, Prompt, Calendar, CapCut, Data และ Policy ใช้ Context ของช่องนั้น
- Dashboard และต้นทุนจะแสดงข้อมูล Focused Channel เป็นหลัก

## 2. เลือก Active Project

Active Project คือวิดีโอที่กำลังเดินหน้าอยู่

ตัวอย่าง:

```text
Channel Focus: History Lab
Active Project: Wojtek: The Soldier Bear
Current Stage: Script Approved
```

เลือก Project ของช่องอื่นได้ ระบบจะเปลี่ยน Channel Focus ให้เอง

## 3. เปิด Video Mission Control

กด `Start mission` จาก HUD หรือเปิดเมนู `Mission`

Mission Control แสดง:

- Current mission
- Current stage
- Target stage
- Recommended tool/prompt
- Completion Gate
- Progress 17 ขั้น
- Artifacts ที่พร้อมและยังขาด
- Project queue ของช่อง
- Calendar missions ของคลิป

## 4. เริ่ม Mission

กด `Start mission`

ระบบจะเปิดหน้าที่ถูกต้องตาม Pipeline เช่น:

- Research / Hook / Script / Storyboard → Prompt Studio
- CapCut generation → CapCut Lab
- QA → Policy Shield
- Performance entry → Analytics War Room
- Publish URL → Mission Control dialog

คุณไม่จำเป็นต้องเลือก Prompt จาก 16 แบบเองทุกครั้ง

## 5. ใช้ Prompt Studio

Prompt Studio จะเลือก `Recommended Prompt` ตาม Current Stage

ขั้นตอน:

1. ตรวจ Channel, Project, Stage และ Language
2. กด `Copy to ChatGPT`
3. วาง Prompt ใน ChatGPT Thinking Pro
4. ให้ ChatGPT ตอบ JSON ตาม Output Contract
5. Paste JSON ในช่อง `Paste AI response`
6. กด `Parse, save & advance`

ระบบจะบันทึกผลลัพธ์ลง Active Project และเลื่อนไปขั้นถัดไปเมื่อ Gate ผ่าน

### ตัวอย่าง Storyboard JSON

```json
{
  "title": "Wojtek: The Soldier Bear",
  "durationSeconds": 55,
  "scenes": [
    {
      "start": 0,
      "end": 3,
      "narration": "This bear was not just a mascot.",
      "visual": "Wojtek beside Polish soldiers",
      "onScreenText": "A REAL SOLDIER?",
      "sourceNote": "AI historical reconstruction"
    }
  ],
  "disclosure": "AI historical reconstruction"
}
```

## 6. Completion Gate

ปุ่ม `Complete & advance` ใช้ได้จริงเมื่อ Artifact พร้อม

ตัวอย่าง:

| Target stage | สิ่งที่ต้องมี |
|---|---|
| Researching | Research summary |
| Sources Verified | Research + Source + Fact-check |
| Hook Ready | Hook |
| Script Draft / Approved | Script |
| Storyboard | Scene list |
| Assets Needed | Asset prompts |
| CapCut Draft | CapCut brief |
| Editing | Credit ledger |
| Scheduled | Policy Low + 6 checks |
| Published | Publication URL |
| Analytics Review | Actual analytics |
| Repurpose | Post-mortem |
| Archived | Repurposing plan |

ถ้ายังไม่ผ่าน ระบบจะบอก Blocker และเปิดหน้าที่ต้องแก้

## 7. Calendar-driven Mission

หน้า `Calendar` แสดงเฉพาะงานของ Channel Focus เป็นค่าเริ่มต้น

- Mission ปัจจุบัน: Start ได้
- Future mission: Locked
- Past mission: Done
- Manual task: ทำเครื่องหมายเสร็จได้ตามปกติ
- `Rebuild workflow` สร้างภารกิจใหม่ตาม Current Stage โดยไม่ลบ Manual tasks

Calendar ไม่ได้แค่เตือนวัน แต่เป็นตัวขับ Workflow

## 8. Pipeline

หน้า `Board` ใช้ดูทุก Stage และ WIP

- Active Project มีกรอบเน้น
- Project ที่ไม่ผ่าน Gate จะไม่ควรเลื่อนไปเอง
- เปิด Project card เพื่อไป Mission, Prompt, CapCut, Calendar หรือ Policy
- ปิดงานใกล้ Publish ก่อนเปิด WIP ใหม่

## 9. CapCut Lab

เมื่อ Pipeline ถึง `CapCut Draft`:

1. เปิด CapCut Lab
2. ตรวจ Standard/Director recommendation
3. Generate งานใน CapCut
4. บันทึก Balance ก่อนและหลัง
5. ใส่ Generations, Regenerations และ Usable outputs
6. Save Credit Entry

Credit ledger เป็น Gate สำหรับ `Editing`

## 10. Policy Shield

ก่อน `Scheduled` ให้ทำอย่างน้อย 6 checks และ Risk ต้องเป็น `Low`

ตรวจ:

- Original script
- Sources present
- Claims classified
- AI disclosure
- Music license
- Template/repetition risk

## 11. Publish และ Analytics

### Publish

เมื่ออยู่ `Scheduled` กด `Complete & advance` แล้วใส่ URL ที่เผยแพร่จริง

### Analytics

เมื่ออยู่ `Published`:

1. เปิด `Data`
2. เลือก Active Project
3. บันทึก Actual views, retention, CTR, subscribers, time, credits และ cost
4. ระบบเลื่อนไป `Analytics Review`

หลังจากนั้นใช้ Prompt `Analytics Post-mortem`

## 12. ปิด Learning Loop

ลำดับสุดท้าย:

```text
Published
→ Actual Analytics
→ Analytics Post-mortem
→ Repurposing Plan
→ Archived
→ Next Video Recommendation
```

`Archived` หมายถึงปิดรอบการเรียนรู้แล้ว ไม่ใช่ลบ Project

## 13. สำรองข้อมูล

เปิด `Files`:

- Export Workspace JSON
- Export Projects CSV
- Export Analytics CSV
- Import Workspace JSON

ข้อมูลอยู่ใน Browser เครื่องปัจจุบัน ควร Export JSON เป็นระยะ

## 14. แนวทางใช้งานที่แนะนำ

- ใช้ 1 Primary Channel + 1 Experimental Channel
- Focus หนึ่งคลิปจนผ่าน Stage สำคัญก่อนสลับ
- ใช้ Prompt recommendation เป็นค่าเริ่มต้น
- บันทึกเครดิต CapCut ทุกครั้ง
- หลัง Publish ต้องบันทึก Actual analytics
- อย่าใช้ Simulator เป็นคำรับประกันรายได้
