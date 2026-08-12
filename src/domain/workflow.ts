import type {
  CalendarTask,
  MissionRoute,
  ProjectStatus,
  PromptType,
  RiskLevel,
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

export const productionStatuses: ProjectStatus[] = workflowStatuses.slice(0, workflowStatuses.indexOf('published') + 1);
export const growthStatuses: ProjectStatus[] = ['analytics-review', 'repurpose', 'archived'];

export const workflowStageRank = (status: ProjectStatus): number => Math.max(0, workflowStatuses.indexOf(status));
export const workflowStatusIndex = workflowStageRank;

export const workflowStatusLabels: Record<ProjectStatus, string> = {
  'idea-backlog': 'Idea Backlog', selected: 'Selected', researching: 'Researching', 'sources-verified': 'Sources Verified',
  'hook-ready': 'Hook Ready', 'script-draft': 'Script Draft', 'script-approved': 'Script Approved', storyboard: 'Storyboard',
  'assets-needed': 'Assets Needed', 'capcut-draft': 'CapCut Draft', editing: 'Editing', qa: 'QA', scheduled: 'Scheduled',
  published: 'Published · Video Complete', 'analytics-review': 'Growth · Analytics', repurpose: 'Growth · Repurpose', archived: 'Learning Loop Complete',
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

const routeForPrompt = (promptType?: PromptType): MissionRoute => promptType ? 'prompts' : 'mission';
const longMinutes = (project: VideoProject, shorts: number, long: number): number => project.format === 'long' ? long : shorts;

export const workflowRecommendation = (_workspace: Workspace, project: VideoProject): WorkflowRecommendation => {
  const scriptPrompt: PromptType = project.format === 'long' ? 'long-script' : 'shorts-script';
  const capcutPrompt: PromptType = project.riskLevel === 'low' && /product|advert|property|sales/i.test(`${project.title} ${project.series}`)
    ? 'capcut-director' : 'capcut-standard';
  const map: Record<ProjectStatus, Omit<WorkflowRecommendation, 'sourceStatus'>> = {
    'idea-backlog': { targetStatus: 'selected', title: 'Confirm video plan', detail: 'Lock topic, format and publication datetime before production.', route: 'mission', minutes: 10, xp: 20, taskType: 'other' },
    selected: { targetStatus: 'researching', title: 'Research the topic', detail: 'Build the evidence base and separate documented facts, reported accounts and disputed claims.', promptType: 'topic-research', route: 'prompts', minutes: longMinutes(project, 40, 75), xp: 35, taskType: 'research' },
    researching: { targetStatus: 'sources-verified', title: 'Fact-check the story', detail: 'Verify the research summary, attach credible sources and write a safe factual summary.', promptType: 'fact-check', route: 'prompts', minutes: longMinutes(project, 35, 60), xp: 40, taskType: 'research' },
    'sources-verified': { targetStatus: 'hook-ready', title: 'Generate and select the hook', detail: 'Create opening patterns and save the strongest hook for this audience.', promptType: 'hook-generator', route: 'prompts', minutes: 20, xp: 30, taskType: 'script' },
    'hook-ready': { targetStatus: 'script-draft', title: project.format === 'long' ? 'Write the long-form script' : 'Write the Shorts script', detail: 'Turn verified evidence and the selected hook into an original script.', promptType: scriptPrompt, route: 'prompts', minutes: longMinutes(project, 45, 120), xp: 45, taskType: 'script' },
    'script-draft': { targetStatus: 'script-approved', title: 'Review and approve the script', detail: 'Read aloud, fix factual ambiguity and lock narration before visuals.', route: 'mission', minutes: longMinutes(project, 25, 45), xp: 35, taskType: 'script' },
    'script-approved': { targetStatus: 'storyboard', title: 'Create storyboard and shot list', detail: 'Break the approved script into timed scenes, visuals, captions and source notes.', promptType: 'storyboard', route: 'prompts', minutes: longMinutes(project, 35, 75), xp: 45, taskType: 'script' },
    storyboard: { targetStatus: 'assets-needed', title: 'Prepare visual asset prompts', detail: 'Create consistent image/video prompts only for shots that need new assets.', promptType: 'ai-image', route: 'prompts', minutes: longMinutes(project, 35, 60), xp: 35, taskType: 'editing' },
    'assets-needed': { targetStatus: 'capcut-draft', title: 'Build the CapCut production brief', detail: 'Choose Standard or Director based on the project and create the exact production brief.', promptType: capcutPrompt, route: routeForPrompt(capcutPrompt), minutes: longMinutes(project, 25, 45), xp: 35, taskType: 'editing' },
    'capcut-draft': { targetStatus: 'editing', title: 'Generate and log the CapCut draft', detail: 'Create the draft, log credits/cost and retain usable outputs only.', route: 'capcut', minutes: longMinutes(project, 55, 120), xp: 45, taskType: 'editing' },
    editing: { targetStatus: 'qa', title: 'Finish the edit', detail: 'Lock narration, captions, pacing, music, disclosure and final export.', route: 'mission', minutes: longMinutes(project, 60, 180), xp: 50, taskType: 'editing' },
    qa: { targetStatus: 'scheduled', title: 'Pass release gate', detail: 'Complete all mandatory originality, source, licensing and AI disclosure checks.', route: 'policy', minutes: longMinutes(project, 25, 40), xp: 45, taskType: 'upload' },
    scheduled: { targetStatus: 'published', title: 'Upload & publish', detail: 'Upload the approved master at the planned time and save the public URL. This completes production.', route: 'mission', minutes: 25, xp: 55, taskType: 'upload' },
    published: { targetStatus: 'analytics-review', title: 'Growth loop: record actual performance', detail: 'Production is complete. Capture real analytics separately to improve the next video.', route: 'analytics', minutes: 20, xp: 45, taskType: 'analytics' },
    'analytics-review': { targetStatus: 'repurpose', title: 'Growth loop: analytics post-mortem', detail: 'Diagnose retention, reach, conversion, cost and the highest-impact improvement.', promptType: 'analytics-postmortem', route: 'prompts', minutes: 30, xp: 50, taskType: 'analytics' },
    repurpose: { targetStatus: 'archived', title: 'Growth loop: repurpose the winner', detail: 'Adapt the story for each useful platform, then close the learning loop.', promptType: 'repurposing', route: 'prompts', minutes: 30, xp: 45, taskType: 'other' },
    archived: { title: 'Choose the next video', detail: 'Use this project’s lessons to recommend the next topic in the focused channel.', promptType: 'next-video', route: 'prompts', minutes: 20, xp: 25, taskType: 'other' },
  };
  return { sourceStatus: project.status, ...map[project.status] };
};

export interface WorkflowReadiness { ready: boolean; completed: string[]; blockers: string[]; }

export const requiredPolicyChecks = [
  'originalScript', 'sourcesPresent', 'claimsClassified', 'aiDisclosureReviewed', 'musicLicensed', 'templateRiskReviewed',
] as const;

const hasPolicyEvidence = (project: VideoProject, key: string): boolean =>
  typeof project.policyEvidence?.[key] === 'string' && Boolean(project.policyEvidence[key].trim());

export const policyRiskLevel = (project: VideoProject): RiskLevel => {
  const missingChecks = requiredPolicyChecks.filter((key) => !project.policyChecks[key]).length;
  const missingEvidence = ['aiDisclosureReviewed', 'musicLicensed']
    .filter((key) => project.policyChecks[key] && !hasPolicyEvidence(project, key)).length;
  const blockers = missingChecks + missingEvidence;
  return blockers === 0 ? 'low' : blockers >= 4 ? 'high' : 'review';
};

const projectSourceEvidence = (workspace: Workspace, project: VideoProject): {
  attachedCount: number;
  provenanceComplete: boolean;
  resolved: boolean;
} => {
  const sourceIds = new Set(Array.isArray(project.sourceIds) ? project.sourceIds.filter((id) => typeof id === 'string' && Boolean(id)) : []);
  const attachedSources = workspace.sources.filter((source) => typeof source === 'object' && source !== null && source.projectId === project.id && sourceIds.has(source.id));
  return {
    attachedCount: attachedSources.length,
    resolved: sourceIds.size >= 1 && attachedSources.length === sourceIds.size,
    provenanceComplete: attachedSources.length >= 1
      && attachedSources.every((source) => [source.url, source.publisher, source.accessedAt].every((value) => typeof value === 'string' && Boolean(value.trim()))),
  };
};

export const isProductionComplete = (project: VideoProject): boolean =>
  Boolean(project.productionCompletedAt || (workflowStageRank(project.status) >= workflowStageRank('published') && project.publicationLinks.length));

export const markProductionComplete = (project: VideoProject): void => {
  if (!project.productionCompletedAt) project.productionCompletedAt = new Date().toISOString();
  project.growthLoopStatus = project.growthLoopStatus ?? 'pending';
};

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
    case 'selected': check(Boolean(project.channelId && project.title && project.deadline), 'Project scope is set.', 'Set channel, title and publication date.'); break;
    case 'researching': check(Boolean(project.researchSummary.trim()), 'Research summary saved.', 'Paste and apply the topic research result.'); break;
    case 'sources-verified':
      check(Boolean(project.researchSummary.trim()), 'Research summary saved.', 'Complete topic research first.');
      {
        const evidence = projectSourceEvidence(workspace, project);
        check(evidence.resolved, `${evidence.attachedCount} source(s) attached with project provenance.`, 'Every attached source ID must resolve to this project with provenance.');
        if (evidence.attachedCount) {
          check(
            evidence.provenanceComplete,
            'Attached source provenance is complete.',
            'Every attached source requires a URL, publisher, and access date.',
          );
        }
      }
      check(Boolean(project.factCheckSummary.trim()), 'Fact-check summary saved.', 'Paste and apply the fact-check result.');
      break;
    case 'hook-ready': check(Boolean(project.hook.trim()), 'Hook selected.', 'Save a recommended hook.'); break;
    case 'script-draft':
    case 'script-approved': check(Boolean(project.script.trim()), `Script v${project.scriptVersion || 1} saved.`, 'Write and save the script.'); break;
    case 'storyboard': check(project.storyboard.length > 0, `${project.storyboard.length} storyboard scene(s) saved.`, 'Create storyboard and shot list.'); break;
    case 'assets-needed': check(project.assetPrompts.length > 0, `${project.assetPrompts.length} asset prompt(s) saved.`, 'Create visual asset prompts.'); break;
    case 'capcut-draft': check(Boolean(project.capcutBrief.trim()), 'CapCut brief saved.', 'Create and apply the CapCut production brief.'); break;
    case 'editing': check(workspace.credits.some((entry) => entry.projectId === project.id), 'CapCut credit entry recorded.', 'Generate the draft and record a credit ledger entry.'); break;
    case 'qa': check(Boolean(project.script && project.storyboard.length), 'Narrative and visual plan exist.', 'Finish script and storyboard before QA.'); break;
    case 'scheduled': {
      check(project.riskLevel === 'low', 'Policy risk is Low.', 'Resolve Policy Shield until risk is Low.');
      const missing = requiredPolicyChecks.filter((key) => !project.policyChecks[key]);
      check(missing.length === 0, 'All mandatory policy checks passed.', `Mandatory checks missing: ${missing.join(', ')}`);
      const sourceEvidence = projectSourceEvidence(workspace, project);
      check(Boolean(project.policyChecks.sourcesPresent && sourceEvidence.resolved && sourceEvidence.provenanceComplete), 'Source evidence supports the release check.', 'The sourcesPresent check requires complete project source evidence.');
      check(Boolean(project.policyChecks.claimsClassified && typeof project.factCheckSummary === 'string' && project.factCheckSummary.trim()), 'Claim classification has a fact-check artifact.', 'The claimsClassified check requires a saved fact-check artifact.');
      check(Boolean(project.policyChecks.originalScript && typeof project.script === 'string' && project.script.trim()), 'Original script has a saved artifact.', 'The originalScript check requires a saved script artifact.');
      check(Boolean(project.policyChecks.aiDisclosureReviewed && hasPolicyEvidence(project, 'aiDisclosureReviewed')), 'AI disclosure decision is saved.', 'The aiDisclosureReviewed check requires a saved disclosure decision.');
      check(Boolean(project.policyChecks.musicLicensed && hasPolicyEvidence(project, 'musicLicensed')), 'Music and footage rights evidence is saved.', 'The musicLicensed check requires saved rights evidence.');
      break;
    }
    case 'published': check(project.publicationLinks.length > 0, 'Publication URL saved.', 'Add at least one real publication URL.'); break;
    case 'analytics-review': check(workspace.analytics.some((entry) => entry.projectId === project.id && !entry.isDemo), 'Actual analytics recorded.', 'Record non-demo actual analytics.'); break;
    case 'repurpose': check(Boolean(project.analyticsPostmortem.trim() || project.lessonsLearned.trim()), 'Post-mortem saved.', 'Complete the analytics post-mortem.'); break;
    case 'archived': check(Boolean(project.repurposingPlan.trim()), 'Repurposing plan saved.', 'Create the multi-platform repurposing plan.'); break;
  }
  return { ready: blockers.length === 0, completed, blockers };
};

export const promptCompletionStatus = (type: PromptType, _project: VideoProject): ProjectStatus | undefined => ({
  'topic-research': 'researching', 'fact-check': 'sources-verified', 'hook-generator': 'hook-ready',
  'shorts-script': 'script-draft', 'long-script': 'script-draft', storyboard: 'storyboard', 'ai-image': 'assets-needed',
  'ai-video': 'assets-needed', 'capcut-standard': 'capcut-draft', 'capcut-director': 'capcut-draft',
  'analytics-postmortem': 'repurpose', repurposing: 'archived',
} as Partial<Record<PromptType, ProjectStatus>>)[type];

export const recordWorkflowEvent = (project: VideoProject, event: Omit<WorkflowEvent, 'id' | 'at'> & Partial<Pick<WorkflowEvent, 'id' | 'at'>>): void => {
  project.workflowEvents.push({ id: event.id ?? uid('event'), at: event.at ?? new Date().toISOString(), ...event });
};

const timeToMinutes = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 9) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};
const minutesToTime = (value: number): string => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const publishDateFor = (project: VideoProject): string => project.publishAt?.slice(0, 10) || project.deadline.slice(0, 10);
const publishTimeFor = (workspace: Workspace, project: VideoProject): string => project.publishAt?.slice(11, 16) || workspace.settings.defaultPublishTime || '19:00';

const usedMinutesOn = (workspace: Workspace, date: string, projectId: string): number => workspace.calendarTasks
  .filter((task) => task.date === date && !task.completed && !(task.projectId === projectId && task.autoGenerated) && task.type !== 'rest')
  .reduce((sum, task) => sum + task.durationMinutes, 0);

const nextCapacitySlot = (workspace: Workspace, project: VideoProject, date: string, duration: number): { date: string; time: string; conflict: boolean } => {
  const startMinute = timeToMinutes(workspace.settings.workdayStart || '09:00');
  const endMinute = timeToMinutes(workspace.settings.workdayEnd || '18:00');
  const workdayWindow = Math.max(60, endMinute > startMinute ? endMinute - startMinute : 60);
  const weeklyDailyShare = Math.max(10, Math.floor(((workspace.settings.weeklyHoursAvailable || 12) * 60) / 5));
  const dailyCapacity = Math.min(workdayWindow, weeklyDailyShare);
  const publishDate = publishDateFor(project);
  let cursor = date;
  for (let guard = 0; guard < 45; guard += 1) {
    const used = usedMinutesOn(workspace, cursor, project.id);
    if (used + duration <= dailyCapacity && startMinute + used + duration <= startMinute + workdayWindow) {
      return { date: cursor, time: minutesToTime(startMinute + used), conflict: cursor > publishDate };
    }
    cursor = addDays(cursor, 1);
  }
  return { date: cursor, time: workspace.settings.workdayStart || '09:00', conflict: true };
};

export const buildWorkflowTasks = (workspace: Workspace, project: VideoProject, startDate = todayIso()): CalendarTask[] => {
  const startIndex = workflowStageRank(project.status);
  const result: CalendarTask[] = [];
  let cursorDate = startDate;
  const publishDate = publishDateFor(project);
  for (let index = startIndex; index < workflowStatuses.length - 1; index += 1) {
    const sourceStatus = workflowStatuses[index];
    const shadow = { ...project, status: sourceStatus } as VideoProject;
    const recommendation = workflowRecommendation(workspace, shadow);
    if (!recommendation.targetStatus) continue;
    const growth = workflowStageRank(sourceStatus) >= workflowStageRank('published');
    let slot = nextCapacitySlot(workspace, project, cursorDate, recommendation.minutes);
    if (sourceStatus === 'scheduled') slot = { date: publishDate, time: publishTimeFor(workspace, project), conflict: false };
    if (sourceStatus === 'published' && slot.date <= publishDate) slot = nextCapacitySlot(workspace, project, addDays(publishDate, 1), recommendation.minutes);
    const conflict = !growth && sourceStatus !== 'scheduled' && slot.date > publishDate;
    result.push({
      id: uid('task'), title: recommendation.title, date: slot.date, startTime: slot.time,
      durationMinutes: recommendation.minutes, type: recommendation.taskType, projectId: project.id, recurring: 'none', completed: false,
      workflowPromptType: recommendation.promptType, sourceStatus, targetStatus: recommendation.targetStatus,
      missionRoute: recommendation.route, autoGenerated: true, priority: 100 - index,
      templateKind: growth ? 'growth' : project.format, conflict, conflictReason: conflict ? `Capacity exceeds planned publish date ${publishDate}` : undefined,
      isDemo: project.isDemo,
    });
    cursorDate = slot.date;
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

export const rescheduleProjectWorkflow = (workspace: Workspace, projectId: string, publishAt: string, startDate = todayIso()): CalendarTask[] => {
  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project) return [];
  project.publishAt = publishAt;
  project.deadline = publishAt.slice(0, 10);
  project.updatedAt = new Date().toISOString();
  recordWorkflowEvent(project, { type: 'rescheduled', note: `Publish rescheduled to ${publishAt}` });
  return rebuildWorkflowTasks(workspace, projectId, startDate);
};

export const taskIsUnlocked = (task: CalendarTask, project?: VideoProject): boolean => !task.sourceStatus || !project || workflowStageRank(project.status) >= workflowStageRank(task.sourceStatus);
export const hasReachedStatus = (project: VideoProject, status: ProjectStatus): boolean => workflowStageRank(project.status) >= workflowStageRank(status);

export const syncNextWorkflowMission = (workspace: Workspace, projectId: string): CalendarTask | undefined => {
  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project) return undefined;
  const currentRank = workflowStageRank(project.status);
  workspace.calendarTasks.forEach((task) => {
    if (task.projectId !== projectId || !task.autoGenerated || !task.sourceStatus) return;
    if (workflowStageRank(task.sourceStatus) < currentRank) { task.completed = true; task.completedAt ??= new Date().toISOString(); }
  });
  let current = workspace.calendarTasks.find((task) => task.projectId === projectId && task.autoGenerated && !task.completed && task.sourceStatus === project.status);
  if (!current && project.status !== 'archived') {
    const planned = buildWorkflowTasks(workspace, project, todayIso());
    const replacement = planned.find((task) => task.sourceStatus === project.status);
    if (replacement) { workspace.calendarTasks.push(replacement); current = replacement; }
  }
  return current;
};
