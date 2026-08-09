import type { View } from '../app/view.js';
import type { Workspace } from '../domain/types.js';
import { escapeHtml } from '../domain/utils.js';
import { icon } from '../ui/icons.js';
import { mountSimpleCreate } from '../controllers/autopilot-controller.js';
import { routeHref } from '../app/router.js';
import { simpleChannelRecommendations } from '../domain/simple-channels.js';
export { simpleChannelRecommendations } from '../domain/simple-channels.js';

const channelChoices = (): string => simpleChannelRecommendations.map((channel, index) => `<label class="channel-choice ${index === 0 ? 'selected' : ''}">
  <input type="radio" name="channelKey" form="autopilot-create-form" value="${escapeHtml(channel.key)}" ${index === 0 ? 'checked' : ''}>
  <span class="channel-choice-icon tone-${index + 1}">${icon(channel.iconName)}</span>
  <span class="channel-choice-copy"><strong>${escapeHtml(channel.name)}</strong><small>${escapeHtml(channel.niche)}</small></span>
  <span class="channel-choice-promise">${escapeHtml(channel.promise)}</span>
  <span class="channel-choice-ready"><b>${channel.aiFitScore}% AI fit</b><small>พร้อมใช้งาน</small></span>
  <span class="channel-choice-select">เลือกช่องนี้</span>
</label>`).join('');

export const renderSimpleCreate = (_workspace: Workspace): View => ({
  html: `<section class="simple-create-page">
    <header class="simple-hero">
      <div><h1>มาจากไอเดียเดียว สู่คลิปพร้อมอัปโหลด</h1><p>ให้ AI วางแผน สร้าง และจัดชุดวิดีโอให้ครบรอบในคลิกเดียว</p></div>
      <img class="simple-hero-art" src="./ai-sparkle.png" width="420" height="190" alt="">
    </header>
    <form id="autopilot-create-form" class="autopilot-composer" data-simple-create>
      <label for="simple-topic">วันนี้อยากทำคลิปเรื่องอะไร?</label>
      <textarea id="simple-topic" name="topic" rows="2" maxlength="500" required>ให้ AI วางแผนคลิป YouTube จากไอเดียจนพร้อมอัปโหลด</textarea>
      <div class="composer-controls">
        <label class="composer-select">${icon('play')}<span class="sr-only">รูปแบบ</span><select name="format"><option value="shorts">Shorts</option><option value="long">Long-form</option></select>${icon('chevron')}</label>
        <label class="composer-select">${icon('simulator')}<span class="sr-only">ความยาว</span><select name="durationSeconds"><option value="30">30 วินาที</option><option value="60">60 วินาที</option><option value="480">8 นาที</option></select>${icon('chevron')}</label>
        <label class="composer-select">${icon('map')}<span class="sr-only">ภาษา</span><select name="language"><option value="th">ภาษาไทย</option><option value="en">English</option></select>${icon('chevron')}</label>
        <button class="simple-primary" type="submit">${icon('sparkle')}<span>สร้างชุดวิดีโอทั้งหมด</span></button>
      </div>
      <p class="composer-note">${icon('sparkle')} AI จะเตรียม Research → Content Plan → Script → Fact-check → Production Pack ให้ครบอัตโนมัติ</p>
    </form>
    <section class="channel-recommendations" aria-labelledby="recommended-channel-heading">
      <div class="simple-section-heading"><h2 id="recommended-channel-heading">แนะนำช่องสำหรับคุณ</h2><span>เลือกไว้ล่วงหน้าตามความเหมาะสมกับ AI</span></div>
      <div class="channel-choice-list">${channelChoices()}</div>
    </section>
    <section id="autopilot-state" class="autopilot-state" aria-live="polite"></section>
  </section>`,
  mount: mountSimpleCreate,
});

export const renderSimpleChannels = (workspace: Workspace): View => ({ html: `<section class="simple-list-page"><header><span>CHANNELS</span><h1>ช่องของฉัน</h1><p>Channel Blueprint ทั้งหมดที่ใช้ได้ทั้งใน Simple และ Expert Mode</p></header><div class="simple-collection">${workspace.channels.map((channel) => `<article><span class="collection-mark">${escapeHtml(channel.name.slice(0, 2).toUpperCase())}</span><div><h2>${escapeHtml(channel.name)}</h2><p>${escapeHtml(channel.blueprint.promise || channel.niche)}</p></div><b>${channel.health}%</b></article>`).join('') || '<div class="simple-empty"><h2>ยังไม่มีช่อง</h2><a href="' + routeHref('beta/create') + '">เริ่มสร้างชุดวิดีโอแรก</a></div>'}</div></section>` });

export const renderSimpleProjects = (workspace: Workspace): View => ({ html: `<section class="simple-list-page"><header><span>PROJECTS</span><h1>ผลงาน</h1><p>ชุดวิดีโอที่สร้างด้วย Autopilot และงานเดิมจาก Expert Mode</p></header><div class="simple-collection">${workspace.projects.map((project) => `<article><span class="collection-mark">${icon(project.format === 'shorts' ? 'play' : 'board')}</span><div><h2>${escapeHtml(project.title)}</h2><p>${escapeHtml(project.script ? 'มีสคริปต์พร้อมทำงานต่อ' : 'กำลังวางแผน')}</p></div><b>${escapeHtml(project.status)}</b></article>`).join('') || '<div class="simple-empty"><h2>ยังไม่มีผลงาน</h2><a href="' + routeHref('beta/create') + '">สร้างชุดวิดีโอแรก</a></div>'}</div></section>` });
