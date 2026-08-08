import type { Workspace } from '../domain/types.js';
import { escapeHtml, formatNumber } from '../domain/utils.js';
import { icon } from '../ui/icons.js';
import { activeChannel, activeProject, dailyMission } from './selectors.js';
import { navigation, primaryMobileNavigation, routeTitle } from './navigation.js';
import { routeHref } from './router.js';
import { getStorageStatus } from '../db/storage.js';

export interface ToastState { title: string; detail: string; reward?: string; }

export const renderShell = (workspace: Workspace, route: string, content: string, toast?: ToastState | null): string => {
  const nav = navigation.map((item) => `<a class="nav-dot ${item.route === route ? 'active' : ''}" href="${routeHref(item.route)}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span>${escapeHtml(item.shortLabel)}</span></a>`).join('');
  const mobileNav = navigation.filter((item) => primaryMobileNavigation.includes(item.route)).map((item) => `<a class="mobile-nav ${item.route === route ? 'active' : ''}" href="${routeHref(item.route)}">${icon(item.icon)}<span>${escapeHtml(item.shortLabel)}</span></a>`).join('');
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const mission = dailyMission(workspace);
  const storage = getStorageStatus();
  const channelProjects = channel ? workspace.projects.filter((item) => item.channelId === channel.id) : workspace.projects;
  const storageHealthy = storage.mode === 'sqlite' || storage.mode === 'hybrid';
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
  const focusControls = `<div class="focus-switcher" aria-label="Channel and project focus">
      <label><span>Channel</span><select class="focus-select" data-change="active-channel"><option value="portfolio" ${workspace.focus.mode === 'portfolio' ? 'selected' : ''}>Portfolio · ทุกช่อง</option>${workspace.channels.map((item) => `<option value="${escapeHtml(item.id)}" ${channel?.id === item.id && workspace.focus.mode === 'channel' ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
      <label><span>Active video</span><select class="focus-select" data-change="active-project" ${channelProjects.length ? '' : 'disabled'}>${channelProjects.map((item) => `<option value="${escapeHtml(item.id)}" ${project?.id === item.id ? 'selected' : ''}>${escapeHtml(item.title)} · ${escapeHtml(item.status)}</option>`).join('')}</select></label>
      <button class="focus-mission-button" data-action="start-focus-mission" data-project-id="${escapeHtml(project?.id ?? '')}" data-task-id="${escapeHtml(mission.taskId ?? '')}">${icon('play')}<span>Start</span></button>
    </div>`;
  return `
    <div class="screen app-live">
      <div class="app-shell">
        <aside class="side-rail" aria-label="เมนูหลัก"><a class="brand-orbit" href="${routeHref('hq')}" aria-label="Creator Empire Simulator"></a>${nav}<div class="nav-spacer"></div></aside>
        <header class="topbar">
          <div class="top-title"><h1>Creator Empire</h1><span>${escapeHtml(routeTitle(route))} · ${workspace.settings.workflowMode === 'automatic' ? `AI Assisted · ${workspace.settings.aiProvider.toUpperCase()}` : 'Manual'}</span></div>
          ${focusControls}
          <div class="hud">
            <button class="hud-command" data-action="open-command" aria-label="ค้นหา">${icon('search')}</button>
            <a class="hud-command" href="${routeHref('settings')}" aria-label="Settings" title="Settings">${icon('gear')}</a>
            <div class="hud-item"><span class="orb" style="background:var(--amber)"></span><div><b>${formatNumber(workspace.settings.capcutBalance)}</b><small>CapCut credits</small></div></div>
            <div class="hud-item storage-hud"><span class="orb" style="background:${storageHealthy ? 'var(--green)' : 'var(--amber)'}"></span><div><b>${storage.mode === 'hybrid' ? 'SQLite + backup' : storage.mode === 'sqlite' ? 'SQLite' : 'Offline backup'}</b><small>${escapeHtml(storage.detail)}</small></div></div>
          </div>
        </header>
        <div class="focus-mobile-bar">
          <button data-action="open-focus-picker"><span><small>${workspace.focus.mode === 'portfolio' ? 'Portfolio' : escapeHtml(channel?.name ?? 'Choose channel')}</small><strong>${escapeHtml(project?.title ?? 'No active video')}</strong></span>${icon('chevron')}</button>
          <button class="mobile-mission" data-action="start-focus-mission" data-project-id="${escapeHtml(project?.id ?? '')}" data-task-id="${escapeHtml(mission.taskId ?? '')}"><span>${escapeHtml(mission.title)}</span>${icon('play')}</button>
        </div>
        <main id="main-content" class="content" tabindex="-1">${content}</main>
      </div>
      <nav class="mobile-bottom" aria-label="เมนูมือถือ">${mobileNav}</nav>
      ${onboarding}${toastMarkup}
    </div>`;
};
