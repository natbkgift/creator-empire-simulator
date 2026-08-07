import type { Workspace } from '../domain/types.js';
import { escapeHtml, formatNumber } from '../domain/utils.js';
import { icon } from '../ui/icons.js';
import { activeChannel, activeProject, dailyMission } from './selectors.js';
import { navigation, primaryMobileNavigation, routeTitle } from './navigation.js';
import { routeHref } from './router.js';
import { getStorageStatus } from '../db/storage.js';

export interface ToastState {
  title: string;
  detail: string;
  reward?: string;
}

export const renderShell = (
  workspace: Workspace,
  route: string,
  content: string,
  toast?: ToastState | null,
): string => {
  const levelProgress = Math.min(100, Math.round(((workspace.xp % Math.max(1, workspace.level * 180)) / Math.max(1, workspace.level * 180)) * 100));
  const nav = navigation.map((item) => `<a class="nav-dot ${item.route === route ? 'active' : ''}" href="${routeHref(item.route)}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span>${escapeHtml(item.shortLabel)}</span></a>`).join('');
  const mobileNav = navigation.filter((item) => primaryMobileNavigation.includes(item.route)).map((item) => `<a class="mobile-nav ${item.route === route ? 'active' : ''}" href="${routeHref(item.route)}">${icon(item.icon)}<span>${escapeHtml(item.shortLabel)}</span></a>`).join('');
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const mission = dailyMission(workspace);
  const storage = getStorageStatus();
  const channelProjects = channel ? workspace.projects.filter((item) => item.channelId === channel.id) : workspace.projects;
  const onboarding = workspace.settings.onboardingComplete ? '' : `
    <section class="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div class="panel onboarding-card">
        <span class="kicker">Creator Studio Boot Sequence</span>
        <h2 id="onboarding-title">สร้างช่องให้เป็นระบบ ไม่ใช่ผลิตคลิปแบบเดา</h2>
        <p class="muted small-copy">เริ่มจาก Demo Workspace สองช่อง ทดลอง Idea ภาษาไทย/อังกฤษ แล้วใช้ข้อมูลจริงแทนสมมติฐานเมื่อเผยแพร่ 5–10 คลิป</p>
        <div class="onboarding-steps">
          <div class="onboarding-step"><span class="chip cyan">01</span><b>เลือกโอกาส</b><p>เปรียบเทียบ 50 Ideas แยกคะแนนไทยและอังกฤษก่อนเปิดช่องใหม่</p></div>
          <div class="onboarding-step"><span class="chip amber">02</span><b>ผลิตอย่างควบคุม</b><p>ใช้ Mission Control, Prompt Studio, CapCut Ledger และ WIP limits เพื่อลดเวลาและเครดิตสูญเปล่า</p></div>
          <div class="onboarding-step"><span class="chip violet">03</span><b>เรียนรู้จากข้อมูลจริง</b><p>บันทึก Analytics, ทำ Post-mortem และให้ระบบส่งภารกิจถัดไปอัตโนมัติ</p></div>
        </div>
        <div class="row between wrap">
          <span class="inline-note">ระบบหลักทำงานแบบ Local-first และไม่ต้องใช้ API Key</span>
          <button class="btn primary" data-action="complete-onboarding">เริ่มใช้งาน Demo Workspace</button>
        </div>
      </div>
    </section>`;
  const toastMarkup = toast ? `<div class="toast-region" role="status"><div class="toast"><span class="reward">${escapeHtml(toast.reward ?? '✓')}</span><div><strong>${escapeHtml(toast.title)}</strong><span>${escapeHtml(toast.detail)}</span></div><button aria-label="ปิด" data-action="dismiss-toast">×</button></div></div>` : '';
  const focusControls = `<div class="focus-switcher" aria-label="Channel and project focus">
      <label><span>Channel Focus</span><select class="focus-select" data-change="active-channel"><option value="portfolio" ${workspace.focus.mode === 'portfolio' ? 'selected' : ''}>Portfolio · ทุกช่อง</option>${workspace.channels.map((item) => `<option value="${escapeHtml(item.id)}" ${channel?.id === item.id && workspace.focus.mode === 'channel' ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
      <label><span>Active Project</span><select class="focus-select" data-change="active-project" ${channelProjects.length ? '' : 'disabled'}>${channelProjects.map((item) => `<option value="${escapeHtml(item.id)}" ${project?.id === item.id ? 'selected' : ''}>${escapeHtml(item.title)} · ${escapeHtml(item.status)}</option>`).join('')}</select></label>
      <button class="focus-mission-button" data-action="start-focus-mission" data-project-id="${escapeHtml(project?.id ?? '')}" data-task-id="${escapeHtml(mission.taskId ?? '')}">${icon('play')}<span>Start mission</span></button>
    </div>`;
  return `
    <div class="screen app-live">
      <div class="app-shell">
        <aside class="side-rail" aria-label="เมนูหลัก">
          <a class="brand-orbit" href="${routeHref('hq')}" aria-label="Creator Empire Simulator"></a>
          ${nav}
          <div class="nav-spacer"></div>
        </aside>
        <header class="topbar">
          <div class="top-title"><h1>Creator Empire</h1><span>${escapeHtml(routeTitle(route))} · ${workspace.settings.workflowMode === 'automatic' ? `Automatic ${workspace.settings.aiProvider.toUpperCase()}` : 'Manual'}</span></div>
          ${focusControls}
          <div class="hud">
            <button class="hud-command" data-action="open-command" aria-label="ค้นหา">${icon('search')}</button>
            <div class="hud-item"><span class="orb"></span><div><b>Lv ${workspace.level}</b><small>${formatNumber(workspace.xp)} XP · ${levelProgress}%</small></div></div>
            <div class="hud-item"><span class="orb" style="background:var(--amber)"></span><div><b>${formatNumber(workspace.settings.capcutBalance)}</b><small>CapCut credits</small></div></div>
            <div class="hud-item storage-hud"><span class="orb" style="background:${storage.mode === 'sqlite' ? 'var(--green)' : 'var(--amber)'}"></span><div><b>${storage.mode === 'sqlite' ? 'SQLite' : 'IndexedDB'}</b><small>${escapeHtml(storage.detail)}</small></div></div>
          </div>
        </header>
        <div class="focus-mobile-bar">
          <button data-action="open-focus-picker"><span><small>${workspace.focus.mode === 'portfolio' ? 'Portfolio' : escapeHtml(channel?.name ?? 'Choose channel')}</small><strong>${escapeHtml(project?.title ?? 'No active project')}</strong></span>${icon('chevron')}</button>
          <button class="mobile-mission" data-action="start-focus-mission" data-project-id="${escapeHtml(project?.id ?? '')}" data-task-id="${escapeHtml(mission.taskId ?? '')}"><span>${escapeHtml(mission.title)}</span>${icon('play')}</button>
        </div>
        <main id="main-content" class="content" tabindex="-1">${content}</main>
      </div>
      <nav class="mobile-bottom" aria-label="เมนูมือถือ">${mobileNav}</nav>
      ${onboarding}
      ${toastMarkup}
    </div>`;
};
