# Creator Empire Simulator v1.1.0 — Release Notes

## Release objective

เปลี่ยนระบบจาก Portfolio-first toolkit ให้เป็น Channel-focused video operating loop ที่พาผู้ใช้ทำงานหนึ่งคลิปต่อเนื่องจน Publish และเรียนรู้จาก Analytics

## New: Channel Focus Mode

- Global Channel selector อยู่ใน Desktop HUD และ Mobile Focus Bar
- ทุกหน้าหลักอ่าน Channel เดียวกันเป็น Context
- `Portfolio Mode` ใช้ดูทุกช่องพร้อมกัน
- การเลือก Project ของอีกช่องจะเปลี่ยน Channel Focus ให้ตรงกับเจ้าของ Project อัตโนมัติ
- Focus state บันทึกใน IndexedDB และ Workspace export

## New: Active Project

- Global Active Project selector แสดงเฉพาะ Project ใน Channel Focus
- Mission, Prompt Studio, CapCut, Calendar, Policy และ Analytics ใช้ Project เดียวกัน
- เปลี่ยน Project แล้ว Context, Language, Audience, Analytics และ Prompt เปลี่ยนตาม
- Project focus และ Current Mission คงอยู่หลัง Reload

## New: Video Mission Control

หน้า `Mission` แสดง:

- Channel Focus
- Active Project
- Current stage และ Target stage
- Recommended prompt/tool
- Current Calendar mission
- Completion Gate
- 17-stage production path
- Artifact inventory
- Focused channel queue
- Project-specific calendar missions

## New: Calendar-driven Mission

- สร้างแผนภารกิจจากสถานะ Pipeline ที่แท้จริง
- Mission ปัจจุบันเริ่มได้จาก HQ, HUD, Calendar หรือ Mission Control
- Future missions แสดง Locked จน Project ถึง Source Stage
- งานที่ผ่านแล้วถูก Mark complete อัตโนมัติ
- Rebuild workflow plan ได้โดยไม่ลบ Manual calendar tasks

## New: Pipeline-driven Prompt Studio

- Pipeline เลือก Prompt ถัดไปให้
- Prompt Studio เน้น `Recommended Now` แทนการให้ผู้ใช้เดา 16 Prompt เอง
- Typed JSON response สามารถบันทึก:
  - Research summary และ Sources
  - Fact-check summary
  - Hook
  - Script
  - Storyboard
  - Asset prompts
  - CapCut brief
  - Thumbnail/title concepts
  - Analytics post-mortem
  - Repurposing plan
  - Next-video recommendations
- Parse/Apply จะเลื่อน Pipeline อัตโนมัติเฉพาะ Prompt ที่เข้ากับ Current Stage เท่านั้น

## New: Completion Gates

Pipeline จะไม่เลื่อนเมื่อ Artifact ที่จำเป็นยังไม่ครบ เช่น:

- Sources Verified ต้องมี Research, Source และ Fact-check
- Storyboard ต้องมี Scene list
- Assets Needed ต้องมี Asset prompts
- Editing ต้องมี Credit ledger
- Scheduled ต้องมี Policy risk Low และอย่างน้อย 6 checks
- Published ต้องมี Publication URL
- Analytics Review ต้องมี Actual analytics ที่ไม่ใช่ Demo
- Repurpose ต้องมี Post-mortem
- Archived ต้องมี Repurposing plan

## Data and migration

- Workspace schema เพิ่มจาก 1 เป็น 2
- เพิ่ม `focus`
- เพิ่ม Workflow metadata ใน CalendarTask
- เพิ่ม Project artifact fields และ Workflow event history
- Import schema 1 จะ migrate เป็น schema 2 อัตโนมัติ

## PWA

- Cache version: `creator-empire-v1.1.0`
- Offline asset list เพิ่ม Focus, Workflow, Migration และ Mission modules

## Quality corrections

- แก้ Mission Control grid min-content overflow บน Desktop
- ป้องกัน document-level horizontal overflow ในทุก route ที่ตรวจ
- เพิ่ม Domain tests สำหรับ Focus, Workflow, Gates, Migration และ Calendar mission sync
## Release verification

- TypeScript build: PASS
- Domain tests: 22/22 PASS
- Browser acceptance: 131/131 PASS
- Desktop routes: 15/15 with no document overflow
- Mobile routes: 15/15 with no document overflow and Focus bar visible
- Console errors: 0
- Page errors: 0
- Offline PWA reload: PASS

See `docs/QA-1.1.0.md` for the complete evidence ledger.

