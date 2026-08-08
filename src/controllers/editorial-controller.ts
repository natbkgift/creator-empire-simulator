import { Actions } from '../domain/actions.js';
import { getWorkspace, updateWorkspace } from '../app/store.js';
import { routeHref } from '../app/router.js';
import { applyChannelFocus, applyPortfolioFocus, applyProjectFocus } from '../domain/focus.js';
import { escapeHtml } from '../domain/utils.js';
import { activeChannel, activeProject, statusLabels } from '../app/selectors.js';
import { openDialog } from '../ui/feedback.js';
import { openCommandPalette } from './command-palette.js';
import { openAddPlanIdeaDialog, openPlanIdeaDialog, regenerateThirtyDayPlan } from './channel-workspace-controller.js';
import { syncCurrentRouteToFocus } from './workflow-controller.js';

const sidebarKey = 'creator-empire:sidebar-expanded';

const openMobileWorkspaceControls = (): void => {
  const workspace = getWorkspace();
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const channelProjects = channel ? workspace.projects.filter((item) => item.channelId === channel.id && item.status !== 'archived') : [];
  const aiLabel = workspace.settings.workflowMode === 'automatic'
    ? `AI Assisted · ${workspace.settings.aiProvider === 'openai' ? 'OpenAI' : 'Gemini'}`
    : 'Manual';
  const dialog = openDialog('Workspace controls', `
    <div class="mobile-controls-menu">
      <section><span class="editorial-section-label">Switch Channel</span><button class="mobile-control-row ${workspace.focus.mode === 'portfolio' ? 'active' : ''}" data-mobile-portfolio><strong>Portfolio · All Channels</strong><small>Clear Channel Focus</small></button>${workspace.channels.map((item) => `<button class="mobile-control-row ${item.id === channel?.id ? 'active' : ''}" data-mobile-channel="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.niche)}</small></button>`).join('')}</section>
      ${channel ? `<section><span class="editorial-section-label">Active Video</span>${channelProjects.map((item) => `<button class="mobile-control-row ${item.id === project?.id ? 'active' : ''}" data-mobile-project="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(statusLabels[item.status])}</small></button>`).join('') || '<p class="muted small-copy">No active videos.</p>'}</section>` : ''}
      <section class="mobile-control-utilities"><span class="editorial-section-label">Global Controls</span><a class="mobile-control-row" href="${routeHref('settings')}"><strong>${escapeHtml(aiLabel)}</strong><small>AI mode, provider, budgets and Settings</small></a><a class="mobile-control-row" href="${routeHref('settings')}"><strong>Settings</strong><small>Locale, timezone, work capacity and calendar defaults</small></a><a class="mobile-control-row" href="${routeHref('import-export')}"><strong>Storage / Backup</strong><small>SQLite status, export and recovery history</small></a></section>
    </div>`, 'md');
  dialog.querySelector('[data-mobile-portfolio]')?.addEventListener('click', () => {
    updateWorkspace(applyPortfolioFocus);
    dialog.close();
    syncCurrentRouteToFocus('channel');
  });
  dialog.querySelectorAll<HTMLElement>('[data-mobile-channel]').forEach((button) => button.addEventListener('click', () => {
    updateWorkspace((draft) => applyChannelFocus(draft, button.dataset.mobileChannel ?? ''));
    dialog.close();
    syncCurrentRouteToFocus('channel');
  }));
  dialog.querySelectorAll<HTMLElement>('[data-mobile-project]').forEach((button) => button.addEventListener('click', () => {
    updateWorkspace((draft) => applyProjectFocus(draft, button.dataset.mobileProject ?? ''));
    dialog.close();
    syncCurrentRouteToFocus('project');
  }));
  dialog.querySelectorAll<HTMLAnchorElement>('.mobile-control-utilities a').forEach((link) => link.addEventListener('click', () => dialog.close()));
};

const installEditorialInteractions = (): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  try {
    document.body.classList.toggle('sidebar-expanded', window.localStorage.getItem(sidebarKey) === '1');
  } catch {
    document.body.classList.remove('sidebar-expanded');
  }

  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === Actions.TOGGLE_SIDEBAR) {
      const expanded = !document.body.classList.contains('sidebar-expanded');
      document.body.classList.toggle('sidebar-expanded', expanded);
      try { window.localStorage.setItem(sidebarKey, expanded ? '1' : '0'); } catch { /* UI preference only */ }
    } else if (action === Actions.OPEN_MOBILE_CONTROLS) {
      openMobileWorkspaceControls();
    } else if (action === Actions.OPEN_PLAN_IDEA) {
      const channelId = target.dataset.channelId;
      const index = Number(target.dataset.planIndex);
      if (channelId && Number.isInteger(index) && index >= 0) openPlanIdeaDialog(channelId, index);
    } else if (action === Actions.ADD_PLAN_IDEA) {
      const channelId = target.dataset.channelId;
      if (channelId) openAddPlanIdeaDialog(channelId);
    } else if (action === Actions.REGENERATE_PLAN) {
      const channelId = target.dataset.channelId;
      if (channelId) regenerateThirtyDayPlan(channelId);
    }
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (!document.querySelector('#app-dialog')) openCommandPalette();
    }
  });
};

installEditorialInteractions();
