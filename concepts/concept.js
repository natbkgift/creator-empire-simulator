const icon = (name) => {
  const paths = {
    home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/>',
    map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    idea:'<path d="M9 18h6"/><path d="M10 22h4"/><path d="M8 14c-1.5-1.2-2.5-3-2.5-5a6.5 6.5 0 0 1 13 0c0 2-1 3.8-2.5 5-.8.7-1 1.2-1 2H9c0-.8-.2-1.3-1-2Z"/>',
    board:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M5.5 8h1M10.5 8h3M18 8h1"/>',
    prompt:'<path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h5"/>',
    chart:'<path d="M4 19V5M4 19h16"/><path d="m7 15 4-5 3 2 4-6"/>',
    shield:'<path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/><path d="m9 12 2 2 4-5"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.8 1 1 .3.2.7.3 1 .4h.1v4h-.1c-.4.1-.8.2-1 .4-.4.2-.8.6-1 1Z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.home}</svg>`;
};

const nav = (active='home') => `
<aside class="side-rail">
  <div class="brand-orbit" aria-label="Creator Empire"></div>
  ${[['home','HQ'],['map','Map'],['idea','Ideas'],['board','Flow'],['prompt','Prompts'],['chart','Data'],['shield','Policy']].map(([k,l])=>`<div class="nav-dot ${active===k?'active':''}">${icon(k)}<span>${l}</span></div>`).join('')}
  <div class="nav-spacer"></div>
  <div class="nav-dot">${icon('gear')}<span>Settings</span></div>
</aside>`;

const topbar = (title, subtitle) => `
<header class="topbar">
  <div class="top-title"><h1>${title}</h1><span>${subtitle}</span></div>
  <div class="topbar-center"><div class="command-search">ค้นหาโปรเจกต์, Prompt หรือคำสั่ง… <kbd>Ctrl K</kbd></div></div>
  <div class="hud">
    <div class="hud-item"><span class="orb"></span><div><b>Lv. 7</b><small>Studio Rank</small></div></div>
    <div class="hud-item"><div><b>1,634</b><small>CapCut • Manual</small></div></div>
    <div class="hud-item"><div><b>8.5h</b><small>This week</small></div></div>
  </div>
</header>`;

const shell = (active,title,subtitle,body) => `<div class="screen"><div class="app-shell">${nav(active)}${topbar(title,subtitle)}<main class="content">${body}</main></div></div>`;

function hq(){
return shell('home','Creator Empire','Studio HQ · Asia/Bangkok',`
<div class="context-row"><div><h2>Studio HQ</h2><p>พื้นที่บัญชาการหลักสำหรับวางแผน ผลิต และเรียนรู้จากข้อมูลจริง</p></div><div class="action-group"><button class="btn ghost">Import workspace</button><button class="btn primary">+ เริ่มวิดีโอใหม่</button></div></div>
<div class="hq-layout">
  <section class="hq-main">
    <div class="panel mission-deck">
      <div class="mission-title"><span class="label">Daily mission · 45 นาที</span><h3>ปิด Script และ Shot List ของ “Wojtek: The Soldier Bear”</h3><p>ภารกิจนี้ปลดล็อก CapCut Standard Prompt และลดงานค้างใน History Lab ก่อนเปิดช่องทดลองเพิ่ม</p><div class="mission-meta"><span class="chip cyan"><span class="dot"></span>English</span><span class="chip amber"><span class="dot"></span>Shorts 55s</span><span class="chip violet"><span class="dot"></span>+120 XP</span></div></div>
      <div class="progress-orbit"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="fill" cx="60" cy="60" r="52"/></svg><div class="orbit-copy"><b>75%</b><span>4 จาก 5 ขั้น</span></div></div>
    </div>
    <div class="panel channel-lanes">
      <div class="section-head"><div><h3>Channel Portfolio</h3><span class="sub">1 Primary · 1 Experiment · 1 Backlog</span></div><span class="chip green"><span class="dot"></span>Capacity healthy</span></div>
      <div class="lane-table">
        <div class="lane-row lane-head"><div>Channel</div><div>Production stages</div><div style="text-align:right">Health</div></div>
        <div class="lane-row"><div class="channel-name"><div class="channel-icon">HL</div><div><strong>History Lab</strong><small>Primary · EN · Strange History</small></div></div><div class="stage-line"><div class="stage done">Research</div><div class="stage done">Hook</div><div class="stage active">Script</div><div class="stage">Edit</div><div class="stage">Publish</div></div><div class="health"><b style="color:var(--green)">82</b><span>On track</span></div></div>
        <div class="lane-row"><div class="channel-name"><div class="channel-icon">AI</div><div><strong>FlowBiz AI Minute</strong><small>Experiment · TH · AI Automation</small></div></div><div class="stage-line"><div class="stage done">Research</div><div class="stage active">Hook</div><div class="stage">Script</div><div class="stage">Edit</div><div class="stage">Publish</div></div><div class="health"><b style="color:var(--amber)">64</b><span>Needs cadence</span></div></div>
        <div class="lane-row"><div class="channel-name"><div class="channel-icon">PT</div><div><strong>Pattaya Intel</strong><small>Backlog · EN/TH · Property & Travel</small></div></div><div class="stage-line"><div class="stage">Validate</div><div class="stage">Position</div><div class="stage">Pilot</div><div class="stage">Review</div><div class="stage">Decide</div></div><div class="health"><b style="color:var(--muted)">—</b><span>Not started</span></div></div>
      </div>
    </div>
    <div class="panel production-dock">
      <div><div class="section-head"><div><h3>Production Dock</h3><span class="sub">งานที่ควรทำต่อภายใน 48 ชั่วโมง</span></div><span class="chip">4 active</span></div><div class="queue-list"><div class="video-ticket" style="--accent:var(--cyan)"><span class="label">Script approval</span><strong>Wojtek — Soldier Bear</strong><small>Due วันนี้ · 45 min</small></div><div class="video-ticket" style="--accent:var(--amber)"><span class="label">Hook test</span><strong>Automate One Boring Task</strong><small>Due พรุ่งนี้ · 25 min</small></div><div class="video-ticket" style="--accent:var(--violet)"><span class="label">Analytics review</span><strong>Why Penicillin Was an Accident</strong><small>Published · Demo data</small></div></div></div>
      <div class="credit-meter"><span class="label">CapCut capacity</span><div class="balance"><b>1,634</b><span>credits recorded manually</span></div><div class="mini-bars">${[15,22,11,26,18,33,25,39,28,42,34,48].map(h=>`<i style="height:${h}px"></i>`).join('')}</div><span style="font-size:8px;color:var(--muted);margin-top:5px">อย่าใช้ประมาณการจนมีบันทึกจริง ≥ 5 งาน</span></div>
    </div>
  </section>
  <aside class="hq-side">
    <div class="panel next-action"><span class="label">Next best action</span><h3>ส่ง Script เข้า Fact-check ก่อนสร้างภาพ</h3><p>มีข้อกล่าวอ้างเกี่ยวกับการขนกระสุนที่ควรแยก “documented” ออกจาก “according to accounts” เพื่อป้องกันข้อมูลเกินจริง</p><div class="action-steps"><div class="action-step"><span class="num">1</span><div><b>ตรวจแหล่งข้อมูล 2 แห่ง</b><span>Research Archive</span></div><em>12m</em></div><div class="action-step"><span class="num">2</span><div><b>ล็อก Claims และ Caveats</b><span>Policy Shield</span></div><em>8m</em></div><div class="action-step"><span class="num">3</span><div><b>สร้าง CapCut Prompt Pack</b><span>Prompt Studio</span></div><em>15m</em></div></div><button class="btn primary">เริ่มภารกิจนี้</button></div>
    <div class="panel capacity"><span class="label">Weekly capacity</span><div class="capacity-line"><b>72%</b><span>8.5 / 12 ชั่วโมง</span></div><div class="capacity-track"><i></i></div><div class="capacity-grid"><div><b>4</b><span>Shorts capacity</span></div><div><b>1</b><span>Long-form slot</span></div><div><b>2</b><span>Channels active</span></div></div></div>
    <div class="panel policy-mini"><span class="label">Policy shield</span><div class="risk-line"><div class="risk-ring">LOW</div><div class="risk-copy"><b>ช่องหลักยังอยู่ในเกณฑ์ปลอดภัย</b><span>ทุกโปรเจกต์มี Script ต้นฉบับและแยก AI reconstruction ชัดเจน</span></div></div></div>
  </aside>
</div>`);
}

const kanCard=(title,meta,kind='history',priority=false)=>`<div class="kan-card ${priority?'priority':''}"><div class="thumb ${kind}"></div><div class="tag-row"><span class="chip cyan">EN</span><span class="chip">Shorts</span></div><h4>${title}</h4><p>${meta}</p><div class="card-foot"><span>Due 08 Aug</span><div class="avatar-stack"><i></i><i></i></div></div></div>`;
function pipeline(){
return shell('board','Creator Empire','Production Pipeline',`
<div class="context-row"><div><h2>Production Pipeline</h2><p>ลากงานจากไอเดียไปสู่การเผยแพร่ โดยเห็นต้นทุน ความเสี่ยง และเจ้าของงานในจุดเดียว</p></div><div class="action-group"><button class="btn ghost">Automation rules</button><button class="btn primary">+ Add video project</button></div></div>
<div class="pipeline-layout">
  <aside class="panel pipeline-sidebar"><h3>Portfolio filters</h3><div class="filter-list"><div class="filter-item active"><span>ทุกช่อง</span><b>12</b></div><div class="filter-item"><span>History Lab</span><b>6</b></div><div class="filter-item"><span>FlowBiz AI Minute</span><b>4</b></div><div class="filter-item"><span>Pattaya Intel</span><b>2</b></div></div><div class="form-section"><h4 style="margin-bottom:8px">Language</h4><div style="display:flex;gap:6px"><span class="chip cyan">EN 8</span><span class="chip">TH 4</span></div></div><div class="form-section"><h4 style="margin-bottom:8px">Format</h4><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip">Shorts 9</span><span class="chip">Long 3</span></div></div><div class="capacity-block"><strong>WIP Limit: 7 / 8</strong><div class="capacity-track" style="margin-top:8px"><i style="width:87%"></i></div><p>งาน Editing ใกล้เต็ม ควรปิดงานก่อนเพิ่มหัวข้อใหม่</p></div></aside>
  <section class="panel kanban"><div class="kanban-toolbar"><span class="chip cyan">Board</span><span class="chip">Timeline</span><span class="chip">Calendar</span><div class="spacer"></div><span class="chip amber"><span class="dot"></span>2 blocked</span><button class="btn">Filter</button></div><div class="kanban-scroll"><div class="kanban-grid">
    <div class="kanban-col"><div class="col-head"><strong>Selected</strong><span>3</span></div>${kanCard('The Bear Who Joined an Army','Audience score 86 · Evidence medium','history')}${kanCard('Why This Ad Stopped the Scroll','Business/Marketing · TH','ai')}</div>
    <div class="kanban-col"><div class="col-head"><strong>Researching</strong><span>2</span></div>${kanCard('Wojtek: Fact vs Legend','2/3 sources verified','history',true)}${kanCard('Hidden Pattaya After Dark','Location evidence needed','property')}</div>
    <div class="kanban-col"><div class="col-head"><strong>Script Ready</strong><span>2</span></div>${kanCard('Penicillin Was an Accident','128 words · EN naturalized','history')}${kanCard('Automate One Boring Task','Thai voice · Lead generation','ai')}</div>
    <div class="kanban-col"><div class="col-head"><strong>CapCut Draft</strong><span>2</span></div>${kanCard('The Spy With a Wooden Leg','Standard Mode · 5 key shots','history')}${kanCard('Pricing Psychology: 9 vs 10','Director A/B experiment','ai')}</div>
    <div class="kanban-col"><div class="col-head"><strong>QA</strong><span>2</span></div>${kanCard('The City Lost Under Sand','Policy review · AI label','history',true)}${kanCard('3 Condo Buying Mistakes','Factual claims pending','property')}</div>
    <div class="kanban-col"><div class="col-head"><strong>Scheduled</strong><span>1</span></div>${kanCard('A Horse That Saved a Kingdom','YouTube · Fri 20:30 ICT','history')}</div>
  </div></div></section>
</div>`);
}

function analytics(){
return shell('chart','Creator Empire','Analytics War Room',`
<div class="context-row"><div><h2>Analytics War Room</h2><p>แยก Actual, Estimate และ Demo พร้อมบอกสิ่งที่ควรทำต่อ ไม่ใช่แค่แสดงกราฟ</p></div><div class="action-group"><span class="chip amber">Demo data visible</span><button class="btn">Import CSV</button><button class="btn primary">Log metrics</button></div></div>
<div class="analytics-layout">
  <section class="panel chart-panel"><div class="chart-title"><div><h3>90-day audience trajectory</h3><div class="chart-sub">Actual 21 วัน + deterministic forecast พร้อมช่วงความไม่แน่นอน</div></div><div class="chart-legend"><span><i></i>Actual</span><span class="est"><i></i>Forecast</span></div></div><svg class="big-chart" viewBox="0 0 900 315" preserveAspectRatio="none">
    ${[40,95,150,205,260].map(y=>`<line class="gridline" x1="45" x2="875" y1="${y}" y2="${y}"/>`).join('')}
    <path class="band" d="M490 217 C590 188 675 158 875 75 L875 185 C690 205 590 225 490 233 Z"/>
    <path class="actual-line" d="M45 270 C95 267 130 258 170 252 S255 235 300 239 S365 214 410 221 S455 208 490 217"/>
    <path class="est-line" d="M490 217 C585 195 680 155 875 112"/>
    ${[[45,270],[170,252],[300,239],[410,221],[490,217]].map(([x,y])=>`<circle class="dot-actual" cx="${x}" cy="${y}" r="5"/>`).join('')}
    <text x="45" y="300">Day 1</text><text x="300" y="300">Day 21</text><text x="580" y="300">Day 55</text><text x="835" y="300">Day 90</text>
    <text x="5" y="265">0</text><text x="5" y="210">1K</text><text x="5" y="155">2K</text><text x="5" y="100">3K</text><text x="5" y="45">4K subs</text>
  </svg></section>
  <aside class="panel insight-panel"><h3>Decision signal</h3><div class="insight-main"><div class="score">78<span>/100</span></div><p>History Lab มี Retention ดี แต่ Hook 2 วินาทีแรกยังต่ำกว่าเป้าหมาย การเพิ่มคลิปไม่ใช่คำตอบที่ดีที่สุดตอนนี้</p></div><div class="insight-list"><div class="insight-item"><i></i><div><b>ปรับ Hook ก่อนเพิ่มความถี่</b><span>Viewed vs swiped ต่ำกว่าคลิปชนะ 11 จุด</span></div><em>High impact</em></div><div class="insight-item"><i style="background:var(--amber)"></i><div><b>สร้าง Long-form จากหัวข้อผู้ชนะ</b><span>สัตว์ในประวัติศาสตร์มี retention สูงสุด</span></div><em>Next sprint</em></div><div class="insight-item"><i style="background:var(--violet)"></i><div><b>ทดสอบ EN ต่อ</b><span>ผู้ชม US/UK/CA/AU รวม 43% ใน Demo</span></div><em>Evidence weak</em></div></div></aside>
  <section class="panel scatter-panel"><div class="chart-title"><div><h3>CTR vs retention</h3><div class="chart-sub">หาคลิปที่ควรต่อยอด ไม่ดูยอดวิวอย่างเดียว</div></div><span class="chip cyan">Winner zone</span></div><svg class="scatter" viewBox="0 0 700 230"><line class="gridline" x1="45" x2="680" y1="190" y2="190"/><line class="gridline" x1="45" x2="45" y1="15" y2="190"/><line class="gridline" x1="45" x2="680" y1="105" y2="105"/><line class="gridline" x1="365" x2="365" y1="15" y2="190"/><rect x="365" y="15" width="315" height="90" fill="rgba(103,230,223,.045)"/><circle cx="186" cy="149" r="9"/><circle cx="285" cy="118" r="12"/><circle cx="430" cy="86" r="15" class="win"/><circle cx="558" cy="58" r="18" class="win"/><circle cx="492" cy="133" r="10"/><circle cx="332" cy="68" r="8"/><text x="45" y="215">3% CTR</text><text x="630" y="215">12% CTR</text><text x="4" y="190">50%</text><text x="4" y="22">100%</text><text x="478" y="40" style="fill:var(--cyan)">Scale these topics</text></svg></section>
  <aside class="panel cost-panel"><h3>Cost & credit efficiency</h3><div class="cost-band"><span>History EN Shorts</span><div class="cost-track"><i style="width:62%"></i></div><b>84 cr/video</b></div><div class="cost-band"><span>AI TH Shorts</span><div class="cost-track"><i style="width:44%"></i></div><b>59 cr/video</b></div><div class="cost-band"><span>Property EN</span><div class="cost-track"><i style="width:78%;background:linear-gradient(90deg,var(--amber),var(--red))"></i></div><b>112 cr/video</b></div><div class="cost-summary"><div><b>18.4</b><span>videos remaining · estimated</span></div><div><b>22%</b><span>regen waste · demo</span></div><div><b>฿0</b><span>API cost · Copy-to-Chat</span></div><div><b>1.9h</b><span>median production time</span></div></div></aside>
</div>`);
}

function mapScreen(){
return shell('map','Creator Empire','Studio Map',`
<div class="context-row"><div><h2>Portfolio Map</h2><p>ใช้แผนที่เป็นทางเลือกในการนำทาง โดยพื้นที่ทำงานจริงยังเปิดได้โดยตรงจาก Command Palette</p></div><div class="action-group"><button class="btn ghost">Reduce motion</button><button class="btn primary">Resume mission</button></div></div>
<div class="map-layout">
  <section class="panel map-canvas"><div class="studio-map"><div class="map-path p1"></div><div class="map-path p2"></div><div class="map-path p3"></div><div class="map-path p4"></div><div class="map-path p5"></div>
    <div class="room r1"><div class="room-icon">◈</div><div class="room-copy"><strong>Niche Observatory</strong><span>ค้นหาและให้คะแนนโอกาส</span></div></div>
    <div class="room r2"><div class="room-icon">⌁</div><div class="room-copy"><strong>Channel Foundry</strong><span>สร้าง Positioning และ Blueprint</span></div></div>
    <div class="room r3"><div class="room-icon">▦</div><div class="room-copy"><strong>Research Archive</strong><span>Claims, sources และ caveats</span></div></div>
    <div class="room r4"><div class="room-icon">⚡</div><div class="room-copy"><strong>Hook Laboratory</strong><span>ทดลอง Opening และแพตเทิร์น</span></div></div>
    <div class="room r5 active"><div class="room-icon">✦</div><div class="room-copy"><strong>Prompt Studio</strong><span>ประกอบ Prompt Pack จากข้อมูลจริงในโปรเจกต์</span></div></div>
    <div class="room r6"><div class="room-icon">▶</div><div class="room-copy"><strong>CapCut Production Lab</strong><span>Standard, Director และ Credit ledger</span></div></div>
    <div class="room r7"><div class="room-icon">▤</div><div class="room-copy"><strong>Publishing Tower</strong><span>Calendar, batch days และ ICS</span></div></div>
    <div class="room r8"><div class="room-icon">⌁</div><div class="room-copy"><strong>Analytics War Room</strong><span>Actual vs estimate และ NBA</span></div></div>
    <div class="room r9"><div class="room-icon">◇</div><div class="room-copy"><strong>Monetization Vault</strong><span>Ads, affiliate, lead และ product</span></div></div>
  </div></section>
  <aside class="map-side"><div class="panel room-detail"><div class="room-hero">✦</div><span class="label" style="display:block;margin-top:14px">Selected room</span><h3>Prompt Studio</h3><p>สร้าง Prompt แบบมีโครงสร้างสำหรับ Research, Script, Storyboard, CapCut, Thumbnail และ Post-mortem โดยไม่ต้องใช้ API</p><div class="room-actions"><div class="room-action"><strong>Open active prompt</strong><span>Wojtek →</span></div><div class="room-action"><strong>Template library</strong><span>16 types →</span></div><div class="room-action"><strong>Paste AI result</strong><span>JSON schema →</span></div></div></div><div class="panel missions-side"><h3>Nearby missions</h3><div class="mini-mission"><div class="icon">1</div><div><b>Complete Fact-check prompt</b><span>History Lab</span></div><em>+40 XP</em></div><div class="mini-mission"><div class="icon">2</div><div><b>Save CapCut Standard template</b><span>55-second documentary</span></div><em>+55 XP</em></div><div class="mini-mission"><div class="icon">3</div><div><b>Parse structured result</b><span>Storyboard JSON</span></div><em>+25 XP</em></div></div></aside>
</div>`);
}

function prompt(){
const types=['Niche Research','Topic Research','Fact-check','Hook Generator','Shorts Script','Long-form Script','Storyboard & Shots','CapCut Standard','CapCut Director','AI Image','AI Video Clip','Thumbnail & Title','Repurposing','Post-mortem','Next Video'];
return shell('prompt','Creator Empire','Prompt Studio',`
<div class="context-row"><div><h2>Prompt Studio</h2><p>ประกอบ Prompt จากข้อมูลจริงของช่อง พร้อม Copy-to-Chat และ Typed result schema</p></div><div class="action-group"><button class="btn ghost">Save template</button><button class="btn primary">Copy prompt</button></div></div>
<div class="prompt-layout">
  <aside class="panel prompt-nav"><h3>Prompt library</h3>${types.map((t,i)=>`<div class="prompt-type ${i===7?'active':''}"><span class="picon">${i+1}</span><span>${t}</span>${i===7?'<em>ACTIVE</em>':''}</div>`).join('')}</aside>
  <section class="panel prompt-form"><h3>CapCut Standard Mode</h3><p>แนะนำสำหรับ Documentary, Educational และงานที่ต้องควบคุมข้อเท็จจริง</p><div class="form-section"><h4>Project context</h4><div class="form-row"><div class="field"><label>Channel</label><div class="fake-input">History Lab <span>⌄</span></div></div><div class="field"><label>Language</label><div class="fake-input">English <span>⌄</span></div></div></div><div class="field"><label>Video project</label><div class="fake-input">Wojtek: The Soldier Bear <span>⌄</span></div></div></div><div class="form-section"><h4>Production controls</h4><div class="form-row"><div class="field"><label>Format</label><div class="fake-input">Shorts · 9:16</div></div><div class="field"><label>Duration</label><div class="fake-input">50–55 sec</div></div></div><div class="form-row"><div class="field"><label>Voice</label><div class="fake-input">Neutral American</div></div><div class="field"><label>Visual style</label><div class="fake-input">Realistic Film</div></div></div><div class="field"><label>Evidence rule</label><div class="fake-textarea">Separate documented facts from disputed accounts. Use “according to accounts” when evidence is not conclusive.</div></div></div><div class="switch-row"><div><b>Require AI disclosure guidance</b><span>ตรวจ realistic synthetic scenes</span></div><div class="switch"></div></div><div class="switch-row"><div><b>Use actual credit history</b><span>ยังไม่มีข้อมูลเพียงพอ — แสดง manual estimate</span></div><div class="switch"></div></div></section>
  <section class="panel prompt-document"><div class="doc-toolbar"><strong>Live prompt document</strong><span class="chip cyan">EN naturalized</span><span class="chip amber">Policy aware</span><div class="spacer"></div><button class="btn">Shorter</button><button class="btn">Advanced</button></div><div class="doc-body"><span class="doc-label">Ready to copy</span><h3>Create an original 50–55 second vertical historical documentary.</h3><pre class="doc-code"><span class="key">ROLE</span>
Act as a documentary producer, historical fact-checker, and short-form retention editor.

<span class="key">PROJECT</span>
Channel: <span class="value">History Lab</span>
Topic: <span class="value">Wojtek, the bear associated with Polish soldiers in World War II</span>
Audience: English-speaking viewers, primarily US, UK, Canada, and Australia.

<span class="key">OUTPUT</span>
Produce an editable CapCut Standard Mode plan with:
1. A 2-second curiosity hook.
2. A natural English voiceover script of 120–140 words.
3. Eight distinct scenes with visual changes every 2–4 seconds.
4. Three AI-video hero shots and five lower-cost still-image shots.
5. Caption emphasis, sound cues, and an end payoff.

<span class="key">ACCURACY & ORIGINALITY</span>
Do not invent facts. Label disputed details as accounts rather than confirmed facts.
Treat generated realistic visuals as historical reconstruction, not archive footage.
Avoid template-like repetition and write original narrative commentary.</pre></div><div class="schema-strip"><div class="schema-copy"><strong>Expected structured result</strong><p>Typed JSON: script, claims[], caveats[], scenes[], capcutSettings, disclosureDecision, estimatedCredits, qaChecklist.</p></div><div class="schema-actions"><button class="btn primary">Copy to ChatGPT</button><button class="btn">Paste AI result</button></div></div></section>
</div>`);
}

function mobile(){
return `<div class="mobile-screen"><div class="mobile-shell"><header class="mobile-top"><div class="brand-orbit"></div><div class="mobile-title"><strong>Creator Empire</strong><span>Studio HQ · Bangkok</span></div><div class="mobile-xp"><b>Lv. 7 · 1,634 cr</b><span>Manual balance</span></div></header><main class="mobile-content"><div class="mobile-hello"><div><h2>วันนี้ต้องปิดอะไร</h2><span>Thursday · 6 Aug 2026</span></div><span class="chip green">Capacity 72%</span></div><section class="mobile-mission"><span class="label">Daily mission · 45 min</span><h3>ปิด Script และ Shot List ของ Wojtek</h3><p>ทำ Fact-check ให้เสร็จก่อนสร้างภาพ AI เพื่อคุมความถูกต้องและลดการ Regenerate</p><div class="mobile-progress"><i></i></div></section><div class="mobile-row-title"><strong>Active channels</strong><span>View portfolio</span></div><div class="mobile-channel"><div class="channel-icon">HL</div><div><b>History Lab</b><span>Primary · English · 3 active</span></div><em>82</em></div><div class="mobile-channel"><div class="channel-icon">AI</div><div><b>FlowBiz AI Minute</b><span>Experiment · Thai · 2 active</span></div><em style="color:var(--amber)">64</em></div><div class="mobile-row-title"><strong>Next in production</strong><span>Open board</span></div><div class="mobile-tasks"><div class="mobile-task"><div class="ticon">1</div><div><b>Verify two sources</b><span>Wojtek · Research Archive</span></div><em>12m</em></div><div class="mobile-task"><div class="ticon">2</div><div><b>Generate 3 hooks</b><span>Automate One Boring Task</span></div><em>10m</em></div><div class="mobile-task"><div class="ticon">3</div><div><b>Review retention</b><span>Penicillin Was an Accident · Demo</span></div><em>8m</em></div></div></main><nav class="mobile-bottom"><div class="mobile-nav active"><i></i><span>HQ</span></div><div class="mobile-nav"><i></i><span>Ideas</span></div><div class="mobile-nav"><i></i><span>Flow</span></div><div class="mobile-nav"><i></i><span>Prompts</span></div><div class="mobile-nav"><i></i><span>Data</span></div></nav></div></div>`;
}

function review(){
return `<div class="screen review-menu"><div class="panel review-panel"><h1>Creator Empire Simulator</h1><p>Phase 1 concept review — เลือกหน้าจอด้านล่างเพื่อเปิด Concept ที่สร้างไว้ก่อนเข้าสู่ Functional MVP</p><div class="review-grid">${[
['hq','Desktop Studio HQ','Command center ที่เน้น Daily Mission, Portfolio capacity และ Next Best Action'],
['pipeline','Production Pipeline','Kanban หลายช่อง พร้อม WIP limit, cost และ policy blockers'],
['mobile','Mobile Studio HQ','มุมมองมือถือที่ยังทำงานจริง ไม่ใช่แค่ Dashboard ย่อส่วน'],
['analytics','Analytics War Room','Actual vs estimate, uncertainty และคำแนะนำที่นำไปใช้ได้'],
['map','Studio Map','Navigation ทางเลือกแบบเกม โดยไม่บดบังพื้นที่ทำงาน'],
['prompt','Prompt Studio','Copy-to-Chat, CapCut workflow และ structured result schema']
].map(([k,t,d])=>`<a class="review-card" href="?screen=${k}"><strong>${t}</strong><span>${d}</span></a>`).join('')}</div></div></div>`;
}

const params=new URLSearchParams(location.search); const screen=params.get('screen')||'review';
const routes={review,hq,pipeline,analytics,map:mapScreen,prompt,mobile};
document.getElementById('app').innerHTML=(routes[screen]||review)();
