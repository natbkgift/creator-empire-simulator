import type { CalendarTask, VideoProject, Workspace } from '../domain/types.js';
import { getWorkspace, updateWorkspace, awardXp } from '../app/store.js';
import { parseRoute, navigate, routeHref } from '../app/router.js';
import { requestRender } from '../app/runtime.js';
import { activeChannel, activeProject, projectById, statusLabels } from '../app/selectors.js';
import { applyChannelFocus, applyPortfolioFocus, applyProjectFocus } from '../domain/focus.js';
import { recordWorkflowEvent, syncNextWorkflowMission, taskIsUnlocked, workflowReadiness, workflowRecommendation, workflowStageRank, workflowStatuses } from '../domain/workflow.js';
import { escapeHtml, todayIso } from '../domain/utils.js';
import { rebuildWorkflowTasks } from '../domain/workflow.js';
import { confirmDialog, openDialog, showToast } from '../ui/feedback.js';
import { Actions } from '../domain/actions.js';

export const taskForProject = (workspace: Workspace, project: VideoProject, taskId?: string): CalendarTask | undefined => {
  const explicit = workspace.calendarTasks.find((task) => task.id === taskId && task.projectId === project.id && !task.completed);
  if (explicit && taskIsUnlocked(explicit, project)) return explicit;
  return workspace.calendarTasks.find((task) => task.projectId === project.id && !task.completed && task.sourceStatus === project.status && taskIsUnlocked(task, project))
    ?? workspace.calendarTasks.find((task) => task.projectId === project.id && !task.completed && taskIsUnlocked(task, project));
};

export const navigateMissionRoute = (project: VideoProject, task?: CalendarTask): void => {
  const recommendation = workflowRecommendation(getWorkspace(), project);
  const route = task?.missionRoute ?? recommendation.route;
  const promptType = task?.workflowPromptType ?? recommendation.promptType;
  if (route === 'prompts') navigate('prompts', { project: project.id, type: promptType });
  else navigate(route, { project: project.id });
};

export const startMission = (projectId?: string, taskId?: string): void => {
  const workspace = getWorkspace();
  const project = projectById(workspace, projectId) ?? activeProject(workspace);
  if (!project) {
    showToast('เลือก Active Project ก่อนเริ่ม Mission', 'warning');
    navigate('ideas');
    return;
  }
  const task = taskForProject(workspace, project, taskId);
  if (task && !taskIsUnlocked(task, project)) {
    showToast(`Mission ยังล็อกอยู่จนถึง ${task.sourceStatus ?? project.status}`, 'warning');
    navigate('mission', { project: project.id });
    return;
  }
  updateWorkspace((draft) => {
    applyProjectFocus(draft, project.id, task?.id);
    const targetTask = draft.calendarTasks.find((item) => item.id === task?.id);
    if (targetTask) targetTask.startedAt ??= new Date().toISOString();
    const target = draft.projects.find((item) => item.id === project.id);
    if (target) recordWorkflowEvent(target, { type: 'mission-started', note: task?.title ?? workflowRecommendation(draft, target).title, taskId: task?.id, promptType: task?.workflowPromptType });
  });
  navigateMissionRoute(project, task);
};

export const openPublicationDialog = (project: VideoProject, taskId?: string): void => {
  const dialog = openDialog('Publish video', `<form id="publication-form" class="stack"><p>บันทึก URL ที่เผยแพร่จริงเพื่อผ่าน Scheduled → Published</p><label><span>Publication URL</span><input name="url" type="url" required placeholder="https://youtube.com/shorts/..."></label><div class="dialog-actions"><button class="btn primary" type="submit">Save URL and advance</button></div></form>`, 'md');
  dialog.querySelector<HTMLFormElement>('#publication-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget as HTMLFormElement).get('url') ?? '').trim();
    if (!url) return;
    updateWorkspace((draft) => {
      const target = draft.projects.find((item) => item.id === project.id);
      if (target && !target.publicationLinks.includes(url)) target.publicationLinks.push(url);
    });
    dialog.close();
    completeMission(project.id, taskId);
  });
};

export const completeMission = (projectId?: string, taskId?: string): void => {
  const workspace = getWorkspace();
  const project = projectById(workspace, projectId) ?? activeProject(workspace);
  if (!project) { showToast('ไม่พบ Active Project', 'warning'); return; }
  const task = taskForProject(workspace, project, taskId);
  const recommendation = workflowRecommendation(workspace, project);
  if (!recommendation.targetStatus) {
    startMission(project.id, task?.id);
    return;
  }
  if (project.status === 'scheduled' && !project.publicationLinks.length) {
    openPublicationDialog(project, task?.id);
    return;
  }
  const readiness = workflowReadiness(workspace, project, recommendation.targetStatus);
  if (!readiness.ready) {
    showToast(readiness.blockers[0] ?? 'Completion gate ยังไม่ผ่าน', 'warning');
    navigateMissionRoute(project, task);
    return;
  }
  let nextTaskId: string | undefined;
  updateWorkspace((draft) => {
    const target = draft.projects.find((item) => item.id === project.id);
    if (!target || !recommendation.targetStatus) return;
    const previous = target.status;
    const targetTask = draft.calendarTasks.find((item) => item.id === task?.id)
      ?? draft.calendarTasks.find((item) => item.projectId === target.id && !item.completed && item.sourceStatus === previous);
    if (targetTask) {
      targetTask.completed = true;
      targetTask.completedAt = new Date().toISOString();
    }
    target.status = recommendation.targetStatus;
    target.updatedAt = new Date().toISOString();
    recordWorkflowEvent(target, { type: 'mission-completed', note: task?.title ?? recommendation.title, fromStatus: previous, toStatus: target.status, taskId: targetTask?.id, promptType: task?.workflowPromptType ?? recommendation.promptType });
    recordWorkflowEvent(target, { type: 'stage-advanced', note: `Advanced to ${target.status}`, fromStatus: previous, toStatus: target.status });
    awardXp(draft, `mission:${target.id}:${target.status}`, recommendation.xp, recommendation.taskType === 'research' ? 'research' : recommendation.taskType === 'analytics' ? 'analytics' : recommendation.taskType === 'editing' ? 'editing' : 'consistency');
    const next = syncNextWorkflowMission(draft, target.id);
    nextTaskId = next?.id;
    applyProjectFocus(draft, target.id, next?.id);
  });
  showToast(`Mission complete · ${recommendation.targetStatus} · +${recommendation.xp} XP`);
  navigate('mission', { project: project.id, task: nextTaskId });
};

const normalizeRoute = (route: string): string => route === 'pipeline' ? 'production' : route;

export const syncCurrentRouteToFocus = (scope: 'channel' | 'project'): void => {
  const workspace = getWorkspace();
  const route = normalizeRoute(parseRoute().name);
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  if (route === 'blueprint') navigate('blueprint', { channel: channel?.id });
  else if (['mission', 'prompts', 'capcut', 'calendar', 'policy'].includes(route)) navigate(route, { project: project?.id });
  else if (route === 'analytics') navigate('analytics', scope === 'project' ? { project: project?.id } : undefined);
  else if (route === 'production') requestRender();
  else requestRender();
};

export const openFocusPicker = (): void => {
  const workspace = getWorkspace();
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const dialog = openDialog('Channel Focus', `<div class="focus-picker"><button class="focus-picker-portfolio ${workspace.focus.mode === 'portfolio' ? 'active' : ''}" data-action="picker-portfolio"><strong>Portfolio overview</strong><span>ดูทุกช่องพร้อมกัน</span></button>${workspace.channels.map((item) => `<section class="focus-picker-channel ${item.id === channel?.id ? 'active' : ''}"><button data-action="picker-channel" data-channel-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.niche)} · ${item.language.toUpperCase()}</span></button><div>${workspace.projects.filter((candidate) => candidate.channelId === item.id).map((candidate) => `<button class="focus-picker-project ${candidate.id === project?.id ? 'active' : ''}" data-action="picker-project" data-project-id="${escapeHtml(candidate.id)}"><span>${escapeHtml(candidate.title)}</span><small>${escapeHtml(candidate.status)}</small></button>`).join('') || '<small>No projects</small>'}</div></section>`).join('')}</div>`, 'lg');
  dialog.querySelector('[data-action="picker-portfolio"]')?.addEventListener('click', () => { updateWorkspace(applyPortfolioFocus); dialog.close(); syncCurrentRouteToFocus('channel'); });
  dialog.querySelectorAll<HTMLElement>('[data-action="picker-channel"]').forEach((button) => button.addEventListener('click', () => { updateWorkspace((draft) => applyChannelFocus(draft, button.dataset.channelId ?? '')); dialog.close(); syncCurrentRouteToFocus('channel'); }));
  dialog.querySelectorAll<HTMLElement>('[data-action="picker-project"]').forEach((button) => button.addEventListener('click', () => { updateWorkspace((draft) => applyProjectFocus(draft, button.dataset.projectId ?? '')); dialog.close(); syncCurrentRouteToFocus('project'); }));
};

export const moveProjectNext = (projectId?: string): void => {
  const workspace = getWorkspace();
  const project = projectById(workspace, projectId) ?? activeProject(workspace);
  if (!project) return;
  const currentIndex = workflowStageRank(project.status);
  const nextStatus = workflowStatuses[currentIndex + 1];
  if (!nextStatus) {
    showToast('Project อยู่ในสถานะสุดท้ายแล้ว', 'info');
    return;
  }
  const readiness = workflowReadiness(workspace, project, nextStatus);
  if (!readiness.ready) {
    updateWorkspace((draft) => applyProjectFocus(draft, project.id));
    showToast(readiness.blockers[0] ?? 'ทำ Mission ของขั้นนี้ก่อนเลื่อน Pipeline', 'warning');
    navigate('mission', { project: project.id });
    return;
  }
  updateWorkspace((draft) => {
    const target = draft.projects.find((item) => item.id === project.id);
    if (!target) return;
    const previous = target.status;
    target.status = nextStatus;
    target.updatedAt = new Date().toISOString();
    recordWorkflowEvent(target, {
      type: 'stage-advanced',
      note: `Advanced to ${statusLabels[nextStatus]}`,
      fromStatus: previous,
      toStatus: nextStatus,
    });
    syncNextWorkflowMission(draft, target.id);
    applyProjectFocus(draft, target.id);
    awardXp(draft, `stage:${target.id}:${nextStatus}`, 35, 'consistency');
  });
  showToast(`เลื่อนไป ${statusLabels[nextStatus]} แล้ว`);
};

export const deleteProject = async (projectId?: string): Promise<void> => {
  const workspace = getWorkspace();
  const project = projectById(workspace, projectId) ?? activeProject(workspace);
  if (!project) return;
  if (project.isDemo) {
    showToast('ไม่สามารถลบ Demo Project ได้ (ใช้ Remove Demo Data จาก Import/Export)', 'warning');
    return;
  }
  const confirmed = await confirmDialog('Delete Project', `ลบ Project "${project.title}" และภารกิจทั้งหมดในปฏิทิน?`, 'Delete');
  if (!confirmed) return;
  updateWorkspace((draft) => {
    draft.projects = draft.projects.filter((item) => item.id !== project.id);
    draft.calendarTasks = draft.calendarTasks.filter((item) => item.projectId !== project.id);
    draft.analytics = draft.analytics.filter((item) => item.projectId !== project.id);
    draft.sources = draft.sources.filter((item) => item.projectId !== project.id);
    draft.credits = draft.credits.filter((item) => item.projectId !== project.id);
  });
  showToast(`ลบ Project "${project.title}" แล้ว`);
};

