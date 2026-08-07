import type { CalendarTask, Channel, VideoProject, Workspace } from './types.js';
import { workflowStageRank } from './workflow.js';

const liveProject = (project: VideoProject): boolean => project.status !== 'archived';

export const chooseFocusProject = (workspace: Workspace, channelId?: string): VideoProject | undefined => {
  const candidates = workspace.projects
    .filter((project) => (!channelId || project.channelId === channelId) && liveProject(project))
    .toSorted((a, b) => {
      const activeDelta = Number(b.status !== 'published') - Number(a.status !== 'published');
      if (activeDelta) return activeDelta;
      const deadlineDelta = a.deadline.localeCompare(b.deadline);
      if (deadlineDelta) return deadlineDelta;
      return workflowStageRank(b.status) - workflowStageRank(a.status);
    });
  return candidates[0] ?? workspace.projects.find((project) => !channelId || project.channelId === channelId);
};

export const focusedChannel = (workspace: Workspace): Channel | undefined => {
  if (workspace.focus.mode === 'portfolio') return undefined;
  return workspace.channels.find((channel) => channel.id === workspace.focus.activeChannelId)
    ?? workspace.channels.find((channel) => channel.role === 'primary')
    ?? workspace.channels[0];
};

export const focusedProject = (workspace: Workspace): VideoProject | undefined => {
  const direct = workspace.projects.find((project) => project.id === workspace.focus.activeProjectId);
  if (direct) return direct;
  return chooseFocusProject(workspace, focusedChannel(workspace)?.id);
};

export const focusedProjects = (workspace: Workspace): VideoProject[] => {
  const channel = focusedChannel(workspace);
  return channel ? workspace.projects.filter((project) => project.channelId === channel.id) : workspace.projects;
};

export const focusedTasks = (workspace: Workspace, includeStudioTasks = true): CalendarTask[] => {
  const projectIds = new Set(focusedProjects(workspace).map((project) => project.id));
  return workspace.calendarTasks.filter((task) =>
    task.projectId ? projectIds.has(task.projectId) : includeStudioTasks,
  ).toSorted((a, b) => {
    const priority = (b.priority ?? 0) - (a.priority ?? 0);
    return priority || `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);
  });
};

export const normalizeWorkspaceFocus = (workspace: Workspace): Workspace => {
  const primary = workspace.channels.find((channel) => channel.role === 'primary') ?? workspace.channels[0];
  if (!workspace.focus) {
    workspace.focus = {
      mode: primary ? 'channel' : 'portfolio',
      activeChannelId: primary?.id,
      activeProjectId: chooseFocusProject(workspace, primary?.id)?.id,
      updatedAt: new Date().toISOString(),
    };
  }
  if (workspace.focus.activeProjectId) {
    const project = workspace.projects.find((candidate) => candidate.id === workspace.focus.activeProjectId);
    if (project) {
      workspace.focus.activeChannelId = project.channelId;
      if (workspace.focus.mode !== 'portfolio') workspace.focus.mode = 'channel';
    } else {
      workspace.focus.activeProjectId = undefined;
      workspace.focus.activeTaskId = undefined;
    }
  }
  if (workspace.focus.mode === 'channel') {
    const channel = workspace.channels.find((candidate) => candidate.id === workspace.focus.activeChannelId) ?? primary;
    workspace.focus.activeChannelId = channel?.id;
    const project = workspace.projects.find((candidate) => candidate.id === workspace.focus.activeProjectId && candidate.channelId === channel?.id)
      ?? chooseFocusProject(workspace, channel?.id);
    workspace.focus.activeProjectId = project?.id;
    const task = workspace.calendarTasks.find((candidate) => candidate.id === workspace.focus.activeTaskId && (!candidate.projectId || candidate.projectId === project?.id));
    if (!task) workspace.focus.activeTaskId = undefined;
  }
  return workspace;
};

export const applyChannelFocus = (workspace: Workspace, channelId: string, projectId?: string): void => {
  const channel = workspace.channels.find((candidate) => candidate.id === channelId);
  if (!channel) return;
  const project = workspace.projects.find((candidate) => candidate.id === projectId && candidate.channelId === channelId)
    ?? chooseFocusProject(workspace, channelId);
  workspace.focus = {
    mode: 'channel',
    activeChannelId: channelId,
    activeProjectId: project?.id,
    activeTaskId: project?.id === workspace.focus?.activeProjectId ? workspace.focus?.activeTaskId : undefined,
    updatedAt: new Date().toISOString(),
  };
};

export const applyProjectFocus = (workspace: Workspace, projectId: string, taskId?: string): void => {
  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  workspace.focus = {
    mode: 'channel',
    activeChannelId: project.channelId,
    activeProjectId: project.id,
    activeTaskId: taskId,
    updatedAt: new Date().toISOString(),
  };
};

export const applyPortfolioFocus = (workspace: Workspace): void => {
  workspace.focus = {
    ...workspace.focus,
    mode: 'portfolio',
    activeTaskId: undefined,
    updatedAt: new Date().toISOString(),
  };
};
