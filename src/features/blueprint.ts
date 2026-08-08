import type { Channel, ContentPlanItem, Workspace } from '../domain/types.js';
import { addDays, escapeHtml, todayIso } from '../domain/utils.js';
import { routeHref } from '../app/router.js';
import { activeChannel, channelHealth, statusLabels } from '../app/selectors.js';
import { dataLabel, pageHeader } from '../ui/components.js';
import { isProductionComplete } from '../domain/workflow.js';

const planStatus = (workspace: Workspace, channel: Channel, item: ContentPlanItem): { label: string; tone: string } => {
  const project = workspace.projects.find((candidate) => candidate.channelId === channel.id && candidate.title.trim().toLowerCase() === item.title.trim().toLowerCase());
  if (!project) return { label: 'Idea', tone: 'muted' };
  if (isProductionComplete(project)) return { label: 'Video Complete', tone: 'success' };
  return { label: statusLabels[project.status], tone: project.status === 'scheduled' ? 'warning' : 'active' };
};

const renderPortfolio = (workspace: Workspace): string => `${pageHeader('Channels', 'Strategy home for every creator channel. Select a channel to focus the entire workspace.', `<a class="btn primary" href="${routeHref('ideas')}">+ New Channel</a>`)}
  <section class="channel-portfolio-grid">
    ${workspace.channels.map((channel) => {
      const projects = workspace.projects.filter((project) => project.channelId === channel.id);
      const active = projects.find((project) => !isProductionComplete(project) && project.status !== 'archived');
      const published = projects.filter(isProductionComplete).length;
      const analytics = workspace.analytics.filter((entry) => entry.channelId === channel.id);
      const views = analytics.reduce((sum, entry) => sum + entry.views, 0);
      return `<a class="channel-portfolio-card" href="${routeHref('blueprint', { channel: channel.id })}" data-action="focus-channel" data-channel-id="${escapeHtml(channel.id)}">
        <div class="channel-card-top"><div><span class="kicker">${escapeHtml(channel.role)} · ${channel.language === 'th' ? 'ไทย' : 'English'}</span><h3>${escapeHtml(channel.name)}</h3><p>${escapeHtml(channel.niche)}</p></div><span class="health-badge">${channelHealth(workspace, channel)}% health</span></div>
        <div class="channel-active-video"><span>Active video</span><strong>${escapeHtml(active?.title ?? 'No active video')}</strong><small>${active ? `${escapeHtml(statusLabels[active.status])} · Publish ${escapeHtml((active.publishAt ?? active.deadline).replace('T', ' '))}` : 'Ready for a new plan'}</small></div>
        <div class="channel-card-stats"><div><span>Published</span><b>${published}</b></div><div><span>Tracked views</span><b>${views.toLocaleString()}</b></div><div><span>Plan</span><b>${channel.blueprint.plan30Days.length} ideas</b></div></div>
        <div class="channel-card-open">Open Channel Workspace <span>→</span></div>
      </a>`;
    }).join('') || '<div class="empty-state"><div><strong>No channels yet</strong><span>Create your first Channel Blueprint.</span></div></div>'}
  </section>`;

export const renderBlueprint = (workspace: Workspace, params: URLSearchParams): string => {
  if (params.get('portfolio') === '1') return renderPortfolio(workspace);
  const selectedId = params.get('channel') ?? activeChannel(workspace)?.id;
  const channel = workspace.channels.find((item) => item.id === selectedId);
  if (!channel) return renderPortfolio(workspace);

  const blueprint = channel.blueprint;
  const channelProjects = workspace.projects.filter((item) => item.channelId === channel.id && item.status !== 'archived');
  const activeProject = channelProjects.find((item) => item.id === workspace.focus.activeProjectId) ?? channelProjects.find((item) => !isProductionComplete(item));
  const publishedCount = channelProjects.filter(isProductionComplete).length;
  const channelAnalytics = workspace.analytics.filter((entry) => entry.channelId === channel.id);
  const subscribers = channelAnalytics.reduce((sum, entry) => sum + entry.subscribersGained, 0);
  const avgViews = channelAnalytics.length ? Math.round(channelAnalytics.reduce((sum, entry) => sum + entry.views, 0) / channelAnalytics.length) : 0;
  const publishDate = addDays(todayIso(), 5);
  const publishTime = workspace.settings.defaultPublishTime || '19:00';
  const money = workspace.monetization.filter((item) => item.channelId === channel.id);
  const decisionText = blueprint.decisionCriteria[0] ?? blueprint.viewerDesire;

  return `${pageHeader('Channels', 'Channel Workspace · strategy, originality, monetization and the next 30 days of production.', `<a class="btn" href="${routeHref('blueprint', { portfolio: '1' })}">← Portfolio</a><a class="btn" href="${routeHref('calendar')}">Calendar</a><a class="btn primary" href="#new-video">Create Video</a>`)}
    <section class="panel channel-workspace-hero">
      <div class="channel-workspace-title"><div class="row wrap"><span class="kicker">${escapeHtml(channel.role)} channel</span>${channel.isDemo ? dataLabel('demo') : ''}<span class="health-badge">${channelHealth(workspace, channel)}% health</span></div><h2>${escapeHtml(channel.name)}</h2><p>${escapeHtml(channel.niche)} · ${channel.language === 'th' ? 'Thai' : 'English'}</p></div>
      <div class="channel-workspace-active"><span>Active video</span><strong>${escapeHtml(activeProject?.title ?? 'No active video')}</strong><small>${activeProject ? `${escapeHtml(statusLabels[activeProject.status])} · Publish ${escapeHtml((activeProject.publishAt ?? activeProject.deadline).replace('T', ' '))}` : 'Choose an idea and create the next video.'}</small></div>
      <div class="channel-workspace-metrics"><div><span>Published</span><b>${publishedCount}</b></div><div><span>Subscribers gained</span><b>${subscribers.toLocaleString()}</b></div><div><span>Avg tracked views</span><b>${avgViews.toLocaleString()}</b></div></div>
      <div class="channel-workspace-actions"><button class="btn" data-action="focus-channel" data-channel-id="${escapeHtml(channel.id)}">Set Active Channel</button><label class="workspace-video-switch"><span>Active Video</span><select class="select" data-change="active-project" ${channelProjects.length ? '' : 'disabled'}>${channelProjects.map((item) => `<option value="${escapeHtml(item.id)}" ${activeProject?.id === item.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('')}</select></label><a class="btn" href="${routeHref('production')}">Production</a></div>
    </section>

    <section class="channel-editorial-section"><div class="editorial-section-label">Channel Blueprint</div><div class="channel-strategy-grid">
      <article><h3>Positioning</h3><dl><dt>Channel promise</dt><dd>${escapeHtml(blueprint.promise)}</dd><dt>Core concept</dt><dd>${escapeHtml(blueprint.concept)}</dd><dt>Why subscribe</dt><dd>${escapeHtml(decisionText)}</dd></dl></article>
      <article><h3>Target Audience</h3><dl><dt>Primary audience</dt><dd>${escapeHtml(blueprint.targetAudience)}</dd><dt>Desired transformation</dt><dd>${escapeHtml(blueprint.viewerDesire)}</dd><dt>Narration personality</dt><dd>${escapeHtml(blueprint.narrationPersonality)}</dd></dl></article>
    </div>
    <div class="content-pillars"><h3>Content Pillars</h3><div>${blueprint.pillars.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></div>
    <div class="channel-strategy-grid compact"><article><h3>Language & Format</h3><div class="strategy-rows"><div><span>Language</span><b>${escapeHtml(blueprint.languageStrategy)}</b></div><div><span>Shorts</span><b>${escapeHtml(blueprint.shortsStrategy)}</b></div><div><span>Long-form</span><b>${escapeHtml(blueprint.longFormStrategy)}</b></div></div></article><article><h3>Publishing Targets</h3><div class="strategy-rows"><div><span>Weekly Shorts</span><b>${channel.weeklyShortsTarget}</b></div><div><span>Monthly Long-form</span><b>${channel.monthlyLongTarget}</b></div><div><span>Available hours</span><b>${channel.weeklyHours}h/week</b></div></div></article></div></section>

    <section class="channel-editorial-section"><div class="editorial-section-label">Originality & Sources</div><div class="channel-strategy-grid">
      <article><h3>Originality angle</h3><p>${escapeHtml(blueprint.originalityStrategy)}</p><h4>Source policy</h4><p>${escapeHtml(blueprint.sourcePolicy)}</p></article>
      <article><h3>Fact-checking standard</h3><ul class="editorial-list">${blueprint.factCheckWorkflow.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><h4>Content risk</h4><div class="risk-line"><span>Repetitious / sourcing review</span><b class="risk-${blueprint.risks.length ? 'review' : 'low'}">${blueprint.risks.length ? 'Review' : 'Low'}</b></div>${blueprint.risks.length ? `<p class="muted small-copy">${escapeHtml(blueprint.risks[0])}</p>` : ''}</article>
    </div></section>

    <section class="channel-editorial-section"><div class="editorial-section-label">Monetization</div><div class="monetization-cards">${blueprint.monetizationPaths.map((path, index) => { const actual = money[index] ?? money.find((item) => item.name === path); return `<article><div><h3>${escapeHtml(path)}</h3><span class="money-status ${actual?.status ?? 'idea'}">${escapeHtml(actual?.status ?? 'idea')}</span></div><p>${escapeHtml(actual?.nextAction ?? 'Validate after a proof set of published videos.')}</p><small>${actual ? `Confirmed ${actual.confirmedMonthlyThb.toLocaleString()} THB/mo` : 'Potential path'}</small></article>`; }).join('')}</div></section>

    <section class="channel-editorial-section plan-section"><div class="plan-section-head"><div><div class="editorial-section-label">30-Day Content Plan</div><h2>From strategy to production</h2><p>${blueprint.plan30Days.length} ideas · open an idea to edit it or create real production work.</p></div><div class="row wrap"><button class="btn" data-action="regenerate-plan" data-channel-id="${escapeHtml(channel.id)}">Rebalance Plan</button><button class="btn primary" data-action="add-plan-idea" data-channel-id="${escapeHtml(channel.id)}">+ Add Idea</button></div></div>
      <div class="plan-table-wrap"><table class="plan-table editorial-plan-table"><thead><tr><th>Day</th><th>Topic / Title</th><th>Format</th><th>Objective</th><th>Content Pillar</th><th>Status</th></tr></thead><tbody>${blueprint.plan30Days.map((item, index) => { const status = planStatus(workspace, channel, item); const pillar = item.pillar ?? blueprint.pillars[index % Math.max(1, blueprint.pillars.length)] ?? '—'; return `<tr><td>Day ${item.day}</td><td><button class="plan-title-button" data-action="open-plan-idea" data-channel-id="${escapeHtml(channel.id)}" data-plan-index="${index}"><strong>${escapeHtml(item.title)}</strong><span>Open idea →</span></button></td><td><span class="format-badge ${item.format}">${escapeHtml(item.format === 'long' ? 'Long-form' : 'Shorts')}</span></td><td>${escapeHtml(item.objective)}</td><td>${escapeHtml(pillar)}</td><td><span class="plan-status ${status.tone}">${escapeHtml(status.label)}</span></td></tr>`; }).join('')}</tbody></table></div>
    </section>

    <section id="new-video" class="panel channel-create-video"><div><span class="editorial-section-label">Create Video</span><h3>Turn an idea into a publish plan</h3><p>Calendar Planner will generate Research → Script → Production → QA → Upload around your publish deadline and capacity.</p></div><form class="stack" data-form="create-project"><input type="hidden" name="channelId" value="${escapeHtml(channel.id)}"/><div class="field"><label>Topic / video title</label><input class="input" name="title" value="${escapeHtml(blueprint.plan30Days[0]?.title ?? channel.niche)}" required/></div><div class="form-grid"><div class="field"><label>Format</label><select class="select" name="format"><option value="shorts">Shorts</option><option value="long">Long-form</option></select></div><div class="field"><label>Publish date & time</label><input class="input" type="datetime-local" name="deadline" value="${publishDate}T${escapeHtml(publishTime)}" required/></div></div><button class="btn primary" type="submit">Create Video & Plan Calendar</button></form></section>

    <section class="channel-editorial-section"><div class="editorial-section-label">Current Videos</div><div class="channel-video-list">${channelProjects.toSorted((a, b) => (a.publishAt ?? a.deadline).localeCompare(b.publishAt ?? b.deadline)).map((item) => `<button data-action="set-active-project" data-project-id="${escapeHtml(item.id)}"><span class="plan-status ${isProductionComplete(item) ? 'success' : 'active'}">${isProductionComplete(item) ? 'Video Complete' : escapeHtml(statusLabels[item.status])}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.format)} · Publish ${escapeHtml((item.publishAt ?? item.deadline).replace('T', ' '))}</small></button>`).join('') || '<span class="muted small-copy">No videos yet.</span>'}</div></section>`;
};
