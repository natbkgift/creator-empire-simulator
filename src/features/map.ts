import type { Workspace } from '../domain/types.js';
import { escapeHtml } from '../domain/utils.js';
import { nextBestAction } from '../app/selectors.js';
import { routeHref } from '../app/router.js';
import { pageHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const rooms = [
  { cls:'r1', route:'ideas', icon:'idea', name:'Niche Observatory', detail:'ค้นหาและประเมินโอกาส' },
  { cls:'r2', route:'blueprint', icon:'blueprint', name:'Channel Foundry', detail:'สร้างคำสัญญาและแผนช่อง' },
  { cls:'r3', route:'production', icon:'board', name:'Research Archive', detail:'จัด Sources และ Pipeline' },
  { cls:'r4', route:'prompts', icon:'prompt', name:'Hook Laboratory', detail:'ทดสอบ Hook และ Script' },
  { cls:'r5', route:'prompts', icon:'prompt', name:'Prompt Studio', detail:'ประกอบ Prompt จากข้อมูลจริง' },
  { cls:'r6', route:'capcut', icon:'capcut', name:'CapCut Production Lab', detail:'ควบคุม Mode และ Credits' },
  { cls:'r7', route:'calendar', icon:'calendar', name:'Publishing Tower', detail:'Schedule และ Mission' },
  { cls:'r8', route:'analytics', icon:'chart', name:'Analytics War Room', detail:'วิเคราะห์และปิด Learning Loop' },
  { cls:'r9', route:'monetization', icon:'money', name:'Monetization Vault', detail:'ออกแบบรายได้หลายทาง' },
];

export const renderMap = (workspace: Workspace): string => {
  const next = nextBestAction(workspace);
  const routeRoom = rooms.find((room) => room.route === next.route) ?? rooms[4];
  return `${pageHeader('Portfolio Map','แผนที่ Studio เป็น Navigation ทางเลือก พื้นที่ทำงานจริงยังอยู่ในแต่ละห้อง','<a class="btn primary" href="#/hq">กลับ Studio HQ</a>')}
    <div class="map-layout">
      <section class="panel map-canvas" aria-label="Creator Studio Map">
        <div class="studio-map">
          <i class="map-path p1"></i><i class="map-path p2"></i><i class="map-path p3"></i><i class="map-path p4"></i><i class="map-path p5"></i>
          ${rooms.map((room) => `<a class="room ${room.cls} ${room.route === next.route ? 'active' : ''}" href="${routeHref(room.route)}"><span class="room-icon">${icon(room.icon)}</span><span class="room-copy"><strong>${escapeHtml(room.name)}</strong><span>${escapeHtml(room.detail)}</span></span></a>`).join('')}
        </div>
      </section>
      <aside class="map-side">
        <section class="panel room-detail"><div class="room-hero">${icon(routeRoom.icon)}</div><span class="kicker">Recommended room</span><h3>${escapeHtml(routeRoom.name)}</h3><p>${escapeHtml(next.reason)}</p><div class="room-actions"><a class="room-action" href="${routeHref(routeRoom.route)}"><strong>${escapeHtml(next.title)}</strong><span>Open →</span></a><a class="room-action" href="${routeHref('policy')}"><strong>Policy Shield</strong><span>Review →</span></a><a class="room-action" href="${routeHref('simulator')}"><strong>YouTube Simulator</strong><span>Run →</span></a></div></section>
        <section class="panel missions-side"><h3>Studio status</h3>${workspace.channels.map((channel,index) => `<div class="mini-mission"><span class="icon">${index+1}</span><div><b>${escapeHtml(channel.name)}</b><span>${escapeHtml(channel.role)} · ${channel.weeklyHours}h/week</span></div><em>${channel.health}%</em></div>`).join('')}</section>
      </aside>
    </div>`;
};
