export type Language = 'th' | 'en';
export type VideoFormat = 'shorts' | 'long' | 'both';
export type ChannelRole = 'primary' | 'experiment' | 'backlog';
export type RiskLevel = 'low' | 'review' | 'high' | 'blocked';
export type FocusMode = 'portfolio' | 'channel';
export type AutomationMode = 'manual' | 'automatic';
export type AiProvider = 'openai' | 'gemini';
export type GrowthLoopStatus = 'pending' | 'analytics' | 'repurpose' | 'complete';
export type MissionRoute = 'mission' | 'prompts' | 'capcut' | 'policy' | 'analytics' | 'calendar' | 'production';
export type ProjectStatus =
  | 'idea-backlog' | 'selected' | 'researching' | 'sources-verified' | 'hook-ready' | 'script-draft'
  | 'script-approved' | 'storyboard' | 'assets-needed' | 'capcut-draft' | 'editing' | 'qa' | 'scheduled'
  | 'published' | 'analytics-review' | 'repurpose' | 'archived';

export interface LanguageScore {
  audienceDemand: number; repeatability: number; differentiation: number; monetizationPotential: number;
  productionEase: number; evidenceAvailability: number; languageMarketFit: number; creatorFit: number; total: number;
  productionMinutes: number; estimatedCreditsLow: number; estimatedCreditsHigh: number; shortsSuitability: number;
  longFormSuitability: number; evergreen: number; trendDependency: 'low' | 'medium' | 'high';
  factCheckDifficulty: 'low' | 'medium' | 'high'; copyrightRisk: RiskLevel; aiVisualSuitability: number;
  sponsorPotential: number; affiliatePotential: number; digitalProductPotential: number; recommendedCountries: string[];
  narrationStyle: string;
}

export interface Idea {
  id: string; categoryId: string; categoryNameEn: string; categoryNameTh: string; titleEn: string; titleTh: string;
  descriptionEn: string; descriptionTh: string; score: Record<Language, LanguageScore>; saved: boolean; isDemo?: boolean;
}

/** v1.4 adds optional editorial metadata without requiring a workspace schema bump. */
export interface ContentPlanItem {
  day: number;
  title: string;
  format: Exclude<VideoFormat, 'both'>;
  objective: string;
  pillar?: string;
  hook?: string;
}

export interface ChannelBlueprint {
  concept: string; nameOptions: string[]; promise: string; targetAudience: string; viewerDesire: string; pillars: string[];
  visualIdentity: string; narrationPersonality: string; languageStrategy: string; voice: string; shortsStrategy: string;
  longFormStrategy: string; plan30Days: ContentPlanItem[]; experiment90Days: string[]; monetizationPaths: string[];
  risks: string[]; originalityStrategy: string; factCheckWorkflow: string[]; sourcePolicy: string; decisionCriteria: string[];
}

export interface Channel {
  id: string; name: string; handle: string; ideaId: string; niche: string; language: Language; role: ChannelRole;
  health: number; weeklyHours: number; weeklyShortsTarget: number; monthlyLongTarget: number; audienceCountries: string[];
  blueprint: ChannelBlueprint; createdAt: string; isDemo?: boolean;
}

export interface SourceRecord {
  id: string; projectId: string; title: string; url: string; publisher: string; accessedAt: string;
  claimType: 'documented' | 'reported' | 'disputed' | 'context'; notes: string;
}

export interface WorkflowEvent {
  id: string; at: string;
  type: 'focus' | 'mission-started' | 'mission-completed' | 'prompt-applied' | 'stage-advanced' | 'analytics-recorded' | 'production-completed' | 'rescheduled';
  note: string; fromStatus?: ProjectStatus; toStatus?: ProjectStatus; promptType?: PromptType; taskId?: string;
}

export interface VideoProject {
  id: string; title: string; channelId: string; ideaId: string; series: string; language: Language; platforms: string[];
  format: Exclude<VideoFormat, 'both'>; targetDurationSeconds: number; deadline: string;
  /** Exact intended publication datetime. Added in schema v4; migration backfills older workspaces. */
  publishAt?: string;
  owner: string; estimatedMinutes: number; budgetThb: number; creditEstimateLow: number; creditEstimateHigh: number;
  actualCredits: number; status: ProjectStatus; productionCompletedAt?: string; growthLoopStatus?: GrowthLoopStatus;
  sourceIds: string[]; researchSummary: string; factCheckSummary: string; scriptVersion: number; script: string; hook: string;
  storyboard: string[]; assetPrompts: string[]; capcutBrief: string; promptVersions: string[]; thumbnailVersions: string[];
  publicationLinks: string[]; lessonsLearned: string; analyticsPostmortem: string; repurposingPlan: string;
  workflowEvents: WorkflowEvent[]; policyChecks: Record<string, boolean>; riskLevel: RiskLevel; createdAt: string; updatedAt: string; isDemo?: boolean;
}

export type PromptType =
  | 'niche-research' | 'topic-research' | 'fact-check' | 'competitor-pattern' | 'hook-generator' | 'shorts-script'
  | 'long-script' | 'storyboard' | 'capcut-standard' | 'capcut-director' | 'ai-image' | 'ai-video'
  | 'thumbnail-title' | 'repurposing' | 'analytics-postmortem' | 'next-video';

export interface PromptTemplate { id: string; name: string; type: PromptType; language: Language; body: string; projectId?: string; createdAt: string; updatedAt: string; }

export interface CreditEntry {
  id: string; projectId?: string; channelId?: string; createdAt: string; balanceBefore: number; balanceAfter: number;
  tool: 'full-video' | 'video-clip' | 'ai-image' | 'voiceover' | 'captions' | 'avatar' | 'other'; mode: 'standard' | 'director';
  model: string; durationSeconds: number; resolution: '720p' | '1080p' | 'other'; soundEnabled: boolean; generations: number;
  regenerations: number; usableOutputs: number; completedVideo: boolean; visualStyle: string; notes: string;
}

export interface CalendarTask {
  id: string; title: string; date: string; startTime: string; durationMinutes: number;
  type: 'research' | 'script' | 'editing' | 'upload' | 'analytics' | 'rest' | 'other'; projectId?: string;
  recurring: 'none' | 'daily' | 'weekly'; completed: boolean; workflowPromptType?: PromptType; sourceStatus?: ProjectStatus;
  targetStatus?: ProjectStatus; missionRoute?: MissionRoute; autoGenerated?: boolean; priority?: number; startedAt?: string;
  completedAt?: string; templateKind?: 'shorts' | 'long' | 'manual' | 'growth'; conflict?: boolean; conflictReason?: string; isDemo?: boolean;
}

export interface AnalyticsEntry {
  id: string; projectId: string; channelId: string; recordedAt: string;
  platform: 'youtube' | 'facebook' | 'tiktok' | 'instagram' | 'other'; impressions: number; views: number;
  viewedVsSwiped: number; ctr: number; averageViewDurationSeconds: number; averagePercentageViewed: number; retentionPoints: number[];
  watchHours: number; subscribersGained: number; returningViewers: number; topCountries: string[]; revenueThb: number;
  rpmThb: number; productionMinutes: number; creditsUsed: number; financialCostThb: number; isDemo?: boolean;
}

export interface PolicyRule {
  id: string; platform: 'youtube' | 'facebook' | 'tiktok' | 'instagram' | 'capcut' | 'other'; country: string | 'global';
  topic: string; summary: string; sourceUrl: string; lastVerifiedAt: string; status: 'active' | 'uncertain' | 'deprecated';
  editableValue?: string | number | boolean; notes?: string;
}

export interface MonetizationPath {
  id: string; channelId: string; name: string; type: 'platform' | 'off-platform' | 'lead-generation';
  status: 'idea' | 'testing' | 'active' | 'paused'; estimatedMonthlyThb: number; confirmedMonthlyThb: number; nextAction: string;
}

export interface SimulationInputs {
  videosPerWeek: number; shortsPercent: number; averageViews: number; retentionPercent: number; ctrPercent: number;
  subscriberConversionPercent: number; productionQuality: number; topicRepeatability: number; language: Language;
  highValueAudiencePercent: number; monthlyBudgetThb: number; availableCredits: number; hoursPerWeek: number;
  consistencyPercent: number; seed: number;
}

export interface SimulationScenarioResult {
  scenario: 'conservative' | 'base' | 'growth' | 'breakout'; publishCapacity: number; subscribersLow: number;
  subscribersHigh: number; watchHoursLow: number; watchHoursHigh: number; creditsRequired: number; financialRequirementThb: number;
  milestoneMonthsLow: number; milestoneMonthsHigh: number; bottleneck: string; improvement: string; burnoutRisk: 'low' | 'medium' | 'high';
}

export interface SimulationRun { id: string; createdAt: string; inputs: SimulationInputs; results: SimulationScenarioResult[]; assumptions: string[]; }
export interface Achievement { id: string; title: string; description: string; icon: string; unlockedAt?: string; }

export interface SkillProgress {
  research: number; topicSelection: number; hookWriting: number; storytelling: number; scriptWriting: number; visualDirection: number;
  editing: number; thumbnail: number; distribution: number; analytics: number; monetization: number; consistency: number;
}

export interface Settings {
  locale: 'th' | 'en'; timezone: string; weeklyHoursAvailable: number; capcutBalance: number; soundEnabled: boolean;
  reducedMotion: boolean; onboardingComplete: boolean; workflowMode: AutomationMode; aiProvider: AiProvider; openAiModel: string; openAiAdvancedModel?: string;
  geminiModel: string; geminiThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'; connectedAiEnabled: boolean; connectedAiProxyUrl: string; sqliteStorageEnabled: boolean; activeChannelLimit: number;
  aiMaxOutputTokens?: number; aiRequestTimeoutSeconds?: number; aiDailyBudgetUsd?: number; aiMonthlyBudgetUsd?: number;
  openAiInputUsdPer1M?: number; openAiOutputUsdPer1M?: number; openAiAdvancedInputUsdPer1M?: number; openAiAdvancedOutputUsdPer1M?: number; geminiInputUsdPer1M?: number; geminiOutputUsdPer1M?: number; geminiSearchUsdPerQuery?: number;
  workdayStart?: string; workdayEnd?: string; defaultPublishTime?: string;
}

export interface FocusState { mode: FocusMode; activeChannelId?: string; activeProjectId?: string; activeTaskId?: string; updatedAt: string; }

export interface Workspace {
  schemaVersion: 1 | 2 | 3 | 4;
  revision?: number;
  id: 'default'; name: string; createdAt: string; updatedAt: string; ideas: Idea[]; channels: Channel[]; projects: VideoProject[];
  sources: SourceRecord[]; prompts: PromptTemplate[]; calendarTasks: CalendarTask[]; credits: CreditEntry[]; analytics: AnalyticsEntry[];
  policies: PolicyRule[]; monetization: MonetizationPath[]; simulations: SimulationRun[]; achievements: Achievement[]; skills: SkillProgress;
  xp: number; level: number; streak: number; earnedEvents: string[]; settings: Settings; focus: FocusState;
}
