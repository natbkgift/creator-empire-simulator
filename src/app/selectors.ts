import type { AnalyticsEntry, CalendarTask, Channel, CreditEntry, ProjectStatus, VideoProject, Workspace } from '../domain/types.js';
import { addDays, todayIso } from '../domain/utils.js';
import { focusedChannel, focusedProject, focusedProjects, focusedTasks } from '../domain/focus.js';
import { taskIsUnlocked, workflowRecommendation, workflowStatuses, workflowStageRank, workflowStatusLabels } from '../domain/workflow.js';

export const statusLabels: Record<ProjectStatus, string> = workflowStatusLabels;
export const pipelineStatuses: ProjectStatus[] = workflowStatuses;
export const activePipelineStatuses: ProjectStatus[] = workflowStatuses.filter((status) => !['idea-backlog', 'published', 'archived'].includes(status));

export const channelById = (workspace: Workspace, id?: string): Channel | undefined => workspace.channels.find((item) => item.id === id);
export const projectById = (workspace: Workspace, id?: string): VideoProject | undefined => workspace.projects.find((item) => item.id === id);
export const activeChannel = focusedChannel;
export const activeProject = focusedProject;
export const projectsInFocus = focusedProjects;
export const calendarTasksInFocus = focusedTasks;

export const actualCreditsUsed = (entry: CreditEntry): number => Math.max(0, entry.balanceBefore - entry.balanceAfter);

export const creditStats = (workspace: Workspace): {
  used: number;
  avgGeneration: number;
  avgUsable: number;
  avgCompletedVideo: number;
  waste: number;
  capacity: number;
} => {
  const channel = focusedChannel(workspace);
  const entries = channel ? workspace.credits.filter((entry) => entry.channelId === channel.id) : workspace.credits;
  const used = entries.reduce((sum, entry) => sum + actualCreditsUsed(entry), 0);
  const generations = entries.reduce((sum, entry) => sum + Math.max(1, entry.generations + entry.regenerations), 0);
  const usable = entries.reduce((sum, entry) => sum + Math.max(0, entry.usableOutputs), 0);
  const completed = entries.filter((entry) => entry.completedVideo);
  const completedUsed = completed.reduce((sum, entry) => sum + actualCreditsUsed(entry), 0);
  const regenerationWaste = entries.reduce((sum, entry) => {
    const per = actualCreditsUsed(entry) / Math.max(1, entry.generations + entry.regenerations);
    return sum + entry.regenerations * per;
  }, 0);
  const avgCompletedVideo = completed.length ? completedUsed / completed.length : 95;
  return {
    used,
    avgGeneration: generations ? used / generations : 0,
    avgUsable: usable ? used / usable : 0,
    avgCompletedVideo,
    waste: regenerationWaste,
    capacity: Math.max(0, Math.floor(workspace.settings.capcutBalance / Math.max(1, avgCompletedVideo))),
  };
};

export const capacityStats = (workspace: Workspace): {
  hoursUsed: number;
  hoursAvailable: number;
  percent: number;
  activeChannels: number;
  wip: number;
  warning: string;
} => {
  const activeChannels = workspace.channels.filter((channel) => channel.role !== 'backlog').length;
  const hoursUsed = workspace.channels.filter((channel) => channel.role !== 'backlog').reduce((sum, channel) => sum + channel.weeklyHours, 0);
  const hoursAvailable = Math.max(1, workspace.settings.weeklyHoursAvailable);
  const percent = (hoursUsed / hoursAvailable) * 100;
  const wip = workspace.projects.filter((project) => activePipelineStatuses.includes(project.status) && project.status !== 'published').length;
  const warning = activeChannels > workspace.settings.activeChannelLimit
    ? 'จำนวนช่องที่ Active เกิน Capacity ที่ตั้งไว้'
    : percent > 110
      ? 'เวลาที่วางแผนเกินชั่วโมงที่มี ควรลด Cadence หรือ Batch งาน'
      : wip > 8
        ? 'งานระหว่างผลิตสูง ควรปิดงานก่อนเปิดหัวข้อใหม่'
        : 'Capacity อยู่ในระดับควบคุมได้';
  return { hoursUsed, hoursAvailable, percent, activeChannels, wip, warning };
};

const pendingUnlockedTasks = (workspace: Workspace): CalendarTask[] => focusedTasks(workspace)
  .filter((task) => !task.completed)
  .filter((task) => taskIsUnlocked(task, projectById(workspace, task.projectId)))
  .toSorted((a, b) => {
    const overdueDelta = Number(a.date > todayIso()) - Number(b.date > todayIso());
    const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
    return overdueDelta || priorityDelta || `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);
  });

export const nextBestAction = (workspace: Workspace): { title: string; reason: string; route: string; project?: VideoProject; task?: CalendarTask; xp: number } => {
  const active = focusedProject(workspace);
  if (active) {
    const task = pendingUnlockedTasks(workspace).find((candidate) => candidate.projectId === active.id);
    const recommendation = workflowRecommendation(workspace, active);
    return {
      title: task?.title ?? recommendation.title,
      reason: task
        ? `Calendar-driven mission · ${task.durationMinutes} นาที · ${workflowStatusLabels[active.status]} → ${task.targetStatus ? workflowStatusLabels[task.targetStatus] : 'Next'}`
        : recommendation.detail,
      route: task?.missionRoute ?? recommendation.route,
      project: active,
      task,
      xp: recommendation.xp,
    };
  }
  const task = pendingUnlockedTasks(workspace)[0];
  if (task) {
    const project = projectById(workspace, task.projectId);
    return { title: task.title, reason: 'ภารกิจที่มี Priority สูงสุดใน Portfolio', route: task.missionRoute ?? 'calendar', project, task, xp: 30 };
  }
  return { title: 'เลือก Idea และสร้าง Channel Blueprint', reason: 'Portfolio ยังไม่มีงานถัดไปที่ชัดเจน', route: 'ideas', xp: 30 };
};

export const dailyMission = (workspace: Workspace): { title: string; detail: string; progress: number; xp: number; route: string; projectId?: string; taskId?: string } => {
  const action = nextBestAction(workspace);
  const project = action.project;
  const progress = project ? projectProgress(project.status) : 0;
  return {
    title: action.title,
    detail: action.task
      ? `${action.task.date} · ${action.task.startTime} · ${action.task.durationMinutes} นาที · ${action.reason}`
      : action.reason,
    progress,
    xp: action.xp,
    route: action.route,
    projectId: project?.id,
    taskId: action.task?.id,
  };
};

export const analyticsForChannel = (workspace: Workspace, channelId?: string): AnalyticsEntry[] =>
  workspace.analytics.filter((entry) => !channelId || entry.channelId === channelId);

export const analyticsInFocus = (workspace: Workspace, projectId?: string): AnalyticsEntry[] => {
  const project = projectId ? projectById(workspace, projectId) : undefined;
  if (project) return workspace.analytics.filter((entry) => entry.projectId === project.id);
  const channel = focusedChannel(workspace);
  return workspace.analytics.filter((entry) => !channel || entry.channelId === channel.id);
};

export const taskWindow = (workspace: Workspace, days = 7): CalendarTask[] => {
  const start = todayIso();
  const end = addDays(start, days - 1);
  return focusedTasks(workspace)
    .filter((task) => task.date >= start && task.date <= end)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
};

export const projectProgress = (status: ProjectStatus): number => {
  const index = workflowStageRank(status);
  return Math.max(0, Math.round((index / (workflowStatuses.length - 1)) * 100));
};

export const channelHealth = (workspace: Workspace, channel: Channel): number => {
  const entries = analyticsForChannel(workspace, channel.id);
  if (!entries.length) return channel.health;
  const retention = entries.reduce((sum, entry) => sum + entry.averagePercentageViewed, 0) / entries.length;
  const consistency = workspace.projects.filter((project) => project.channelId === channel.id && project.status === 'published').length * 5;
  return Math.max(20, Math.min(100, Math.round(retention * .78 + Math.min(20, consistency))));
};
