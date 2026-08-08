import type { Workspace } from '../domain/types.js';
import { escapeHtml } from '../domain/utils.js';
import { icon } from '../ui/icons.js';
import { activeChannel, activeProject, statusLabels } from './selectors.js';
import { navigation, primaryMobileNavigation } from './navigation.js';
import { routeHref } from './router.js';
import { getStorageStatus } from '../db/storage.js';
import '../controllers/editorial-controller.js';

export interface ToastState { title: string; detail: string; reward?: string; }

const renderChannelOptions = (workspace: Workspace, activeId?: string): string =>
  `<option value="portfolio" ${workspace.focus.mode === 'portfolio' ? 'selected' : ''}>Portfolio · All Channels</option>${workspace.channels.map((item) => `<option value="${escapeHtml(item.id)}" ${activeId === item.id && workspace.focus.mode === 'channel' ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`;

export const renderShell = (workspace: Workspace, route: string, content: string, toast?: ToastState | null): string => {
  const nav = navigation.map((item) => `<a class="nav-dot ${item.route === route ? 'active' : ''}" href="${routeHref(item.route)}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}"><span class="nav-icon">${icon(item.icon)}</span><span class="nav-label">${escapeHtml(item.shortLabel)}</span></a>`).join('');
  const mobileNav = navigation.filter((item) => primaryMobileNavigation.includes(item.route)).map((item) => `<a class="mobile-nav ${item.route === route ? 'active' : ''}" href="${routeHref(item.route)}" aria-label="${escapeHtml(item.label)}">${icon(item.icon)}<span>${escapeHtml(item.shortLabel)}</span></a>`).join('');
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const storage = getStorageStatus();
  const channelProjects = channel ? workspace.projects.filter((item) => item.channelId === channel.id && item.status !== 'archived') : [];
  const storageHealthy = storage.mode === 'sqlite' || storage.mode === 'hybrid';
  const workflowLabel = workspace.settings.workflowMode === 'automatic'
    ? `AI Assisted · ${workspace.settings.aiProvider === 'openai' ? 'OpenAI' : 'Gemini'}`
    : 'Manual';
  const publishAt = project?.publishAt ?? (project?.deadline ? `${project.deadline}T${workspace.settings.defaultPublishTime || '19:00'}` : '');

  const onboarding = workspace.settings.onboardingComplete ? '' : `
    <section class="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div class="panel onboarding-card">
        <span class="kicker">Creator Studio Setup</span>
        <h2 id="onboarding-title">เลือกช่อง วางวัน Publish แล้วทำ Mission ถัดไป</h2>
        <p class="muted small-copy">ระบบโฟกัสงานที่ต้องทำวันนี้ เก็บ Workspace ใน SQLite พร้อม IndexedDB mirror และแยก Growth Loop หลังวิดีโอ Publish สำเร็จ</p>
        <div class="onboarding-steps">
          <div class="onboarding-step"><span class="chip cyan">01</span><b>เลือก Channel</b><p>เริ่มจากหนึ่งช่องหลักและหนึ่งช่องทดลอง</p></div>
          <div class="onboarding-step"><span class="chip amber">02</span><b>กำหนด Publish</b><p>เลือกหัวข้อ ชนิด และวันเวลา แล้ว Calendar จัดลำดับงาน</p></div>
          <div class="onboarding-step"><span class="chip violet">03</span><b>ทำ Next Mission</b><p>Prompt, CapCut และ Policy จะเปิดตาม Context ไม่ต้องหาเมนูเอง</p></div>
        </div>
        <div class="row between wrap"><span class="inline-note">Manual ใช้ได้โดยไม่ต้องมี API · AI Assisted ใช้ OpenAI/Gemini ผ่าน local server</span><button class="btn primary" data-action="complete-onboarding">เข้า Today</button></div>
      </div>
    </section>`;
  const toastMarkup = toast ? `<div class="toast-region" role="status"><div class="toast"><span class="reward">${escapeHtml(toast.reward ?? '✓')}</span><div><strong>${escapeHtml(toast.title)}</strong><span>${escapeHtml(toast.detail)}</span></div><button aria-label="ปิด" data-action="dismiss-toast">×</button></div></div>` : '';

  const headerContext = `<div class="command-context" aria-label="Workspace context">
      <label class="command-select command-channel">
        <span class="context-dot ${channel ? escapeHtml(channel.role) : 'portfolio'}" aria-hidden="true"></span>
        <span class="sr-only">Channel focus</span>
        <select data-change="active-channel" aria-label="Switch Channel">${renderChannelOptions(workspace, channel?.id)}</select>
        ${icon('chevron')}
      </label>
      ${channel ? `<span class="context-separator" aria-hidden="true">›</span><label class="command-select command-video"><span class="sr-only">Active video</span><select data-change="active-project" aria-label="Switch active video" ${channelProjects.length ? '' : 'disabled'}>${channelProjects.map((item) => `<option value="${escapeHtml(item.id)}" ${project?.id === item.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('')}</select>${icon('chevron')}</label>` : ''}
      ${project ? `<span class="context-stage">${escapeHtml(statusLabels[project.status])}</span>${publishAt ? `<span class="context-publish">Publish · ${escapeHtml(publishAt.replace('T', ' '))}</span>` : ''}` : ''}
    </div>`;

  return `
    <div class="screen app-live editorial-os">
      <a class="skip-link" href="#main-content">Skip to content</a>
      <div class="app-shell">
        <aside class="side-rail" aria-label="Main navigation">
          <button class="brand-orbit" type="button" data-action="toggle-sidebar" aria-label="Expand or collapse sidebar" title="Creator Empire"><span class="brand-mark-text">CE</span><span class="brand-copy"><strong>Creator</strong><small>Empire</small></span></button>
          <nav class="side-nav">${nav}</nav>
          <div class="nav-spacer"></div>
          <a class="side-ai-status" href="${routeHref('settings')}" title="${escapeHtml(workflowLabel)}"><span class="orb ${workspace.settings.workflowMode === 'automatic' ? 'healthy' : ''}"></span><span class="side-ai-copy"><strong>${workspace.settings.workflowMode === 'automatic' ? 'AI Assisted' : 'Manual'}</strong><small>${workspace.settings.workflowMode === 'automatic' ? escapeHtml(workspace.settings.aiProvider === 'openai' ? workspace.settings.openAiModel : workspace.settings.geminiModel) : 'External AI workflow'}</small></span></a>
        </aside>
        <header class="topbar global-command-header">
          ${headerContext}
          <button class="global-search" data-action="open-command" aria-label="Search or jump to"><span>${icon('search')}</span><span class="global-search-label">Search or jump to…</span><kbd>⌘K</kbd></button>
          <div class="global-controls">
            <a class="ai-mode-status" href="${routeHref('settings')}" aria-label="AI mode settings"><span class="orb ${workspace.settings.workflowMode === 'automatic' ? 'healthy' : ''}"></span><span>${escapeHtml(workflowLabel)}</span></a>
            <a class="icon-command" href="${routeHref('settings')}" aria-label="Settings" title="Settings">${icon('gear')}</a>
            <a class="system-status ${storageHealthy ? 'healthy' : 'warning'}" href="${routeHref('import-export')}" aria-label="Storage and recovery status" title="${escapeHtml(storage.detail)}"><span class="orb ${storageHealthy ? 'healthy' : ''}"></span><span>${storage.mode === 'hybrid' ? 'Synced' : storage.mode === 'sqlite' ? 'SQLite' : 'Offline'}</span></a>
          </div>
        </header>
        <div class="focus-mobile-bar">
          <div class="mobile-context-copy"><span>${workspace.focus.mode === 'portfolio' ? 'Portfolio' : escapeHtml(channel?.name ?? 'Choose channel')}</span><strong>${escapeHtml(project?.title ?? 'All channels')}</strong>${project ? `<small>${escapeHtml(statusLabels[project.status])}</small>` : ''}</div>
          <button class="mobile-search" data-action="open-command" aria-label="Search">${icon('search')}</button>
          <button class="mobile-more" data-action="open-mobile-controls" aria-label="Workspace controls">•••</button>
        </div>
        <main id="main-content" class="content" tabindex="-1">${content}</main>
      </div>
      <nav class="mobile-bottom" aria-label="Mobile navigation">${mobileNav}</nav>
      ${onboarding}${toastMarkup}
    </div>`;
};
