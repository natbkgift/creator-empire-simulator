import type { Workspace } from '../domain/types.js';
import { addDays, escapeHtml, todayIso } from '../domain/utils.js';
import { routeHref } from '../app/router.js';
import { activeChannel, channelHealth } from '../app/selectors.js';
import { dataLabel, pageHeader } from '../ui/components.js';

export const renderBlueprint = (workspace: Workspace, params: URLSearchParams): string => {
  const selectedId = params.get('channel') ?? activeChannel(workspace)?.id ?? workspace.channels[0]?.id;
  const channel = workspace.channels.find((item) => item.id === selectedId) ?? workspace.channels[0];
  if (!channel) return `${pageHeader('Channels','ยังไม่มี Channel Blueprint')}<div class="empty-state"><div><strong>สร้าง Channel แรก</strong><span>เลือก Idea และภาษาใน Niche Observatory</span><div style="margin-top:14px"><a class="btn primary" href="${routeHref('ideas')}">เลือก Idea</a></div></div></div>`;
  const blueprint = channel.blueprint;
  const publishDate = addDays(todayIso(), 5);
  const publishTime = workspace.settings.defaultPublishTime || '19:00';
  return `${pageHeader('Channels','กำหนด Channel Strategy แล้วสร้างวิดีโอพร้อมเวลา Publish ที่ระบบจะใช้วาง Production Calendar',`<a class="btn" href="${routeHref('calendar')}">Calendar</a><a class="btn primary" href="${routeHref('mission', { project: workspace.focus.activeProjectId })}">Start next mission</a>`)}
    <div class="blueprint-layout">
      <aside class="panel channel-selector">
        <div class="panel-title"><div><h3>Channels</h3><p>เลือกช่องที่ต้องการ Focus</p></div><a class="btn small" href="${routeHref('ideas')}">+ New</a></div>
        ${workspace.channels.map((item) => `<button class="channel-select-card ${item.id === channel.id ? 'active' : ''}" data-action="focus-channel" data-channel-id="${escapeHtml(item.id)}"><span class="channel-icon">${escapeHtml(item.name.slice(0,2).toUpperCase())}</span><span><strong style="display:block;font-size:10px">${escapeHtml(item.name)}</strong><small class="muted">${escapeHtml(item.role)} · ${item.language === 'en' ? 'English' : 'ไทย'}</small></span><b style="font-size:9px">${channelHealth(workspace,item)}%</b></button>`).join('')}
      </aside>
      <section class="blueprint-body">
        <article class="panel blueprint-hero"><div><div class="row wrap"><span class="kicker">${escapeHtml(channel.role)} channel</span>${channel.isDemo ? dataLabel('demo') : ''}</div><h3>${escapeHtml(channel.name)}</h3><p class="muted small-copy">${escapeHtml(blueprint.concept)}</p><div class="inline-note" style="margin-top:14px"><strong>Channel promise</strong><br/>${escapeHtml(blueprint.promise)}</div><div class="row wrap" style="margin-top:13px"><span class="chip cyan">${channel.language === 'en' ? 'English' : 'ไทย'}</span><span class="chip amber">${channel.weeklyShortsTarget} Shorts/week</span><span class="chip violet">${channel.monthlyLongTarget} Long/month</span></div></div>
          <form class="stack" data-form="create-project">
            <input type="hidden" name="channelId" value="${escapeHtml(channel.id)}"/>
            <div class="field"><label>หัวข้อวิดีโอ</label><input class="input" name="title" value="${escapeHtml(blueprint.plan30Days[0]?.title ?? channel.niche)}" required/></div>
            <div class="form-grid"><div class="field"><label>ชนิดวิดีโอ</label><select class="select" name="format"><option value="shorts">Shorts</option><option value="long">Long-form</option></select></div><div class="field"><label>วันและเวลาที่จะ Publish</label><input class="input" type="datetime-local" name="deadline" value="${publishDate}T${escapeHtml(publishTime)}" required/></div></div>
            <p class="muted small-copy">ระบบจะแตก Research → Script → Storyboard → Edit → QA → Upload และตรวจ Capacity ให้อัตโนมัติ</p>
            <button class="btn primary" type="submit">วางแผนวิดีโอนี้</button>
          </form>
        </article>
        <div class="blueprint-sections">
          <article class="panel blueprint-section"><h3>Audience & desire</h3><p class="muted small-copy">${escapeHtml(blueprint.targetAudience)}</p><div class="divider"></div><p class="muted small-copy">${escapeHtml(blueprint.viewerDesire)}</p></article>
          <article class="panel blueprint-section"><h3>Visual & narration</h3><p class="muted small-copy">${escapeHtml(blueprint.visualIdentity)}</p><div class="divider"></div><p class="muted small-copy"><strong>Voice:</strong> ${escapeHtml(blueprint.voice)}</p></article>
          <article class="panel blueprint-section"><h3>Content pillars</h3><ul class="bullet-list">${blueprint.pillars.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
          <article class="panel blueprint-section"><h3>Shorts → Long-form</h3><p class="muted small-copy"><strong>Shorts:</strong> ${escapeHtml(blueprint.shortsStrategy)}</p><div class="divider"></div><p class="muted small-copy"><strong>Long-form:</strong> ${escapeHtml(blueprint.longFormStrategy)}</p></article>
          <article class="panel blueprint-section"><h3>Originality & sources</h3><p class="muted small-copy">${escapeHtml(blueprint.originalityStrategy)}</p><div class="divider"></div><p class="muted small-copy">${escapeHtml(blueprint.sourcePolicy)}</p></article>
          <article class="panel blueprint-section"><h3>Monetization</h3><ul class="bullet-list">${blueprint.monetizationPaths.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        </div>
        <article class="panel blueprint-section"><div class="panel-title"><div><h3>30-day idea plan</h3><p>เลือกหัวข้อแล้วกำหนดวัน Publish ให้ Calendar Planner จัดงาน</p></div><span class="chip cyan">${blueprint.plan30Days.length} ideas</span></div><div style="overflow:auto"><table class="plan-table"><thead><tr><th>Day</th><th>Title</th><th>Format</th><th>Objective</th></tr></thead><tbody>${blueprint.plan30Days.map((item) => `<tr><td>Day ${item.day}</td><td><strong>${escapeHtml(item.title)}</strong></td><td>${escapeHtml(item.format)}</td><td>${escapeHtml(item.objective)}</td></tr>`).join('')}</tbody></table></div></article>
      </section>
    </div>`;
};
