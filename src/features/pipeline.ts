import type { ProjectStatus, VideoProject } from '../domain/types.js';
import type { View } from '../app/view.js';
import { navigate, routeHref } from '../app/router.js';
import { requestRender } from '../app/runtime.js';
import { getWorkspace, updateWorkspace } from '../app/store.js';
import { activeChannel, activeProject, statusLabels } from '../app/selectors.js';
import { applyChannelFocus, applyProjectFocus } from '../domain/focus.js';
import { isProductionComplete } from '../domain/workflow.js';
import { escapeHtml, todayIso } from '../domain/utils.js';
import { button, chip, dataBadge, metric, pageHeader } from '../ui/components.js';
import { openDialog, showToast } from '../ui/feedback.js';
import { createProjectFromForm } from '../controllers/entity-controller.js';

interface StageGroup {
  id: 'idea' | 'research' | 'script' | 'production' | 'edit' | 'release' | 'growth';
  label: string;
  detail: string;
  statuses: ProjectStatus[];
}

const stageGroups: StageGroup[] = [
  { id: 'idea', label: 'Idea', detail: 'Backlog → Selected', statuses: ['idea-backlog', 'selected'] },
  { id: 'research', label: 'Research', detail: 'Research → Sources', statuses: ['researching', 'sources-verified'] },
  { id: 'script', label: 'Script', detail: 'Hook → Approved', statuses: ['hook-ready', 'script-draft', 'script-approved'] },
  { id: 'production', label: 'Production', detail: 'Storyboard → CapCut', statuses: ['storyboard', 'assets-needed', 'capcut-draft'] },
  { id: 'edit', label: 'Edit', detail: 'Editing', statuses: ['editing'] },
  { id: 'release', label: 'Release', detail: 'QA → Published', statuses: ['qa', 'scheduled', 'published'] },
  { id: 'growth', label: 'Growth', detail: 'Analytics → Archive', statuses: ['analytics-review', 'repurpose', 'archived'] },
];

let channelFilter = '';
let languageFilter = 'all';
let formatFilter = 'all';

const projectGroup = (status: ProjectStatus): StageGroup => stageGroups.find((group) => group.statuses.includes(status)) ?? stageGroups[0];

const projectCard = (project: VideoProject, activeId?: string): string => {
  const workspace = getWorkspace();
  const channel = workspace.channels.find((candidate) => candidate.id === project.channelId);
  const complete = isProductionComplete(project);
  const overdue = project.deadline < todayIso() && !complete && project.status !== 'archived';
  const currentTask = workspace.calendarTasks.find((task) => task.projectId === project.id && !task.completed && task.sourceStatus === project.status);
  const publish = project.publishAt ?? project.deadline;
  const link = project.publicationLinks[0];
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(project.updatedAt).getTime()) / 3_600_000));
  return `<article class="flow-video-card ${overdue ? 'overdue' : ''} ${project.id === activeId ? 'active-project' : ''} ${complete ? 'video-complete' : ''}" data-project-id="${escapeHtml(project.id)}">
    <button type="button" class="flow-video-open" data-flow-open-project="${escapeHtml(project.id)}">
      <div class="flow-card-top"><span class="channel-dot ${channel?.role ?? 'backlog'}"></span><span>${escapeHtml(channel?.name ?? 'Unassigned')}</span>${dataBadge(project.isDemo)}</div>
      ${complete ? '<span class="video-complete-badge">VIDEO COMPLETE · 100%</span>' : `<span class="detail-stage">${escapeHtml(statusLabels[project.status])}</span>`}
      <h3>${escapeHtml(project.title)}</h3>
      <p>${escapeHtml(currentTask?.title ?? project.hook ?? 'Open the video context to continue.')}</p>
      <div class="flow-card-meta"><span>${escapeHtml(project.format === 'long' ? 'Long-form' : 'Shorts')}</span><span>${elapsed < 1 ? '<1h' : `${elapsed}h`} in stage</span></div>
      <div class="flow-card-publish"><span>${overdue ? 'Overdue' : 'Publish'}</span><b>${escapeHtml(publish.replace('T', ' '))}</b></div>
    </button>
    ${complete && link ? `<a class="publication-link" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">View published video →</a>` : ''}
  </article>`;
};

const projectDialog = (project: VideoProject): void => {
  const workspace = getWorkspace();
  const channel = workspace.channels.find((candidate) => candidate.id === project.channelId);
  const recommendedRoute = project.status === 'qa' || project.status === 'scheduled' ? 'policy' : ['storyboard', 'assets-needed', 'capcut-draft', 'editing'].includes(project.status) ? 'capcut' : ['published', 'analytics-review', 'repurpose'].includes(project.status) ? 'analytics' : 'prompts';
  const recommendedLabel = recommendedRoute === 'policy' ? 'Policy Shield' : recommendedRoute === 'capcut' ? 'CapCut Lab' : recommendedRoute === 'analytics' ? 'Insights' : 'Prompt Studio';
  const complete = isProductionComplete(project);
  const body = `<div class="context-project-summary"><span class="kicker">${escapeHtml(channel?.name ?? 'Unassigned')} · ${escapeHtml(projectGroup(project.status).label)}</span><h3>${escapeHtml(project.title)}</h3><div class="row wrap">${chip(statusLabels[project.status], complete ? 'green' : 'violet')}${chip(project.format === 'long' ? 'Long-form' : 'Shorts', project.format === 'long' ? 'amber' : 'cyan')}${complete ? chip('Video Complete', 'green') : ''}</div></div>
    <div class="context-project-grid"><div><span>Publish</span><b>${escapeHtml((project.publishAt ?? project.deadline).replace('T', ' '))}</b></div><div><span>Risk</span><b>${escapeHtml(project.riskLevel)}</b></div><div><span>Credits</span><b>${project.actualCredits || `${project.creditEstimateLow}–${project.creditEstimateHigh}`}</b></div></div>
    ${complete ? `<div class="video-complete-panel"><strong>Production finished</strong><span>Growth work is now separate from production completion.</span>${project.publicationLinks[0] ? `<a href="${escapeHtml(project.publicationLinks[0])}" target="_blank" rel="noreferrer">Open publication →</a>` : ''}</div>` : `<div class="recommended-tool"><span>RECOMMENDED NOW</span><strong>${recommendedLabel}</strong><p>Open the stage-specific workspace with this video already selected.</p></div>`}
    <div class="context-tool-actions"><button class="btn primary" data-context-route="${recommendedRoute}">${recommendedLabel}</button><button class="btn" data-context-route="mission">Mission</button><button class="btn" data-context-route="calendar">Calendar</button><button class="btn" data-context-route="prompts">Prompt Studio</button><button class="btn" data-context-route="capcut">CapCut Lab</button><button class="btn" data-context-route="policy">Policy Shield</button></div>`;
  const dialog = openDialog(project.title, body, 'lg');
  dialog.querySelectorAll<HTMLElement>('[data-context-route]').forEach((control) => control.addEventListener('click', () => {
    const route = control.dataset.contextRoute;
    if (!route) return;
    updateWorkspace((draft) => applyProjectFocus(draft, project.id));
    dialog.close();
    navigate(route, { project: project.id });
  }));
};

const projectDate = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const newProjectDialog = (): void => {
  const workspace = getWorkspace();
  const channel = activeChannel(workspace) ?? workspace.channels[0];
  if (!channel) { showToast('สร้าง Channel ก่อนสร้างวิดีโอ', 'warning'); navigate('blueprint'); return; }
  const defaultPublish = `${projectDate(5)}T${workspace.settings.defaultPublishTime || '19:00'}`;
  const body = `<form id="flow-new-project" class="stack"><input type="hidden" name="channelId" value="${escapeHtml(channel.id)}"/><div class="field"><label>Topic / title</label><input class="input" name="title" required placeholder="New video title"></div><div class="form-grid two"><div class="field"><label>Format</label><select class="select" name="format"><option value="shorts">Shorts</option><option value="long">Long-form</option></select></div><div class="field"><label>Publish date & time</label><input class="input" type="datetime-local" name="deadline" value="${defaultPublish}" required></div></div><div class="dialog-actions"><button class="btn primary" type="submit">Create Video & Plan Calendar</button></div></form>`;
  const dialog = openDialog('Create Video', body, 'md');
  dialog.querySelector<HTMLFormElement>('#flow-new-project')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    dialog.close();
    createProjectFromForm(form);
  });
};

export const renderPipeline = (): View => {
  const workspace = getWorkspace();
  const focusedChannel = activeChannel(workspace);
  const focusedProject = activeProject(workspace);
  const effectiveChannel = channelFilter || (workspace.focus.mode === 'channel' ? focusedChannel?.id ?? 'all' : 'all');
  const projects = workspace.projects.filter((project) =>
    (effectiveChannel === 'all' || project.channelId === effectiveChannel)
    && (languageFilter === 'all' || project.language === languageFilter)
    && (formatFilter === 'all' || project.format === formatFilter));
  const productionWip = projects.filter((project) => !isProductionComplete(project) && !['analytics-review', 'repurpose', 'archived'].includes(project.status)).length;
  const groups = stageGroups.map((group) => {
    const cards = projects.filter((project) => group.statuses.includes(project.status));
    return `<section class="flow-group flow-group-${group.id}" data-stage-group="${group.id}"><div class="flow-group-head"><div><span>${escapeHtml(group.label)}</span><small>${escapeHtml(group.detail)}</small></div><b>${cards.length}</b></div><div class="flow-group-cards">${cards.map((project) => projectCard(project, focusedProject?.id)).join('') || '<div class="flow-empty">No videos</div>'}</div>${group.id === 'growth' ? '<div class="growth-loop-note"><span>GROWTH LOOP</span><p>Analytics → Post-mortem → Repurpose → Archive</p><small>Separate from production progress.</small></div>' : ''}</section>`;
  }).join('');

  const html = `${pageHeader('Production', 'A seven-group Production Flow that preserves the detailed workflow and its completion gates.', `${button('Create Video', 'add-project', 'primary', 'plus')}<a class="btn" href="${routeHref('mission', focusedProject ? { project: focusedProject.id } : undefined)}">Current Mission</a>`)}
    <section class="production-focus-strip"><div><span class="kicker">Channel Focus</span><strong>${escapeHtml(focusedChannel?.name ?? 'Portfolio · All Channels')}</strong></div><div><span class="kicker">Active Video</span><strong>${escapeHtml(focusedProject?.title ?? 'None')}</strong><small>${focusedProject ? escapeHtml(statusLabels[focusedProject.status]) : 'Select a video card'}</small></div><button class="btn" data-action="open-focus-picker">Change focus</button></section>
    <section class="pipeline-toolbar panel"><div class="pipeline-filters"><label><span>Channel</span><select id="pipeline-channel"><option value="all">Portfolio · All Channels</option>${workspace.channels.map((item) => `<option value="${escapeHtml(item.id)}" ${effectiveChannel === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><label><span>Language</span><select id="pipeline-language"><option value="all">All</option><option value="en" ${languageFilter === 'en' ? 'selected' : ''}>EN</option><option value="th" ${languageFilter === 'th' ? 'selected' : ''}>TH</option></select></label><label><span>Format</span><select id="pipeline-format"><option value="all">All</option><option value="shorts" ${formatFilter === 'shorts' ? 'selected' : ''}>Shorts</option><option value="long" ${formatFilter === 'long' ? 'selected' : ''}>Long-form</option></select></label></div><div class="pipeline-summary">${metric('Visible', projects.length)}${metric('Production WIP', productionWip)}${metric('Video Complete', projects.filter(isProductionComplete).length)}</div></section>
    <div class="production-flow-board" aria-label="Production Flow groups">${groups}</div>`;

  return { html, mount: () => {
    document.querySelector('#pipeline-channel')?.addEventListener('change', (event) => {
      channelFilter = (event.target as HTMLSelectElement).value;
      const value = channelFilter;
      if (value !== 'all') updateWorkspace((draft) => applyChannelFocus(draft, value));
      requestRender();
    });
    document.querySelector('#pipeline-language')?.addEventListener('change', (event) => { languageFilter = (event.target as HTMLSelectElement).value; requestRender(); });
    document.querySelector('#pipeline-format')?.addEventListener('change', (event) => { formatFilter = (event.target as HTMLSelectElement).value; requestRender(); });
    document.querySelectorAll<HTMLElement>('[data-flow-open-project]').forEach((card) => card.addEventListener('click', () => {
      const projectId = card.dataset.flowOpenProject;
      const project = getWorkspace().projects.find((item) => item.id === projectId);
      if (!project) return;
      updateWorkspace((draft) => applyProjectFocus(draft, project.id));
      projectDialog(project);
    }));
    document.querySelector('[data-action="add-project"]')?.addEventListener('click', newProjectDialog);
  } };
};
