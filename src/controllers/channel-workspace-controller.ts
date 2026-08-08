import { getWorkspace, updateWorkspace } from '../app/store.js';
import { addDays, escapeHtml, todayIso } from '../domain/utils.js';
import { openDialog, showToast } from '../ui/feedback.js';
import { createProjectFromForm } from './entity-controller.js';

const objectiveOptions = ['Hook Test', 'Demand Test', 'Build Authority', 'Audience Education', 'Conversion', 'Series Development', 'Trend Response'];

const planItem = (channelId: string, index: number) => {
  const workspace = getWorkspace();
  const channel = workspace.channels.find((item) => item.id === channelId);
  const item = channel?.blueprint.plan30Days[index];
  return { workspace, channel, item };
};

export const openPlanIdeaDialog = (channelId: string, index: number): void => {
  const { workspace, channel, item } = planItem(channelId, index);
  if (!channel || !item) { showToast('ไม่พบ Content idea นี้', 'warning'); return; }
  const publishDate = addDays(todayIso(), Math.max(1, item.day - 1));
  const publishTime = workspace.settings.defaultPublishTime || '19:00';
  const pillar = item.pillar ?? channel.blueprint.pillars[index % Math.max(1, channel.blueprint.pillars.length)] ?? channel.niche;
  const hook = item.hook ?? item.title;
  const dialog = openDialog('Content idea', `
    <div class="idea-detail-head"><span class="kicker">DAY ${item.day} · ${escapeHtml(item.format.toUpperCase())}</span><h3>${escapeHtml(item.title)}</h3><p class="muted small-copy">${escapeHtml(item.objective)} · ${escapeHtml(pillar)}</p></div>
    <form id="plan-idea-form" class="stack">
      <input type="hidden" name="channelId" value="${escapeHtml(channel.id)}"/>
      <div class="field"><label>Topic / title</label><input class="input" name="title" value="${escapeHtml(item.title)}" required/></div>
      <div class="form-grid two"><div class="field"><label>Format</label><select class="select" name="format"><option value="shorts" ${item.format === 'shorts' ? 'selected' : ''}>Shorts</option><option value="long" ${item.format === 'long' ? 'selected' : ''}>Long-form</option></select></div><div class="field"><label>Publish date & time</label><input class="input" name="deadline" type="datetime-local" value="${publishDate}T${escapeHtml(publishTime)}" required/></div></div>
      <div class="form-grid two"><div class="field"><label>Objective</label><select class="select" name="objective">${objectiveOptions.map((value) => `<option ${value === item.objective ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></div><div class="field"><label>Content pillar</label><input class="input" name="pillar" value="${escapeHtml(pillar)}"/></div></div>
      <div class="field"><label>Suggested hook</label><textarea class="textarea" name="hook" rows="3">${escapeHtml(hook)}</textarea></div>
      <div class="idea-dialog-actions"><button class="btn" type="button" data-save-plan-idea>Save idea</button><button class="btn primary" type="submit">Create Video & plan Calendar</button></div>
    </form>`, 'lg');
  const form = dialog.querySelector<HTMLFormElement>('#plan-idea-form');
  const saveIdea = (): void => {
    if (!form) return;
    const data = new FormData(form);
    updateWorkspace((draft) => {
      const targetChannel = draft.channels.find((candidate) => candidate.id === channelId);
      const target = targetChannel?.blueprint.plan30Days[index];
      if (!target) return;
      target.title = String(data.get('title') ?? target.title).trim() || target.title;
      target.format = String(data.get('format')) === 'long' ? 'long' : 'shorts';
      target.objective = String(data.get('objective') ?? target.objective).trim() || target.objective;
      target.pillar = String(data.get('pillar') ?? '').trim() || undefined;
      target.hook = String(data.get('hook') ?? '').trim() || undefined;
    });
    showToast('บันทึก Content idea แล้ว');
  };
  dialog.querySelector('[data-save-plan-idea]')?.addEventListener('click', saveIdea);
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveIdea();
    dialog.close();
    createProjectFromForm(form);
  });
};

export const openAddPlanIdeaDialog = (channelId: string): void => {
  const workspace = getWorkspace();
  const channel = workspace.channels.find((item) => item.id === channelId);
  if (!channel) { showToast('ไม่พบ Channel', 'warning'); return; }
  const suggestedDay = Math.min(30, (channel.blueprint.plan30Days.at(-1)?.day ?? 0) + 3);
  const dialog = openDialog('Add content idea', `
    <form id="add-plan-idea-form" class="stack">
      <div class="field"><label>Topic / title</label><input class="input" name="title" required placeholder="หัวข้อวิดีโอใหม่"/></div>
      <div class="form-grid two"><div class="field"><label>Day</label><input class="input" name="day" type="number" min="1" max="30" value="${suggestedDay}"/></div><div class="field"><label>Format</label><select class="select" name="format"><option value="shorts">Shorts</option><option value="long">Long-form</option></select></div></div>
      <div class="form-grid two"><div class="field"><label>Objective</label><select class="select" name="objective">${objectiveOptions.map((value) => `<option>${escapeHtml(value)}</option>`).join('')}</select></div><div class="field"><label>Content pillar</label><select class="select" name="pillar">${channel.blueprint.pillars.map((value) => `<option>${escapeHtml(value)}</option>`).join('')}</select></div></div>
      <div class="field"><label>Suggested hook</label><textarea class="textarea" name="hook" rows="3"></textarea></div>
      <div class="dialog-actions"><button class="btn primary" type="submit">Add to 30-Day Plan</button></div>
    </form>`, 'md');
  dialog.querySelector<HTMLFormElement>('#add-plan-idea-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const title = String(data.get('title') ?? '').trim();
    if (!title) return;
    updateWorkspace((draft) => {
      const target = draft.channels.find((candidate) => candidate.id === channelId);
      if (!target) return;
      target.blueprint.plan30Days.push({
        day: Math.max(1, Math.min(30, Number(data.get('day')) || suggestedDay)),
        title,
        format: String(data.get('format')) === 'long' ? 'long' : 'shorts',
        objective: String(data.get('objective') ?? 'Hook Test'),
        pillar: String(data.get('pillar') ?? '').trim() || undefined,
        hook: String(data.get('hook') ?? '').trim() || undefined,
      });
      target.blueprint.plan30Days.sort((a, b) => a.day - b.day);
    });
    dialog.close();
    showToast('เพิ่ม Content idea แล้ว');
  });
};

export const regenerateThirtyDayPlan = (channelId: string): void => {
  updateWorkspace((draft) => {
    const channel = draft.channels.find((item) => item.id === channelId);
    if (!channel || !channel.blueprint.plan30Days.length) return;
    const items = channel.blueprint.plan30Days;
    const step = items.length <= 1 ? 0 : 29 / (items.length - 1);
    items.forEach((item, index) => {
      item.day = Math.max(1, Math.min(30, Math.round(1 + index * step)));
      item.pillar = item.pillar ?? channel.blueprint.pillars[index % Math.max(1, channel.blueprint.pillars.length)];
      item.hook = item.hook ?? item.title;
    });
  });
  showToast('Rebalanced 30-Day Content Plan แล้ว');
};
