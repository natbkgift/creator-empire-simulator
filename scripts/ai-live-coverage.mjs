import fs from 'node:fs';
import { createSeedWorkspace } from '../dist/src/seed/demo.js';
import { generatePrompt, promptTypes } from '../dist/src/domain/prompts.js';
import { validatePromptResponse } from '../dist/src/domain/validation.js';

const baseUrl = (process.env.CREATOR_EMPIRE_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const provider = process.env.CREATOR_EMPIRE_AI_PROVIDER === 'gemini' ? 'gemini' : 'openai';
const model = process.env.CREATOR_EMPIRE_AI_MODEL || (provider === 'openai' ? 'gpt-5.6-luna' : 'gemini-3.5-flash');
const advancedModel = process.env.CREATOR_EMPIRE_AI_ADVANCED_MODEL || 'gpt-5.6-terra';
const advancedPromptTypes = new Set(['niche-research', 'fact-check', 'analytics-postmortem']);
const delayMs = Math.max(0, Number(process.env.CREATOR_EMPIRE_AI_TEST_DELAY_MS || 11000));
const requestedTypes = new Set((process.env.CREATOR_EMPIRE_AI_TEST_TYPES || '').split(',').map((item) => item.trim()).filter(Boolean));
const coverageTypes = requestedTypes.size ? promptTypes.filter((item) => requestedTypes.has(item.id)) : promptTypes;
const testMode = process.env.CREATOR_EMPIRE_AI_TEST_MODE === 'full' ? 'full' : 'contract';
const requestedOutputTokens = testMode === 'full' ? 8000 : 4000;
const authFile = process.env.CREATOR_EMPIRE_BASIC_AUTH_FILE;
const credentials = process.env.CREATOR_EMPIRE_BASIC_AUTH || (authFile ? fs.readFileSync(authFile, 'utf8').trim() : '');
const headers = { 'content-type': 'application/json' };
if (credentials) headers.authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
const isFlashLite = provider === 'gemini' && model.includes('flash-lite');

function qualitySignals(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { fields: 0, arrayItems: 0, textCharacters: 0, sourceUrls: 0 };
  const values = Object.values(parsed);
  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
  return {
    fields: Object.keys(parsed).length,
    arrayItems: values.reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0),
    textCharacters: values.reduce((sum, value) => sum + (typeof value === 'string' ? value.length : 0), 0),
    sourceUrls: sources.filter((source) => source && typeof source === 'object' && /^https?:\/\//i.test(String(source.url || ''))).length,
  };
}

const workspace = createSeedWorkspace();
if (process.env.CREATOR_EMPIRE_CONFIGURE_TEST_WORKSPACE === '1') {
  workspace.settings = {
    ...workspace.settings,
    workflowMode: 'automatic',
    aiProvider: provider,
    openAiModel: model,
    openAiAdvancedModel: advancedModel,
    geminiModel: provider === 'gemini' ? model : workspace.settings.geminiModel,
    geminiThinkingLevel: isFlashLite ? 'minimal' : 'low',
    aiMaxOutputTokens: requestedOutputTokens,
    aiRequestTimeoutSeconds: 120,
    aiDailyBudgetUsd: 2,
    aiMonthlyBudgetUsd: 20,
    openAiInputUsdPer1M: 0.2,
    openAiOutputUsdPer1M: 1.2,
    openAiAdvancedInputUsdPer1M: 2,
    openAiAdvancedOutputUsdPer1M: 12,
    geminiInputUsdPer1M: isFlashLite ? 0.3 : 1.5,
    geminiOutputUsdPer1M: isFlashLite ? 2.5 : 9,
    geminiSearchUsdPerQuery: 0.014,
  };
  const configured = await fetch(`${baseUrl}/api/workspace`, {
    method: 'PUT', headers, body: JSON.stringify({ workspace }), signal: AbortSignal.timeout(10_000),
  });
  if (!configured.ok) throw new Error(`Unable to configure isolated AI test workspace: ${await configured.text()}`);
  console.log('Isolated AI test workspace configured');
}
const channel = workspace.channels[0];
const project = workspace.projects.find((item) => item.channelId === channel?.id) ?? workspace.projects[0];
const idea = workspace.ideas.find((item) => item.id === (project?.ideaId ?? channel?.ideaId));
if (!channel || !project) throw new Error('Seed workspace has no AI test context');

const results = [];
for (const { id } of coverageTypes) {
  const generatedPrompt = generatePrompt({ type: id, language: project.language, idea, channel, project, workspace, shorter: testMode === 'contract' });
  const outputContract = generatedPrompt.split('\n\nOUTPUT CONTRACT\n').at(-1) || generatedPrompt;
  const prompt = testMode === 'full'
    ? generatedPrompt
    : `AI WORKFLOW CONTRACT TEST: ${id}\nReturn a concise, meaningful example that obeys this output contract. Use exactly one item per array and keep the complete JSON under 600 tokens.\n\n${outputContract}`;
  try {
    const response = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ provider, model, promptType: id, prompt, maxOutputTokens: requestedOutputTokens }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
    const validation = validatePromptResponse(payload.text || '', id);
    const expectedModel = provider === 'openai' && advancedPromptTypes.has(id) ? advancedModel : model;
    const routedCorrectly = provider !== 'openai' || payload.model === expectedModel;
    results.push({
      promptType: id,
      valid: validation.valid && routedCorrectly,
      error: validation.error || (routedCorrectly ? '' : `router selected ${payload.model}; expected ${expectedModel}`),
      model: String(payload.model || ''),
      modelTier: String(payload.modelTier || ''),
      reasoningEffort: String(payload.reasoningEffort || ''),
      inputTokens: Number(payload.inputTokens || 0),
      outputTokens: Number(payload.outputTokens || 0),
      searchQueries: Number(payload.searchQueries || 0),
      estimatedCostUsd: Number(payload.estimatedCostUsd || 0),
      signals: qualitySignals(validation.parsed),
    });
    console.log(`${validation.valid && routedCorrectly ? 'PASS' : 'FAIL'} ${id} · ${payload.model || 'unknown model'}${validation.error ? ` — ${validation.error}` : routedCorrectly ? '' : ' — router mismatch'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown live AI error';
    results.push({ promptType: id, valid: false, error: message, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
    console.log(`FAIL ${id} — ${message}`);
  }
  if (delayMs && id !== coverageTypes.at(-1)?.id) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

const passed = results.filter((item) => item.valid).length;
const report = {
  baseUrl,
  provider,
  model,
  advancedModel: provider === 'openai' ? advancedModel : undefined,
  mode: testMode,
  passed,
  total: results.length,
  coveragePercent: Math.round((passed / results.length) * 100),
  inputTokens: results.reduce((sum, item) => sum + item.inputTokens, 0),
  outputTokens: results.reduce((sum, item) => sum + item.outputTokens, 0),
  searchQueries: results.reduce((sum, item) => sum + Number(item.searchQueries || 0), 0),
  estimatedCostUsd: Number(results.reduce((sum, item) => sum + item.estimatedCostUsd, 0).toFixed(6)),
  modelDistribution: Object.fromEntries([...new Set(results.map((item) => item.model).filter(Boolean))].map((name) => [name, results.filter((item) => item.model === name).length])),
  routerPolicy: provider === 'openai' ? { lunaWorkflows: 13, terraWorkflows: 3, lunaPercent: 81.25, terraPercent: 18.75 } : undefined,
  qualitySignals: Object.fromEntries(results.filter((item) => item.valid).map(({ promptType, signals }) => [promptType, signals])),
  failures: results.filter((item) => !item.valid).map(({ promptType, error }) => ({ promptType, error })),
};
console.log(JSON.stringify(report, null, 2));
if (passed !== results.length) process.exitCode = 1;
