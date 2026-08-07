import type { Workspace } from '../domain/types.js';
import { escapeHtml } from '../domain/utils.js';
import { activeChannel, activeProject, capacityStats, dailyMission, nextBestAction, projectProgress, projectsInFocus, statusLabels } from '../app/selectors.js';
import { routeHref } from '../app/router.js';
import { button, chip, pageHeader, progress } from '../ui/components.js';
import { isProductionComplete } from '../domain/workflow.js';

export const renderHq = (workspace: Workspace): string => {
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const mission = dailyMission(workspace);
  const next = nextBestAction(workspace);
  const capacity = capacityStats(workspace);
  const actionAttrs = `data-project-id="${escapeHtml(project?.id ?? '')}" data-task-id="${escapeHtml(mission.taskId ?? '')}"`;
  const today = new Date().toISOString().slice(0,10);
  const todayTasks = workspace.calendarTasks.filter((task) => task.date === today && !task.completed).toSorted((a,b) => a.startTime.localeCompare(b.startTime)).slice(0,5);
  const focused = projectsInFocus(workspace);
  const completeCount = focused.filter(isProductionComplete).length;
  const wip = focused.filter((item) => !isProductionComplete(item) && item.status !== 'archived').toSorted((a,b) => (a.publishAt ?? a.deadline).localeCompare(b.publishAt ?? b.deadline)).slice(0,4);

  return `${pageHeader('Today','เห็นเฉพาะสิ่งที่ควรทำต่อ แล้วให้ Mission เปิด Prompt / CapCut / Policy ตาม Context ให้เอง', `<a class="btn" href="${routeHref('calendar')}">Calendar</a><a class="btn primary" href="${routeHref('blueprint', channel ? { channel: channel.id } : undefined)}">+ Plan video</a>`)}
    <section class="panel mission-deck">
      <div class="mission-title"><span class="kicker">NEXT MISSION · +${mission.xp} XP</span><h3>${escapeHtml(mission.title)}</h3><p>${escapeHtml(mission.detail)}</p><div class="mission-meta">${channel ? chip(channel.name,'cyan') : chip('Portfolio','violet')}${project ? chip(statusLabels[project.status], isProductionComplete(project) ? 'green' : 'amber') : ''}</div><div class="row wrap" style="margin-top:16px">${button('Start now','start-mission',{tone:'primary',iconName:'play',attrs:actionAttrs})}${project ? `<a class="btn" href="${routeHref('calendar',{project:project.id})}">View plan</a>` : ''}</div></div>
      <div class="progress-orbit" aria-label="Project progress ${mission.progress}%"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="48"/><circle class="fill" cx="60" cy="60" r="48" style="stroke-dasharray:302;stroke-dashoffset:${302 * (1 - mission.progress / 100)}"/></svg><div class="orbit-copy"><b>${mission.progress}%</b><span>${isProductionComplete(project ?? ({} as never)) ? 'complete' : 'to publish'}</span></div></div>
    </section>

    <div class="grid-2" style="margin-top:16px">
      <section class="panel panel-pad"><div class="panel-title"><div><h3>Today schedule</h3><p>${todayTasks.length ? `${todayTasks.length} งานที่ต้องทำวันนี้` : 'ไม่มีงานค้างวันนี้'}</p></div><a class="btn small" href="${routeHref('calendar')}">Open calendar</a></div><div class="stack tight">${todayTasks.map((task) => `<button class="path-card" data-action="start-mission" data-project-id="${escapeHtml(task.projectId ?? '')}" data-task-id="${escapeHtml(task.id)}"><div class="row between"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.startTime)}</span></div><p>${task.durationMinutes}m · ${escapeHtml(task.templateKind ?? task.type)}${task.conflict ? ' · ⚠ conflict' : ''}</p></button>`).join('') || '<div class="empty-state"><div><strong>มี Buffer</strong><span>ใช้เวลานี้เตรียมหัวข้อถัดไปหรือพัก</span></div></div>'}</div></section>
      <section class="panel panel-pad"><div class="panel-title"><div><h3>Active video</h3><p>${project ? escapeHtml(project.title) : 'ยังไม่ได้เลือกวิดีโอ'}</p></div>${project ? chip(`${projectProgress(project.status)}%`, isProductionComplete(project) ? 'green' : 'cyan') : ''}</div>${project ? `<div class="data-proof-list"><div><b>Channel</b><span>${escapeHtml(channel?.name ?? '')}</span></div><div><b>Format</b><span>${escapeHtml(project.format)}</span></div><div><b>Publish</b><span>${escapeHtml((project.publishAt ?? project.deadline).replace('T',' '))}</span></div><div><b>Status</b><span>${escapeHtml(statusLabels[project.status])}</span></div></div>${progress(projectProgress(project.status),'Production progress')}` : '<div class="empty-state"><div><strong>Plan first video</strong><span>เลือก Channel แล้วกำหนด Topic, Format และ Publish time</span></div></div>'}</section>
    </div>

    <section class="panel panel-pad" style="margin-top:16px"><div class="panel-title"><div><h3>Production queue</h3><p>${completeCount} video complete · ${capacity.hoursUsed}/${capacity.hoursAvailable}h planned</p></div><a class="btn small" href="${routeHref('production')}">Production</a></div><div class="queue-list">${wip.map((item) => `<button class="video-ticket ${item.id === project?.id ? 'active' : ''}" data-action="set-active-project" data-project-id="${escapeHtml(item.id)}"><span class="label">${escapeHtml(statusLabels[item.status])}</span><strong>${escapeHtml(item.title)}</strong><small>${item.format} · Publish ${escapeHtml((item.publishAt ?? item.deadline).replace('T',' '))}</small><b>${projectProgress(item.status)}%</b></button>`).join('') || '<span class="muted small-copy">ไม่มีวิดีโอค้างใน Focus นี้</span>'}</div></section>

    <section class="panel panel-pad" style="margin-top:16px"><div class="row between wrap"><div><span class="kicker">NEXT BEST ACTION</span><strong style="display:block;margin-top:4px">${escapeHtml(next.title)}</strong><p class="muted small-copy">${escapeHtml(next.reason)}</p></div><div class="row wrap">${capacity.percent > 100 ? chip('Capacity overload','amber') : chip('Capacity OK','green')}<a class="btn" href="${routeHref('analytics')}">Insights</a></div></div></section>`;
};
