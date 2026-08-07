import type {
  SimulationInputs,
  SimulationRun,
  SimulationScenarioResult,
} from './types.js';
import { clamp, round, uid } from './utils.js';

const seededRandom = (seed: number): (() => number) => {
  let state = Math.abs(Math.floor(seed)) || 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const configs = [
  { scenario: 'conservative' as const, factor: 0.52, spread: 0.18 },
  { scenario: 'base' as const, factor: 1, spread: 0.28 },
  { scenario: 'growth' as const, factor: 1.7, spread: 0.42 },
  { scenario: 'breakout' as const, factor: 3.4, spread: 0.75 },
];

export const defaultSimulationInputs: SimulationInputs = {
  videosPerWeek: 4,
  shortsPercent: 80,
  averageViews: 1800,
  retentionPercent: 82,
  ctrPercent: 5.5,
  subscriberConversionPercent: 0.75,
  productionQuality: 72,
  topicRepeatability: 78,
  language: 'en',
  highValueAudiencePercent: 35,
  monthlyBudgetThb: 2500,
  availableCredits: 1634,
  hoursPerWeek: 12,
  consistencyPercent: 80,
  seed: 46,
};

export const runSimulation = (inputs: SimulationInputs): SimulationRun => {
  const random = seededRandom(inputs.seed);
  const monthlyVideos = inputs.videosPerWeek * 4.33;
  const qualityMultiplier = 0.55 + inputs.productionQuality / 140;
  const retentionMultiplier = 0.5 + inputs.retentionPercent / 130;
  const consistencyMultiplier = 0.45 + inputs.consistencyPercent / 120;
  const repeatabilityMultiplier = 0.55 + inputs.topicRepeatability / 160;
  const languageMultiplier = inputs.language === 'en' ? 1.18 : 0.92;
  const audienceValueMultiplier = 0.82 + inputs.highValueAudiencePercent / 180;
  const capacityFromHours = Math.max(1, Math.floor(inputs.hoursPerWeek / 2.4));
  const publishingCapacity = Math.min(inputs.videosPerWeek, capacityFromHours);
  const overloadRatio = inputs.videosPerWeek / Math.max(1, capacityFromHours);
  const expectedCreditsPerVideo = 68 + (inputs.productionQuality / 100) * 52;

  const results: SimulationScenarioResult[] = configs.map((config, index) => {
    const noise = 0.92 + random() * 0.16;
    const monthlyViews =
      publishingCapacity *
      4.33 *
      inputs.averageViews *
      qualityMultiplier *
      retentionMultiplier *
      consistencyMultiplier *
      repeatabilityMultiplier *
      languageMultiplier *
      config.factor *
      noise;
    const monthlySubscribers = monthlyViews * (inputs.subscriberConversionPercent / 100);
    const shortShare = inputs.shortsPercent / 100;
    const averageMinutesViewed = (shortShare * 0.72 + (1 - shortShare) * 4.8) * (inputs.retentionPercent / 100);
    const monthlyWatchHours = (monthlyViews * averageMinutesViewed) / 60;
    const lowFactor = 1 - config.spread;
    const highFactor = 1 + config.spread;
    const creditsRequired = Math.round(monthlyVideos * expectedCreditsPerVideo);
    const targetSubscribers = 1000;
    const monthsToMilestone = targetSubscribers / Math.max(1, monthlySubscribers);
    const overload = overloadRatio > 1.25;
    const budgetGap = creditsRequired > inputs.availableCredits;
    const weakRetention = inputs.retentionPercent < 70;
    const bottleneck = overload
      ? 'Production capacity exceeds available hours.'
      : budgetGap
        ? 'CapCut credit capacity is below the proposed publishing rate.'
        : weakRetention
          ? 'Retention is the primary growth constraint.'
          : 'Topic selection and hook testing are the next constraints.';
    const improvement = overload
      ? 'Reduce active channels or batch production before increasing cadence.'
      : budgetGap
        ? 'Use still-image motion for secondary scenes and cap regeneration per shot.'
        : weakRetention
          ? 'Rewrite the first 3 seconds and remove setup that delays the payoff.'
          : 'Create sequels from the top two topics and test three hooks per concept.';
    const burnoutRisk: 'low' | 'medium' | 'high' =
      overloadRatio > 1.5 ? 'high' : overloadRatio > 0.95 ? 'medium' : 'low';
    return {
      scenario: config.scenario,
      publishCapacity: publishingCapacity,
      subscribersLow: Math.max(0, Math.round(monthlySubscribers * lowFactor)),
      subscribersHigh: Math.max(1, Math.round(monthlySubscribers * highFactor)),
      watchHoursLow: round(monthlyWatchHours * lowFactor, 1),
      watchHoursHigh: round(monthlyWatchHours * highFactor, 1),
      creditsRequired,
      financialRequirementThb: Math.round(inputs.monthlyBudgetThb * (0.62 + index * 0.22) * audienceValueMultiplier),
      milestoneMonthsLow: round(clamp(monthsToMilestone * lowFactor, 0.2, 60), 1),
      milestoneMonthsHigh: round(clamp(monthsToMilestone * highFactor, 0.3, 84), 1),
      bottleneck,
      improvement,
      burnoutRisk,
    };
  });

  return {
    id: uid('sim'),
    createdAt: new Date().toISOString(),
    inputs,
    results,
    assumptions: [
      'The model is deterministic for the same seed and input values.',
      'Output is a planning range, not a revenue or growth guarantee.',
      'Actual channel data should replace default assumptions after 5–10 published videos.',
      'Shorts and long-form have different watch-time economics; this model uses a blended approximation.',
      'CapCut requirements are estimated from user ledger history when available, otherwise from a conservative planning baseline.',
    ],
  };
};
