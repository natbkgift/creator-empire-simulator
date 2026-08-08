import { getWorkspace } from '../app/store.js';
import { routeHref } from '../app/router.js';
import { navigation } from '../app/navigation.js';
import { activeChannel, activeProject } from '../app/selectors.js';
import { escapeHtml } from '../domain/utils.js';
import { openDialog } from '../ui/feedback.js';

export const openCommandPalette = (): void => {
  const workspace = getWorkspace();
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const dialog = openDialog('Search or jump to…', `
    <label><span>Global command</span><input id="command-query" class="input" autocomplete="off" placeholder="Channel, video, idea or destination"></label>
    <div class="command-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</div>
    <div id="command-results" class="command-results"></div>
  `, 'md');
  const input = dialog.querySelector<HTMLInputElement>('#command-query');
  const results = dialog.querySelector<HTMLElement>('#command-results');
  let activeIndex = 0;
  let anchors: HTMLAnchorElement[] = [];

  const renderResults = (): void => {
    const query = (input?.value ?? '').trim().toLowerCase();
    const quick: Array<{ title: string; detail: string; href: string }> = [
      ...(project ? [{ title: 'Start Current Mission', detail: `${project.title} · ${project.status}`, href: routeHref('mission', { project: project.id }) }] : []),
      { title: 'Create New Video', detail: channel ? `Plan in ${channel.name}` : 'Choose a Channel and plan a publish datetime', href: routeHref('blueprint', channel ? { channel: channel.id } : { portfolio: '1' }) },
      { title: 'Switch Channel', detail: channel?.name ?? 'Portfolio · All Channels', href: routeHref('blueprint', { portfolio: '1' }) },
    ];
    const items: Array<{ title: string; detail: string; href: string }> = [
      ...quick,
      ...navigation.map((item) => ({ title: item.label, detail: 'Creator OS destination', href: routeHref(item.route) })),
      ...workspace.channels.map((item) => ({ title: item.name, detail: `${item.role} channel · ${item.language.toUpperCase()}`, href: routeHref('blueprint', { channel: item.id }) })),
      ...workspace.projects.map((item) => ({ title: item.title, detail: `${item.status} · ${item.format}`, href: routeHref('mission', { project: item.id }) })),
      ...workspace.ideas.map((item) => ({ title: `${item.titleEn} / ${item.titleTh}`, detail: item.categoryNameTh, href: routeHref('ideas', { idea: item.id }) })),
    ].filter((item) => !query || `${item.title} ${item.detail}`.toLowerCase().includes(query)).slice(0, 22);
    activeIndex = Math.min(activeIndex, Math.max(0, items.length - 1));
    if (results) {
      results.innerHTML = items.map((item, index) => `<a href="${item.href}" data-command-link class="${index === activeIndex ? 'active' : ''}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></a>`).join('') || '<div class="empty-panel small"><h3>No results</h3><p>Try a Channel, video title or destination.</p></div>';
      anchors = Array.from(results.querySelectorAll<HTMLAnchorElement>('[data-command-link]'));
      anchors.forEach((link) => link.addEventListener('click', () => dialog.close()));
      anchors[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  };
  input?.addEventListener('input', () => { activeIndex = 0; renderResults(); });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, Math.max(0, anchors.length - 1)); renderResults(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); renderResults(); }
    else if (event.key === 'Enter') { event.preventDefault(); anchors[activeIndex]?.click(); }
  });
  renderResults();
  requestAnimationFrame(() => input?.focus());
};
