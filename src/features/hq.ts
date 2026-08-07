import type { Workspace } from '../domain/types.js';
import { escapeHtml, formatNumber } from '../domain/utils.js';
import {
  activeChannel,
  activeProject,
  capacityStats,
  channelHealth,
  creditStats,
  dailyMission,
  nextBestAction,
  projectProgress,
  projectsInFocus,
  statusLabels,
} from '../app/selectors.js';
import { routeHref } from '../app/router.js';
import { button, chip, dataLabel, pageHeader, progress } from '../ui/components.js';

export const renderHq = (workspace: Workspace): string => {
  const channel = activeChannel(workspace);
  const project = activeProject(workspace);
  const mission = dailyMission(workspace);
  const next = nextBestAction(workspace);
  const capacity = capacityStats(workspace);
  const credits = creditStats(workspace);
  const queue = projectsInFocus(workspace).filter((item) => !['archived', 'published'].includes(item.status)).toSorted((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
  const channels = workspace.focus.mode === 'portfolio' ? workspace.channels.slice(0, 6) : workspace.channels.filter((item) => item.id === channel?.id);
  const skills = Object.entries(workspace.skills).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const actionAttrs = `data-project-id="${escapeHtml(project?.id ?? '')}" data-task-id="${escapeHtml(mission.taskId ?? '')}"`;
  return `${pageHeader('Studio HQ', 'ทำงานจาก Channel Focus และ Active Project เดียว โดย Calendar กับ Pipeline จะเลือกภารกิจถัดไปให้', '<a class="btn" href="#/import-export">Import workspace</a><a class="btn primary" href="#/ideas">+ สร้าง Channel</a>')}
    <section class="hq-focus-strip">
      <div><span class="kicker">Mode</span><h3>${workspace.focus.mode === 'portfolio' ? 'Portfolio Overview' : 'Channel Focus'}</h3><p>${workspace.focus.mode === 'portfolio' ? 'มองทุกช่อง แต่เริ่ม Mission จะกลับเข้าสู่ Project ที่เลือก' : escapeHtml(channel?.name ?? 'No channel')}</p></div>
      <div><span class="kicker">Active Project</span><h3>${escapeHtml(project?.title ?? 'No active project')}</h3><p>${project ? `${statusLabels[project.status]} · ${project.format} · deadline ${project.deadline}` : 'เลือก Project เพื่อเริ่มเส้นทางผลิต'}</p></div>
      <div class="focus-strip-actions"><button class="btn" data-action="open-focus-picker">Change focus</button>${workspace.focus.mode === 'channel' ? '<button class="btn ghost" data-action="portfolio-mode">Portfolio</button>' : '<button class="btn ghost" data-action="focus-primary-channel">Primary channel</button>'}</div>
    </section>
    <div class="hq-layout">
      <div class="hq-main">
        <section class="panel mission-deck">
          <div class="mission-title"><span class="kicker">Calendar-driven Mission · +${mission.xp} XP</span><h3>${escapeHtml(mission.title)}</h3><p>${escapeHtml(mission.detail)}</p><div class="mission-meta">${chip('Pipeline-selected', 'cyan')}${project ? chip(statusLabels[project.status], 'amber') : chip('Studio task', 'violet')}</div><div class="row wrap" style="margin-top:14px">${button('Start mission', 'start-mission', { tone: 'primary', iconName: 'play', attrs: actionAttrs })}<a class="btn" href="${routeHref('mission', project ? { project: project.id } : undefined)}">Mission Control</a>${button('Complete & advance', 'complete-mission', { attrs: actionAttrs })}</div></div>
          <div class="progress-orbit" aria-label="Project progress ${mission.progress}%"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="48"/><circle class="fill" cx="60" cy="60" r="48" style="stroke-dasharray:302;stroke-dashoffset:${302 * (1 - mission.progress / 100)}"/></svg><div class="orbit-copy"><b>${mission.progress}%</b><span>production path</span></div></div>
        </section>
        <section class="panel channel-lanes">
          <div class="section-head"><div><h3>${workspace.focus.mode === 'portfolio' ? 'Channel Portfolio' : 'Focused channel'}</h3><span class="sub">กด Channel หรือ Project เพื่อเปลี่ยน Context ทั้งระบบ</span></div><a class="btn small" href="#/map">Portfolio Map</a></div>
          <div class="lane-table">${channels.map((item) => { const itemProjects = workspace.projects.filter((candidate) => candidate.channelId === item.id); const health = channelHealth(workspace, item); return `<button class="lane-row lane-channel ${item.id === channel?.id ? 'active' : ''}" data-action="focus-channel" data-channel-id="${escapeHtml(item.id)}"><div class="channel-name"><div class="channel-icon">${escapeHtml(item.name.slice(0, 2).toUpperCase())}</div><div><strong>${escapeHtml(item.name)} ${item.isDemo ? dataLabel('demo') : ''}</strong><small>${item.language === 'en' ? 'English' : 'ไทย'} · ${item.role}</small></div></div><div class="lane-projects">${itemProjects.slice(0, 4).map((candidate) => `<span class="lane-project ${candidate.id === project?.id ? 'active' : ''}">${escapeHtml(candidate.title)}<small>${escapeHtml(statusLabels[candidate.status])}</small></span>`).join('') || '<span class="muted">No projects</span>'}</div><div class="health"><b>${health}%</b><span>${item.weeklyHours}h/week</span></div></button>`; }).join('')}</div>
        </section>
        <section class="panel production-dock"><div><div class="section-head"><div><h3>Focused production queue</h3><span class="sub">เฉพาะ ${escapeHtml(channel?.name ?? 'Portfolio')} · ปิดงานใกล้ Publish ก่อนเปิด WIP ใหม่</span></div><a class="btn small" href="#/production">Open Board</a></div><div class="queue-list">${queue.length ? queue.map((item, index) => `<button class="video-ticket ${item.id === project?.id ? 'active' : ''}" style="--accent:${index === 1 ? 'var(--amber)' : index === 2 ? 'var(--violet)' : 'var(--cyan)'}" data-action="set-active-project" data-project-id="${escapeHtml(item.id)}"><span class="label">${escapeHtml(statusLabels[item.status])}</span><strong>${escapeHtml(item.title)}</strong><small>${item.format} · ${item.targetDurationSeconds}s · ${item.creditEstimateLow}–${item.creditEstimateHigh} credits</small><b>${projectProgress(item.status)}%</b></button>`).join('') : '<span class="muted small-copy">ไม่มีงานค้างใน Focus นี้</span>'}</div></div><div class="credit-meter"><span class="label">Focused production capacity</span><div class="balance"><b>${formatNumber(workspace.settings.capcutBalance)}</b><span>credits</span></div>${progress(Math.min(100, (workspace.settings.capcutBalance / 2000) * 100), 'CapCut balance')}<span class="muted small-copy" style="margin-top:7px">ประมาณ ${credits.capacity} คลิปจาก Ledger ของ Focus ปัจจุบัน</span></div></section>
      </div>
      <aside class="hq-side">
        <section class="panel next-action-card"><span class="kicker">Next Best Action</span><h3>${escapeHtml(next.title)}</h3><p>${escapeHtml(next.reason)}</p><button class="btn primary" data-action="start-mission" data-project-id="${escapeHtml(next.project?.id ?? '')}" data-task-id="${escapeHtml(next.task?.id ?? '')}">ทำขั้นตอนนี้</button></section>
        <section class="panel capacity-card"><div class="panel-title"><div><h3>Capacity Planner</h3><p>${escapeHtml(capacity.warning)}</p></div>${capacity.percent > 110 ? chip('Overload', 'amber') : chip('Controlled', 'green')}</div><div class="capacity-line"><b>เวลาช่อง Active</b><span>${capacity.hoursUsed}/${capacity.hoursAvailable} ชั่วโมง</span></div>${progress(Math.min(100, capacity.percent), 'Weekly hours')}<div class="capacity-line"><b>Active channels</b><span>${capacity.activeChannels}/${workspace.settings.activeChannelLimit}</span></div>${progress(Math.min(100, (capacity.activeChannels / workspace.settings.activeChannelLimit) * 100), 'Active channels')}<div class="capacity-line"><b>Work in progress</b><span>${capacity.wip} projects</span></div>${progress(Math.min(100, (capacity.wip / 8) * 100), 'WIP')}</section>
        <section class="panel skill-card"><div class="panel-title"><div><h3>Creator Skills</h3><p>XP ได้จากการขยับ Project ผ่าน Gate จริง</p></div><span class="chip violet">Lv ${workspace.level}</span></div><div class="skill-list">${skills.map(([name, value]) => `<div class="skill-line"><span>${escapeHtml(name.replace(/[A-Z]/g, (letter) => ` ${letter}`).trim())}</span>${progress(value, name)}<b>${value}</b></div>`).join('')}</div></section>
      </aside>
    </div>`;
};
