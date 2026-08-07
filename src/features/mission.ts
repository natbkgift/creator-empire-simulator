import type { CalendarTask, VideoProject, Workspace } from '../domain/types.js';
import { activeChannel, activeProject, projectProgress, statusLabels } from '../app/selectors.js';
import { routeHref } from '../app/router.js';
import { escapeHtml, formatNumber } from '../domain/utils.js';
import {
  taskIsUnlocked,
  workflowReadiness,
  workflowRecommendation,
  workflowStatuses,
  workflowStatusLabels,
} from '../domain/workflow.js';
import { button, chip, dataBadge, pageHeader, riskChip } from '../ui/components.js';

const artifact = (label: string, value: string | number, ready: boolean, route: string, project: VideoProject): string =>
  `<a class="mission-artifact ${ready ? 'ready' : ''}" href="${routeHref(route, { project: project.id })}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${ready ? 'Ready' : 'Needs work'}</small></a>`;

const taskRow = (task: CalendarTask, project: VideoProject): string => {
  const unlocked = taskIsUnlocked(task, project);
  return `<article class="mission-queue-task ${task.completed ? 'done' : ''} ${unlocked ? '' : 'locked'}">
    <span class="mission-task-time">${escapeHtml(task.date)}<br>${escapeHtml(task.startTime)}</span>
    <div><strong>${escapeHtml(task.title)}</strong><small>${task.durationMinutes} min · ${task.sourceStatus ? workflowStatusLabels[task.sourceStatus] : task.type}${!unlocked ? ` · Locked until ${task.sourceStatus ? workflowStatusLabels[task.sourceStatus] : ''}` : ''}</small></div>
    ${task.completed ? chip('Done', 'green') : unlocked ? `<button class="btn small" data-action="start-mission" data-project-id="${escapeHtml(project.id)}" data-task-id="${escapeHtml(task.id)}">Start</button>` : chip('Locked', 'amber')}
  </article>`;
};

export const renderMission = (workspace: Workspace, params: URLSearchParams): string => {
  const requested = workspace.projects.find((item) => item.id === params.get('project'));
  const project = requested ?? activeProject(workspace);
  const channel = project ? workspace.channels.find((item) => item.id === project.channelId) : activeChannel(workspace);
  if (!project || !channel) {
    return `${pageHeader('Video Mission Control', 'เลือก Channel และ Project ก่อนเริ่มภารกิจ')}<section class="panel empty-panel"><h3>ยังไม่มี Active Project</h3><p>สร้าง Video Project จาก Channel Blueprint หรือเลือก Project จาก Channel Focus ด้านบน</p><a class="btn primary" href="${routeHref('ideas')}">เลือก Idea</a></section>`;
  }
  const recommendation = workflowRecommendation(workspace, project);
  const readiness = workflowReadiness(workspace, project, recommendation.targetStatus);
  const projectTasks = workspace.calendarTasks
    .filter((task) => task.projectId === project.id && !task.completed)
    .toSorted((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const activeTask = workspace.calendarTasks.find((task) => task.id === workspace.focus.activeTaskId)
    ?? projectTasks.find((task) => task.sourceStatus === project.status)
    ?? projectTasks.find((task) => taskIsUnlocked(task, project));
  const completedStages = workflowStatuses.indexOf(project.status);
  const actualAnalytics = workspace.analytics.filter((entry) => entry.projectId === project.id && !entry.isDemo);
  const sources = workspace.sources.filter((item) => project.sourceIds.includes(item.id));
  const credits = workspace.credits.filter((entry) => entry.projectId === project.id);
  const passedChecks = Object.values(project.policyChecks).filter(Boolean).length;
  const actionParams = `data-project-id="${escapeHtml(project.id)}" data-task-id="${escapeHtml(activeTask?.id ?? '')}"`;
  const headerActions = `<button class="btn" data-action="generate-workflow-plan" data-project-id="${escapeHtml(project.id)}">Rebuild plan</button><a class="btn" href="${routeHref('production', { project: project.id })}">Open pipeline</a>`;
  return `${pageHeader('Video Mission Control', 'Channel Focus + Active Project + Calendar Mission + Pipeline Prompt ทำงานเป็นเส้นทางเดียว', headerActions)}
    <section class="hq-focus-strip mission-focus-strip">
      <div><span class="kicker">Channel Focus</span><h3>${escapeHtml(channel.name)}</h3><p>${escapeHtml(channel.niche)} · ${channel.language.toUpperCase()} · ${channel.role}</p></div>
      <div><span class="kicker">Active Project</span><h3>${escapeHtml(project.title)} ${dataBadge(project.isDemo)}</h3><p>${escapeHtml(project.format)} · ${project.targetDurationSeconds}s · deadline ${escapeHtml(project.deadline)}</p></div>
      <div class="focus-strip-actions"><button class="btn" data-action="open-focus-picker">Change focus</button><button class="btn ghost" data-action="portfolio-mode">Portfolio</button></div>
    </section>

    <div class="mission-control-layout">
      <div class="mission-main-column">
        <section class="panel mission-command-card">
          <div class="mission-command-copy">
            <div class="row wrap"><span class="kicker">Current mission · +${recommendation.xp} XP</span>${riskChip(project.riskLevel)}${activeTask ? chip(`${activeTask.durationMinutes} min`, 'cyan') : ''}</div>
            <h3>${escapeHtml(activeTask?.title ?? recommendation.title)}</h3>
            <p>${escapeHtml(recommendation.detail)}</p>
            <div class="mission-meta-grid">
              <div><span>Current stage</span><b>${escapeHtml(statusLabels[project.status])}</b></div>
              <div><span>Target stage</span><b>${escapeHtml(recommendation.targetStatus ? statusLabels[recommendation.targetStatus] : 'Learning loop')}</b></div>
              <div><span>Recommended tool</span><b>${escapeHtml(activeTask?.workflowPromptType ?? recommendation.promptType ?? recommendation.route)}</b></div>
              <div><span>Credits used</span><b>${formatNumber(project.actualCredits)}</b></div>
            </div>
            <div class="row wrap mission-actions">
              ${button('Start mission', 'start-mission', { tone: 'primary', iconName: 'play', attrs: actionParams })}
              <a class="btn" href="${routeHref(activeTask?.missionRoute ?? recommendation.route, { project: project.id, type: activeTask?.workflowPromptType ?? recommendation.promptType })}">Open recommended work</a>
              ${button('Complete & advance', 'complete-mission', { tone: readiness.ready ? 'success' : '', iconName: 'check', attrs: actionParams })}
            </div>
          </div>
          <div class="mission-progress-orbit" aria-label="Project progress ${projectProgress(project.status)}%"><svg viewBox="0 0 140 140"><circle class="track" cx="70" cy="70" r="56"/><circle class="fill" cx="70" cy="70" r="56" style="stroke-dasharray:352;stroke-dashoffset:${352 * (1 - projectProgress(project.status) / 100)}"/></svg><div><b>${projectProgress(project.status)}%</b><span>${completedStages + 1}/17 stages</span></div></div>
        </section>

        <section class="panel mission-gate ${readiness.ready ? 'ready' : 'blocked'}">
          <div class="section-head"><div><h3>Completion gate</h3><span class="sub">ระบบจะไม่เลื่อน Pipeline จนกว่างานหลักของขั้นนี้พร้อม</span></div>${readiness.ready ? chip('Ready to advance', 'green') : chip(`${readiness.blockers.length} blocker(s)`, 'amber')}</div>
          <div class="mission-gate-grid">
            <div><h4>Passed</h4>${readiness.completed.length ? `<ul>${readiness.completed.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">ยังไม่มี Gate ที่ผ่าน</p>'}</div>
            <div><h4>Blockers</h4>${readiness.blockers.length ? `<ul>${readiness.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="success-copy">ไม่มี Blocker</p>'}</div>
          </div>
        </section>

        <section class="panel mission-stage-panel">
          <div class="section-head"><div><h3>17-stage production path</h3><span class="sub">Pipeline เป็นตัวกำหนด Prompt และ Calendar mission ถัดไป</span></div><a class="btn small" href="${routeHref('production', { project: project.id })}">Board view</a></div>
          <div class="mission-stage-timeline">${workflowStatuses.map((status, index) => `<a class="mission-stage ${index < completedStages ? 'done' : status === project.status ? 'active' : ''}" href="${routeHref('production', { project: project.id })}"><span>${index + 1}</span><b>${escapeHtml(workflowStatusLabels[status])}</b></a>`).join('')}</div>
        </section>

        <section class="panel mission-artifacts-panel">
          <div class="section-head"><div><h3>Project artifacts</h3><span class="sub">ผลลัพธ์ที่ Paste กลับจาก Prompt Studio จะถูกบันทึกใน Project นี้</span></div></div>
          <div class="mission-artifact-grid">
            ${artifact('Research', project.researchSummary ? 'Saved' : 'Empty', Boolean(project.researchSummary), 'prompts', project)}
            ${artifact('Sources', sources.length, sources.length > 0, 'prompts', project)}
            ${artifact('Hook', project.hook ? 'Selected' : 'Empty', Boolean(project.hook), 'prompts', project)}
            ${artifact('Script', `v${project.scriptVersion}`, Boolean(project.script), 'prompts', project)}
            ${artifact('Storyboard', project.storyboard.length, project.storyboard.length > 0, 'prompts', project)}
            ${artifact('Asset prompts', project.assetPrompts.length, project.assetPrompts.length > 0, 'prompts', project)}
            ${artifact('CapCut brief', project.capcutBrief ? 'Ready' : 'Empty', Boolean(project.capcutBrief), 'capcut', project)}
            ${artifact('Credit entries', credits.length, credits.length > 0, 'capcut', project)}
            ${artifact('Policy', `${passedChecks} checks`, project.riskLevel === 'low', 'policy', project)}
            ${artifact('Publication', project.publicationLinks.length, project.publicationLinks.length > 0, 'mission', project)}
            ${artifact('Actual analytics', actualAnalytics.length, actualAnalytics.length > 0, 'analytics', project)}
            ${artifact('Post-mortem', project.analyticsPostmortem ? 'Saved' : 'Empty', Boolean(project.analyticsPostmortem), 'prompts', project)}
            ${artifact('Repurpose plan', project.repurposingPlan ? 'Saved' : 'Empty', Boolean(project.repurposingPlan), 'prompts', project)}
          </div>
        </section>
      </div>

      <aside class="mission-side-column">
        <section class="panel mission-context-card"><span class="kicker">Active hook</span><p>${escapeHtml(project.hook || 'ยังไม่มี Hook ที่เลือก')}</p><span class="kicker">Latest learning</span><p>${escapeHtml(project.analyticsPostmortem || project.lessonsLearned || 'ยังไม่มีข้อมูลหลังเผยแพร่')}</p></section>
        <section class="panel mission-queue"><div class="section-head"><div><h3>Channel work queue</h3><span class="sub">เฉพาะ ${escapeHtml(channel.name)}</span></div></div>${workspace.projects.filter((item) => item.channelId === channel.id && item.status !== 'archived').toSorted((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6).map((item) => `<button class="mission-project-row ${item.id === project.id ? 'active' : ''}" data-action="set-active-project" data-project-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(statusLabels[item.status])} · ${escapeHtml(item.deadline)}</small></span><b>${projectProgress(item.status)}%</b></button>`).join('')}</section>
        <section class="panel mission-calendar"><div class="section-head"><div><h3>Calendar missions</h3><span class="sub">เฉพาะ Project นี้</span></div><a class="btn small" href="${routeHref('calendar', { project: project.id })}">Full calendar</a></div><div class="mission-task-list">${projectTasks.slice(0, 8).map((task) => taskRow(task, project)).join('') || '<p class="muted">ไม่มีภารกิจค้าง</p>'}</div></section>
      </aside>
    </div>`;
};
