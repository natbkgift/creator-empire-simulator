import type { Workspace } from '../domain/types.js';
import { escapeHtml } from '../domain/utils.js';
import { routeHref } from '../app/router.js';
import { activeChannel, channelHealth } from '../app/selectors.js';
import { dataLabel, pageHeader } from '../ui/components.js';

export const renderBlueprint = (workspace: Workspace, params: URLSearchParams): string => {
  const selectedId = params.get('channel') ?? activeChannel(workspace)?.id ?? workspace.channels[0]?.id;
  const channel = workspace.channels.find((item) => item.id === selectedId) ?? workspace.channels[0];
  if (!channel) return `${pageHeader('Channel Foundry','ยังไม่มี Channel Blueprint')}<div class="empty-state"><div><strong>สร้าง Channel แรก</strong><span>เลือก Idea และภาษาใน Niche Observatory</span><div style="margin-top:14px"><a class="btn primary" href="${routeHref('ideas')}">เลือก Idea</a></div></div></div>`;
  const blueprint = channel.blueprint;
  return `${pageHeader('Channel Foundry','Blueprint ที่กำหนดคำสัญญา กลุ่มผู้ชม Content Pillars และแผนทดสอบ 90 วัน',`<a class="btn" href="${routeHref('production')}">Production Pipeline</a><a class="btn primary" href="${routeHref('mission', { project: workspace.focus.activeProjectId })}">Mission Control</a>`)}
    <div class="blueprint-layout">
      <aside class="panel channel-selector">
        <div class="panel-title"><div><h3>Channels</h3><p>เลือก Blueprint ที่ต้องการจัดการ</p></div><a class="btn small" href="${routeHref('ideas')}">+ New</a></div>
        ${workspace.channels.map((item) => `<button class="channel-select-card ${item.id === channel.id ? 'active' : ''}" data-action="focus-channel" data-channel-id="${escapeHtml(item.id)}" style="text-decoration:none"><span class="channel-icon">${escapeHtml(item.name.slice(0,2).toUpperCase())}</span><span><strong style="display:block;font-size:10px">${escapeHtml(item.name)}</strong><small class="muted">${escapeHtml(item.role)} · ${item.language === 'en' ? 'English' : 'ไทย'}</small></span><b style="font-size:9px">${channelHealth(workspace,item)}%</b></button>`).join('')}
      </aside>
      <section class="blueprint-body">
        <article class="panel blueprint-hero"><div><div class="row wrap"><span class="kicker">${escapeHtml(channel.role)} channel</span>${channel.isDemo ? dataLabel('demo') : ''}</div><h3>${escapeHtml(channel.name)}</h3><p class="muted small-copy">${escapeHtml(blueprint.concept)}</p><div class="inline-note" style="margin-top:14px"><strong>Channel promise</strong><br/>${escapeHtml(blueprint.promise)}</div><div class="row wrap" style="margin-top:13px"><span class="chip cyan">${channel.language === 'en' ? 'English' : 'ไทย'}</span><span class="chip amber">${channel.weeklyShortsTarget} Shorts/week</span><span class="chip violet">${channel.monthlyLongTarget} Long/month</span></div></div>
          <form class="stack" data-form="create-project"><input type="hidden" name="channelId" value="${escapeHtml(channel.id)}"/><div class="field"><label>ชื่อวิดีโอแรก</label><input class="input" name="title" value="${escapeHtml(blueprint.plan30Days[0]?.title ?? channel.niche)}" required/></div><div class="form-grid"><div class="field"><label>Format</label><select class="select" name="format"><option value="shorts">Shorts</option><option value="long">Long-form</option></select></div><div class="field"><label>Deadline</label><input class="input" type="date" name="deadline" required/></div></div><button class="btn primary" type="submit">สร้าง Video Project</button></form>
        </article>
        <div class="blueprint-sections">
          <article class="panel blueprint-section"><h3>Audience & desire</h3><p class="muted small-copy">${escapeHtml(blueprint.targetAudience)}</p><div class="divider"></div><p class="muted small-copy">${escapeHtml(blueprint.viewerDesire)}</p></article>
          <article class="panel blueprint-section"><h3>Visual & narration system</h3><p class="muted small-copy">${escapeHtml(blueprint.visualIdentity)}</p><div class="divider"></div><p class="muted small-copy"><strong>Voice:</strong> ${escapeHtml(blueprint.voice)}</p></article>
          <article class="panel blueprint-section"><h3>Content pillars</h3><ul class="bullet-list">${blueprint.pillars.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
          <article class="panel blueprint-section"><h3>Shorts → Long-form</h3><p class="muted small-copy"><strong>Shorts:</strong> ${escapeHtml(blueprint.shortsStrategy)}</p><div class="divider"></div><p class="muted small-copy"><strong>Long-form:</strong> ${escapeHtml(blueprint.longFormStrategy)}</p></article>
          <article class="panel blueprint-section"><h3>Originality & source policy</h3><p class="muted small-copy">${escapeHtml(blueprint.originalityStrategy)}</p><div class="divider"></div><p class="muted small-copy">${escapeHtml(blueprint.sourcePolicy)}</p></article>
          <article class="panel blueprint-section"><h3>Monetization paths</h3><ul class="bullet-list">${blueprint.monetizationPaths.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        </div>
        <article class="panel blueprint-section"><div class="panel-title"><div><h3>30-day content plan</h3><p>เริ่มจาก Validation แล้วขยายเฉพาะสัญญาณที่ชนะ</p></div><span class="chip cyan">${blueprint.plan30Days.length} releases</span></div><div style="overflow:auto"><table class="plan-table"><thead><tr><th>Day</th><th>Title</th><th>Format</th><th>Objective</th></tr></thead><tbody>${blueprint.plan30Days.map((item) => `<tr><td>Day ${item.day}</td><td><strong>${escapeHtml(item.title)}</strong></td><td>${escapeHtml(item.format)}</td><td>${escapeHtml(item.objective)}</td></tr>`).join('')}</tbody></table></div></article>
        <div class="blueprint-sections">
          <article class="panel blueprint-section"><h3>90-day experiment</h3><ul class="bullet-list">${blueprint.experiment90Days.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
          <article class="panel blueprint-section"><h3>Continue / pivot / stop</h3><ul class="bullet-list">${blueprint.decisionCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        </div>
      </section>
    </div>`;
};
