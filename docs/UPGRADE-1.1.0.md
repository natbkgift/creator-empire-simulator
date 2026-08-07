# Upgrade 1.1.0 — Channel-focused Mission Orchestration

## ปัญหาของรุ่นก่อน

รุ่น 1.0 มี Channel portfolio, Pipeline, Prompt Studio และ Calendar ครบ แต่แต่ละส่วนยังมีลักษณะเป็นเครื่องมือแยกหน้า ผู้ใช้ต้องจำเองว่า:

- กำลังทำช่องไหน
- กำลังทำคลิปไหน
- วันนี้ต้องทำขั้นไหน
- ควรเลือก Prompt อะไร
- งานที่สร้างแล้วต้องบันทึกไว้ที่ใด

## สถาปัตยกรรมใหม่

```text
Workspace
  └─ FocusState
       ├─ mode: channel | portfolio
       ├─ activeChannelId
       ├─ activeProjectId
       └─ activeTaskId

Channel
  └─ VideoProject
       ├─ ProjectStatus
       ├─ Artifacts
       ├─ WorkflowEvents
       └─ CalendarTask[]
```

## Orchestration contract

### 1. Channel Focus

`applyChannelFocus()` เลือก Channel และหา Project ที่ควร Focus ภายในช่องนั้น

### 2. Active Project

`applyProjectFocus()` เลือก Project แล้วปรับ Channel Focus ให้ตรงกับ `project.channelId`

### 3. Pipeline recommendation

`workflowRecommendation()` แปลง Current `ProjectStatus` เป็น:

- Mission title
- Target status
- Prompt type หรือ Product route
- Estimated minutes
- XP
- Calendar task type

### 4. Completion Gate

`workflowReadiness()` ตรวจ Artifact ก่อนเลื่อน Stage

### 5. Calendar sync

`syncNextWorkflowMission()`:

- ปิด Past missions
- หา Current mission
- สร้าง Current mission หากยังไม่มี
- รักษา Future missions ให้ Locked

### 6. Prompt response application

`parseAndApplyPromptResponse()`:

- ตรวจ JSON
- Apply fields เข้า Active Project
- ตรวจว่า Prompt ตรงกับ Pipeline recommendation หรือไม่
- ตรวจ Completion Gate
- ปิด Mission เดิม
- เลื่อน Stage
- Award XP
- Focus Mission ถัดไป

## Route ownership

| Stage | Recommended surface |
|---|---|
| Selected | Prompt Studio — Topic Research |
| Researching | Prompt Studio — Fact-check |
| Sources Verified | Prompt Studio — Hook Generator |
| Hook Ready | Prompt Studio — Script |
| Script Draft | Mission Control — Review/Approve |
| Script Approved | Prompt Studio — Storyboard |
| Storyboard | Prompt Studio — AI Image/Video |
| Assets Needed | Prompt Studio — CapCut Prompt |
| CapCut Draft | CapCut Lab |
| Editing | Mission Control |
| QA | Policy Shield |
| Scheduled | Mission Control — Publish URL |
| Published | Analytics War Room |
| Analytics Review | Prompt Studio — Post-mortem |
| Repurpose | Prompt Studio — Repurposing |
| Archived | Prompt Studio — Next Video |

## Backward compatibility

- Workspace schema 1 import รองรับ
- Existing Project และ Calendar records ถูกเติม Default fields
- Existing Manual tasks ไม่ถูกลบ
- Existing Demo and real data remain separate
- Connected AI ยังปิดไว้เหมือนเดิม
