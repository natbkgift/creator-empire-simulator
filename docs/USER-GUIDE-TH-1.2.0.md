# คู่มือใช้งาน v1.2.0

## เปิดระบบ

บน Windows ให้แตก ZIP แล้วดับเบิลคลิก:

```text
START-HERE-WINDOWS.bat
```

ระบบจะเปิด Local Server ที่:

```text
http://127.0.0.1:4173
```

ฐานข้อมูลจะอยู่ที่:

```text
data/creator_empire.sqlite
```

## โหมด Manual

เหมาะสำหรับเริ่มใช้งานโดยไม่ต้องเสีย API เพิ่ม

1. เลือก Channel Focus
2. เลือก Active Project
3. เปิด Mission Control หรือ Calendar
4. Start Mission
5. เข้า Prompt Studio
6. Copy prompt
7. วางใน ChatGPT หรือ Gemini เอง
8. เอาผลลัพธ์ JSON กลับมา Paste
9. กด Parse, save & advance
10. ระบบเลื่อน Pipeline ไปขั้นถัดไป

## โหมด Automatic

เหมาะเมื่อพร้อมใช้ API

1. ไปที่ Settings
2. เลือก Workflow Mode = Automatic
3. เลือก Provider: OpenAI หรือ Gemini
4. ใส่ชื่อ Model
5. กด Save settings
6. ในส่วน API keys ให้เลือก Provider
7. วาง API key ในช่อง API key ของแอปเท่านั้น
8. กด Save key to SQLite
9. กด Test selected provider
10. กลับไป Prompt Studio แล้วกด Generate with OpenAI/Gemini

อย่าส่ง API key เข้ามาในแชต ให้ใส่ในหน้า Settings ของแอปบนเครื่องตัวเองเท่านั้น

## Calendar Plan

Calendar จะผูกกับ Active Project และ Pipeline:

- Research
- Fact-check
- Hook
- Script
- Storyboard
- Asset prompts
- CapCut draft
- Editing
- QA
- Schedule
- Upload / Published
- Analytics review
- Repurpose

งานแต่ละชิ้นถือว่าสำเร็จเมื่อมี Artifact ตามขั้นนั้น เช่น Script, Storyboard, CapCut Brief, Credit Ledger, URL เผยแพร่ หรือ Analytics จริง

## เมื่อไรถือว่าคลิปเสร็จ

สำหรับ v1.2.0 คลิปถือว่าสำเร็จเมื่อ Project ผ่านถึงสถานะ:

```text
Published
```

โดยต้องมี Publication URL เช่น YouTube Shorts URL หรือ Facebook/TikTok URL

หลังจากนั้นระบบจะเปิดขั้น Analytics Review เพื่อเรียนรู้และวางคลิปถัดไป
