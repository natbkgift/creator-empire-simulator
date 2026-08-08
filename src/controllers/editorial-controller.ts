import { Actions } from '../domain/actions.js';
import { openCommandPalette } from './command-palette.js';
import { openAddPlanIdeaDialog, openPlanIdeaDialog, regenerateThirtyDayPlan } from './channel-workspace-controller.js';

const sidebarKey = 'creator-empire:sidebar-expanded';

const syncSidebarState = (): void => {
  try {
    document.body.classList.toggle('sidebar-expanded', localStorage.getItem(sidebarKey) === '1');
  } catch {
    document.body.classList.remove('sidebar-expanded');
  }
};

syncSidebarState();

document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === Actions.TOGGLE_SIDEBAR) {
    const expanded = !document.body.classList.contains('sidebar-expanded');
    document.body.classList.toggle('sidebar-expanded', expanded);
    try { localStorage.setItem(sidebarKey, expanded ? '1' : '0'); } catch { /* UI preference only */ }
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
