import type { Workspace } from '../domain/types.js';
import { escapeHtml } from '../domain/utils.js';
import { icon } from '../ui/icons.js';
import { routeHref } from './router.js';

const simpleNavigation = [
  { route: 'beta/create', label: 'สร้างวิดีโอ', icon: 'sparkle' },
  { route: 'simple/channels', label: 'ช่องของฉัน', icon: 'blueprint' },
  { route: 'simple/projects', label: 'ผลงาน', icon: 'board' },
  { route: 'hq', label: 'Expert', icon: 'map' },
];

export const renderSimpleShell = (workspace: Workspace, route: string, content: string): string => {
  const nav = simpleNavigation.map((item) => `<a class="simple-nav-link ${item.route === route ? 'active' : ''}" href="${routeHref(item.route)}">${icon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`).join('');
  return `<div class="simple-screen">
    <a class="skip-link" href="#simple-main">ข้ามไปยังเนื้อหา</a>
    <aside class="simple-sidebar" aria-label="เมนูหลัก">
      <a class="simple-brand" href="${routeHref('beta/create')}"><img src="./simple-logo.png" width="48" height="48" alt=""><span><strong>Creator Empire</strong><small>by FlowBiz</small></span></a>
      <nav class="simple-nav">${nav}</nav>
      <div class="simple-profile"><span class="simple-avatar">F</span><span><strong>${escapeHtml(workspace.name || 'FlowBiz Creator Lab')}</strong><small>Creator</small></span>${icon('chevron')}</div>
    </aside>
    <header class="simple-topbar">
      <div class="simple-workspace"><span class="simple-avatar">FL</span><strong>${escapeHtml(workspace.name || 'FlowBiz Creator Lab')}</strong>${icon('chevron')}</div>
      <span class="simple-beta-badge">Simple Beta</span>
    </header>
    <main id="simple-main" class="simple-main" tabindex="-1">${content}</main>
  </div>`;
};
