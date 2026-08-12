import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedIdeas, ideaCategories } from '../dist/src/seed/ideas.js';
import { createSeedWorkspace } from '../dist/src/seed/demo.js';
import { calculateScore, compareIdeaLanguages } from '../dist/src/domain/scoring.js';
import { generateBlueprint } from '../dist/src/domain/blueprint.js';
import { generatePrompt, promptTypes, recommendCapCutMode } from '../dist/src/domain/prompts.js';
import { defaultSimulationInputs, runSimulation } from '../dist/src/domain/simulator.js';
import { validatePromptResponse, validateWorkspace } from '../dist/src/domain/validation.js';
import { applyChannelFocus, applyPortfolioFocus, applyProjectFocus, focusedChannel, focusedProject, focusedProjects, focusedTasks } from '../dist/src/domain/focus.js';
import {
  buildWorkflowTasks, promptCompletionStatus, rebuildWorkflowTasks, rescheduleProjectWorkflow,
  requiredPolicyChecks, isProductionComplete, syncNextWorkflowMission, taskIsUnlocked,
  mediaArtifactReadiness, policyRiskLevel, workflowReadiness, workflowRecommendation, workflowStatuses, productionStatuses, growthStatuses,
} from '../dist/src/domain/workflow.js';
import { migrateWorkspace } from '../dist/src/domain/migration.js';
import { aiWorkflowCoverage, promptResponseContracts } from '../dist/src/domain/ai-contracts.js';
import { clearPendingRequest, clearRequestKey, getOrCreateRequestKey, loadPendingRequest, peekRequestKey, requestFingerprint, savePendingRequest } from '../dist/src/domain/request-idempotency.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const historyChannelId = 'channel_history_lab';
const aiChannelId = 'channel_flowbiz_ai';
const wojtekProjectId = 'project_wojtek_short';
const aiProjectId = 'project_ai_boring_task';

const migratedSeed = () => migrateWorkspace(createSeedWorkspace());

const addReviewedMedia = (project) => {
  const digest = 'a'.repeat(64);
  project.mediaArtifacts = ['voice', 'captions', 'render'].map((kind) => ({
    id: `${kind}-${project.id}`, projectId: project.id, kind, sha256: digest, status: 'reviewed',
    language: project.language, createdAt: '2026-08-12T00:00:00Z',
  }));
  project.mediaQa = {
    reviewedAt: '2026-08-12T00:10:00Z', reviewer: 'owner', result: 'pass',
    artifactDigests: { voice: digest, captions: digest, render: digest },
    checks: { brand: true, duration: true, resolution: true, audio: true, captionSync: true, language: true },
  };
};

test('request keys survive ambiguous retries and clear only after reconciliation', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const first = getOrCreateRequestKey(storage, 'autopilot-create', () => 'first-uuid');
  const repeated = getOrCreateRequestKey(storage, 'autopilot-create', () => 'second-uuid');
  assert.equal(first, repeated);
  assert.equal(peekRequestKey(storage, 'autopilot-create'), first);
  clearRequestKey(storage, 'autopilot-create');
  assert.equal(peekRequestKey(storage, 'autopilot-create'), undefined);
  assert.notEqual(getOrCreateRequestKey(storage, 'autopilot-create', () => 'third-uuid'), first);
});

test('pending provider request retains the exact uploaded asset across response loss', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  savePendingRequest(storage, 'youtube-upload:job-1', { assetId: 'asset-1', jobId: 'job-1' });
  assert.deepEqual(loadPendingRequest(storage, 'youtube-upload:job-1'), { assetId: 'asset-1', jobId: 'job-1' });
  clearPendingRequest(storage, 'youtube-upload:job-1');
  assert.equal(loadPendingRequest(storage, 'youtube-upload:job-1'), undefined);
});

test('provider request scopes are stable per payload and isolated across payloads', () => {
  assert.equal(requestFingerprint({ topic: 'A', format: 'shorts' }), requestFingerprint({ topic: 'A', format: 'shorts' }));
  assert.equal(requestFingerprint({ topic: 'A', channel: { name: 'FlowBiz', key: 'business' } }), requestFingerprint({ channel: { key: 'business', name: 'FlowBiz' }, topic: 'A' }));
  assert.notEqual(requestFingerprint({ topic: 'A', format: 'shorts' }), requestFingerprint({ topic: 'B', format: 'shorts' }));
});

test('authoritative approval hydration preserves server identity without queueing a write', async () => {
  const { flushStore, getWorkspace, hydrateWorkspace } = await import('../dist/src/app/store.js');
  const authoritative = migratedSeed();
  authoritative.revision = 41;
  authoritative.updatedAt = '2026-08-11T22:00:00.000Z';
  hydrateWorkspace(authoritative);
  await flushStore();
  assert.equal(getWorkspace().revision, 41);
  assert.equal(getWorkspace().updatedAt, '2026-08-11T22:00:00.000Z');
});

test('approval waits for queued workspace saves before requesting server materialization', () => {
  const source = readFileSync(new URL('../src/controllers/autopilot-controller.ts', import.meta.url), 'utf8');
  const approval = source.slice(source.indexOf('const approveJob'), source.indexOf('const refreshYoutubeStatus'));
  assert.ok(approval.indexOf('await flushStore()') > 0);
  assert.ok(approval.indexOf('await flushStore()') < approval.indexOf('/approve'));
});

test('provider request identities persist across tabs and reset after definitive rejection', () => {
  const source = readFileSync(new URL('../src/controllers/autopilot-controller.ts', import.meta.url), 'utf8');
  assert.match(source, /window\.localStorage/);
  assert.match(source, /isDefinitiveRejection/);
  assert.match(source, /const channel = \{ key: selected\.key, name: selected\.name, niche: selected\.niche, promise: selected\.promise, aiFitScore: selected\.aiFitScore \}/);
  assert.match(source, /clearPendingRequest\(storage, requestScope\)/);
});

test('workspace persistence surfaces CAS conflicts and keeps SQLite authoritative on revision ties', () => {
  const source = readFileSync(new URL('../src/db/storage.ts', import.meta.url), 'utf8');
  const storeSource = readFileSync(new URL('../src/app/store.ts', import.meta.url), 'utf8');
  assert.match(source, /error instanceof ServerResponseError/);
  assert.match(source, /if \(ar !== br\) return ar > br \? a : b;\s*return a;/);
  assert.match(source, /Could not reconcile IndexedDB into SQLite[\s\S]*error instanceof ServerResponseError[\s\S]*throw error/);
  assert.match(source, /expectedRevision/);
  assert.doesNotMatch(source, /return workspace;\s*\n\s*}\s*;\s*\n\s*export const getRecoveryHistory/);
  assert.doesNotMatch(storeSource, /saveQueue\s*=\s*saveQueue\.catch/);
});

test('seed library contains 5 categories and 50 ideas', () => {
  assert.equal(ideaCategories.length, 5); assert.equal(seedIdeas.length, 50);
  for (const category of ideaCategories) assert.equal(seedIdeas.filter((idea) => idea.categoryId === category.id).length, 10);
});

test('all language scores stay in valid ranges', () => {
  for (const idea of seedIdeas) for (const language of ['en','th']) {
    const score = idea.score[language]; assert.ok(score.total >= 0 && score.total <= 100); assert.ok(score.estimatedCreditsHigh >= score.estimatedCreditsLow); assert.ok(score.productionMinutes > 0);
  }
});

test('all 16 AI prompt workflows have structured validation and persisted destinations', () => {
  assert.equal(promptTypes.length, 16);
  assert.deepEqual(new Set(promptTypes.map((item) => item.id)), new Set(Object.keys(promptResponseContracts)));
  assert.deepEqual(aiWorkflowCoverage, { promptTypes: 16, structuredContracts: 16, persistedContracts: 16 });
  for (const { id } of promptTypes) {
    const contract = promptResponseContracts[id];
    const response = JSON.stringify({ [contract.requiredAny[0]]: contract.requiredAny[0].endsWith('s') ? ['covered'] : 'covered' });
    assert.equal(validatePromptResponse(response, id).valid, true, id);
    assert.equal(validatePromptResponse('{"unrelated":true}', id).valid, false, id);
  }
});

test('weighted scoring and simulator remain deterministic', () => {
  const base = seedIdeas[0].score.en; assert.equal(calculateScore({ ...base, total: undefined }).total, base.total);
  const first = runSimulation(defaultSimulationInputs); const second = runSimulation(defaultSimulationInputs);
  assert.deepEqual(first.results, second.results); assert.equal(first.results.length, 4);
});

test('language comparison and blueprint remain production-ready', () => {
  assert.ok(['en','th'].includes(compareIdeaLanguages(seedIdeas[0]).winner));
  const blueprint = generateBlueprint(seedIdeas[0], 'en', 'both');
  assert.equal(blueprint.nameOptions.length, 10); assert.ok(blueprint.plan30Days.length >= 8); assert.ok(blueprint.factCheckWorkflow.length >= 3);
});

test('all 16 prompt workflows remain context-aware', () => {
  assert.equal(promptTypes.length, 16);
  const workspace = migratedSeed(); const channel = workspace.channels[0]; const project = workspace.projects[0];
  const idea = workspace.ideas.find((item) => item.id === project.ideaId);
  const prompt = generatePrompt({ type: 'shorts-script', language: 'en', idea, channel, project, workspace, advanced: true });
  assert.match(prompt, /SHORTS SCRIPT PROMPT/); assert.match(prompt, /Return valid JSON only/); assert.match(prompt, /red-team/i);
});

test('fact-check audits saved research before scripting without treating a missing script as a blocker', () => {
  const workspace = migratedSeed(); const channel = workspace.channels[0]; const project = workspace.projects[0];
  const idea = workspace.ideas.find((item) => item.id === project.ideaId);
  project.researchSummary = 'Saved research claim: human review remains required before publishing AI-assisted content.';
  project.script = '';
  workspace.sources.push({ id: 'source_fact_context', projectId: project.id, title: 'Authoritative workflow guide', url: 'https://example.com/workflow-guide', publisher: 'Example Publisher', accessedAt: '2026-08-09T00:00:00.000Z', claimType: 'context', notes: 'Supports the saved research claim.' });
  const prompt = generatePrompt({ type: 'fact-check', language: 'en', idea, channel, project, workspace });
  assert.match(prompt, /FACT-CHECK INPUT/); assert.match(prompt, /Saved research claim/); assert.match(prompt, /workflow-guide/);
  assert.match(prompt, /missing script is not a blocker/i); assert.doesNotMatch(prompt, /Audit every factual claim in the proposed story/);
});

test('CapCut mode keeps factual content controlled and product content Director-capable', () => {
  const workspace = migratedSeed(); const historyIdea = workspace.ideas.find((item) => item.categoryId === 'history');
  assert.equal(recommendCapCutMode(historyIdea, workspace.projects[0]).mode, 'standard');
  assert.equal(recommendCapCutMode(historyIdea, { ...workspace.projects[0], title: 'Property Project Advertisement' }).mode, 'director');
});

test('validation accepts legacy input then migrates it to schema v5 with Simple Mode compatibility', () => {
  const legacy = createSeedWorkspace(); assert.equal(validateWorkspace(legacy).valid, true);
  const migrated = migrateWorkspace(legacy); assert.equal(migrated.schemaVersion, 5); assert.equal(migrated.revision, 0);
  assert.ok(migrated.projects.every((project) => project.publishAt));
  assert.ok(migrated.projects.every((project) => project.autopilotPackage === undefined));
  assert.equal(migrated.settings.experienceMode, 'simple');
  assert.ok(migrated.settings.aiMaxOutputTokens > 0); assert.ok(migrated.settings.defaultPublishTime);
  assert.equal(validateWorkspace(migrated).valid, true); assert.equal(validateWorkspace({}).valid, false);
});

test('prompt JSON validation rejects malformed input', () => {
  assert.equal(validatePromptResponse('{"hook":"works"}').valid, true); assert.equal(validatePromptResponse('not-json').valid, false);
});

test('Channel Focus scopes projects/tasks and Active Project changes owning channel', () => {
  const workspace = migratedSeed(); applyChannelFocus(workspace, aiChannelId);
  assert.equal(focusedChannel(workspace)?.id, aiChannelId); assert.equal(focusedProject(workspace)?.id, aiProjectId);
  assert.ok(focusedProjects(workspace).every((project) => project.channelId === aiChannelId));
  const ids = new Set(focusedProjects(workspace).map((project) => project.id)); assert.ok(focusedTasks(workspace, false).every((task) => !task.projectId || ids.has(task.projectId)));
  applyProjectFocus(workspace, wojtekProjectId); assert.equal(workspace.focus.activeChannelId, historyChannelId);
});

test('Portfolio Focus exposes every project without discarding active project', () => {
  const workspace = migratedSeed(); const activeBefore = workspace.focus.activeProjectId; applyPortfolioFocus(workspace);
  assert.equal(focusedChannel(workspace), undefined); assert.equal(focusedProjects(workspace).length, workspace.projects.length); assert.equal(workspace.focus.activeProjectId, activeBefore);
});

test('workflow keeps 17 stages but splits production and growth semantics', () => {
  assert.equal(workflowStatuses.length, 17); assert.equal(productionStatuses.at(-1), 'published');
  assert.deepEqual(growthStatuses, ['analytics-review','repurpose','archived']);
  assert.deepEqual(workflowStatuses, ['idea-backlog','selected','researching','sources-verified','hook-ready','script-draft','script-approved','storyboard','assets-needed','capcut-draft','editing','qa','scheduled','published','analytics-review','repurpose','archived']);
});

test('pipeline maps Script Approved to Storyboard Prompt Studio mission', () => {
  const workspace = migratedSeed(); const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  const recommendation = workflowRecommendation(workspace, project);
  assert.equal(recommendation.targetStatus, 'storyboard'); assert.equal(recommendation.promptType, 'storyboard'); assert.equal(recommendation.route, 'prompts');
});

test('Shorts and Long-form templates use different production durations', () => {
  const workspace = migratedSeed(); const short = structuredClone(workspace.projects[0]); short.status = 'hook-ready'; short.format = 'shorts';
  const long = structuredClone(short); long.format = 'long';
  assert.ok(workflowRecommendation(workspace, long).minutes > workflowRecommendation(workspace, short).minutes);
});

test('capacity-aware planner puts upload at exact publish datetime', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]);
  project.status = 'selected'; project.publishAt = '2026-08-20T19:45'; project.deadline = '2026-08-20';
  const tasks = buildWorkflowTasks(workspace, project, '2026-08-07');
  const upload = tasks.find((task) => task.sourceStatus === 'scheduled');
  assert.equal(upload?.date, '2026-08-20'); assert.equal(upload?.startTime, '19:45');
  assert.ok(tasks.some((task) => task.templateKind === 'shorts'));
});

test('capacity conflict is flagged when workload cannot fit before publish', () => {
  const workspace = migratedSeed(); workspace.settings.weeklyHoursAvailable = 1;
  const project = structuredClone(workspace.projects[0]); project.status = 'selected'; project.publishAt = '2026-08-08T19:00'; project.deadline = '2026-08-08';
  const tasks = buildWorkflowTasks(workspace, project, '2026-08-07');
  assert.ok(tasks.some((task) => task.conflict));
});

test('reschedule changes publish time and rebuilds project workflow only', () => {
  const workspace = migratedSeed(); const manualBefore = workspace.calendarTasks.filter((task) => !task.autoGenerated).length;
  const tasks = rescheduleProjectWorkflow(workspace, wojtekProjectId, '2026-08-25T20:15', '2026-08-07');
  const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  assert.equal(project.publishAt, '2026-08-25T20:15'); assert.equal(project.deadline, '2026-08-25');
  assert.equal(tasks.find((task) => task.sourceStatus === 'scheduled')?.startTime, '20:15');
  assert.equal(workspace.calendarTasks.filter((task) => !task.autoGenerated).length, manualBefore);
});

test('future workflow tasks remain locked until their stage', () => {
  const workspace = migratedSeed(); const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  const tasks = buildWorkflowTasks(workspace, project, '2026-08-07');
  assert.equal(taskIsUnlocked(tasks[0], project), true); assert.equal(taskIsUnlocked(tasks[1], project), false);
});

test('evidence gate blocks missing research then passes complete evidence', () => {
  const workspace = migratedSeed(); const base = workspace.projects.find((item) => item.id === wojtekProjectId);
  const project = { ...structuredClone(base), status: 'researching', researchSummary: '', factCheckSummary: '', sourceIds: [] };
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').blockers.length, 3);
  const source = workspace.sources.find((item) => item.projectId === project.id);
  project.researchSummary='summary'; project.factCheckSummary='checked'; project.sourceIds=[source.id];
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').ready, true);
});

test('evidence gate rejects dangling source IDs and incomplete provenance', () => {
  const workspace = migratedSeed(); const base = workspace.projects.find((item) => item.id === wojtekProjectId);
  const project = { ...structuredClone(base), status: 'researching', researchSummary: 'summary', factCheckSummary: 'checked', sourceIds: ['missing-source'] };
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').ready, false);
  assert.match(workflowReadiness(workspace, project, 'sources-verified').blockers.join(' '), /provenance/i);

  const validSource = workspace.sources.find((item) => item.projectId === project.id);
  const foreignSource = { ...validSource, id: 'foreign-source', projectId: 'other-project' };
  workspace.sources.push(foreignSource);
  project.sourceIds = [validSource.id, 'missing-source'];
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').ready, false);
  project.sourceIds = [validSource.id, foreignSource.id];
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').ready, false);

  workspace.sources.push({ id: 'incomplete-source', projectId: project.id, title: 'Untitled evidence', url: '', publisher: '', accessedAt: '', claimType: 'context', notes: '' });
  project.sourceIds = ['incomplete-source'];
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').ready, false);
  assert.match(workflowReadiness(workspace, project, 'sources-verified').blockers.join(' '), /URL, publisher, and access date/);

  workspace.sources.push({ id: 'malformed-source', projectId: project.id, title: 'Malformed evidence', url: undefined, publisher: 'Publisher', accessedAt: '2026-08-12T00:00:00Z', claimType: 'context', notes: '' });
  project.sourceIds = ['malformed-source'];
  assert.doesNotThrow(() => workflowReadiness(workspace, project, 'sources-verified'));
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').ready, false);

  workspace.sources.push(null);
  project.sourceIds = [validSource.id];
  assert.doesNotThrow(() => workflowReadiness(workspace, project, 'sources-verified'));
  assert.equal(workflowReadiness(workspace, project, 'sources-verified').ready, true);
});

test('release gate requires every mandatory policy check, not arbitrary 6/8', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='qa'; project.riskLevel='low';
  addReviewedMedia(project);
  project.policyChecks = Object.fromEntries(requiredPolicyChecks.map((key) => [key, true]));
  project.policyEvidence = {
    aiDisclosureReviewed: 'Reviewed the final edit; no realistic synthetic reconstruction is present.',
    musicLicensed: 'Licensed music and footage recorded in the project rights log.',
    sensitiveContentReviewed: 'not-applicable: no sensitive content appears.',
    templateRiskReviewed: 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.',
    trademarkReviewed: 'not-applicable: no trademarked material appears.',
  };
  assert.equal(policyRiskLevel(project), 'low');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);
  project.policyEvidence = {};
  assert.equal(policyRiskLevel(project), 'high');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /musicLicensed check requires saved rights evidence/);
  project.policyEvidence.aiDisclosureReviewed = 'Reviewed the final edit; no realistic synthetic reconstruction is present.';
  project.policyEvidence.musicLicensed = 'Licensed music and footage recorded in the project rights log.';
  project.policyEvidence.sensitiveContentReviewed = 'not-applicable: no sensitive content appears.';
  project.policyEvidence.templateRiskReviewed = 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.';
  project.policyEvidence.trademarkReviewed = 'not-applicable: no trademarked material appears.';
  project.policyChecks.musicLicensed = false;
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /musicLicensed/);
});

test('release gate does not trust source and claim checkboxes without supporting artifacts', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='qa'; project.riskLevel='low';
  addReviewedMedia(project);
  project.policyChecks = Object.fromEntries(requiredPolicyChecks.map((key) => [key, true]));
  project.policyEvidence = {
    aiDisclosureReviewed: 'Reviewed the final edit; no realistic synthetic reconstruction is present.',
    musicLicensed: 'Licensed music and footage recorded in the project rights log.',
    sensitiveContentReviewed: 'not-applicable: no sensitive content appears.',
    templateRiskReviewed: 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.',
    trademarkReviewed: 'not-applicable: no trademarked material appears.',
  };
  project.sourceIds = [];
  project.factCheckSummary = '';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /source evidence/i);

  const source = workspace.sources.find((item) => item.projectId === project.id);
  project.sourceIds = [source.id];
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /fact-check artifact/i);

  project.factCheckSummary = 'Claims classified as documented, reported, disputed, or unsupported.';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);

  project.sourceIds = [source.id, 'missing-source'];
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  project.sourceIds = [source.id];
  project.factCheckSummary = 123;
  assert.doesNotThrow(() => workflowReadiness(workspace, project, 'scheduled'));
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);

  project.factCheckSummary = 'Claims classified as documented, reported, disputed, or unsupported.';
  project.script = '';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /originalScript check requires a saved script artifact/);
});

test('release gate requires a saved project disclosure decision for the AI review checkbox', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='qa'; project.riskLevel='low';
  addReviewedMedia(project);
  project.policyChecks = Object.fromEntries(requiredPolicyChecks.map((key) => [key, true]));
  project.policyEvidence = {
    musicLicensed: 'Licensed music and footage recorded in the project rights log.',
    sensitiveContentReviewed: 'not-applicable: no sensitive content appears.',
    templateRiskReviewed: 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.',
    trademarkReviewed: 'not-applicable: no trademarked material appears.',
  };

  assert.equal(policyRiskLevel(project), 'review');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /aiDisclosureReviewed check requires a saved disclosure decision/);

  project.policyEvidence.aiDisclosureReviewed = 'Reviewed the final edit; realistic synthetic reconstruction is disclosed at 00:18.';
  assert.equal(policyRiskLevel(project), 'low');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);
});

test('release gate requires saved project differentiation evidence for the template review checkbox', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='qa'; project.riskLevel='low';
  addReviewedMedia(project);
  project.policyChecks = Object.fromEntries(requiredPolicyChecks.map((key) => [key, true]));
  project.policyEvidence = {
    aiDisclosureReviewed: 'Reviewed the final edit; no realistic synthetic reconstruction is present.',
    musicLicensed: 'Licensed music and footage recorded in the project rights log.',
    sensitiveContentReviewed: 'not-applicable: no sensitive content appears.',
    trademarkReviewed: 'not-applicable: no trademarked material appears.',
  };

  assert.equal(policyRiskLevel(project), 'review');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /templateRiskReviewed check requires saved differentiation evidence/);

  project.policyEvidence.templateRiskReviewed = 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.';
  assert.equal(policyRiskLevel(project), 'low');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);
});

test('release gate requires explicit applicable or not-applicable decisions for conditional reviews', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='qa'; project.riskLevel='low';
  addReviewedMedia(project);
  project.policyChecks = Object.fromEntries(requiredPolicyChecks.map((key) => [key, true]));
  project.policyEvidence = {
    aiDisclosureReviewed: 'Reviewed the final edit; no realistic synthetic reconstruction is present.',
    musicLicensed: 'Licensed music and footage recorded in the project rights log.',
    templateRiskReviewed: 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.',
  };

  assert.equal(policyRiskLevel(project), 'review');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /sensitiveContentReviewed requires an applicable: or not-applicable: evidence decision/);

  project.policyEvidence.sensitiveContentReviewed = 'not-applicable: no real person, violence, health, financial, or legal claims appear.';
  project.policyEvidence.trademarkReviewed = 'not-applicable: no logo, trademark, product claim, or packaging appears.';
  assert.equal(policyRiskLevel(project), 'low');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);

  project.policyEvidence.trademarkReviewed = 'applicable: a product logo appears at 00:12 and was reviewed.';
  assert.equal(policyRiskLevel(project), 'review');
  project.policyChecks.trademarkReviewed = true;
  assert.equal(policyRiskLevel(project), 'low');
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);
});

test('release gate requires current sourced active policy records for every target platform', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='qa'; project.riskLevel='low';
  addReviewedMedia(project);
  project.policyChecks = Object.fromEntries(requiredPolicyChecks.map((key) => [key, true]));
  project.policyEvidence = {
    aiDisclosureReviewed: 'Reviewed the final edit; no realistic synthetic reconstruction is present.',
    musicLicensed: 'Licensed music and footage recorded in the project rights log.',
    sensitiveContentReviewed: 'not-applicable: no sensitive content appears.',
    templateRiskReviewed: 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.',
    trademarkReviewed: 'not-applicable: no trademarked material appears.',
  };

  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);
  workspace.policies.filter((rule) => rule.platform === 'tiktok').forEach((rule) => { rule.status = 'uncertain'; });
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /current sourced active policy record.*tiktok/i);

  const tiktokRule = workspace.policies.find((rule) => rule.platform === 'tiktok');
  tiktokRule.status = 'active';
  tiktokRule.sourceUrl = '';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  tiktokRule.sourceUrl = 'https://support.tiktok.com/policy';
  tiktokRule.lastVerifiedAt = 'invalid';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  tiktokRule.sourceUrl = 'https://%';
  tiktokRule.lastVerifiedAt = '2026-08-12';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  tiktokRule.sourceUrl = 'https://support.tiktok.com/policy';
  tiktokRule.lastVerifiedAt = '2026-02-30';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  project.platforms = ['YouTube + TikTok'];
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  tiktokRule.lastVerifiedAt = '0001-01-01';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);
  tiktokRule.lastVerifiedAt = '0000-01-01';
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
});

test('Published with real URL is Video Complete even while Growth Loop remains pending', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]);
  project.status='published'; project.publicationLinks=['https://youtube.com/watch?v=real']; project.productionCompletedAt=new Date().toISOString(); project.growthLoopStatus='pending';
  assert.equal(isProductionComplete(project), true); assert.equal(project.growthLoopStatus, 'pending');
  assert.equal(workflowRecommendation(workspace, project).targetStatus, 'analytics-review');
});

test('publication readiness requires a real publication URL field', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='scheduled'; project.publicationLinks=[];
  assert.equal(workflowReadiness(workspace, project, 'published').ready, false);
  project.publicationLinks=['https://example.com/video']; assert.equal(workflowReadiness(workspace, project, 'published').ready, true);
});

test('prompt completion types still map to intended stages', () => {
  const project = migratedSeed().projects[0];
  assert.equal(promptCompletionStatus('topic-research', project), 'researching'); assert.equal(promptCompletionStatus('storyboard', project), 'storyboard');
  assert.equal(promptCompletionStatus('capcut-standard', project), 'capcut-draft'); assert.equal(promptCompletionStatus('analytics-postmortem', project), 'repurpose');
  assert.equal(promptCompletionStatus('thumbnail-title', project), undefined);
});

test('sync next mission completes past tasks and returns current stage', () => {
  const workspace = migratedSeed(); const project = workspace.projects.find((item) => item.id === wojtekProjectId);
  rebuildWorkflowTasks(workspace, project.id, '2026-08-07'); project.status='assets-needed';
  const current = syncNextWorkflowMission(workspace, project.id); assert.equal(current?.sourceStatus, 'assets-needed'); assert.equal(current?.targetStatus, 'capcut-draft');
});

test('CapCut Draft cannot advance to Editing until cost ledger exists', () => {
  const workspace = migratedSeed(); const base = workspace.projects.find((item) => item.id === wojtekProjectId);
  const project = { ...structuredClone(base), status:'capcut-draft', capcutBrief:'Approved brief' };
  workspace.credits = workspace.credits.filter((entry) => entry.projectId !== project.id); assert.equal(workflowReadiness(workspace, project, 'editing').ready, false);
  workspace.credits.push({ id:'credit_test', projectId:project.id, channelId:project.channelId, createdAt:new Date().toISOString(), balanceBefore:100,balanceAfter:90,tool:'video-clip',mode:'standard',model:'Test',durationSeconds:5,resolution:'720p',soundEnabled:false,generations:1,regenerations:0,usableOutputs:1,completedVideo:false,visualStyle:'Documentary',notes:'' });
  assert.equal(workflowReadiness(workspace, project, 'editing').ready, true);
});

test('media artifact readiness requires project-scoped reviewed voice captions render and QA evidence', () => {
  const project = structuredClone(migratedSeed().projects[0]);
  assert.equal(mediaArtifactReadiness(project).ready, false);
  assert.match(mediaArtifactReadiness(project).blockers.join(' '), /voice/i);

  const artifact = (kind, language = project.language) => ({
    id: `${kind}-1`, projectId: project.id, kind, sha256: 'a'.repeat(64), status: 'reviewed', language,
    createdAt: '2026-08-12T00:00:00Z',
  });
  project.mediaArtifacts = [artifact('voice'), artifact('captions'), artifact('render')];
  project.mediaQa = {
    reviewedAt: '2026-08-12T00:10:00Z', reviewer: 'owner', result: 'pass',
    artifactDigests: { voice: 'a'.repeat(64), captions: 'a'.repeat(64), render: 'a'.repeat(64) },
    checks: { brand: true, duration: true, resolution: true, audio: true, captionSync: true, language: true },
  };
  assert.equal(mediaArtifactReadiness(project).ready, true);

  project.mediaArtifacts[2].projectId = 'other-project';
  assert.equal(mediaArtifactReadiness(project).ready, false);
  project.mediaArtifacts[2] = artifact('render');
  project.mediaArtifacts[1].sha256 = 'not-a-digest';
  assert.equal(mediaArtifactReadiness(project).ready, false);
  project.mediaArtifacts[1] = artifact('captions', project.language === 'en' ? 'th' : 'en');
  assert.equal(mediaArtifactReadiness(project).ready, false);
  project.mediaArtifacts[1] = artifact('captions');
  project.mediaQa.checks.captionSync = false;
  assert.equal(mediaArtifactReadiness(project).ready, false);
  project.mediaQa.checks.captionSync = true;
  project.mediaQa.checks = null;
  assert.doesNotThrow(() => mediaArtifactReadiness(project));
  assert.equal(mediaArtifactReadiness(project).ready, false);
  project.mediaQa.checks = { a: true, b: true, c: true, d: true, e: true, f: true };
  assert.equal(mediaArtifactReadiness(project).ready, false);
  project.mediaQa.reviewedAt = 7;
  assert.doesNotThrow(() => mediaArtifactReadiness(project));
  assert.equal(mediaArtifactReadiness(project).ready, false);
  project.mediaQa.reviewedAt = '2026-08-12T00:10:00Z';
  project.mediaQa.checks = { brand: true, duration: true, resolution: true, audio: true, captionSync: true, language: true };
  project.mediaQa.artifactDigests.render = 'b'.repeat(64);
  assert.equal(mediaArtifactReadiness(project).ready, false);
});

test('scheduled release is blocked until exact reviewed media artifacts and QA are present', () => {
  const workspace = migratedSeed(); const project = structuredClone(workspace.projects[0]); project.status='qa'; project.riskLevel='low';
  project.policyChecks = Object.fromEntries(requiredPolicyChecks.map((key) => [key, true]));
  project.policyEvidence = {
    aiDisclosureReviewed: 'Reviewed the final edit; no realistic synthetic reconstruction is present.',
    musicLicensed: 'Licensed music and footage recorded in the project rights log.',
    sensitiveContentReviewed: 'not-applicable: no sensitive content appears.',
    templateRiskReviewed: 'Compared with the last five channel videos; opening, scene order, and visual treatment are distinct.',
    trademarkReviewed: 'not-applicable: no trademarked material appears.',
  };
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, false);
  assert.match(workflowReadiness(workspace, project, 'scheduled').blockers.join(' '), /reviewed voice artifact/i);
  addReviewedMedia(project);
  assert.equal(workflowReadiness(workspace, project, 'scheduled').ready, true);
});

let passed=0;
for (const {name,fn} of tests) {
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
console.log(`\n${passed}/${tests.length} domain tests passed.`);
