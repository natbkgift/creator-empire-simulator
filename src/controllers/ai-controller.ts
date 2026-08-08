import { getWorkspace, updateWorkspace, awardXp } from '../app/store.js';
import { parseRoute, navigate } from '../app/router.js';
import { requestRender } from '../app/runtime.js';
import { activeProject } from '../app/selectors.js';
import { applyProjectFocus } from '../domain/focus.js';
import { promptTypes } from '../domain/prompts.js';
import { uid, isRecord, escapeHtml } from '../domain/utils.js';
import { workflowRecommendation, promptCompletionStatus, workflowReadiness, recordWorkflowEvent, syncNextWorkflowMission } from '../domain/workflow.js';
import { showToast, confirmDialog } from '../ui/feedback.js';
import { validatePromptResponse } from '../domain/validation.js';
import type { PromptType, Language, PromptTemplate, ProjectStatus, SourceRecord } from '../domain/types.js';
import { stringFrom } from './helpers.js';

let promptParseMessage = '';

export const getParseMessage = (): string => promptParseMessage;
export const setParseMessage = (msg: string): void => { promptParseMessage = msg; };

export const savePrompt = (): void => {
  const workspace = getWorkspace();
  const route = parseRoute();
  const projectId = route.params.get('project') ?? activeProject(workspace)?.id;
  const project = workspace.projects.find((item) => item.id === projectId);
  const body = document.querySelector<HTMLTextAreaElement>('#prompt-output')?.value.trim() ?? '';
  const type = (route.params.get('type') || workflowRecommendation(workspace, project ?? workspace.projects[0]).promptType || 'shorts-script') as PromptType;
  const language = (route.params.get('lang') === 'th' ? 'th' : project?.language ?? 'en') as Language;
  if (!body) { showToast('Prompt ว่าง ไม่สามารถบันทึกได้', 'warning'); return; }
  const now = new Date().toISOString();
  const prompt: PromptTemplate = { id: uid('prompt'), name: `${promptTypes.find((item) => item.id === type)?.name ?? type} · ${project?.title ?? 'Studio'}`, type, language, body, projectId: project?.id, createdAt: now, updatedAt: now };
  updateWorkspace((draft) => {
    draft.prompts.push(prompt);
    const target = draft.projects.find((item) => item.id === project?.id);
    if (target) { target.promptVersions.push(prompt.id); applyProjectFocus(draft, target.id); }
    awardXp(draft, `prompt:${prompt.id}`, 20, type.includes('script') ? 'scriptWriting' : 'storytelling');
  });
  showToast('บันทึก Prompt template แล้ว');
};

export const parseAndApplyPromptResponse = (): void => {
  const text = document.querySelector<HTMLTextAreaElement>('#prompt-response')?.value ?? '';
  const workspace = getWorkspace();
  const route = parseRoute();
  const projectId = route.params.get('project') ?? activeProject(workspace)?.id;
  const project = workspace.projects.find((item) => item.id === projectId);
  const requestedType = route.params.get('type');
  const type = (promptTypes.some((item) => item.id === requestedType) ? requestedType : workflowRecommendation(workspace, project ?? workspace.projects[0]).promptType ?? 'shorts-script') as PromptType;
  const validation = validatePromptResponse(text, type);
  if (!validation.valid || !validation.parsed) {
    promptParseMessage = validation.error ?? 'Invalid JSON'; requestRender(); showToast('JSON response ไม่ผ่านการตรวจ', 'warning'); return;
  }
  const parsed = validation.parsed;
  if (!project) { promptParseMessage = 'JSON valid แต่ไม่มี Active Project สำหรับ Apply'; requestRender(); return; }
  const changed: string[] = [];
  let advancedTo: ProjectStatus | undefined;
  let nextTaskId: string | undefined;
  let blocker = '';
  updateWorkspace((draft) => {
    const target = draft.projects.find((item) => item.id === project.id);
    if (!target) return;
    const firstString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
    const stringList = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim() : isRecord(item) ? firstString(item.text) || firstString(item.prompt) || JSON.stringify(item) : '').filter(Boolean) : [];
    const readableList = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim() : isRecord(item) ? Object.entries(item).map(([key, entry]) => `${key}: ${typeof entry === 'string' ? entry : JSON.stringify(entry)}`).join(' · ') : '').filter(Boolean) : [];
    const appendSection = (base: string, label: string, values: string[]): string => values.length ? `${base}${base ? '\n\n' : ''}${label}:\n${values.map((item) => `- ${item}`).join('\n')}` : base;
    const providerGenerated = firstString(parsed._providerGenerated);
    const groundedSearchQueries = typeof parsed._groundedSearchQueries === 'number' ? Math.max(0, parsed._groundedSearchQueries) : 0;
    const attachSources = (value: unknown): void => {
      if (!Array.isArray(value)) return;
      if (providerGenerated && groundedSearchQueries === 0) {
        const suggestions = readableList(value);
        if (type === 'fact-check') target.factCheckSummary = appendSection(target.factCheckSummary, 'AI source suggestions — verify manually', suggestions);
        else target.researchSummary = appendSection(target.researchSummary, 'AI source suggestions — verify manually', suggestions);
        if (suggestions.length) changed.push('unverified source suggestions');
        return;
      }
      let attached = 0;
      value.forEach((item) => {
        if (!isRecord(item)) return;
        const title = firstString(item.title) || firstString(item.publisher) || 'Untitled source';
        const url = firstString(item.url);
        const existing = draft.sources.find((source) => source.projectId === target.id && ((url && source.url === url) || (!url && source.title === title)));
        const source: SourceRecord = existing ?? {
          id: uid('source'), projectId: target.id, title, url, publisher: firstString(item.publisher), accessedAt: new Date().toISOString(),
          claimType: ['documented', 'reported', 'disputed', 'context'].includes(firstString(item.claimType)) ? firstString(item.claimType) as SourceRecord['claimType'] : 'context',
          notes: `${groundedSearchQueries ? `[Web search grounded: ${providerGenerated === 'openai' ? 'OpenAI' : providerGenerated === 'gemini' ? 'Google' : 'provider'}] ` : ''}${firstString(item.notes) || firstString(item.evidence)}`.trim(),
        };
        if (!existing) draft.sources.push(source);
        if (!target.sourceIds.includes(source.id)) { target.sourceIds.push(source.id); attached += 1; }
      });
      if (attached) changed.push(`${attached} grounded source${attached === 1 ? '' : 's'}`);
    };

    if (typeof parsed.title === 'string' && parsed.title.trim()) { target.title = parsed.title.trim(); changed.push('title'); }
    if (type === 'niche-research' || type === 'competitor-pattern') {
      let summary = firstString(parsed.summary) || target.researchSummary;
      summary = appendSection(summary, 'Topic clusters', readableList(parsed.topicClusters));
      summary = appendSection(summary, 'Validation sprint', readableList(parsed.validationSprint));
      summary = appendSection(summary, 'Patterns', readableList(parsed.patterns));
      summary = appendSection(summary, 'Transformed principles', readableList(parsed.transformedPrinciples));
      summary = appendSection(summary, 'Risks', readableList(parsed.risks));
      target.researchSummary = summary;
      changed.push(type === 'niche-research' ? 'niche research' : 'competitor patterns');
      attachSources(parsed.sources);
    }
    if (type === 'topic-research') {
      target.researchSummary = firstString(parsed.summary) || firstString(parsed.researchSummary) || target.researchSummary;
      target.researchSummary = appendSection(target.researchSummary, 'Verified facts', readableList(parsed.verifiedFacts));
      target.researchSummary = appendSection(target.researchSummary, 'Disputed claims', readableList(parsed.disputedClaims));
      if (target.researchSummary) changed.push('research');
      attachSources(parsed.sources);
    }
    if (type === 'fact-check') {
      target.factCheckSummary = firstString(parsed.safeSummary) || firstString(parsed.factCheckSummary) || firstString(parsed.summary) || target.factCheckSummary;
      target.factCheckSummary = appendSection(target.factCheckSummary, 'Claims', readableList(parsed.claims));
      target.factCheckSummary = appendSection(target.factCheckSummary, 'Blocking issues', readableList(parsed.blockingIssues));
      if (target.factCheckSummary) changed.push('fact-check');
      attachSources(parsed.sources);
    }
    if (typeof parsed.hook === 'string' && parsed.hook.trim()) { target.hook = parsed.hook.trim(); changed.push('hook'); }
    if (Array.isArray(parsed.hooks)) {
      const hooks = parsed.hooks.map((item) => typeof item === 'string' ? item.trim() : isRecord(item) ? firstString(item.text) : '').filter(Boolean);
      const recommendedIndex = typeof parsed.recommendedIndex === 'number' ? Math.max(0, Math.min(hooks.length - 1, Math.trunc(parsed.recommendedIndex))) : 0;
      if (hooks[recommendedIndex]) { target.hook = hooks[recommendedIndex]; changed.push('hook'); }
    }
    if (typeof parsed.script === 'string' && parsed.script.trim()) { target.script = parsed.script.trim(); target.scriptVersion += 1; changed.push('script'); }
    if ((type === 'shorts-script' || type === 'long-script') && Array.isArray(parsed.factCaveats)) {
      target.factCheckSummary = appendSection(target.factCheckSummary, 'Script fact caveats', readableList(parsed.factCaveats));
      changed.push('fact caveats');
    }
    const storyboard = Array.isArray(parsed.storyboard) ? parsed.storyboard : Array.isArray(parsed.scenes) ? parsed.scenes : undefined;
    if (storyboard) { target.storyboard = storyboard.map((item) => typeof item === 'string' ? item : JSON.stringify(item)); changed.push('storyboard'); }
    const assets = readableList(parsed.assetPrompts);
    const continuity = readableList(parsed.continuityRules).map((item) => `[Continuity] ${item}`);
    if (assets.length || continuity.length) { target.assetPrompts = [...assets, ...continuity]; changed.push('asset prompts'); }
    if (typeof parsed.capcutBrief === 'string' && parsed.capcutBrief.trim()) { target.capcutBrief = parsed.capcutBrief.trim(); changed.push('CapCut brief'); }
    const titles = [firstString(parsed.recommendedTitle), ...stringList(parsed.thumbnailTitles), ...stringList(parsed.titles)].filter(Boolean);
    const thumbnailConcepts = stringList(parsed.thumbnailConcepts);
    if (titles.length || thumbnailConcepts.length) { target.thumbnailVersions.push(...titles, ...thumbnailConcepts); changed.push('titles/thumbnails'); }
    if (type === 'analytics-postmortem') {
      const diagnosis = readableList(parsed.diagnosis);
      target.analyticsPostmortem = firstString(parsed.analyticsPostmortem) || diagnosis.join('\n') || firstString(parsed.summary) || target.analyticsPostmortem;
      target.analyticsPostmortem = appendSection(target.analyticsPostmortem, 'Next actions', readableList(parsed.nextActions));
      target.analyticsPostmortem = appendSection(target.analyticsPostmortem, 'Next video ideas', readableList(parsed.nextVideoIdeas));
      if (target.analyticsPostmortem) { target.lessonsLearned = target.analyticsPostmortem; changed.push('post-mortem'); }
    }
    if (type === 'repurposing') {
      const plans = readableList(parsed.platformPlans);
      target.repurposingPlan = firstString(parsed.repurposingPlan) || plans.join('\n') || target.repurposingPlan;
      if (target.repurposingPlan) changed.push('repurposing plan');
    }
    if (type === 'next-video' && Array.isArray(parsed.nextVideoIdeas)) {
      target.lessonsLearned = `${target.lessonsLearned}${target.lessonsLearned ? '\n\n' : ''}Next-video recommendations:\n${readableList(parsed.nextVideoIdeas).join('\n')}`;
      changed.push('next-video recommendations');
    }
    target.updatedAt = new Date().toISOString();
    recordWorkflowEvent(target, { type: 'prompt-applied', note: `${type}: ${changed.join(', ') || 'JSON saved'}`, promptType: type });
    awardXp(draft, `parsed-response:${target.id}:${type}:${target.status}`, 25, type.includes('script') ? 'scriptWriting' : type === 'fact-check' || type === 'topic-research' ? 'research' : 'storytelling');

    const recommendation = workflowRecommendation(draft, target);
    const targetStatus = promptCompletionStatus(type, target);
    const compatible = recommendation.promptType === type
      || (recommendation.promptType === 'ai-image' && type === 'ai-video')
      || (recommendation.promptType?.startsWith('capcut-') && type.startsWith('capcut-'));
    if (compatible && targetStatus === recommendation.targetStatus) {
      const readiness = workflowReadiness(draft, target, targetStatus);
      if (readiness.ready) {
        const previous = target.status;
        const task = draft.calendarTasks.find((item) => item.projectId === target.id && !item.completed && item.sourceStatus === previous);
        if (task) { task.completed = true; task.completedAt = new Date().toISOString(); }
        target.status = targetStatus;
        advancedTo = targetStatus;
        recordWorkflowEvent(target, { type: 'mission-completed', note: recommendation.title, fromStatus: previous, toStatus: targetStatus, promptType: type, taskId: task?.id });
        recordWorkflowEvent(target, { type: 'stage-advanced', note: `Advanced to ${targetStatus}`, fromStatus: previous, toStatus: targetStatus });
        awardXp(draft, `mission:${target.id}:${targetStatus}`, recommendation.xp, recommendation.taskType === 'research' ? 'research' : recommendation.taskType === 'analytics' ? 'analytics' : recommendation.taskType === 'editing' ? 'editing' : 'consistency');
        const next = syncNextWorkflowMission(draft, target.id); nextTaskId = next?.id; applyProjectFocus(draft, target.id, next?.id);
      } else { blocker = readiness.blockers[0] ?? ''; applyProjectFocus(draft, target.id); }
    } else applyProjectFocus(draft, target.id);
  });
  promptParseMessage = changed.length ? `JSON valid · applied ${changed.join(', ')}${advancedTo ? ` · advanced to ${advancedTo}` : ''}` : `JSON valid · no recognized fields. Keys: ${Object.keys(parsed).join(', ')}`;
  showToast(advancedTo ? `บันทึกผลลัพธ์และเลื่อนไป ${advancedTo}` : blocker || (changed.length ? 'Parse และ Apply ผลลัพธ์แล้ว' : 'JSON ถูกต้อง แต่ไม่มี Field ที่ระบบนำไปใช้ต่อ'), blocker ? 'warning' : changed.length ? 'success' : 'info');
  if (advancedTo) navigate('mission', { project: project.id, task: nextTaskId }); else requestRender();
};

const renderRunLedger = (payload: unknown): string => {
  if (!isRecord(payload)) return '';
  const daily = typeof payload.dailySpendUsd === 'number' ? payload.dailySpendUsd : 0;
  const monthly = typeof payload.monthlySpendUsd === 'number' ? payload.monthlySpendUsd : 0;
  const runs = Array.isArray(payload.runs) ? payload.runs.slice(0, 5) : [];
  return `<div class="divider"></div><div class="row between wrap"><strong>AI cost ledger</strong><span>$${daily.toFixed(4)} today · $${monthly.toFixed(4)} month</span></div><div class="stack tight">${runs.map((raw) => {
    const run = isRecord(raw) ? raw : {};
    const provider = typeof run.provider === 'string' ? run.provider : 'AI';
    const model = typeof run.model === 'string' ? run.model : '';
    const input = typeof run.inputTokens === 'number' ? run.inputTokens : 0;
    const output = typeof run.outputTokens === 'number' ? run.outputTokens : 0;
    const searches = typeof run.searchQueries === 'number' ? run.searchQueries : 0;
    const cost = typeof run.estimatedCostUsd === 'number' ? run.estimatedCostUsd : 0;
    return `<div class="secret-status-row ${run.ok ? 'configured' : ''}"><b>${escapeHtml(provider.toUpperCase())}</b><span>${escapeHtml(model)} · ${input}/${output} tokens${searches ? ` · ${searches} searches` : ''} · $${cost.toFixed(4)}</span></div>`;
  }).join('') || '<span class="muted small-copy">No AI runs yet.</span>'}</div>`;
};

export const renderSecretStatus = (payload: unknown, runPayload?: unknown): void => {
  const target = document.querySelector<HTMLElement>('#ai-secret-status');
  if (!target || !isRecord(payload)) return;
  const providers = isRecord(payload.providers) ? payload.providers : isRecord(payload.secrets) ? payload.secrets : {};
  const row = (provider: 'openai' | 'gemini'): string => {
    const info = isRecord(providers[provider]) ? providers[provider] : {};
    const configured = Boolean(info.configured);
    const masked = typeof info.maskedKey === 'string' && info.maskedKey ? info.maskedKey : '—';
    const source = typeof info.source === 'string' ? info.source : 'none';
    const detail = configured ? `${source === 'environment' ? 'Environment · persistent' : 'Session memory · clears on server exit'} · ${masked}` : 'Not configured';
    return `<div class="secret-status-row ${configured ? 'configured':''}"><b>${provider.toUpperCase()}</b><span>${escapeHtml(detail)}</span></div>`;
  };
  target.innerHTML = row('openai') + row('gemini') + (runPayload ? renderRunLedger(runPayload) : '');
};

export const refreshAiStatus = async (): Promise<void> => {
  try {
    const [secretResponse, runResponse] = await Promise.all([fetch('/api/secrets'), fetch('/api/ai/runs')]);
    if (!secretResponse.ok) throw new Error(`${secretResponse.status} ${secretResponse.statusText}`);
    renderSecretStatus(await secretResponse.json(), runResponse.ok ? await runResponse.json() : undefined);
  } catch (error) {
    const target = document.querySelector<HTMLElement>('#ai-secret-status');
    if (target) target.textContent = `Local AI server unavailable: ${error instanceof Error ? error.message : 'unknown error'}`;
    showToast('เชื่อม Local AI server ไม่ได้', 'warning');
  }
};

export const saveAiSecret = async (form: HTMLFormElement): Promise<void> => {
  const data = new FormData(form);
  const provider = stringFrom(data, 'provider') === 'gemini' ? 'gemini' : 'openai';
  const apiKey = stringFrom(data, 'apiKey');
  if (!apiKey) { showToast('ใส่ API key สำหรับ session นี้ก่อน', 'warning'); return; }
  try {
    const response = await fetch('/api/secrets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, apiKey }) });
    if (!response.ok) throw new Error(await response.text());
    renderSecretStatus(await response.json());
    form.reset();
    showToast(`${provider.toUpperCase()} key พร้อมใช้ใน memory จนกว่าจะปิด Local Server`);
  } catch (error) {
    showToast(`ตั้งค่า session key ไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown error'}`, 'danger');
  }
};

export const selectedProviderFromSettingsForm = (): 'openai' | 'gemini' => {
  const form = document.querySelector<HTMLFormElement>('[data-form="ai-secret"]');
  const value = form ? stringFrom(new FormData(form), 'provider') : getWorkspace().settings.aiProvider;
  return value === 'gemini' ? 'gemini' : 'openai';
};

export const testAiProvider = async (): Promise<void> => {
  const provider = selectedProviderFromSettingsForm();
  const workspace = getWorkspace();
  const model = provider === 'openai' ? workspace.settings.openAiModel : workspace.settings.geminiModel;
  try {
    const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, model, maxOutputTokens: 512, prompt: 'Return only this JSON: {"ok":true,"message":"connected"}' }) });
    const payload = await response.json() as { ok?: boolean; text?: string; error?: string; model?: string; estimatedCostUsd?: number };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? JSON.stringify(payload).slice(0,180));
    showToast(`${provider.toUpperCase()} test สำเร็จ · ${payload.model ?? model}${typeof payload.estimatedCostUsd === 'number' ? ` · ~$${payload.estimatedCostUsd.toFixed(4)}` : ''}`);
    await refreshAiStatus();
  } catch (error) {
    showToast(`${provider.toUpperCase()} test ไม่ผ่าน: ${error instanceof Error ? error.message : 'unknown error'}`, 'danger');
  }
};

export const clearAiKey = async (): Promise<void> => {
  const provider = selectedProviderFromSettingsForm();
  if (!(await confirmDialog('Clear session key', `ลบ ${provider.toUpperCase()} key ออกจาก memory ของ Local Server? Environment variable จะไม่ถูกแก้ไข`, 'Clear session key'))) return;
  try {
    const response = await fetch(`/api/secrets/${provider}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await response.text());
    renderSecretStatus(await response.json());
    showToast(`ล้าง ${provider.toUpperCase()} session key แล้ว`);
  } catch (error) {
    showToast(`ล้าง key ไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown error'}`, 'danger');
  }
};

export const generateCurrentPromptWithAi = async (): Promise<void> => {
  const workspace = getWorkspace();
  const prompt = document.querySelector<HTMLTextAreaElement>('#prompt-output')?.value ?? '';
  const output = document.querySelector<HTMLTextAreaElement>('#prompt-response');
  if (!prompt || !output) { showToast('ไม่มี Prompt สำหรับ Generate', 'warning'); return; }
  if (workspace.settings.workflowMode !== 'automatic') { showToast('เปิด AI Assisted ที่ Settings ก่อน', 'warning'); return; }
  const provider = workspace.settings.aiProvider;
  const model = provider === 'openai' ? workspace.settings.openAiModel : workspace.settings.geminiModel;
  const routeType = parseRoute().params.get('type');
  const promptType = (promptTypes.some((item) => item.id === routeType) ? routeType : undefined) as PromptType | undefined;
  const useAdvancedModel = provider === 'openai' && Boolean(document.querySelector<HTMLInputElement>('#openai-terra-override')?.checked);
  output.value = `Generating with ${provider === 'openai' ? (useAdvancedModel ? 'OpenAI Terra' : 'OpenAI router') : provider.toUpperCase()}…`;
  try {
    const response = await fetch('/api/ai/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, model, prompt, promptType, useAdvancedModel, maxOutputTokens: workspace.settings.aiMaxOutputTokens ?? 2500 }),
    });
    const payload = await response.json() as { ok?: boolean; text?: string; error?: string; model?: string; modelTier?: string; reasoningEffort?: string; inputTokens?: number; outputTokens?: number; searchQueries?: number; estimatedCostUsd?: number };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? JSON.stringify(payload).slice(0,240));
    output.value = payload.text ?? '';
    showToast(`AI response พร้อม Parse · ${payload.model ?? provider.toUpperCase()}${payload.modelTier ? ` (${payload.modelTier})` : ''} · ${payload.inputTokens ?? 0}/${payload.outputTokens ?? 0} tokens${payload.searchQueries ? ` · ${payload.searchQueries} searches` : ''}${typeof payload.estimatedCostUsd === 'number' ? ` · ~$${payload.estimatedCostUsd.toFixed(4)}` : ''}`);
  } catch (error) {
    output.value = '';
    showToast(`AI Generate ไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown error'}`, 'danger');
  }
};
