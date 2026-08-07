import type { Workspace } from './domain/types.js';
import { Actions, Forms, Changes } from './domain/actions.js';
import type { View } from './app/view.js';
import { initializeStore, getWorkspace, subscribe, updateWorkspace, replaceWorkspace, awardXp } from './app/store.js';
import { parseRoute, navigate } from './app/router.js';
import { registerRenderer } from './app/runtime.js';
import { renderShell } from './app/shell.js';
import { navigation } from './app/navigation.js';
import { escapeHtml, todayIso } from './domain/utils.js';
import { createSeedWorkspace } from './seed/demo.js';
import { applyChannelFocus, applyProjectFocus, applyPortfolioFocus } from './domain/focus.js';
import { rebuildWorkflowTasks, rescheduleProjectWorkflow, requiredPolicyChecks } from './domain/workflow.js';
import { confirmDialog, showToast } from './ui/feedback.js';
import { activeProject, dailyMission } from './app/selectors.js';

import { renderHq } from './features/hq.js';
import { renderMission } from './features/mission.js';
import { renderMap } from './features/map.js';
import { renderIdeas } from './features/ideas.js';
import { renderBlueprint } from './features/blueprint.js';
import { renderPipeline } from './features/pipeline.js';
import { renderPrompts } from './features/prompts.js';
import { renderCapCut } from './features/capcut.js';
import { renderCalendar } from './features/calendar.js';
import { renderSimulator } from './features/simulator.js';
import { renderAnalytics } from './features/analytics.js';
import { renderMonetization } from './features/monetization.js';
import { renderPolicy } from './features/policy.js';
import { renderSettings } from './features/settings.js';
import { renderImportExport } from './features/importExport.js';
import { renderOnboarding } from './features/onboarding.js';

import { copyText, stringFrom } from './controllers/helpers.js';
import { saveSettings } from './controllers/settings-controller.js';
import { openCommandPalette } from './controllers/command-palette.js';
import { exportIcs, exportWorkspace, exportProjectsCsv, exportAnalyticsCsv, importWorkspaceFile, importAnalyticsCsv, removeDemoData } from './controllers/import-export-controller.js';
import { createChannelFromForm, createProjectFromForm, recordCreditEntry, createCalendarTask, toggleCalendarTask, addAnalyticsEntry, addMonetizationPath, recalculateProjectRisk, runSimulatorFromForm } from './controllers/entity-controller.js';
import { startMission, completeMission, syncCurrentRouteToFocus, openFocusPicker, moveProjectNext, deleteProject } from './controllers/workflow-controller.js';
import { savePrompt, parseAndApplyPromptResponse, refreshAiStatus, saveAiSecret, testAiProvider, clearAiKey, generateCurrentPromptWithAi, getParseMessage, setParseMessage } from './controllers/ai-controller.js';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('App root #app was not found.');
let rendering = false;
const normalizeRoute = (route: string): string => route === 'pipeline' ? 'production' : route;

const completeDailyMission = (): void => {
  const mission = dailyMission(getWorkspace());
  if (mission.projectId) completeMission(mission.projectId, mission.taskId);
  else {
    updateWorkspace((draft) => { awardXp(draft, `daily:${todayIso()}:${mission.title}`, mission.xp, 'consistency'); draft.streak += 1; });
    showToast(`Mission complete · +${mission.xp} XP`);
  }
};

const getRouteView = (workspace: Workspace, route: string, params: URLSearchParams): View => {
  switch (route) {
    case 'onboarding': return renderOnboarding();
    case 'hq': return { html: renderHq(workspace) };
    case 'mission': return { html: renderMission(workspace, params) };
    case 'map': return { html: renderMap(workspace) };
    case 'ideas': return { html: renderIdeas(workspace, params) };
    case 'blueprint': return { html: renderBlueprint(workspace, params) };
    case 'production': return renderPipeline();
    case 'prompts': return { html: renderPrompts(workspace, params, getParseMessage()) };
    case 'capcut': return { html: renderCapCut(workspace, params) };
    case 'calendar': return { html: renderCalendar(workspace, params) };
    case 'simulator': return { html: renderSimulator(workspace) };
    case 'analytics': return { html: renderAnalytics(workspace, params) };
    case 'monetization': return { html: renderMonetization(workspace) };
    case 'policy': return { html: renderPolicy(workspace, params) };
    case 'settings': return { html: renderSettings(workspace) };
    case 'import-export': return { html: renderImportExport(workspace) };
    default: return { html: renderHq(workspace) };
  }
};

const render = (): void => {
  if (rendering) return;
  rendering = true;
  try {
    const workspace = getWorkspace();
    const state = parseRoute();
    const route = normalizeRoute(state.name);
    if (!workspace.settings.onboardingComplete && route !== 'onboarding') { navigate('onboarding'); return; }
    if (workspace.settings.onboardingComplete && route === 'onboarding') { navigate('hq'); return; }
    document.documentElement.lang = workspace.settings.locale;
    document.body.classList.toggle('reduce-motion', workspace.settings.reducedMotion);
    const view = getRouteView(workspace, route, state.params);
    app.innerHTML = route === 'onboarding' ? view.html : renderShell(workspace, route, view.html);
    view.mount?.();
    document.body.dataset.route = route;
    document.title = `${navigation.find((item) => item.route === route)?.label ?? 'Creator Empire'} · Creator Empire Simulator`;
  } catch (error) {
    console.error('Render failed', error);
    app.innerHTML = `<main class="fatal-error"><h1>Creator Empire encountered an error</h1><pre>${escapeHtml(error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error))}</pre><button type="button" onclick="location.reload()">Reload</button></main>`;
  } finally { rendering = false; }
};

app.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  const formName = form.dataset.form;
  if (!formName) return;
  event.preventDefault();
  if (formName === Forms.IDEA_FILTER) {
    const data = new FormData(form);
    const current = parseRoute().params;
    navigate('ideas', { q: stringFrom(data, 'q'), category: stringFrom(data, 'category', 'all'), lang: current.get('lang') ?? 'en', format: current.get('format') ?? 'both' });
  } else if (formName === Forms.CREATE_CHANNEL) createChannelFromForm(form);
  else if (formName === Forms.CREATE_PROJECT) createProjectFromForm(form);
  else if (formName === Forms.PROMPT_CONTEXT) {
    const data = new FormData(form);
    const selectedProject = stringFrom(data, 'project');
    setParseMessage('');
    if (selectedProject) updateWorkspace((draft) => applyProjectFocus(draft, selectedProject));
    navigate('prompts', { project: selectedProject, type: stringFrom(data, 'type', 'shorts-script'), lang: stringFrom(data, 'lang', 'en'), advanced: data.get('advanced') === '1' ? '1' : '0', short: data.get('short') === '1' ? '1' : '0' });
  } else if (formName === Forms.CREDIT_ENTRY) recordCreditEntry(form);
  else if (formName === Forms.CALENDAR_TASK) createCalendarTask(form);
  else if (formName === Forms.RESCHEDULE_PROJECT) {
    const data = new FormData(form);
    const projectId = stringFrom(data, 'projectId');
    const publishAt = stringFrom(data, 'publishAt');
    if (!projectId || !publishAt) { showToast('เลือก Project และเวลา Publish ก่อน', 'warning'); return; }
    updateWorkspace((draft) => {
      const tasks = rescheduleProjectWorkflow(draft, projectId, publishAt, todayIso());
      const project = draft.projects.find((item) => item.id === projectId);
      const current = project ? tasks.find((task) => task.sourceStatus === project.status) : undefined;
      applyProjectFocus(draft, projectId, current?.id);
    });
    const conflicts = getWorkspace().calendarTasks.filter((task) => task.projectId === projectId && task.autoGenerated && task.conflict).length;
    showToast(conflicts ? `Reschedule แล้ว แต่มี ${conflicts} Capacity conflict` : 'Reschedule และจัด Production Calendar ใหม่แล้ว', conflicts ? 'warning' : 'success');
  }
  else if (formName === Forms.SIMULATION) runSimulatorFromForm(form);
  else if (formName === Forms.ANALYTICS_ENTRY) addAnalyticsEntry(form);
  else if (formName === Forms.MONETIZATION_PATH) addMonetizationPath(form);
  else if (formName === Forms.SETTINGS) saveSettings(form);
  else if (formName === Forms.AI_SECRET) void saveAiSecret(form);
});

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;
  if (action === Actions.OPEN_COMMAND) openCommandPalette();
  else if (action === Actions.OPEN_FOCUS_PICKER) openFocusPicker();
  else if (action === Actions.PORTFOLIO_MODE) { updateWorkspace(applyPortfolioFocus); syncCurrentRouteToFocus('channel'); }
  else if (action === Actions.FOCUS_PRIMARY_CHANNEL) {
    const primary = getWorkspace().channels.find((item) => item.role === 'primary') ?? getWorkspace().channels[0];
    if (primary) { updateWorkspace((draft) => applyChannelFocus(draft, primary.id)); syncCurrentRouteToFocus('channel'); }
  } else if (action === Actions.FOCUS_CHANNEL) {
    const channelId = target.dataset.channelId;
    if (channelId) { updateWorkspace((draft) => applyChannelFocus(draft, channelId)); syncCurrentRouteToFocus('channel'); }
  } else if (action === Actions.SET_ACTIVE_PROJECT) {
    const projectId = target.dataset.projectId;
    if (projectId) { updateWorkspace((draft) => applyProjectFocus(draft, projectId)); syncCurrentRouteToFocus('project'); }
  } else if (action === Actions.START_FOCUS_MISSION || action === Actions.START_MISSION) startMission(target.dataset.projectId, target.dataset.taskId);
  else if (action === Actions.COMPLETE_MISSION || action === Actions.COMPLETE_WORKFLOW_TASK) completeMission(target.dataset.projectId, target.dataset.taskId);
  else if (action === Actions.GENERATE_WORKFLOW_PLAN) {
    const projectId = target.dataset.projectId ?? activeProject(getWorkspace())?.id;
    if (projectId) {
      updateWorkspace((draft) => {
        const tasks = rebuildWorkflowTasks(draft, projectId, todayIso());
        const project = draft.projects.find((item) => item.id === projectId);
        const current = project ? tasks.find((task) => task.sourceStatus === project.status) : undefined;
        applyProjectFocus(draft, projectId, current?.id);
      });
      const conflicts = getWorkspace().calendarTasks.filter((task) => task.projectId === projectId && task.autoGenerated && task.conflict).length;
      showToast(conflicts ? `Rebuild แล้ว · ${conflicts} Capacity conflict` : 'สร้าง Capacity-aware workflow ใหม่แล้ว', conflicts ? 'warning' : 'success');
      navigate('calendar', { project: projectId });
    }
  }
  else if (action === Actions.DISMISS_TOAST) target.closest('.toast-region')?.remove();
  else if (action === Actions.COMPLETE_ONBOARDING) {
    updateWorkspace((draft) => { draft.settings.onboardingComplete = true; awardXp(draft, 'onboarding-complete', 60, 'consistency'); });
    navigate('hq');
  } else if (action === Actions.COMPLETE_DAILY_MISSION) completeDailyMission();
  else if (action === Actions.TOGGLE_SAVE_IDEA) {
    const id = target.dataset.ideaId;
    if (!id) return;
    updateWorkspace((draft) => { const idea = draft.ideas.find((item) => item.id === id); if (idea) idea.saved = !idea.saved; });
    showToast('อัปเดต Saved Ideas แล้ว');
  } else if (action === Actions.COPY_CAPCUT_PROMPT) void copyText(document.querySelector<HTMLTextAreaElement>('#capcut-prompt')?.value ?? '').then(() => showToast('คัดลอก CapCut Prompt แล้ว'));
  else if (action === Actions.COPY_PROMPT) void copyText(document.querySelector<HTMLTextAreaElement>('#prompt-output')?.value ?? '').then(() => showToast('คัดลอก Prompt แล้ว'));
  else if (action === Actions.GENERATE_WITH_AI) void generateCurrentPromptWithAi();
  else if (action === Actions.SAVE_PROMPT) savePrompt();
  else if (action === Actions.PARSE_RESPONSE) parseAndApplyPromptResponse();
  else if (action === Actions.MOVE_PROJECT_NEXT) moveProjectNext(target.dataset.projectId);
  else if (action === Actions.DELETE_PROJECT) void deleteProject(target.dataset.projectId);
  else if (action === Actions.TOGGLE_TASK) { const taskId = target.dataset.taskId; if (taskId) toggleCalendarTask(taskId); }
  else if (action === Actions.RESET_SIMULATOR) { updateWorkspace((draft) => { draft.simulations = []; }); showToast('Reset Simulator แล้ว'); }
  else if (action === Actions.RECALCULATE_RISK) { const projectId = target.dataset.projectId; if (projectId) recalculateProjectRisk(projectId); }
  else if (action === Actions.SAVE_SETTINGS) document.querySelector<HTMLFormElement>(`[data-form="${Forms.SETTINGS}"]`)?.requestSubmit();
  else if (action === Actions.REFRESH_AI_STATUS) void refreshAiStatus();
  else if (action === Actions.TEST_AI_PROVIDER) void testAiProvider();
  else if (action === Actions.CLEAR_AI_KEY) void clearAiKey();
  else if (action === Actions.EXPORT_ICS) exportIcs();
  else if (action === Actions.EXPORT_WORKSPACE) exportWorkspace();
  else if (action === Actions.EXPORT_PROJECTS_CSV) exportProjectsCsv();
  else if (action === Actions.EXPORT_ANALYTICS_CSV) exportAnalyticsCsv();
  else if (action === Actions.REMOVE_DEMO_DATA) void confirmDialog('Remove Demo Data', 'ลบ Demo Channels, Projects, Calendar, Analytics และ Credits โดยเก็บข้อมูลจริงไว้?', 'ลบ Demo').then((confirmed) => { if (confirmed) removeDemoData(); });
  else if (action === Actions.RESET_WORKSPACE) {
    void confirmDialog('Reset entire workspace', 'ข้อมูลทั้งหมดจะถูกแทนที่ด้วย Demo Workspace เริ่มต้น การดำเนินการนี้ย้อนกลับไม่ได้หากไม่มี Backup', 'Reset').then((confirmed) => {
      if (!confirmed) return;
      const seed = createSeedWorkspace(); seed.settings.onboardingComplete = true; replaceWorkspace(seed); showToast('Reset Workspace แล้ว'); navigate('hq');
    });
  }
});

app.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.dataset.change === Changes.ACTIVE_CHANNEL) {
    if (target.value === 'portfolio') updateWorkspace(applyPortfolioFocus);
    else updateWorkspace((draft) => applyChannelFocus(draft, target.value));
    syncCurrentRouteToFocus('channel');
  } else if (target.dataset.change === Changes.ACTIVE_PROJECT) {
    if (target.value) { updateWorkspace((draft) => applyProjectFocus(draft, target.value)); syncCurrentRouteToFocus('project'); }
  } else if (target.dataset.change === Changes.POLICY_PROJECT) {
    if (target.value) updateWorkspace((draft) => applyProjectFocus(draft, target.value));
    navigate('policy', { project: target.value });
  } else if (target.dataset.change === Changes.POLICY_CHECK) {
    const projectId = target.dataset.projectId;
    const key = target.dataset.checkKey;
    if (!projectId || !key) return;
    updateWorkspace((draft) => {
      const project = draft.projects.find((item) => item.id === projectId);
      if (!project) return;
      project.policyChecks[key] = (target as HTMLInputElement).checked;
      const missingMandatory = requiredPolicyChecks.filter((required) => !project.policyChecks[required]);
      project.riskLevel = missingMandatory.length === 0 ? 'low' : missingMandatory.length >= 4 ? 'high' : 'review';
      project.updatedAt = new Date().toISOString();
      applyProjectFocus(draft, project.id);
    });
  }
  if (target.id === 'workspace-file' && target instanceof HTMLInputElement && target.files?.[0]) void importWorkspaceFile(target.files[0]);
  if (target.id === 'analytics-csv' && target instanceof HTMLInputElement && target.files?.[0]) void importAnalyticsCsv(target.files[0]);
});

app.addEventListener('dragover', (event) => { const zone = (event.target as HTMLElement).closest('#workspace-drop'); if (!zone) return; event.preventDefault(); zone.classList.add('drag-over'); });
app.addEventListener('dragleave', (event) => { const zone = (event.target as HTMLElement).closest('#workspace-drop'); zone?.classList.remove('drag-over'); });
app.addEventListener('drop', (event) => {
  const zone = (event.target as HTMLElement).closest('#workspace-drop');
  if (!zone) return;
  event.preventDefault(); zone.classList.remove('drag-over');
  const file = event.dataTransfer?.files?.[0]; if (file) void importWorkspaceFile(file);
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); }
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { event.preventDefault(); openCommandPalette(); }
});

window.addEventListener('hashchange', () => { if (normalizeRoute(parseRoute().name) !== 'prompts') setParseMessage(''); render(); });
registerRenderer(render);

void initializeStore().then((workspace) => {
  subscribe(() => render());
  if (!location.hash) location.hash = workspace.settings.onboardingComplete ? '#/hq' : '#/onboarding';
  else render();
  if ('serviceWorker' in navigator) {
    const registerServiceWorker = (): void => { navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed.', error)); };
    if (document.readyState === 'complete') registerServiceWorker(); else window.addEventListener('load', registerServiceWorker, { once: true });
  }
}).catch((error) => {
  console.error(error);
  app.innerHTML = `<main class="fatal-error"><h1>Unable to start Creator Empire Simulator</h1><p>${escapeHtml(error instanceof Error ? error.message : 'Unknown startup error')}</p></main>`;
});
