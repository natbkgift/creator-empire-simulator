import type { Channel, ChannelRole, Language, VideoFormat, VideoProject, CreditEntry, ProjectStatus, AnalyticsEntry, CalendarTask, MonetizationPath, RiskLevel, SimulationInputs } from '../domain/types.js';
import { getWorkspace, updateWorkspace, awardXp } from '../app/store.js';
import { navigate } from '../app/router.js';
import { activeProject, capacityStats } from '../app/selectors.js';
import { applyChannelFocus, applyProjectFocus } from '../domain/focus.js';
import { generateBlueprint } from '../domain/blueprint.js';
import { buildWorkflowTasks, recordWorkflowEvent, syncNextWorkflowMission, taskIsUnlocked, workflowReadiness } from '../domain/workflow.js';
import { addDays, slugify, todayIso, uid } from '../domain/utils.js';
import { showToast } from '../ui/feedback.js';
import { defaultSimulationInputs, runSimulation } from '../domain/simulator.js';
import { numberFrom, stringFrom } from './helpers.js';
import { completeMission } from './workflow-controller.js';
import { retentionSeries } from './import-export-controller.js';

export const createChannelFromForm = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  const workspace = getWorkspace();
  const ideaId = stringFrom(data, 'ideaId');
  const idea = workspace.ideas.find((item) => item.id === ideaId);
  if (!idea) {
    showToast('ไม่พบ Idea ที่เลือก', 'danger');
    return;
  }
  const language = (stringFrom(data, 'language') === 'th' ? 'th' : 'en') as Language;
  const role = (stringFrom(data, 'role', 'experiment') || 'experiment') as ChannelRole;
  const format = (stringFrom(data, 'format', 'both') || 'both') as VideoFormat;
  const blueprint = generateBlueprint(idea, language, format);
  const requestedName = stringFrom(data, 'name') || blueprint.nameOptions[0] || 'Creator Studio';
  const existingHandles = new Set(workspace.channels.map((channel) => channel.handle));
  const baseHandle = slugify(requestedName) || `channel-${workspace.channels.length + 1}`;
  let handle = baseHandle;
  let suffix = 2;
  while (existingHandles.has(handle)) {
    handle = `${baseHandle}-${suffix}`;
    suffix += 1;
  }
  const now = new Date().toISOString();
  const channel: Channel = {
    id: uid('channel'),
    name: requestedName,
    handle,
    ideaId: idea.id,
    niche: language === 'en' ? idea.titleEn : idea.titleTh,
    language,
    role,
    health: 55,
    weeklyHours: Math.max(1, numberFrom(data, 'weeklyHours', 4)),
    weeklyShortsTarget: format === 'long' ? 0 : format === 'shorts' ? 4 : 3,
    monthlyLongTarget: format === 'shorts' ? 0 : format === 'long' ? 4 : 2,
    audienceCountries: idea.score[language].recommendedCountries,
    blueprint,
    createdAt: now,
  };
  updateWorkspace((draft) => {
    draft.channels.push(channel);
    applyChannelFocus(draft, channel.id);
    awardXp(draft, `channel:${channel.id}`, 120, 'topicSelection');
    const achievement = draft.achievements.find((item) => item.id === 'achievement_first_channel');
    if (achievement && !achievement.unlockedAt) achievement.unlockedAt = now;
    draft.monetization.push({
      id: uid('money'),
      channelId: channel.id,
      name: blueprint.monetizationPaths[0] ?? 'Primary monetization experiment',
      type: idea.categoryId === 'ai' || idea.categoryId === 'thailand' ? 'lead-generation' : 'platform',
      status: 'idea',
      estimatedMonthlyThb: 0,
      confirmedMonthlyThb: 0,
      nextAction: language === 'en'
        ? 'Publish a proof set before activating this path.'
        : 'สร้างชุดคลิปพิสูจน์ผลก่อนเปิดใช้เส้นทางนี้',
    });
  });
  const nextWorkspace = getWorkspace();
  const capacity = capacityStats(nextWorkspace);
  showToast(
    capacity.activeChannels > nextWorkspace.settings.activeChannelLimit
      ? 'สร้าง Channel แล้ว แต่จำนวนช่อง Active เกิน Capacity ที่ตั้งไว้'
      : 'สร้าง Channel Blueprint แล้ว',
    capacity.activeChannels > nextWorkspace.settings.activeChannelLimit ? 'warning' : 'success',
  );
  navigate('blueprint', { channel: channel.id });
};

export const createProjectFromForm = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  const workspace = getWorkspace();
  const channelId = stringFrom(data, 'channelId');
  const channel = workspace.channels.find((item) => item.id === channelId);
  if (!channel) {
    showToast('ไม่พบ Channel', 'danger');
    return;
  }
  const idea = workspace.ideas.find((item) => item.id === channel.ideaId);
  const format = (stringFrom(data, 'format') === 'long' ? 'long' : 'shorts') as 'shorts' | 'long';
  const score = idea?.score[channel.language];
  const now = new Date().toISOString();
  const project: VideoProject = {
    id: uid('project'),
    title: stringFrom(data, 'title') || channel.niche,
    channelId: channel.id,
    ideaId: channel.ideaId,
    series: channel.niche,
    language: channel.language,
    platforms: format === 'shorts' ? ['YouTube Shorts', 'Facebook Reels', 'TikTok'] : ['YouTube'],
    format,
    targetDurationSeconds: format === 'shorts' ? 55 : 480,
    deadline: stringFrom(data, 'deadline') || addDays(todayIso(), format === 'shorts' ? 5 : 12),
    owner: 'Nat',
    estimatedMinutes: score?.productionMinutes ?? (format === 'shorts' ? 120 : 420),
    budgetThb: 0,
    creditEstimateLow: score?.estimatedCreditsLow ?? 40,
    creditEstimateHigh: score?.estimatedCreditsHigh ?? 120,
    actualCredits: 0,
    status: 'selected',
    sourceIds: [],
    researchSummary: '',
    factCheckSummary: '',
    scriptVersion: 0,
    script: '',
    hook: '',
    storyboard: [],
    assetPrompts: [],
    capcutBrief: '',
    promptVersions: [],
    thumbnailVersions: [],
    publicationLinks: [],
    lessonsLearned: '',
    analyticsPostmortem: '',
    repurposingPlan: '',
    workflowEvents: [],
    policyChecks: {},
    riskLevel: score?.copyrightRisk ?? 'review',
    createdAt: now,
    updatedAt: now,
  };
  updateWorkspace((draft) => {
    draft.projects.push(project);
    const tasks = buildWorkflowTasks(draft, project);
    draft.calendarTasks.push(...tasks);
    applyProjectFocus(draft, project.id, tasks[0]?.id);
    awardXp(draft, `project:${project.id}`, 45, 'consistency');
  });
  showToast('สร้าง Video Project พร้อม Calendar-driven Workflow แล้ว');
  navigate('mission', { project: project.id });
};

export const recordCreditEntry = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  const workspace = getWorkspace();
  const projectId = stringFrom(data, 'projectId');
  const project = workspace.projects.find((item) => item.id === projectId) ?? activeProject(workspace);
  const before = Math.max(0, numberFrom(data, 'balanceBefore'));
  const after = Math.max(0, numberFrom(data, 'balanceAfter'));
  if (after > before) {
    showToast('Balance หลังสร้างต้องไม่มากกว่า Balance ก่อนสร้าง', 'warning');
    return;
  }
  const entry: CreditEntry = {
    id: uid('credit'), projectId: project?.id, channelId: project?.channelId,
    createdAt: new Date().toISOString(), balanceBefore: before, balanceAfter: after,
    tool: stringFrom(data, 'tool', 'other') as CreditEntry['tool'],
    mode: stringFrom(data, 'mode', 'standard') as CreditEntry['mode'],
    model: stringFrom(data, 'model'), durationSeconds: Math.max(0, numberFrom(data, 'durationSeconds')),
    resolution: stringFrom(data, 'resolution', 'other') as CreditEntry['resolution'],
    soundEnabled: data.get('soundEnabled') === 'on', generations: Math.max(1, numberFrom(data, 'generations', 1)),
    regenerations: Math.max(0, numberFrom(data, 'regenerations')), usableOutputs: Math.max(0, numberFrom(data, 'usableOutputs')),
    completedVideo: data.get('completedVideo') === 'on', visualStyle: stringFrom(data, 'visualStyle'), notes: stringFrom(data, 'notes'),
  };
  let advancedTo: ProjectStatus | undefined;
  let nextTaskId: string | undefined;
  let gateBlocker = '';
  updateWorkspace((draft) => {
    draft.credits.push(entry);
    draft.settings.capcutBalance = after;
    const target = draft.projects.find((item) => item.id === project?.id);
    if (target) {
      target.actualCredits += Math.max(0, before - after);
      target.updatedAt = new Date().toISOString();
      const previous = target.status;
      const candidate: ProjectStatus | undefined = previous === 'capcut-draft'
        ? 'editing'
        : previous === 'editing' && entry.completedVideo ? 'qa' : undefined;
      if (candidate) {
        const readiness = workflowReadiness(draft, target, candidate);
        if (readiness.ready) {
          const task = draft.calendarTasks.find((item) => item.projectId === target.id && !item.completed && item.sourceStatus === previous);
          if (task) { task.completed = true; task.completedAt = new Date().toISOString(); }
          target.status = candidate;
          advancedTo = candidate;
          recordWorkflowEvent(target, { type: 'mission-completed', note: candidate === 'editing' ? 'CapCut draft generated and cost logged.' : 'Final edit completed.', fromStatus: previous, toStatus: candidate, taskId: task?.id });
          recordWorkflowEvent(target, { type: 'stage-advanced', note: `Advanced to ${candidate}`, fromStatus: previous, toStatus: candidate });
          const next = syncNextWorkflowMission(draft, target.id);
          nextTaskId = next?.id;
          applyProjectFocus(draft, target.id, next?.id);
        } else {
          gateBlocker = readiness.blockers[0] ?? '';
          applyProjectFocus(draft, target.id);
        }
      } else {
        applyProjectFocus(draft, target.id);
      }
    }
    awardXp(draft, `credit:${entry.id}`, 30, 'editing');
    if (draft.credits.length >= 5) {
      const achievement = draft.achievements.find((item) => item.id === 'achievement_cost_control');
      if (achievement && !achievement.unlockedAt) achievement.unlockedAt = new Date().toISOString();
    }
  });
  showToast(advancedTo ? `บันทึก ${before - after} credits และเลื่อนไป ${advancedTo}` : gateBlocker || `บันทึกต้นทุนจริง ${before - after} credits แล้ว`, gateBlocker ? 'warning' : 'success');
  if (advancedTo && project) navigate('mission', { project: project.id, task: nextTaskId });
}

export const createCalendarTask = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  const recurring = stringFrom(data, 'recurring', 'none') as CalendarTask['recurring'];
  const base: Omit<CalendarTask, 'id' | 'date'> = {
    title: stringFrom(data, 'title'),
    startTime: stringFrom(data, 'startTime', '09:00'),
    durationMinutes: Math.max(5, numberFrom(data, 'durationMinutes', 30)),
    type: stringFrom(data, 'type', 'other') as CalendarTask['type'],
    projectId: stringFrom(data, 'projectId') || undefined,
    recurring,
    completed: false,
  };
  if (!base.title) {
    showToast('กรุณาใส่ชื่อภารกิจ', 'warning');
    return;
  }
  const date = stringFrom(data, 'date', todayIso());
  const dates = recurring === 'daily'
    ? Array.from({ length: 7 }, (_, index) => addDays(date, index))
    : recurring === 'weekly'
      ? Array.from({ length: 4 }, (_, index) => addDays(date, index * 7))
      : [date];
  updateWorkspace((draft) => {
    dates.forEach((taskDate, index) => draft.calendarTasks.push({
      ...base,
      id: uid('task'),
      date: taskDate,
      recurring: index === 0 ? recurring : 'none',
    }));
    awardXp(draft, `calendar:${Date.now()}`, 15, 'consistency');
  });
  showToast(`เพิ่ม ${dates.length} ภารกิจในปฏิทินแล้ว`);
};

export const toggleCalendarTask = (taskId: string): void => {
  const workspace = getWorkspace();
  const task = workspace.calendarTasks.find((item) => item.id === taskId);
  if (!task) return;
  const project = workspace.projects.find((item) => item.id === task.projectId);
  if (task.autoGenerated && project) {
    if (task.completed) { showToast('Workflow mission ที่ผ่านแล้วไม่ควรเปิดย้อนกลับจาก Calendar', 'info'); return; }
    if (!taskIsUnlocked(task, project)) { showToast(`Mission ยังล็อกอยู่จนถึง ${task.sourceStatus}`, 'warning'); return; }
    completeMission(project.id, task.id);
    return;
  }
  updateWorkspace((draft) => {
    const target = draft.calendarTasks.find((item) => item.id === taskId);
    if (!target) return;
    target.completed = !target.completed;
    target.completedAt = target.completed ? new Date().toISOString() : undefined;
    if (target.completed) awardXp(draft, `task:${target.id}`, 20, 'consistency');
  });
  showToast('อัปเดตภารกิจแล้ว');
}

export const addAnalyticsEntry = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  const workspace = getWorkspace();
  const projectId = stringFrom(data, 'projectId') || activeProject(workspace)?.id || '';
  const project = workspace.projects.find((item) => item.id === projectId);
  if (!project) { showToast('ไม่พบ Project', 'danger'); return; }
  const channel = workspace.channels.find((item) => item.id === project.channelId);
  const views = Math.max(0, numberFrom(data, 'views')); const revenue = Math.max(0, numberFrom(data, 'revenueThb')); const retention = Math.max(0, numberFrom(data, 'averagePercentageViewed'));
  const entry: AnalyticsEntry = {
    id: uid('analytics'), projectId: project.id, channelId: project.channelId, recordedAt: new Date().toISOString(),
    platform: stringFrom(data, 'platform', 'youtube') as AnalyticsEntry['platform'], impressions: Math.max(0, numberFrom(data, 'impressions')), views,
    viewedVsSwiped: Math.max(0, numberFrom(data, 'viewedVsSwiped')), ctr: Math.max(0, numberFrom(data, 'ctr')),
    averageViewDurationSeconds: Math.max(0, numberFrom(data, 'averageViewDurationSeconds')), averagePercentageViewed: retention,
    retentionPoints: retentionSeries(retention), watchHours: Math.max(0, numberFrom(data, 'watchHours')), subscribersGained: Math.max(0, numberFrom(data, 'subscribersGained')),
    returningViewers: 0, topCountries: channel?.audienceCountries.slice(0, 3) ?? [], revenueThb: revenue, rpmThb: views > 0 ? (revenue / views) * 1000 : 0,
    productionMinutes: project.estimatedMinutes, creditsUsed: Math.max(0, numberFrom(data, 'creditsUsed')), financialCostThb: Math.max(0, numberFrom(data, 'financialCostThb')), isDemo: false,
  };
  let advanced = false; let nextTaskId: string | undefined;
  updateWorkspace((draft) => {
    draft.analytics.push(entry);
    const target = draft.projects.find((item) => item.id === project.id);
    if (target) {
      recordWorkflowEvent(target, { type: 'analytics-recorded', note: `${entry.platform}: ${entry.views} views` });
      if (target.status === 'published') {
        const readiness = workflowReadiness(draft, target, 'analytics-review');
        if (readiness.ready) {
          const task = draft.calendarTasks.find((item) => item.projectId === target.id && !item.completed && item.sourceStatus === 'published');
          if (task) { task.completed = true; task.completedAt = new Date().toISOString(); }
          target.status = 'analytics-review'; target.updatedAt = new Date().toISOString(); advanced = true;
          recordWorkflowEvent(target, { type: 'stage-advanced', note: 'Actual analytics recorded.', fromStatus: 'published', toStatus: 'analytics-review', taskId: task?.id });
          const next = syncNextWorkflowMission(draft, target.id); nextTaskId = next?.id; applyProjectFocus(draft, target.id, next?.id);
        }
      } else applyProjectFocus(draft, target.id);
    }
    awardXp(draft, `analytics:${entry.id}`, 90, 'analytics');
    const firstPublish = draft.achievements.find((item) => item.id === 'achievement_first_publish'); if (firstPublish && !firstPublish.unlockedAt) firstPublish.unlockedAt = new Date().toISOString();
    const completeLoops = draft.projects.filter((item) => !item.isDemo && item.lessonsLearned && draft.analytics.some((record) => !record.isDemo && record.projectId === item.id)).length;
    if (completeLoops >= 3) { const achievement = draft.achievements.find((item) => item.id === 'achievement_learning_loop'); if (achievement && !achievement.unlockedAt) achievement.unlockedAt = new Date().toISOString(); }
  });
  showToast(advanced ? 'บันทึก Actual analytics และเปิด Post-mortem mission แล้ว' : 'บันทึก Actual analytics แล้ว');
  if (advanced) navigate('mission', { project: project.id, task: nextTaskId });
}

export const addMonetizationPath = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  const path: MonetizationPath = {
    id: uid('money'),
    channelId: stringFrom(data, 'channelId'),
    name: stringFrom(data, 'name'),
    type: stringFrom(data, 'type', 'off-platform') as MonetizationPath['type'],
    status: stringFrom(data, 'status', 'idea') as MonetizationPath['status'],
    estimatedMonthlyThb: Math.max(0, numberFrom(data, 'estimatedMonthlyThb')),
    confirmedMonthlyThb: Math.max(0, numberFrom(data, 'confirmedMonthlyThb')),
    nextAction: stringFrom(data, 'nextAction'),
  };
  if (!path.channelId || !path.name || !path.nextAction) {
    showToast('กรอก Channel, Name และ Next action ให้ครบ', 'warning');
    return;
  }
  updateWorkspace((draft) => {
    draft.monetization.push(path);
    awardXp(draft, `money:${path.id}`, 25, 'monetization');
  });
  showToast('เพิ่มเส้นทางรายได้แล้ว');
};

export const recalculateProjectRisk = (projectId: string): void => {
  updateWorkspace((draft) => {
    const project = draft.projects.find((item) => item.id === projectId); if (!project) return;
    const completed = Object.values(project.policyChecks).filter(Boolean).length;
    let risk: RiskLevel = 'review'; if (completed >= 6) risk = 'low'; else if (completed < 3) risk = 'high';
    project.riskLevel = risk; project.updatedAt = new Date().toISOString(); applyProjectFocus(draft, project.id);
    if (risk === 'low') { awardXp(draft, `policy:${project.id}`, 70, 'research'); const achievement = draft.achievements.find((item) => item.id === 'achievement_source_guard'); if (achievement && !achievement.unlockedAt) achievement.unlockedAt = new Date().toISOString(); }
  });
  showToast('อัปเดต Policy risk แล้ว');
}

export const runSimulatorFromForm = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  const inputs: SimulationInputs = {
    videosPerWeek: Math.max(1, numberFrom(data, 'videosPerWeek', defaultSimulationInputs.videosPerWeek)),
    shortsPercent: Math.min(100, Math.max(0, numberFrom(data, 'shortsPercent', defaultSimulationInputs.shortsPercent))),
    averageViews: Math.max(0, numberFrom(data, 'averageViews', defaultSimulationInputs.averageViews)),
    retentionPercent: Math.max(0, numberFrom(data, 'retentionPercent', defaultSimulationInputs.retentionPercent)),
    ctrPercent: Math.max(0, numberFrom(data, 'ctrPercent', defaultSimulationInputs.ctrPercent)),
    subscriberConversionPercent: Math.max(0, numberFrom(data, 'subscriberConversionPercent', defaultSimulationInputs.subscriberConversionPercent)),
    productionQuality: Math.min(100, Math.max(0, numberFrom(data, 'productionQuality', defaultSimulationInputs.productionQuality))),
    topicRepeatability: Math.min(100, Math.max(0, numberFrom(data, 'topicRepeatability', defaultSimulationInputs.topicRepeatability))),
    language: (stringFrom(data, 'language') === 'th' ? 'th' : 'en') as Language,
    highValueAudiencePercent: Math.min(100, Math.max(0, numberFrom(data, 'highValueAudiencePercent', defaultSimulationInputs.highValueAudiencePercent))),
    monthlyBudgetThb: Math.max(0, numberFrom(data, 'monthlyBudgetThb', defaultSimulationInputs.monthlyBudgetThb)),
    availableCredits: Math.max(0, numberFrom(data, 'availableCredits', getWorkspace().settings.capcutBalance)),
    hoursPerWeek: Math.max(1, numberFrom(data, 'hoursPerWeek', getWorkspace().settings.weeklyHoursAvailable)),
    consistencyPercent: Math.min(100, Math.max(0, numberFrom(data, 'consistencyPercent', defaultSimulationInputs.consistencyPercent))),
    seed: Math.trunc(numberFrom(data, 'seed', defaultSimulationInputs.seed)),
  };
  const simulation = runSimulation(inputs);
  updateWorkspace((draft) => {
    draft.simulations.push(simulation);
    if (draft.simulations.length > 20) draft.simulations = draft.simulations.slice(-20);
    awardXp(draft, `simulation:${simulation.id}`, 20, 'analytics');
  });
  showToast('รันแบบจำลอง 90 วันแล้ว');
};
