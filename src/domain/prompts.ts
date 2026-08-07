import type { Channel, Idea, Language, PromptType, VideoProject, Workspace } from './types.js';

const typeNames: Record<PromptType, string> = {
  'niche-research': 'Niche Research',
  'topic-research': 'Topic Research',
  'fact-check': 'Fact-check',
  'competitor-pattern': 'Competitor Pattern Analysis',
  'hook-generator': 'Hook Generator',
  'shorts-script': 'Shorts Script',
  'long-script': 'Long-form Script',
  storyboard: 'Storyboard and Shot List',
  'capcut-standard': 'CapCut Standard Mode',
  'capcut-director': 'CapCut Director Skill Selection',
  'ai-image': 'AI Image',
  'ai-video': 'AI Video Clip',
  'thumbnail-title': 'Thumbnail and Title',
  repurposing: 'Multi-platform Repurposing',
  'analytics-postmortem': 'Analytics Post-mortem',
  'next-video': 'Next Video Recommendation',
};

export const promptTypes = Object.entries(typeNames).map(([id, name]) => ({
  id: id as PromptType,
  name,
}));

interface PromptContext {
  type: PromptType;
  language: Language;
  idea?: Idea;
  channel?: Channel;
  project?: VideoProject;
  workspace: Workspace;
  advanced?: boolean;
  shorter?: boolean;
}

const languageName = (language: Language): string => (language === 'en' ? 'English' : 'Thai');

const baseContext = ({ language, idea, channel, project, workspace }: PromptContext): string => {
  const score = idea?.score[language];
  const analytics = workspace.analytics.filter((entry) => entry.channelId === channel?.id);
  const avgViews = analytics.length
    ? Math.round(analytics.reduce((sum, entry) => sum + entry.views, 0) / analytics.length)
    : 0;
  return `
PROJECT CONTEXT
- Channel: ${channel?.name ?? 'New channel / not yet assigned'}
- Niche: ${channel?.niche ?? idea?.[language === 'en' ? 'titleEn' : 'titleTh'] ?? 'Not selected'}
- Video: ${project?.title ?? 'New topic'}
- Content language: ${languageName(language)}
- Format: ${project?.format ?? 'shorts'}
- Target duration: ${project?.targetDurationSeconds ?? 55} seconds
- Platforms: ${(project?.platforms ?? ['YouTube Shorts']).join(', ')}
- Audience countries: ${(channel?.audienceCountries ?? score?.recommendedCountries ?? ['Thailand']).join(', ')}
- Voice: ${channel?.blueprint.voice ?? score?.narrationStyle ?? 'Clear, natural documentary voice'}
- Available CapCut credits: ${workspace.settings.capcutBalance}
- Previous average views: ${avgViews || 'No actual data yet'}
- Evidence level: factual claims require at least two credible sources; mark disputed accounts clearly
- Originality requirement: write an original narrative and avoid interchangeable template output
`.trim();
};

const outputSchema = (type: PromptType): string => {
  if (type === 'topic-research') {
    return `Return valid JSON only:\n{"summary":"...","sources":[{"title":"...","url":"...","publisher":"...","claimType":"documented|reported|disputed|context","notes":"..."}],"verifiedFacts":["..."],"disputedClaims":["..."],"nextAction":"..."}`;
  }
  if (type === 'hook-generator') {
    return `Return valid JSON only:\n{"hooks":[{"text":"...","pattern":"curiosity|contradiction|stakes|visual-surprise","whyItWorks":"..."}],"recommendedIndex":0}`;
  }
  if (type === 'fact-check') {
    return `Return valid JSON only:\n{"claims":[{"claim":"...","status":"documented|reported|disputed|unsupported","evidence":"...","caveat":"..."}],"blockingIssues":[],"safeSummary":"...","sources":[{"title":"...","url":"...","publisher":"...","claimType":"documented|reported|disputed|context","notes":"..."}]}`;
  }
  if (type === 'shorts-script' || type === 'long-script') {
    return `Return valid JSON only:\n{"title":"...","hook":"...","script":"...","durationSeconds":55,"factCaveats":["..."],"nextAction":"..."}`;
  }
  if (type === 'storyboard') {
    return `Return valid JSON only:\n{"title":"...","durationSeconds":55,"scenes":[{"start":0,"end":3,"narration":"...","visual":"...","onScreenText":"...","sourceNote":"..."}],"disclosure":"AI historical reconstruction when applicable"}`;
  }
  if (type === 'ai-image' || type === 'ai-video') {
    return `Return valid JSON only:\n{"assetPrompts":[{"scene":"...","prompt":"...","durationSeconds":5,"aspectRatio":"9:16","negativeConstraints":["..."]}],"continuityRules":["..."],"nextAction":"..."}`;
  }
  if (type === 'capcut-standard' || type === 'capcut-director') {
    return `Return valid JSON only:\n{"recommendedMode":"standard|director","capcutBrief":"...","durationSeconds":55,"scenes":[{"start":0,"end":3,"narration":"...","visual":"...","onScreenText":"..."}],"settings":{"aspectRatio":"9:16","voice":"...","captions":"...","avatar":false,"regenerationLimit":2},"disclosure":"..."}`;
  }
  if (type === 'thumbnail-title') {
    return `Return valid JSON only:\n{"titles":["..."],"thumbnailConcepts":["..."],"recommendedTitle":"...","nextAction":"..."}`;
  }
  if (type === 'repurposing') {
    return `Return valid JSON only:\n{"repurposingPlan":"...","platformPlans":[{"platform":"YouTube Shorts","hook":"...","caption":"...","cta":"...","durationSeconds":55}],"nextAction":"..."}`;
  }
  if (type === 'analytics-postmortem') {
    return `Return valid JSON only:\n{"analyticsPostmortem":"...","diagnosis":["..."],"winningSignals":["..."],"nextActions":[{"action":"...","impact":"high|medium|low","effortMinutes":30}],"nextVideoIdeas":["..."]}`;
  }
  if (type === 'next-video') {
    return `Return valid JSON only:\n{"diagnosis":["..."],"nextVideoIdeas":[{"title":"...","reason":"...","format":"shorts|long","priority":1}],"nextAction":"..."}`;
  }
  return `Return valid JSON only:\n{"summary":"...","deliverables":[],"risks":[],"nextAction":"..."}`;
};

const instructionsByType: Record<PromptType, string> = {
  'niche-research': `Evaluate the niche for audience demand, repeatability, differentiation, monetization, production effort, source availability, and Thai-versus-English market fit. Identify 20 topic clusters and propose a 12-video validation sprint.`,
  'topic-research': `Research the selected topic using primary or authoritative sources. Separate verified facts, reported accounts, disputed claims, and context. Do not invent missing details.`,
  'fact-check': `Audit every factual claim in the proposed story. Flag names, dates, locations, statistics, historical visuals, uniforms, equipment, quotations, and causal claims that need correction or caveats.`,
  'competitor-pattern': `Study successful content patterns without copying protected expression. Extract hook structures, pacing, title patterns, information density, visual rhythm, and audience promises. Produce transformed principles, not a clone.`,
  'hook-generator': `Create 12 distinct hooks for the same topic. Each hook must deliver a concrete reason to stop scrolling in the first two seconds. Avoid generic phrases such as “Did you know?” unless the wording adds a sharp contradiction.`,
  'shorts-script': `Write an original ${55}-second vertical-video script. Use a strong first two seconds, clear progression, one major payoff, and a closing line that creates curiosity without begging for engagement. Use short spoken sentences and natural phrasing.`,
  'long-script': `Write a structured 6–9 minute script with cold open, promise, context, escalating sections, evidence, caveats, payoff, and a concise next-video bridge. Avoid filler and repeated setup.`,
  storyboard: `Convert the approved script into an editable shot list. Use 7–10 meaningful scene changes for a Short. Identify which scenes can be still images with motion and which deserve generated video to control credits.`,
  'capcut-standard': `Create a CapCut Standard Mode production brief. Preserve the approved script, factual accuracy, voice, scene timing, visual style, 9:16 composition, English or Thai captions, safe zones, and disclosure. Recommend no avatar unless it materially helps the story.`,
  'capcut-director': `Assess whether a CapCut Director/Skill workflow is suitable. Recommend Director Mode only for product advertising, a style-led experiment, or a skill that closely matches the job. Otherwise return Standard Mode and explain why.`,
  'ai-image': `Create production-ready prompts for still images. Keep subjects, era, wardrobe, geography, lighting, camera, aspect ratio, negative constraints, and continuity consistent. Avoid fake text, logos, watermarks, and unsupported historical claims.`,
  'ai-video': `Create 3–5 second AI-video prompts only for the most valuable motion moments. Define subject, action, camera, environment, continuity, duration, aspect ratio, and negative constraints. Do not generate every scene as video.`,
  'thumbnail-title': `Create 15 titles and 6 thumbnail concepts. Make the promise specific and truthful. Avoid misleading claims, fake urgency, clutter, and text that repeats the title.`,
  repurposing: `Adapt the master video for YouTube Shorts, TikTok, Facebook Reels, Instagram Reels, a long-form expansion, blog, email, and social post. Change hook, caption, CTA, duration, safe zone, and monetization purpose for each platform.`,
  'analytics-postmortem': `Analyze actual performance. Diagnose the opening, topic-market fit, retention drops, CTR, subscriber conversion, geographic mix, production time, credits, and cost. Separate evidence from hypotheses.`,
  'next-video': `Recommend the next five videos using actual winners, unfinished series, audience signals, production capacity, credits, deadlines, and policy risk. Rank by impact divided by effort.`,
};

export const generatePrompt = (context: PromptContext): string => {
  const title = typeNames[context.type];
  const detail = context.advanced
    ? `\nADVANCED REQUIREMENTS\n- Show assumptions and confidence level.\n- Include a red-team pass for factual, copyright, and mass-produced-template risk.\n- Provide an execution checklist with owners and estimated minutes.\n- Optimize for mobile-first 9:16 viewing where relevant.`
    : '';
  const concise = context.shorter
    ? `\nCONCISION RULE\nKeep the response to the minimum information required for direct execution.`
    : '';
  return `# ${title.toUpperCase()} PROMPT\n\nYou are a senior creator strategist, researcher, writer, and production director.\n\n${baseContext(context)}\n\nTASK\n${instructionsByType[context.type]}\n\nQUALITY RULES\n- Do not fabricate facts, sources, quotes, metrics, or platform eligibility.\n- Distinguish documented facts from reported or disputed accounts.\n- Write native, natural ${languageName(context.language)}; do not translate literally.\n- Prioritize original research, original scripting, and clear transformation.\n- Keep generated visuals consistent and disclose realistic synthetic scenes where required.\n- Avoid mass-produced, interchangeable, or minimally varied output.${detail}${concise}\n\nOUTPUT CONTRACT\n${outputSchema(context.type)}`;
};

export const recommendCapCutMode = (idea?: Idea, project?: VideoProject): {
  mode: 'standard' | 'director';
  confidence: number;
  reasons: string[];
} => {
  const category = idea?.categoryId ?? '';
  const factual = ['history', 'ai', 'business', 'dhamma', 'thailand'].includes(category);
  const productWords = /product|advert|sales|สินค้า|โฆษณา|property project/i.test(project?.title ?? idea?.titleEn ?? '');
  if (productWords) {
    return {
      mode: 'director',
      confidence: 74,
      reasons: [
        'The concept is product- or sales-led.',
        'A matching Director skill can accelerate visual experimentation.',
        'Run one A/B version against Standard Mode before scaling.',
      ],
    };
  }
  if (factual) {
    return {
      mode: 'standard',
      confidence: 91,
      reasons: [
        'The content depends on controlled facts and narrative order.',
        'Standard Mode makes script, scene, and caveat edits easier to audit.',
        'It reduces the risk of every episode inheriting the same generic skill template.',
      ],
    };
  }
  return {
    mode: 'standard',
    confidence: 66,
    reasons: ['No Director skill match has been proven yet.', 'Start controlled, then test a single style-led Director version.'],
  };
};
