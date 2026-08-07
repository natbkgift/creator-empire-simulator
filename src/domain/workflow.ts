import type {
  CalendarTask,
  MissionRoute,
  ProjectStatus,
  PromptType,
  VideoProject,
  WorkflowEvent,
  Workspace,
} from './types.js';
import { addDays, todayIso, uid } from './utils.js';

export const workflowStatuses: ProjectStatus[] = [
  'idea-backlog', 'selected', 'researching', 'sources-verified', 'hook-ready', 'script-draft',
  'script-approved', 'storyboard', 'assets-needed', 'capcut-draft', 'editing', 'qa', 'scheduled',
  'published', 'analytics-review', 'repurpose', 'archived',
];

export const workflowStageRank = (status: ProjectStatus): number => Math.max(0, workflowStatuses.indexOf(status));
export const workflowStatusIndex = workflowStageRank;

export const workflowStatusLabels: Record<ProjectStatus, string> = {
  'idea-backlog': 'Idea Backlog',
  selected: 'Selected',
  researching: 'Researching',
  'sources-verified': 'Sources Verified',
  'hook-ready': 'Hook Ready',
  'script-draft': 'Script Draft',
  'script-approved': 'Script Approved',
  storyboard: 'Storyboard',
  'assets-needed': 'Assets Needed',
  'capcut-draft': 'CapCut Draft',
  editing: 'Editing',
  qa: 'QA',
  scheduled: 'Scheduled',
  published: 'Published',
  'analytics-review': 'Analytics Review',
  repurpose: 'Repurpose',
  archived: 'Archived',
};

export interface WorkflowRecommendation {
  sourceStatus: ProjectStatus;
  targetStatus?: ProjectStatus;
  title: string;
  detail: string;
  promptType?: PromptType;
  route: MissionRoute;
  minutes: number;
  xp: number;
  taskType: CalendarTask['type'];
}

const routeForPrompt = (promptType?: PromptType): MissionRoute => {
  if (!promptType) return 'mission';
  if (promptType.startsWith('capcut-')) return 'prompts';
  if (promptType === 'analytics-postmortem') return 'prompts';
  return 'prompts';
};

export const workflowRecommendation = (_workspace: Workspace, project: VideoProject): WorkflowRecommendation => {
  const scriptPrompt: PromptType = project.format === 'long' ? 'long-script' : 'shorts-script';
  const capcutPrompt: PromptType = project.riskLevel === 'low' && /product|advert|property|sales/i.test(`${project.title} ${project.series}`)
    ? 'capcut-director'
    : 'capcut-standard';
  const map: Record<ProjectStatus, Omit<WorkflowRecommendation, 'sourceStatus'>> = {
    'idea-backlog': { targetStatus: 'selected', title: 'Select this video for production', detail: 'Confirm the channel, format, deadline and capacity before research starts.', route: 'mission', minutes: 10, xp: 20, taskType: 'other' },
    selected: { targetStatus: 'researching', title: 'Research the topic', detail: 'Build the evidence base and separate documented facts, reported accounts and disputed claims.', promptType: 'topic-research', route: 'prompts', minutes: 40, xp: 35, taskType: 'research' },
    researching: { targetStatus: 'sources-verified', title: 'Fact-check the story', detail: 'Verify the research summary, attach credible sources and write a safe factual summary.', promptType: 'fact-check', route: 'prompts', minutes: 35, xp: 40, taskType: 'research' },
    'sources-verified': { targetStatus: 'hook-ready', title: 'Generate and select the hook', detail: 'Create several opening patterns, then save the strongest hook for this audience.', promptType: 'hook-generator', route: 'prompts', minutes: 20, xp: 30, taskType: 'script' },
    'hook-ready': { targetStatus: 'script-draft', title: project.format === 'long' ? 'Write the long-form script' : 'Write the Shorts script', detail: 'Turn the verified evidence and selected hook into an original script.', promptType: scriptPrompt, route: 'prompts', minutes: project.format === 'long' ? 100 : 45, xp: 45, taskType: 'script' },
    'script-draft': { targetStatus: 'script-approved', title: 'Review and approve the script', detail: 'Read aloud, fix factual ambiguity and lock the narration before visual production.', route: 'mission', minutes: 25, xp: 35, taskType: 'script' },
    'script-approved': { targetStatus: 'storyboard', title: 'Create storyboard and shot list', detail: 'Break the approved script into timed scenes, visuals, captions and source notes.', promptType: 'storyboard', route: 'prompts', minutes: 35, xp: 45, taskType: 'script' },
    storyboard: { targetStatus: 'assets-needed', title: 'Prepare visual asset prompts', detail: 'Create consistent AI image and video prompts for the shots that require new assets.', promptType: 'ai-image', route: 'prompts', minutes: 35, xp: 35, taskType: 'editing' },
    'assets-needed': { targetStatus: 'capcut-draft', title: 'Build the CapCut production brief', detail: 'Choose Standard or Director mode and generate the exact CapCut prompt for this project.', promptType: capcutPrompt, route: routeForPrompt(capcutPrompt), minutes: 25, xp: 35, taskType: 'editing' },
    'capcut-draft': { targetStatus: 'editing', title: 'Generate and log the CapCut draft', detail: 'Create the draft, record credits before/after and keep only usable outputs.', route: 'capcut', minutes: 55, xp: 45, taskType: 'editing' },
    editing: { targetStatus: 'qa', title: 'Finish the edit', detail: 'Lock narration, captions, pacing, music, disclosure and final export.', route: 'mission', minutes: 60, xp: 50, taskType: 'editing' },
    qa: { targetStatus: 'scheduled', title: 'Pass Policy Shield and schedule', detail: 'Complete originality, source, licensing and AI disclosure checks before scheduling.', route: 'policy', minutes: 25, xp: 45, taskType: 'upload' },
    scheduled: { targetStatus: 'published', title: 'Publish the video', detail: 'Upload the approved master, add metadata and save the public URL.', route: 'mission', minutes: 25, xp: 55, taskType: 'upload' },
    published: { targetStatus: 'analytics-review', title: 'Record actual performance', detail: 'Enter real platform analytics so the learning loop uses evidence instead of assumptions.', route: 'analytics', minutes: 20, xp: 45, taskType: 'analytics' },
    'analytics-review': { targetStatus: 'repurpose', title: 'Run the analytics post-mortem', detail: 'Diagnose retention, reach, conversion, cost and the highest-impact improvement.', promptType: 'analytics-postmortem', route: 'prompts', minutes: 30, xp: 50, taskType: 'analytics' },
    repurpose: { targetStatus: 'archived', title: 'Create the repurposing plan', detail: 'Adapt the winning story for each platform, then archive the completed learning loop.', promptType: 'repurposing', route: 'prompts', minutes: 30, xp: 45, taskType: 'other' },
    archived: { title: 'Choose the next video', detail: 'Use this project’s lessons to recommend the next topic in the focused channel.', promptType: 'next-video', route: 'prompts', minutes: 20, xp: 25, taskType: 'other' },
  };
  return { sourceStatus: project.status, ...map[project.status] };
};

export interface WorkflowReadiness {
  ready: boolean;
  completed: string[];
  blockers: string[];
}

const policyPassedCount = (project: VideoProject): number => Object.values(project.policyChecks).filter(Boolean).length;

export const workflowReadiness = (workspace: Workspace, project: VideoProject, targetStatus?: ProjectStatus): WorkflowReadiness => {
  const target = targetStatus ?? workflowRecommendation(workspace, project).targetStatus;
  const completed: string[] = [];
  const blockers: string[] = [];
  const check = (condition: boolean, okay: string, blocked: string): void => {
    if (condition) completed.push(okay);
    else blockers.push(blocked);
  };
  if (!target) return { ready: true, completed: ['Learning loop is complete.'], blockers: [] };
  switch (target) {
    case 'selected':
      check(Boolean(project.channelId && project.title && project.deadline), 'Project scope is set.', 'Set channel, title and deadline.');
      break;
    case 'researching':
      check(Boolean(project.researchSummary.trim()), 'Research summary saved.', 'Paste and apply the topic research result.');
      break;
    case 'sources-verified':
      check(Boolean(project.researchSummary.trim()), 'Research summary saved.', 'Complete topic research first.');
      check(project.sourceIds.length >= 1, `${project.sourceIds.length} source(s) attached.`, 'Attach at least one credible source.');
      check(Boolean(project.factCheckSummary.trim()), 'Fact-check summary saved.', 'Paste and apply the fact-check result.');
      break;
    case 'hook-ready': check(Boolean(project.hook.trim()), 'Hook selected.', 'Save a recommended hook.'); break;
    case 'script-draft':
    case 'script-approved': check(Boolean(project.script.trim()), `Script v${project.scriptVersion || 1} saved.`, 'Write and save the script.'); break;
    case 'storyboard': check(project.storyboard.length > 0, `${project.storyboard.length} storyboard scene(s) saved.`, 'Create the storyboard and shot list.'); break;
    case 'assets-needed': check(project.assetPrompts.length > 0, `${project.assetPrompts.length} asset prompt(s) saved.`, 'Create visual asset prompts.'); break;
    case 'capcut-draft': check(Boolean(project.capcutBrief.trim()), 'CapCut brief saved.', 'Create and apply the CapCut production brief.'); break;
    case 'editing': check(workspace.credits.some((entry) => entry.projectId === project.id), 'CapCut credit entry recorded.', 'Generate the draft and record a credit ledger entry.'); break;
    case 'qa': check(Boolean(project.script && project.storyboard.length), 'Narrative and visual plan exist.', 'Finish script and storyboard before QA.'); break;
    case 'scheduled':
      check(project.riskLevel === 'low', 'Policy risk is Low.', 'Resolve Policy Shield until risk is Low.');
      check(policyPassedCount(project) >= 6, `${policyPassedCount(project)} policy checks passed.`, 'Complete at least 6 required policy checks.');
      break;
    case 'published': check(project.publicationLinks.length > 0, 'Publication URL saved.', 'Add at least one publication URL.'); break;
    case 'analytics-review': check(workspace.analytics.some((entry) => entry.projectId === project.id && !entry.isDemo), 'Actual analytics recorded.', 'Record non-demo actual analytics.'); break;
    case 'repurpose': check(Boolean(project.analyticsPostmortem.trim() || project.lessonsLearned.trim()), 'Post-mortem saved.', 'Complete the analytics post-mortem.'); break;
    case 'archived': check(Boolean(project.repurposingPlan.trim()), 'Repurposing plan saved.', 'Create the multi-platform repurposing plan.'); break;
  }
  return { ready: blockers.length === 0, completed, blockers };
};

export const promptCompletionStatus = (type: PromptType, project: VideoProject): ProjectStatus | undefined => {
  const map: Partial<Record<PromptType, ProjectStatus>> = {
    'topic-research': 'researching',
    'fact-check': 'sources-verified',
    'hook-generator': 'hook-ready',
    'shorts-script': 'script-draft',
    'long-script': 'script-draft',
    storyboard: 'storyboard',
    'ai-image': 'assets-needed',
    'ai-video': 'assets-needed',
    'capcut-standard': 'capcut-draft',
    'capcut-director': 'capcut-draft',
    'analytics-postmortem': 'repurpose',
    repurposing: 'archived',
  };
  const target = map[type];
  return target && workflowStageRank(target) >= workflowStageRank(project.status) ? target : target;
};

export const recordWorkflowEvent = (
  project: VideoProject,
  event: Omit<WorkflowEvent, 'id' | 'at'> & Partial<Pick<WorkflowEvent, 'id' | 'at'>>,
): void => {
  project.workflowEvents.push({
    id: event.id ?? uid('event'),
    at: event.at ?? new Date().toISOString(),
    type: event.type,
    note: event.note,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    promptType: event.promptType,
    taskId: event.taskId,
  });
};

const stageSpacing = (status: ProjectStatus): number => ['editing', 'scheduled'].includes(status) ? 2 : 1;

export const buildWorkflowTasks = (workspace: Workspace, project: VideoProject, startDate = todayIso()): CalendarTask[] => {
  const startIndex = workflowStageRank(project.status);
  let dayOffset = 0;
  const result: CalendarTask[] = [];
  for (let index = startIndex; index < workflowStatuses.length - 1; index += 1) {
    const sourceStatus = workflowStatuses[index];
    const shadow = { ...project, status: sourceStatus } as VideoProject;
    const recommendation = workflowRecommendation(workspace, shadow);
    if (!recommendation.targetStatus) continue;
    result.push({
      id: uid('task'),
      title: recommendation.title,
      date: addDays(startDate, dayOffset),
      startTime: index === startIndex ? '09:00' : '09:30',
      durationMinutes: recommendation.minutes,
      type: recommendation.taskType,
      projectId: project.id,
      recurring: 'none',
      completed: false,
      workflowPromptType: recommendation.promptType,
      sourceStatus,
      targetStatus: recommendation.targetStatus,
      missionRoute: recommendation.route,
      autoGenerated: true,
      priority: 100 - index,
      isDemo: project.isDemo,
    });
    dayOffset += stageSpacing(sourceStatus);
  }
  return result;
};

export const rebuildWorkflowTasks = (workspace: Workspace, projectId: string, startDate = todayIso()): CalendarTask[] => {
  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project) return [];
  workspace.calendarTasks = workspace.calendarTasks.filter((task) => !(task.projectId === projectId && task.autoGenerated));
  const tasks = buildWorkflowTasks(workspace, project, startDate);
  workspace.calendarTasks.push(...tasks);
  return tasks;
};

export const taskIsUnlocked = (task: CalendarTask, project?: VideoProject): boolean => {
  if (!task.sourceStatus || !project) return true;
  return workflowStageRank(project.status) >= workflowStageRank(task.sourceStatus);
};

export const hasReachedStatus = (project: VideoProject, status: ProjectStatus): boolean => workflowStageRank(project.status) >= workflowStageRank(status);

export const syncNextWorkflowMission = (workspace: Workspace, projectId: string): CalendarTask | undefined => {
  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project) return undefined;
  const currentRank = workflowStageRank(project.status);
  workspace.calendarTasks.forEach((task) => {
    if (task.projectId !== projectId || !task.autoGenerated || !task.sourceStatus) return;
    if (workflowStageRank(task.sourceStatus) < currentRank) {
      task.completed = true;
      task.completedAt ??= new Date().toISOString();
    }
  });
  let current = workspace.calendarTasks.find((task) =>
    task.projectId === projectId && task.autoGenerated && !task.completed && task.sourceStatus === project.status,
  );
  if (!current && project.status !== 'archived') {
    const recommendation = workflowRecommendation(workspace, project);
    current = {
      id: uid('task'),
      title: recommendation.title,
      date: todayIso(),
      startTime: '09:00',
      durationMinutes: recommendation.minutes,
      type: recommendation.taskType,
      projectId,
      recurring: 'none',
      completed: false,
      workflowPromptType: recommendation.promptType,
      sourceStatus: project.status,
      targetStatus: recommendation.targetStatus,
      missionRoute: recommendation.route,
      autoGenerated: true,
      priority: 100,
      isDemo: project.isDemo,
    };
    workspace.calendarTasks.push(current);
  }
  return current;
};
