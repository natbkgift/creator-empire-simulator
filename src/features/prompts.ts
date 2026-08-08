import type { Language, PromptType, Workspace } from '../domain/types.js';
import { generatePrompt, promptTypes } from '../domain/prompts.js';
import { escapeHtml } from '../domain/utils.js';
import { activeProject, channelById, projectsInFocus, projectById, statusLabels } from '../app/selectors.js';
import { routeHref } from '../app/router.js';
import { promptCompletionStatus, workflowReadiness, workflowRecommendation } from '../domain/workflow.js';
import { chip, pageHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export const openAiTerraPromptTypes = new Set<PromptType>(['niche-research', 'fact-check', 'analytics-postmortem']);

export const renderPrompts = (workspace: Workspace, params: URLSearchParams, parsedResponse?: string): string => {
  const focused = activeProject(workspace);
  const requested = projectById(workspace, params.get('project') ?? undefined);
  const project = requested ?? focused ?? workspace.projects[0];
  const channel = project ? channelById(workspace, project.channelId) : workspace.channels[0];
  const idea = workspace.ideas.find((item) => item.id === (project?.ideaId ?? channel?.ideaId));
  const recommendation = project ? workflowRecommendation(workspace, project) : undefined;
  const recommendedType = recommendation?.promptType ?? (project?.format === 'long' ? 'long-script' : 'shorts-script');
  const type = (promptTypes.some((item) => item.id === params.get('type')) ? params.get('type') : recommendedType) as PromptType;
  const terraRouted = openAiTerraPromptTypes.has(type);
  const language = (params.get('lang') === 'th' ? 'th' : project?.language ?? channel?.language ?? 'en') as Language;
  const advanced = params.get('advanced') === '1';
  const shorter = params.get('short') === '1';
  const prompt = generatePrompt({ type, language, idea, channel, project, workspace, advanced, shorter });
  const targetStatus = project ? promptCompletionStatus(type, project) ?? (type === recommendedType ? recommendation?.targetStatus : undefined) : undefined;
  const readiness = project ? workflowReadiness(workspace, project, targetStatus) : { ready: false, completed: [], blockers: ['Select a project.'] };
  const scopedProjects = projectsInFocus(workspace);
  const routeParams = (next: Partial<{type: PromptType; lang: Language; advanced: string; short: string; project: string}>) => routeHref('prompts', {
    project: next.project ?? project?.id,
    type: next.type ?? type,
    lang: next.lang ?? language,
    advanced: next.advanced ?? (advanced ? '1' : '0'),
    short: next.short ?? (shorter ? '1' : '0'),
  });
  if (!project) return `${pageHeader('Prompt Studio', 'เลือก Active Project เพื่อประกอบ Prompt จากข้อมูลจริง')}<section class="panel empty-panel"><h3>No active project</h3></section>`;
  return `${pageHeader('Prompt Studio', 'Prompt ถูกผูกกับ Active Project และ Pipeline จะเลือกงานที่ควรทำถัดไปให้', `<a class="btn" href="${routeHref('mission', { project: project.id })}">Mission Control</a><button class="btn primary" data-action="copy-prompt">Copy prompt</button>`)}
    <section class="prompt-recommended ${type === recommendedType ? 'active' : ''}">
      <div><span class="kicker">Pipeline recommendation</span><h3>${escapeHtml(recommendation?.title ?? 'Choose a prompt')}</h3><p>${escapeHtml(recommendation?.detail ?? '')}</p></div>
      <div class="prompt-recommended-meta">${chip(statusLabels[project.status], 'cyan')}${targetStatus ? chip(`→ ${statusLabels[targetStatus]}`, readiness.ready ? 'green' : 'amber') : ''}<a class="btn ${type === recommendedType ? 'primary' : ''}" href="${routeParams({ type: recommendedType })}">Use recommended prompt</a></div>
    </section>
    <div class="prompt-layout">
      <nav class="panel prompt-nav" aria-label="Prompt types"><h3>Prompt library</h3>${promptTypes.map((item, index) => `<a class="prompt-type ${item.id === type ? 'active' : ''} ${item.id === recommendedType ? 'recommended' : ''}" href="${routeParams({ type: item.id })}" style="text-decoration:none"><span class="picon">${index + 1}</span><span>${escapeHtml(item.name)}</span><em>${item.id === recommendedType ? 'next' : item.id === type ? 'active' : ''}</em></a>`).join('')}</nav>
      <section class="panel prompt-form">
        <h3>Active project context</h3><p>เปลี่ยน Project แล้วระบบจะเปลี่ยน Channel, ภาษา, Analytics และ Prompt Context ตาม Project นั้น</p>
        <form data-form="prompt-context" class="stack">
          <div class="field"><label>Project</label><select class="select" name="project">${scopedProjects.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === project.id ? 'selected' : ''}>${escapeHtml(item.title)} · ${escapeHtml(statusLabels[item.status])}</option>`).join('')}</select></div>
          <div class="form-row"><div class="field"><label>Language</label><select class="select" name="lang"><option value="en" ${language === 'en' ? 'selected' : ''}>English</option><option value="th" ${language === 'th' ? 'selected' : ''}>ไทย</option></select></div><div class="field"><label>Prompt type</label><select class="select" name="type">${promptTypes.map((item) => `<option value="${item.id}" ${item.id === type ? 'selected' : ''}>${escapeHtml(item.name)}${item.id === recommendedType ? ' · NEXT' : ''}</option>`).join('')}</select></div></div>
          <label class="checkbox-row"><input type="checkbox" name="advanced" value="1" ${advanced ? 'checked' : ''}/><span><strong>Advanced red-team pass</strong><br/>เพิ่มความไม่แน่นอน, Risk และ Execution checklist</span></label>
          <label class="checkbox-row"><input type="checkbox" name="short" value="1" ${shorter ? 'checked' : ''}/><span><strong>Concise output</strong><br/>ขอเฉพาะข้อมูลที่ใช้ทำงานต่อทันที</span></label>
          <button class="btn" type="submit">Update context</button>
        </form>
        <div class="form-section"><h4>Resolved inputs</h4><div class="stack tight"><div class="fake-input"><span>Channel</span><b>${escapeHtml(channel?.name ?? 'Not assigned')}</b></div><div class="fake-input"><span>Stage</span><b>${escapeHtml(statusLabels[project.status])}</b></div><div class="fake-input"><span>Format</span><b>${escapeHtml(project.format)}</b></div><div class="fake-input"><span>Credits</span><b>${workspace.settings.capcutBalance}</b></div><div class="fake-input"><span>Audience</span><b>${escapeHtml(channel?.audienceCountries.join(', ') ?? 'Not set')}</b></div></div></div>
        <div class="form-section"><h4>Completion gate</h4>${readiness.ready ? '<p class="success-copy">พร้อม Parse, Save และเลื่อน Pipeline</p>' : `<ul class="prompt-blockers">${readiness.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`}</div>
      </section>
      <section class="panel prompt-document">
        <div class="doc-toolbar"><strong>${escapeHtml(promptTypes.find((item) => item.id === type)?.name ?? type)}</strong><span class="chip cyan">${workspace.settings.workflowMode === 'automatic' ? `${chip('Automatic AI','green')}` : `${chip('Manual copy','cyan')}`}<span class="spacer"></span><a class="btn" href="${routeParams({ short: shorter ? '0' : '1' })}">${shorter ? 'Full' : 'Shorter'}</a><a class="btn" href="${routeParams({ advanced: advanced ? '0' : '1' })}">${advanced ? 'Basic' : 'Advanced'}</a><button class="btn" data-action="save-prompt">Save</button></div>
        <div class="doc-body"><textarea id="prompt-output" class="prompt-output" spellcheck="false">${escapeHtml(prompt)}</textarea></div>
        <div class="schema-strip"><div class="schema-copy"><strong>Paste AI response (JSON)</strong><textarea id="prompt-response" class="textarea code" style="min-height:90px;margin-top:6px" placeholder='{"summary":"..."}'></textarea><div id="parse-result" class="parse-result">${escapeHtml(parsedResponse ?? 'ยังไม่มีผลลัพธ์ที่ Parse')}</div></div><div class="schema-actions">${workspace.settings.workflowMode === 'automatic' && workspace.settings.aiProvider === 'openai' ? `<label class="checkbox-row ai-model-route"><input id="openai-terra-override" type="checkbox" ${terraRouted ? 'checked disabled' : ''}/><span><strong>${terraRouted ? 'Terra · auto-routed' : 'Use Terra for this run'}</strong><br/>${terraRouted ? 'งานซับซ้อนตามนโยบาย 18.75%' : 'เปิดเมื่อเป็นสคริปต์สำคัญหรือหลายเงื่อนไข'}</span></label>` : ''}${workspace.settings.workflowMode === 'automatic' ? `<button class="btn primary" data-action="generate-with-ai">Generate with ${workspace.settings.aiProvider === 'openai' ? (terraRouted ? 'Terra' : 'Luna') : 'Gemini'}</button>` : `<button class="btn primary" data-action="copy-prompt">${icon('copy')} Copy to ChatGPT</button>`}<button class="btn" data-action="parse-response" data-project-id="${escapeHtml(project.id)}" data-prompt-type="${escapeHtml(type)}">Parse, save & advance</button><button class="btn ${readiness.ready ? 'success' : ''}" data-action="complete-mission" data-project-id="${escapeHtml(project.id)}">Complete & advance</button></div></div>
      </section>
    </div>`;
};
