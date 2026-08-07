import type { Idea, Language, LanguageScore } from './types.js';
import { clamp, round } from './utils.js';

const weights = {
  audienceDemand: 20,
  repeatability: 15,
  differentiation: 15,
  monetizationPotential: 15,
  productionEase: 10,
  evidenceAvailability: 10,
  languageMarketFit: 10,
  creatorFit: 5,
} as const;

export const calculateScore = (metrics: Omit<LanguageScore, 'total'>): LanguageScore => {
  const total = Object.entries(weights).reduce((sum, [key, weight]) => {
    const metric = metrics[key as keyof typeof weights];
    return sum + (Number(metric) / 100) * weight;
  }, 0);
  return { ...metrics, total: round(clamp(total, 0, 100)) };
};

export const compareIdeaLanguages = (idea: Idea): {
  winner: Language;
  difference: number;
  reason: string;
} => {
  const th = idea.score.th.total;
  const en = idea.score.en.total;
  const winner: Language = en >= th ? 'en' : 'th';
  const difference = Math.abs(en - th);
  const winnerScore = idea.score[winner];
  const reason =
    winner === 'en'
      ? `English has stronger market reach (${winnerScore.languageMarketFit}/100) and sponsor potential (${winnerScore.sponsorPotential}/100).`
      : `Thai has stronger production fit (${winnerScore.productionEase}/100) and creator fit (${winnerScore.creatorFit}/100).`;
  return { winner, difference, reason };
};

export const scoreLabel = (score: number): string => {
  if (score >= 82) return 'Launch candidate';
  if (score >= 72) return 'Strong test';
  if (score >= 62) return 'Validate first';
  return 'Backlog';
};
