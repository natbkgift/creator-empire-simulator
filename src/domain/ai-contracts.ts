import type { PromptType } from './types.js';

export interface PromptResponseContract {
  requiredAny: string[];
  persistsTo: string[];
}

export const promptResponseContracts: Record<PromptType, PromptResponseContract> = {
  'niche-research': { requiredAny: ['summary', 'topicClusters', 'validationSprint'], persistsTo: ['researchSummary'] },
  'topic-research': { requiredAny: ['summary', 'sources', 'verifiedFacts'], persistsTo: ['researchSummary', 'sources'] },
  'fact-check': { requiredAny: ['safeSummary', 'claims', 'sources'], persistsTo: ['factCheckSummary', 'sources'] },
  'competitor-pattern': { requiredAny: ['summary', 'patterns', 'transformedPrinciples'], persistsTo: ['researchSummary'] },
  'hook-generator': { requiredAny: ['hooks', 'hook'], persistsTo: ['hook'] },
  'shorts-script': { requiredAny: ['script'], persistsTo: ['title', 'hook', 'script', 'factCheckSummary'] },
  'long-script': { requiredAny: ['script'], persistsTo: ['title', 'hook', 'script', 'factCheckSummary'] },
  storyboard: { requiredAny: ['scenes', 'storyboard'], persistsTo: ['storyboard'] },
  'capcut-standard': { requiredAny: ['capcutBrief', 'scenes'], persistsTo: ['capcutBrief', 'storyboard'] },
  'capcut-director': { requiredAny: ['capcutBrief', 'recommendedMode'], persistsTo: ['capcutBrief', 'storyboard'] },
  'ai-image': { requiredAny: ['assetPrompts'], persistsTo: ['assetPrompts'] },
  'ai-video': { requiredAny: ['assetPrompts'], persistsTo: ['assetPrompts'] },
  'thumbnail-title': { requiredAny: ['titles', 'thumbnailConcepts'], persistsTo: ['thumbnailVersions'] },
  repurposing: { requiredAny: ['repurposingPlan', 'platformPlans'], persistsTo: ['repurposingPlan'] },
  'analytics-postmortem': { requiredAny: ['analyticsPostmortem', 'diagnosis'], persistsTo: ['analyticsPostmortem', 'lessonsLearned'] },
  'next-video': { requiredAny: ['nextVideoIdeas'], persistsTo: ['lessonsLearned'] },
};

export const validatePromptContract = (parsed: Record<string, unknown>, type: PromptType): string | undefined => {
  const contract = promptResponseContracts[type];
  const matched = contract.requiredAny.some((key) => {
    const value = parsed[key];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? Boolean(value.trim()) : value !== undefined && value !== null;
  });
  return matched ? undefined : `${type} response must include at least one of: ${contract.requiredAny.join(', ')}.`;
};

export const aiWorkflowCoverage = {
  promptTypes: Object.keys(promptResponseContracts).length,
  structuredContracts: Object.values(promptResponseContracts).filter((item) => item.requiredAny.length > 0).length,
  persistedContracts: Object.values(promptResponseContracts).filter((item) => item.persistsTo.length > 0).length,
};
