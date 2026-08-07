import type { CalendarTask, Workspace } from '../domain/types.js';
import { activeChannel, activeProject, projectsInFocus, statusLabels } from '../app/selectors.js';
import { routeHref } from '../app/router.js';
import { addDays, escapeHtml, todayIso } from '../domain/utils.js';
import { taskIsUnlocked, workflowRecommendation, workflowStatusLabels } from '../domain/workflow.js';
import { chip, pageHeader } from '../ui/components.js';

const taskColor: Record<CalendarTask['type'], string> = {
  research: 'var(--cyan)', script: 'var(--violet)', editing: 'var(--amber)', upload: 'var(--green)', analytics: 'var(--blue)', rest: 'var(--muted)', other: 'var(--red)',
};

const weekday = (iso: string): string => new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));

export const renderCalendar = (workspace: Workspace, params: URLSearchParams): string => {
  const today = todayIso();
  const channel = activeChannel(workspace);
  const requested = workspace.projects.find((item) => item.id === params.get('project'));
  const project = requested ?? activeProject(workspace);
  const projects = projectsInFocus(workspace);
  const projectIds = new Set(projects.map((item) => item.id));
  const tasks = workspace.calendarTasks
    .filter((task) => !task.projectId || projectIds.has(task.projectId))
    .toSorted((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const dates = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const nextTask = tasks.find((task) => !task.completed && taskIsUnlocked(task, workspace.projects.find((item) => item.id === task.projectId)));
  const recommendation = project ? workflowRecommendation(workspace, project) : undefined;
  const maxOffset = 14;
  const taskCard = (task: CalendarTask): string => {
    const owner = workspace.projects.find((item) => item.id === task.projectId);
    const unlocked = taskIsUnlocked(task, owner);
    return `<article class="calendar-task-card ${task.completed ? 'done' : ''} ${unlocked ? '' : 'locked'} ${task.id === workspace.focus.activeTaskId ? 'active' : ''}" style="--task-color:${taskColor[task.type]}">
      <div class="calendar-task-body"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.startTime)} · ${task.durationMinutes}m · ${escapeHtml(task.type)}${owner ? ` · ${escapeHtml(owner.title)}` : ''}</span>${!unlocked && task.sourceStatus ? `<small class="task-lock-copy">Locked until ${escapeHtml(workflowStatusLabels[task.sourceStatus])}</small>` : ''}</div>
      <div class="calendar-task-actions">${task.completed ? chip('Done', 'green') : unlocked ? `<button class="btn small" data-action="start-mission" data-project-id="${escapeHtml(owner?.id ?? '')}" data-task-id="${escapeHtml(task.id)}">Start</button><button class="btn small ghost" data-action="complete-workflow-task" data-project-id="${escapeHtml(owner?.id ?? '')}" data-task-id="${escapeHtml(task.id)}">Complete</button>` : chip('Locked', 'amber')}</div>
    </article>`;
  };
  return `${pageHeader('Publishing Tower', 'Calendar-driven Mission แสดงเฉพาะ Channel ที่ Focus และล็อกงานอนาคตตาม Pipeline', `<button class="btn" data-action="export-ics">Export .ics</button>${project ? `<button class="btn" data-action="generate-workflow-plan" data-project-id="${escapeHtml(project.id)}">Rebuild workflow</button>` : ''}<a class="btn primary" href="${routeHref('mission', project ? { project: project.id } : undefined)}">Mission Control</a>`)}
    <section class="calendar-mission-banner">
      <div><span class="kicker">Next unlocked mission</span><h3>${escapeHtml(nextTask?.title ?? recommendation?.title ?? 'No mission queued')}</h3><p>${nextTask ? `${nextTask.date} · ${nextTask.startTime} · ${nextTask.durationMinutes} นาที` : recommendation?.detail ?? 'Create a project to begin.'}</p></div>
      <div class="row wrap">${channel ? chip(channel.name, 'cyan') : chip('Portfolio', 'violet')}${project ? chip(`${statusLabels[project.status]} · ${project.title}`, 'amber') : ''}${nextTask ? `<button class="btn primary" data-action="start-mission" data-project-id="${escapeHtml(nextTask.projectId ?? '')}" data-task-id="${escapeHtml(nextTask.id)}">Start mission</button>` : ''}</div>
    </section>
    <div class="calendar-layout">
      <section class="stack">
        <article class="panel calendar-panel"><div class="panel-title"><div><h3>7-day production schedule</h3><p>${channel ? `Channel Focus: ${escapeHtml(channel.name)}` : 'Portfolio schedule'}</p></div><span class="chip cyan">${escapeHtml(workspace.settings.timezone)}</span></div><div class="calendar-grid">${dates.map((date) => `<div class="day-column ${date === today ? 'today' : ''}"><div class="day-head"><b>${escapeHtml(weekday(date))}</b><span>${date === today ? 'Today' : ''}</span></div><div class="calendar-day-tasks">${tasks.filter((task) => task.date === date).map(taskCard).join('') || '<span class="dim small-copy">Buffer available</span>'}</div></div>`).join('')}</div></article>
        <article class="panel calendar-panel"><div class="panel-title"><div><h3>Focused roadmap / Gantt slice</h3><p>Timeline แสดง Project ใน Channel ปัจจุบัน ไม่ย่อทุกช่องรวมกัน</p></div></div><div class="gantt">${projects.slice(0, 10).map((item, index) => { const offset = Math.max(0, Math.min(maxOffset - 1, Math.round((new Date(`${item.deadline}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000))); const start = `${(offset / maxOffset) * 100}%`; const span = `${Math.max(8, ((index % 4) + 1) / maxOffset * 100)}%`; return `<button class="gantt-row calendar-project-row ${item.id === project?.id ? 'active' : ''}" data-action="set-active-project" data-project-id="${escapeHtml(item.id)}"><span class="gantt-label">${escapeHtml(item.title)}<small>${escapeHtml(statusLabels[item.status])}</small></span><span class="gantt-track"><i class="gantt-bar" style="--start:${start};--span:${span}"></i></span></button>`; }).join('')}</div></article>
      </section>
      <aside class="panel panel-pad"><div class="panel-title"><div><h3>เพิ่มภารกิจเอง</h3><p>ภารกิจ Manual ใช้ร่วมกับ Workflow Missions ได้</p></div></div><form class="stack" data-form="calendar-task"><div class="field"><label>Task title</label><input class="input" name="title" required placeholder="เช่น Review final captions"/></div><div class="form-grid"><div class="field"><label>Date</label><input class="input" type="date" name="date" value="${today}" required/></div><div class="field"><label>Start</label><input class="input" type="time" name="startTime" value="09:00" required/></div></div><div class="form-grid"><div class="field"><label>Duration</label><input class="input" type="number" name="durationMinutes" min="5" value="30"/></div><div class="field"><label>Type</label><select class="select" name="type"><option value="research">Research</option><option value="script">Script</option><option value="editing">Editing</option><option value="upload">Upload</option><option value="analytics">Analytics</option><option value="rest">Rest/buffer</option><option value="other">Other</option></select></div></div><div class="field"><label>Project</label><select class="select" name="projectId"><option value="">Studio task</option>${projects.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === project?.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('')}</select></div><div class="field"><label>Recurring</label><select class="select" name="recurring"><option value="none">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div><button class="btn primary" type="submit">เพิ่มในปฏิทิน</button></form><div class="divider"></div><div class="panel-title"><div><h3>Upcoming missions</h3><p>${tasks.filter((task) => !task.completed).length} งานยังไม่เสร็จ</p></div></div><div class="stack tight">${tasks.filter((task) => !task.completed).slice(0, 10).map((task) => { const owner = workspace.projects.find((item) => item.id === task.projectId); const unlocked = taskIsUnlocked(task, owner); return `<div class="path-card ${unlocked ? '' : 'locked'}"><div class="row between"><strong style="font-size:10px">${escapeHtml(task.title)}</strong>${unlocked ? chip(task.date) : chip('Locked', 'amber')}</div><p>${escapeHtml(task.startTime)} · ${task.durationMinutes}m · ${escapeHtml(task.type)}${task.sourceStatus ? ` · ${escapeHtml(workflowStatusLabels[task.sourceStatus])}` : ''}</p></div>`; }).join('')}</div></aside>
    </div>`;
};
