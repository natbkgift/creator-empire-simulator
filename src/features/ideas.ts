import type { Language, VideoFormat, Workspace } from '../domain/types.js';
import { compareIdeaLanguages, scoreLabel } from '../domain/scoring.js';
import { escapeHtml } from '../domain/utils.js';
import { ideaCategories } from '../seed/ideas.js';
import { routeHref } from '../app/router.js';
import { dataLabel, pageHeader, progress, riskChip, selectOptions } from '../ui/components.js';

const scoreRows: Array<[string,keyof Workspace['ideas'][number]['score']['en']]> = [
  ['Audience demand','audienceDemand'],['Repeatability','repeatability'],['Differentiation','differentiation'],['Monetization','monetizationPotential'],['Production ease','productionEase'],['Evidence','evidenceAvailability'],['Language fit','languageMarketFit'],['Creator fit','creatorFit'],
];

export const renderIdeas = (workspace: Workspace, params: URLSearchParams): string => {
  const category = params.get('category') ?? 'all';
  const query = (params.get('q') ?? '').toLowerCase();
  const language = (params.get('lang') === 'th' ? 'th' : 'en') as Language;
  const format = (['shorts','long','both'].includes(params.get('format') ?? '') ? params.get('format') : 'both') as VideoFormat;
  const filtered = workspace.ideas.filter((idea) => (category === 'all' || idea.categoryId === category) && (!query || `${idea.titleEn} ${idea.titleTh} ${idea.descriptionEn} ${idea.descriptionTh}`.toLowerCase().includes(query)));
  const selectedId = params.get('idea') ?? filtered[0]?.id ?? workspace.ideas[0]?.id;
  const selected = workspace.ideas.find((idea) => idea.id === selectedId) ?? filtered[0] ?? workspace.ideas[0];
  if (!selected) return pageHeader('Niche Observatory','ไม่พบ Idea ใน Workspace');
  const compare = compareIdeaLanguages(selected);
  const score = selected.score[language];
  const title = language === 'en' ? selected.titleEn : selected.titleTh;
  const proposedName = language === 'en' ? (selected.categoryId === 'history' ? 'History Lab' : selected.titleEn) : selected.titleTh;
  const filterHref = (ideaId: string, nextLang = language, nextFormat = format) => routeHref('ideas',{ category, q:params.get('q') ?? '', idea:ideaId, lang:nextLang, format:nextFormat });
  return `${pageHeader('Niche Observatory','เลือกจาก 5 ประเภท 50 Ideas และเปรียบเทียบตลาดไทยกับอังกฤษก่อนลงทุนเวลาและเครดิต','<a class="btn" href="#/simulator">เปิด Simulator</a>')}
    <div class="idea-layout">
      <section>
        <form class="idea-toolbar" data-form="idea-filter">
          <input class="input" name="q" value="${escapeHtml(params.get('q') ?? '')}" placeholder="ค้นหา Idea, Niche หรือคำสำคัญ" aria-label="ค้นหา Idea" />
          <select class="select" name="category" aria-label="ประเภท">${selectOptions([{value:'all',label:'ทุกประเภท'},...ideaCategories.map((item) => ({value:item.id,label:item.th}))],category)}</select>
          <button class="btn primary" type="submit">กรอง ${filtered.length} Ideas</button>
        </form>
        <div class="idea-grid">
          ${filtered.map((idea) => `<a class="idea-card ${idea.id === selected.id ? 'selected' : ''}" href="${filterHref(idea.id)}">
            <div class="row between"><span class="chip">${escapeHtml(idea.categoryNameTh)}</span>${idea.saved ? '<span class="chip amber">Saved</span>' : ''}</div>
            <h3>${escapeHtml(idea.titleEn)}</h3><p>${escapeHtml(idea.titleTh)}</p>
            <p style="margin-top:8px">${escapeHtml(language === 'en' ? idea.descriptionEn : idea.descriptionTh)}</p>
            <div class="idea-score-row"><div class="idea-score"><b>${idea.score.en.total}</b><span>English · ${scoreLabel(idea.score.en.total)}</span></div><div class="idea-score"><b>${idea.score.th.total}</b><span>ไทย · ${scoreLabel(idea.score.th.total)}</span></div></div>
          </a>`).join('') || '<div class="empty-state"><div><strong>ไม่พบ Idea</strong><span>ลองเปลี่ยนคำค้นหรือประเภท</span></div></div>'}
        </div>
      </section>

      <aside class="panel idea-detail">
        <div class="row between"><span class="kicker">Idea Detail</span>${selected.isDemo ? dataLabel('demo') : ''}</div>
        <h3>${escapeHtml(selected.titleEn)}</h3><p class="muted small-copy">${escapeHtml(selected.titleTh)}</p>
        <div class="segmented" style="margin-top:13px"><a class="${language === 'en' ? 'active' : ''}" href="${filterHref(selected.id,'en')}" style="display:grid;place-items:center;text-decoration:none;font-size:9px;border-radius:7px">English</a><a class="${language === 'th' ? 'active' : ''}" href="${filterHref(selected.id,'th')}" style="display:grid;place-items:center;text-decoration:none;font-size:9px;border-radius:7px">ไทย</a></div>
        <div class="score-compare"><div class="score-column ${compare.winner === 'en' ? 'winner' : ''}"><span>English</span><b>${selected.score.en.total}</b>${progress(selected.score.en.total,'English score')}</div><div class="score-column ${compare.winner === 'th' ? 'winner' : ''}"><span>ไทย</span><b>${selected.score.th.total}</b>${progress(selected.score.th.total,'Thai score')}</div></div>
        <div class="inline-note">ผู้ชนะ: <strong>${compare.winner === 'en' ? 'English' : 'ไทย'}</strong> ต่าง ${compare.difference} คะแนน — ${escapeHtml(compare.reason)}</div>
        <div class="score-list">${scoreRows.map(([label,key]) => `<div class="score-item"><span>${escapeHtml(label)}</span><b>${score[key] as number}</b></div>`).join('')}</div>
        <div class="grid-2" style="margin-top:12px"><div class="metric-card"><b>${score.productionMinutes}m</b><span>Estimated production</span></div><div class="metric-card"><b>${score.estimatedCreditsLow}–${score.estimatedCreditsHigh}</b><span>CapCut planning range</span></div></div>
        <div class="row wrap" style="margin:12px 0">${riskChip(score.copyrightRisk)}<span class="chip cyan">Shorts ${score.shortsSuitability}</span><span class="chip violet">Long ${score.longFormSuitability}</span></div>
        <form class="stack" data-form="create-channel">
          <input type="hidden" name="ideaId" value="${escapeHtml(selected.id)}"/><input type="hidden" name="language" value="${language}"/>
          <div class="field"><label>ชื่อช่องเริ่มต้น</label><input class="input" name="name" value="${escapeHtml(proposedName)}" required /></div>
          <div class="form-grid"><div class="field"><label>บทบาท</label><select class="select" name="role"><option value="primary">Primary</option><option value="experiment" selected>Experiment</option><option value="backlog">Backlog</option></select></div><div class="field"><label>ชั่วโมงต่อสัปดาห์</label><input class="input" name="weeklyHours" type="number" min="1" max="80" value="4" /></div></div>
          <div class="field"><label>รูปแบบ</label><div class="segmented cols-3">${(['shorts','long','both'] as VideoFormat[]).map((item) => `<a class="${format === item ? 'active' : ''}" href="${filterHref(selected.id,language,item)}" style="display:grid;place-items:center;text-decoration:none;font-size:9px;border-radius:7px">${item}</a>`).join('')}</div><input type="hidden" name="format" value="${format}"/></div>
          <button class="btn primary" type="submit">สร้าง Channel Blueprint</button>
          <button class="btn" type="button" data-action="toggle-save-idea" data-idea-id="${escapeHtml(selected.id)}">${selected.saved ? 'นำออกจาก Saved' : 'บันทึก Idea ไว้ภายหลัง'}</button>
        </form>
      </aside>
    </div>`;
};
