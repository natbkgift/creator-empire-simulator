import { getWorkspace } from '../app/store.js';
import { routeHref } from '../app/router.js';
import { navigation } from '../app/navigation.js';
import { escapeHtml } from '../domain/utils.js';
import { openDialog } from '../ui/feedback.js';

export const openCommandPalette = (): void => {
  const workspace = getWorkspace();
  const dialog = openDialog('Command Palette', `
    <label><span>ค้นหา</span><input id="command-query" class="input" autocomplete="off" placeholder="Idea, Channel, Project หรือห้องทำงาน"></label>
    <div id="command-results" class="command-results"></div>
  `, 'md');
  const input = dialog.querySelector<HTMLInputElement>('#command-query');
  const results = dialog.querySelector<HTMLElement>('#command-results');
  const renderResults = (): void => {
    const query = (input?.value ?? '').trim().toLowerCase();
    const items: Array<{ title: string; detail: string; href: string }> = [
      ...navigation.map((item) => ({ title: item.label, detail: 'Studio room', href: routeHref(item.route) })),
      ...workspace.channels.map((item) => ({ title: item.name, detail: `${item.role} channel · ${item.language.toUpperCase()}`, href: routeHref('blueprint', { channel: item.id }) })),
      ...workspace.projects.map((item) => ({ title: item.title, detail: `${item.status} · ${item.format}`, href: routeHref('mission', { project: item.id }) })),
      ...workspace.ideas.map((item) => ({ title: `${item.titleEn} / ${item.titleTh}`, detail: item.categoryNameTh, href: routeHref('ideas', { idea: item.id }) })),
    ].filter((item) => !query || `${item.title} ${item.detail}`.toLowerCase().includes(query)).slice(0, 18);
    if (results) {
      results.innerHTML = items.map((item) => `<a href="${item.href}" data-command-link><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></a>`).join('') || '<div class="empty-panel small"><h3>ไม่พบผลลัพธ์</h3></div>';
    }
    results?.querySelectorAll('[data-command-link]').forEach((link) => link.addEventListener('click', () => dialog.close()));
  };
  input?.addEventListener('input', renderResults);
  renderResults();
  requestAnimationFrame(() => input?.focus());
};
