import assert from 'node:assert/strict';
import { seedIdeas, ideaCategories } from '../dist/src/seed/ideas.js';
import { createSeedWorkspace } from '../dist/src/seed/demo.js';
import { calculateScore, compareIdeaLanguages } from '../dist/src/domain/scoring.js';
import { generateBlueprint } from '../dist/src/domain/blueprint.js';
import { generatePrompt, promptTypes, recommendCapCutMode } from '../dist/src/domain/prompts.js';
import { defaultSimulationInputs, runSimulation } from '../dist/src/domain/simulator.js';
import { validatePromptResponse, validateWorkspace } from '../dist/src/domain/validation.js';
import {
  applyChannelFocus,
  applyPortfolioFocus,
  applyProjectFocus,
  focusedChannel,
  focusedProject,
  focusedProjects,
  focusedTasks,
} from '../dist/src/domain/focus.js';
import {
  buildWorkflowTasks,
  promptCompletionStatus,
  rebuildWorkflowTasks,
  syncNextWorkflowMission,
  taskIsUnlocked,
  workflowReadiness,
  workflowRecommendation,
  workflowStatuses,
} from '../dist/src/domain/workflow.js';
import { migrateWorkspace } from '../dist/src/domain/migration.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const historyChannelId = 'channel_history_lab';
const aiChannelId = 'channel_flowbiz_ai';
const wojtekProjectId = 'project_wojtek_short';
const aiProjectId = 'project_ai_boring_task';

test('seed library contains 5 categories and 50 ideas', () => {
  assert.equal(ideaCategories.length, 5);
  assert.equal(seedIdeas.length, 50);
  for (const category of ideaCategories) {
    assert.equal(seedIdeas.filter((idea) => idea.categoryId === category.id).length, 10);
  }
});

test('all language scores stay in valid ranges', () => {
  for (const idea of seedIdeas) {
    for (const language of ['en', 'th']) {
      const score = idea.score[language];
      assert.ok(score.total >= 0 && score.total <= 100, `${idea.id}/${language}`);
      assert.ok(score.estimatedCreditsLow >= 0);
      assert.ok(score.estimatedCreditsHigh >= score.estimatedCreditsLow);
      assert.ok(score.productionMinutes > 0);
    }
  }
});

test('weighted scoring is deterministic', () => {
  const base = seedIdeas[0].score.en;
  const recalculated = calculateScore({ ...base, total: undefined });
  assert.equal(recalculated.total, base.total);
});

test('language comparison selects a valid winner', () => {
  const comparison = compareIdeaLanguages(seedIdeas[0]);
  assert.ok(['en', 'th'].includes(comparison.winner));
  assert.equal(comparison.difference, Math.abs(seedIdeas[0].score.en.total - seedIdeas[0].score.th.total));
});

test('channel blueprint contains production-ready sections', () => {
  const blueprint = generateBlueprint(seedIdeas[0], 'en', 'both');
  assert.equal(blueprint.nameOptions.length, 10);
  assert.ok(blueprint.pillars.length >= 3);
  assert.ok(blueprint.plan30Days.length >= 8);
  assert.ok(blueprint.experiment90Days.length >= 3);
  assert.ok(blueprint.factCheckWorkflow.length >= 3);
});

test('all 16 prompt workflows are present and context-aware', () => {
  assert.equal(promptTypes.length, 16);
  const workspace = createSeedWorkspace();
  const channel = workspace.channels[0];
  const project = workspace.projects[0];
  const idea = workspace.ideas.find((item) => item.id === project.ideaId);
  const prompt = generatePrompt({ type: 'shorts-script', language: 'en', idea, channel, project, workspace, advanced: true });
  assert.match(prompt, /SHORTS SCRIPT PROMPT/);
  assert.match(prompt, new RegExp(project.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(prompt, /Return valid JSON only/);
  assert.match(prompt, /red-team/i);
});

test('CapCut mode recommends control for factual content and Director for product-led content', () => {
  const workspace = createSeedWorkspace();
  const historyIdea = workspace.ideas.find((item) => item.categoryId === 'history');
  const standard = recommendCapCutMode(historyIdea, workspace.projects[0]);
  assert.equal(standard.mode, 'standard');
  const productProject = { ...workspace.projects[0], title: 'Property Project Advertisement' };
  const director = recommendCapCutMode(historyIdea, productProject);
  assert.equal(director.mode, 'director');
});

test('simulator is deterministic and always exposes four scenarios and assumptions', () => {
  const first = runSimulation(defaultSimulationInputs);
  const second = runSimulation(defaultSimulationInputs);
  assert.deepEqual(first.results, second.results);
  assert.equal(first.results.length, 4);
  assert.deepEqual(first.results.map((r) => r.scenario), ['conservative', 'base', 'growth', 'breakout']);
  assert.ok(first.assumptions.some((item) => /not a revenue or growth guarantee/i.test(item)));
  for (const result of first.results) {
    assert.ok(result.subscribersHigh >= result.subscribersLow);
    assert.ok(result.watchHoursHigh >= result.watchHoursLow);
  }
});

test('workspace and prompt JSON validation reject malformed input', () => {
  const workspace = createSeedWorkspace();
  assert.equal(validateWorkspace(workspace).valid, true);
  assert.equal(validateWorkspace({}).valid, false);
  assert.equal(validatePromptResponse('{"hook":"works"}').valid, true);
  assert.equal(validatePromptResponse('not-json').valid, false);
});

test('seed workspace is schema v3 and starts in a valid channel/project focus', () => {
  const workspace = createSeedWorkspace();
  assert.equal(workspace.schemaVersion, 3);
  assert.equal(workspace.focus.mode, 'channel');
  assert.equal(focusedChannel(workspace)?.id, historyChannelId);
  assert.equal(focusedProject(workspace)?.id, wojtekProjectId);
  assert.ok(workspace.calendarTasks.some((task) => task.id === workspace.focus.activeTaskId));
});

test('Channel Focus scopes projects and tasks to the selected channel', () => {
  const workspace = createSeedWorkspace();
  applyChannelFocus(workspace, aiChannelId);
  assert.equal(focusedChannel(workspace)?.id, aiChannelId);
  assert.equal(focusedProject(workspace)?.id, aiProjectId);
  assert.ok(focusedProjects(workspace).every((project) => project.channelId === aiChannelId));
  const projectIds = new Set(focusedProjects(workspace).map((project) => project.id));
  assert.ok(focusedTasks(workspace, false).every((task) => !task.projectId || projectIds.has(task.projectId)));
});

test('choosing an Active Project automatically switches to its owning channel', () => {
  const workspace = createSeedWorkspace();
  applyProjectFocus(workspace, aiProjectId);
  assert.equal(workspace.focus.mode, 'channel');
  assert.equal(workspace.focus.activeChannelId, aiChannelId);
  assert.equal(workspace.focus.activeProjectId, aiProjectId);
  assert.equal(focusedChannel(workspace)?.id, aiChannelId);
});

test('Portfolio Focus exposes projects from every channel without losing the active project', () => {
  const workspace = createSeedWorkspace();
  const activeBefore = workspace.focus.activeProjectId;
  applyPortfolioFocus(workspace);
  assert.equal(workspace.focus.mode, 'portfolio');
  assert.equal(focusedChannel(workspace), undefined);
  assert.equal(focusedProjects(workspace).length, workspace.projects.length);
  assert.equal(workspace.focus.activeProjectId, activeBefore);
});

test('workflow contains the exact 17 ordered production stages', () => {
  assert.equal(workflowStatuses.length, 17);
  assert.deepEqual(workflowStatuses, [
    'idea-backlog', 'selected', 'researching', 'sources-verified', 'hook-ready', 'script-draft',
    'script-approved', 'storyboard', 'assets-needed', 'capcut-draft', 'editing', 'qa', 'scheduled',
    'published', 'analytics-review', 'repurpose', 'archived',
  ]);
});

test('pipeline recommendation maps Script Approved to the Storyboard Prompt Studio mission', () => {
  const workspace = createSeedWorkspace();
  const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  const recommendation = workflowRecommendation(workspace, project);
  assert.equal(project.status, 'script-approved');
  assert.equal(recommendation.targetStatus, 'storyboard');
  assert.equal(recommendation.promptType, 'storyboard');
  assert.equal(recommendation.route, 'prompts');
});

test('workflow task builder creates the remaining stage plan and locks future stages', () => {
  const workspace = createSeedWorkspace();
  const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  const tasks = buildWorkflowTasks(workspace, project, '2026-08-07');
  assert.equal(tasks[0].sourceStatus, 'script-approved');
  assert.equal(tasks[0].targetStatus, 'storyboard');
  assert.equal(tasks.at(-1).sourceStatus, 'repurpose');
  assert.equal(tasks.at(-1).targetStatus, 'archived');
  assert.equal(taskIsUnlocked(tasks[0], project), true);
  assert.equal(taskIsUnlocked(tasks[1], project), false);
  assert.ok(tasks.every((task) => task.autoGenerated && task.projectId === project.id));
});

test('rebuilding a workflow replaces only the project auto-generated plan', () => {
  const workspace = createSeedWorkspace();
  const manualTaskCount = workspace.calendarTasks.filter((task) => !task.autoGenerated).length;
  const rebuilt = rebuildWorkflowTasks(workspace, wojtekProjectId, '2026-08-07');
  assert.ok(rebuilt.length > 0);
  assert.equal(workspace.calendarTasks.filter((task) => !task.autoGenerated).length, manualTaskCount);
  assert.equal(workspace.calendarTasks.filter((task) => task.projectId === wojtekProjectId && task.autoGenerated).length, rebuilt.length);
});

test('Sources Verified completion gate blocks missing evidence then passes with research, source and fact-check', () => {
  const workspace = createSeedWorkspace();
  const base = workspace.projects.find((item) => item.id === wojtekProjectId);
  const project = { ...structuredClone(base), status: 'researching', researchSummary: '', factCheckSummary: '', sourceIds: [] };
  const blocked = workflowReadiness(workspace, project, 'sources-verified');
  assert.equal(blocked.ready, false);
  assert.equal(blocked.blockers.length, 3);
  project.researchSummary = 'Verified research summary.';
  project.factCheckSummary = 'Claims classified and checked.';
  project.sourceIds = ['source_1'];
  const ready = workflowReadiness(workspace, project, 'sources-verified');
  assert.equal(ready.ready, true);
  assert.equal(ready.completed.length, 3);
});

test('prompt completion types map to the stage they are allowed to complete', () => {
  const workspace = createSeedWorkspace();
  const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  assert.equal(promptCompletionStatus('topic-research', project), 'researching');
  assert.equal(promptCompletionStatus('fact-check', project), 'sources-verified');
  assert.equal(promptCompletionStatus('storyboard', project), 'storyboard');
  assert.equal(promptCompletionStatus('ai-video', project), 'assets-needed');
  assert.equal(promptCompletionStatus('capcut-standard', project), 'capcut-draft');
  assert.equal(promptCompletionStatus('analytics-postmortem', project), 'repurpose');
  assert.equal(promptCompletionStatus('repurposing', project), 'archived');
  assert.equal(promptCompletionStatus('thumbnail-title', project), undefined);
});

test('syncing the next mission completes past tasks and returns the exact current-stage task', () => {
  const workspace = createSeedWorkspace();
  const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  rebuildWorkflowTasks(workspace, project.id, '2026-08-07');
  project.status = 'assets-needed';
  const current = syncNextWorkflowMission(workspace, project.id);
  assert.equal(current?.sourceStatus, 'assets-needed');
  assert.equal(current?.targetStatus, 'capcut-draft');
  const past = workspace.calendarTasks.filter((task) => task.projectId === project.id && task.autoGenerated && ['script-approved', 'storyboard'].includes(task.sourceStatus));
  assert.ok(past.length >= 2);
  assert.ok(past.every((task) => task.completed && task.completedAt));
});

test('schema v1 migration adds focus, workflow artifact fields and a current mission', () => {
  const legacy = structuredClone(createSeedWorkspace());
  legacy.schemaVersion = 1;
  delete legacy.focus;
  for (const project of legacy.projects) {
    delete project.researchSummary;
    delete project.factCheckSummary;
    delete project.assetPrompts;
    delete project.capcutBrief;
    delete project.analyticsPostmortem;
    delete project.repurposingPlan;
    delete project.workflowEvents;
  }
  const migrated = migrateWorkspace(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.ok(migrated.focus.activeChannelId);
  assert.ok(migrated.focus.activeProjectId);
  for (const project of migrated.projects) {
    assert.equal(typeof project.researchSummary, 'string');
    assert.equal(typeof project.factCheckSummary, 'string');
    assert.ok(Array.isArray(project.assetPrompts));
    assert.equal(typeof project.capcutBrief, 'string');
    assert.equal(typeof project.analyticsPostmortem, 'string');
    assert.equal(typeof project.repurposingPlan, 'string');
    assert.ok(Array.isArray(project.workflowEvents));
  }
  const activeProject = focusedProject(migrated);
  assert.ok(migrated.calendarTasks.some((task) => task.projectId === activeProject.id && task.sourceStatus === activeProject.status && !task.completed));
  assert.equal(validateWorkspace(migrated).valid, true);
});

test('CapCut Draft cannot advance to Editing until a real ledger entry exists', () => {
  const workspace = createSeedWorkspace();
  const base = workspace.projects.find((item) => item.id === wojtekProjectId);
  const project = { ...structuredClone(base), status: 'capcut-draft', capcutBrief: 'Approved CapCut production brief.' };
  workspace.credits = workspace.credits.filter((entry) => entry.projectId !== project.id);
  assert.equal(workflowReadiness(workspace, project, 'editing').ready, false);
  workspace.credits.push({
    id: 'credit_test', projectId: project.id, channelId: project.channelId, createdAt: new Date().toISOString(),
    balanceBefore: 100, balanceAfter: 90, tool: 'video-clip', mode: 'standard', model: 'Test',
    durationSeconds: 5, resolution: '720p', soundEnabled: false, generations: 1, regenerations: 0,
    usableOutputs: 1, completedVideo: false, visualStyle: 'Documentary', notes: 'Test ledger',
  });
  assert.equal(workflowReadiness(workspace, project, 'editing').ready, true);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`\n${passed}/${tests.length} domain tests passed.`);
