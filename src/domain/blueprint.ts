import type { ChannelBlueprint, Idea, Language, VideoFormat } from './types.js';

const categoryPillars: Record<string, Record<Language, string[]>> = {
  history: {
    en: ['Unbelievable but documented', 'Forgotten people and animals', 'Myth versus evidence', 'How one event changed what followed'],
    th: ['เรื่องเหลือเชื่อที่มีหลักฐาน', 'คนและสัตว์ที่ถูกลืม', 'ตำนานเทียบกับหลักฐาน', 'เหตุการณ์หนึ่งเปลี่ยนสิ่งที่ตามมาอย่างไร'],
  },
  ai: {
    en: ['Practical tool tests', 'Automation builds', 'Failure analysis', 'Business outcomes'],
    th: ['ทดสอบเครื่องมือจริง', 'สร้างระบบอัตโนมัติ', 'วิเคราะห์ความผิดพลาด', 'ผลลัพธ์ทางธุรกิจ'],
  },
  business: {
    en: ['Business case studies', 'Marketing psychology', 'Revenue systems', 'Small-budget experiments'],
    th: ['กรณีศึกษาธุรกิจ', 'จิตวิทยาการตลาด', 'ระบบรายได้', 'การทดลองงบจำกัด'],
  },
  dhamma: {
    en: ['One principle, one problem', 'Original wisdom stories', 'Mind training', 'Careful psychology comparisons'],
    th: ['หนึ่งหลักธรรมต่อหนึ่งปัญหา', 'เรื่องปัญญาต้นฉบับ', 'การฝึกใจ', 'เปรียบเทียบจิตวิทยาอย่างระมัดระวัง'],
  },
  thailand: {
    en: ['Local intelligence', 'Property explained', 'Cost and trade-offs', 'Then and now'],
    th: ['ข้อมูลท้องถิ่น', 'อธิบายอสังหาริมทรัพย์', 'ต้นทุนและข้อแลกเปลี่ยน', 'อดีตเทียบปัจจุบัน'],
  },
};

const namesByCategory: Record<string, Record<Language, string[]>> = {
  history: {
    en: ['History Lab', 'Past Unpacked', 'Evidence of Yesterday', 'True Story Archive', 'Odd History Files', 'The Forgotten Record', 'History Under One Minute', 'Archive After Dark', 'Before We Knew', 'History, Verified'],
    th: ['ห้องแล็บประวัติศาสตร์', 'แกะรอยอดีต', 'บันทึกที่ถูกลืม', 'เรื่องจริงจากอดีต', 'ประวัติศาสตร์นอกตำรา', 'หลักฐานจากเมื่อวาน', 'หนึ่งนาทีประวัติศาสตร์', 'คลังเรื่องเหลือเชื่อ', 'ก่อนโลกจะรู้', 'อดีตที่ตรวจสอบแล้ว'],
  },
  ai: {
    en: ['Agent Minute', 'AI Workflow Lab', 'Automate Better', 'Prompt to Process', 'The Agent Operator', 'Work Less Manual', 'AI Field Test', 'Future Workbench', 'Flow by AI', 'Automation Reality'],
    th: ['AI Minute ไทย', 'ห้องทดลอง AI Agent', 'งานนี้ให้ออโต', 'Prompt สู่ระบบ', 'คนคุมเอเจนต์', 'เลิกทำงานซ้ำ', 'ทดสอบ AI จริง', 'โต๊ะทำงานอนาคต', 'FlowBiz AI Minute', 'Automation แบบไม่ขายฝัน'],
  },
  business: {
    en: ['Business Under Glass', 'Money System Lab', 'The Funnel Room', 'Market Mechanics', 'Why It Sold', 'Small Budget Operator', 'Creator Revenue Lab', 'Pricing Explained', 'Business Signal', 'Growth Without Guessing'],
    th: ['ผ่าธุรกิจ', 'ห้องทดลองระบบเงิน', 'แกะ Funnel', 'กลไกตลาด', 'ทำไมมันขายได้', 'ธุรกิจงบน้อย', 'รายได้ครีเอเตอร์', 'อธิบายการตั้งราคา', 'สัญญาณธุรกิจ', 'โตแบบไม่เดา'],
  },
  dhamma: {
    en: ['One Quiet Minute', 'Wisdom for Real Life', 'The Mind Practice', 'Pause Before Reacting', 'Modern Dhamma Notes', 'Small Steps Inward', 'Clarity Before Sleep', 'The Ordinary Sage', 'Seven Days of Mind', 'Stillness, Applied'],
    th: ['หนึ่งนาทีสงบใจ', 'ธรรมะใช้ได้จริง', 'ห้องฝึกใจ', 'หยุดก่อนตอบโต้', 'บันทึกธรรมะสมัยใหม่', 'ก้าวเล็กเข้าข้างใน', 'ชัดใจก่อนนอน', 'ปัญญาจากคนธรรมดา', 'ฝึกใจเจ็ดวัน', 'ความสงบที่นำไปใช้'],
  },
  thailand: {
    en: ['Pattaya Intel', 'Thailand In Plain English', 'Local Thailand Brief', 'Property Truth Thailand', 'The Thailand Trade-off', 'Beyond Tourist Thailand', 'Pattaya Field Notes', 'Thailand Cost Check', 'Neighbourhood Intelligence', 'Thailand Then & Now'],
    th: ['พัทยาอินเทล', 'ไทยแบบเข้าใจง่าย', 'ข่าวกรองท้องถิ่นไทย', 'ความจริงอสังหาไทย', 'ข้อแลกเปลี่ยนในไทย', 'ไทยนอกลิสต์นักท่องเที่ยว', 'บันทึกภาคสนามพัทยา', 'เช็กค่าครองชีพไทย', 'เปรียบเทียบทำเล', 'ไทยเมื่อก่อนและตอนนี้'],
  },
};

const categoryPromise: Record<string, Record<Language, string>> = {
  history: {
    en: 'True stories from the past that sound fictional—researched, visualized, and explained without turning legend into fact.',
    th: 'เรื่องจริงจากอดีตที่ฟังเหมือนแต่งขึ้น—ค้นข้อมูล ทำภาพ และอธิบายโดยไม่เอาตำนานมาเล่าเป็นข้อเท็จจริง',
  },
  ai: {
    en: 'Practical AI workflows tested on real work, with time, cost, failures, and safeguards shown clearly.',
    th: 'ทดลอง AI กับงานจริง พร้อมเวลา ต้นทุน จุดพลาด และวิธีป้องกันแบบไม่ขายฝัน',
  },
  business: {
    en: 'Business and marketing systems explained through evidence, experiments, and decisions you can apply.',
    th: 'อธิบายระบบธุรกิจและการตลาดผ่านหลักฐาน การทดลอง และการตัดสินใจที่นำไปใช้ได้',
  },
  dhamma: {
    en: 'Original, calm wisdom for specific modern problems—practical, careful, and free from exaggerated promises.',
    th: 'งานเขียนปัญญาต้นฉบับสำหรับปัญหาสมัยใหม่แบบเฉพาะเจาะจง ใช้ได้จริง ระมัดระวัง และไม่ให้คำสัญญาเกินจริง',
  },
  thailand: {
    en: 'Useful Thailand intelligence with real costs, current context, and honest trade-offs for residents, buyers, and visitors.',
    th: 'ข้อมูลไทยที่ใช้ได้จริง พร้อมต้นทุน บริบทปัจจุบัน และข้อแลกเปลี่ยนตรงไปตรงมาสำหรับผู้อยู่อาศัย ผู้ซื้อ และนักท่องเที่ยว',
  },
};

const targetByCategory: Record<string, Record<Language, string>> = {
  history: { en: 'Curious English-speaking viewers aged 18–44 who like documentary Shorts and surprising evidence-led stories.', th: 'ผู้ชมไทยอายุ 18–44 ที่ชอบสารคดีสั้น เรื่องเหลือเชื่อ และการแยกตำนานออกจากหลักฐาน' },
  ai: { en: 'Creators, operators, and small-business owners who want practical AI rather than hype.', th: 'เจ้าของธุรกิจ ผู้ทำงาน และครีเอเตอร์ไทยที่ต้องการใช้ AI จริง ไม่ใช่แค่ตามกระแส' },
  business: { en: 'Entrepreneurs and creators seeking practical business and marketing explanations.', th: 'ผู้ประกอบการและครีเอเตอร์ไทยที่ต้องการเข้าใจธุรกิจและการตลาดแบบนำไปใช้ได้' },
  dhamma: { en: 'Adults seeking calm, practical reflection without religious pressure.', th: 'ผู้ใหญ่ที่ต้องการทบทวนใจอย่างสงบ ใช้ได้จริง และไม่ถูกกดดันทางศาสนา' },
  thailand: { en: 'Expats, tourists, property buyers, and internationally minded Thai viewers.', th: 'คนไทย ชาวต่างชาติ นักลงทุน และผู้ซื้ออสังหาฯ ที่ต้องการข้อมูลท้องถิ่นตรงไปตรงมา' },
};

const sampleTitles = (idea: Idea, language: Language): string[] => {
  const base = language === 'en' ? idea.titleEn : idea.titleTh;
  if (language === 'en') {
    return [
      `${base}: The Story Most People Missed`,
      `The Real Reason ${base} Matters`,
      `${base} in 60 Seconds`,
      `What the Evidence Says About ${base}`,
      `The Detail That Changes ${base}`,
      `${base}: Myth vs Fact`,
      `How ${base} Changed What Happened Next`,
      `The Cost of Getting ${base} Wrong`,
    ];
  }
  return [
    `${base}: เรื่องที่คนส่วนใหญ่ไม่รู้`,
    `เหตุผลจริงที่ ${base} สำคัญ`,
    `${base} ใน 60 วินาที`,
    `หลักฐานบอกอะไรเกี่ยวกับ ${base}`,
    `รายละเอียดที่เปลี่ยนความเข้าใจเรื่อง ${base}`,
    `${base}: ตำนานเทียบข้อเท็จจริง`,
    `${base} เปลี่ยนสิ่งที่ตามมาอย่างไร`,
    `ต้นทุนของการเข้าใจ ${base} ผิด`,
  ];
};

export const generateBlueprint = (idea: Idea, language: Language, format: VideoFormat = 'both'): ChannelBlueprint => {
  const names = namesByCategory[idea.categoryId]?.[language] ?? [language === 'en' ? 'Creator Studio' : 'สตูดิโอครีเอเตอร์'];
  const pillars = categoryPillars[idea.categoryId]?.[language] ?? [];
  const promise = categoryPromise[idea.categoryId]?.[language] ?? '';
  const target = targetByCategory[idea.categoryId]?.[language] ?? '';
  const titles = sampleTitles(idea, language);
  const isEn = language === 'en';
  const plan30Days = Array.from({ length: 12 }, (_, index) => ({
    day: index === 0 ? 1 : index * 2 + 2,
    title: titles[index % titles.length],
    format: index === 5 || index === 11 ? 'long' as const : 'shorts' as const,
    objective: index < 4
      ? isEn ? 'Validate topic and hook demand.' : 'ทดสอบความต้องการของหัวข้อและ Hook'
      : index < 8
        ? isEn ? 'Build a repeatable series from winning signals.' : 'สร้างซีรีส์ต่อเนื่องจากสัญญาณที่ชนะ'
        : isEn ? 'Expand the strongest Short into long-form or monetization.' : 'ขยาย Short ที่แข็งแรงเป็น Long-form หรือเส้นทางรายได้',
  })).filter((item) => format === 'both' || item.format === format);

  return {
    concept: isEn
      ? `A focused ${idea.categoryNameEn} channel built around “${idea.titleEn},” using original research, clear storytelling, and a disciplined Shorts-to-long-form system.`
      : `ช่อง ${idea.categoryNameTh} ที่โฟกัส “${idea.titleTh}” ด้วยงานค้นคว้าต้นฉบับ การเล่าเรื่องชัด และระบบต่อยอด Shorts สู่ Long-form`,
    nameOptions: names,
    promise,
    targetAudience: target,
    viewerDesire: isEn
      ? 'Understand something surprising quickly and trust that the creator separated evidence from exaggeration.'
      : 'เข้าใจสิ่งที่น่าประหลาดใจได้เร็ว และเชื่อถือได้ว่าผู้สร้างแยกหลักฐานออกจากคำกล่าวเกินจริง',
    pillars,
    visualIdentity: isEn
      ? 'Dark documentary studio, clean direct captions, one focal image per scene, restrained cyan/amber accents, no fake archival labels.'
      : 'สตูดิโอสารคดีโทนเข้ม คำบรรยายตรง อ่านง่าย หนึ่งภาพหลักต่อฉาก ใช้สีฟ้าอมเขียว/ส้มอย่างพอดี และไม่ติดป้ายภาพ AI ว่าเป็นภาพ archive จริง',
    narrationPersonality: idea.score[language].narrationStyle,
    languageStrategy: isEn
      ? 'Write natively in English for international viewers. Use concise vocabulary, neutral pronunciation, and English captions. Do not translate Thai scripts literally.'
      : 'เขียนต้นฉบับภาษาไทยให้เป็นธรรมชาติ ใช้คำสั้นชัด มี Subtitle ไทย และอธิบายศัพท์อังกฤษเมื่อจำเป็น',
    voice: idea.score[language].narrationStyle,
    shortsStrategy: isEn
      ? 'Publish 3–5 Shorts per week, test three hook families, and create sequels only when at least two performance signals beat the channel median.'
      : 'เผยแพร่ Shorts 3–5 คลิปต่อสัปดาห์ ทดสอบ Hook สามแบบ และทำภาคต่อเมื่ออย่างน้อยสองตัวชี้วัดสูงกว่าค่ากลางของช่อง',
    longFormStrategy: isEn
      ? 'Every 8–10 Shorts, expand the strongest topic into a 6–9 minute evidence-led video to build watch time and authority.'
      : 'ทุก 8–10 Shorts ให้นำหัวข้อที่ชนะไปขยายเป็นวิดีโอ 6–9 นาทีเพื่อสะสม Watch Time และความน่าเชื่อถือ',
    plan30Days,
    experiment90Days: [
      isEn ? 'Days 1–30: publish 12 Shorts across three sub-series and record retention, swiped-away rate, geography, time, and credits.' : 'วันที่ 1–30: ลง 12 Shorts ในสามซีรีส์ย่อยและบันทึก Retention, Swiped-away, ประเทศ, เวลา และเครดิต',
      isEn ? 'Days 31–60: double down on the strongest series; produce two long-form expansions.' : 'วันที่ 31–60: เพิ่มการผลิตซีรีส์ที่ชนะและทำ Long-form สองคลิป',
      isEn ? 'Days 61–90: test one monetization route and decide continue, pivot, or stop using actual data.' : 'วันที่ 61–90: ทดสอบรายได้หนึ่งเส้นทางแล้วตัดสินใจเดินหน้า ปรับ หรือหยุดจากข้อมูลจริง',
    ],
    monetizationPaths: idea.categoryId === 'ai' || idea.categoryId === 'business'
      ? ['YouTube advertising', 'Affiliate tools', 'Digital templates', 'Business leads', 'Sponsorship']
      : idea.categoryId === 'thailand'
        ? ['YouTube advertising', 'Property or travel leads', 'Affiliate bookings', 'Sponsorship', 'Email or LINE OA capture']
        : ['YouTube advertising', 'Sponsorship', 'Digital compilations', 'Affiliate books or learning products'],
    risks: [
      isEn ? 'Competition is global; generic AI visuals and translated scripts will underperform.' : 'ตลาดไทยเล็กกว่า ต้องชนะด้วยความสม่ำเสมอและความใกล้ชิดกับผู้ชม',
      isEn ? 'A single template repeated across the channel may create inauthentic-content risk.' : 'การใช้ Template เดิมซ้ำทุกคลิปอาจทำให้ช่องดูผลิตซ้ำและขาดความเป็นต้นฉบับ',
      isEn ? 'Claims and realistic AI reconstructions require a documented review workflow.' : 'ข้อกล่าวอ้างและภาพ AI สมจริงต้องผ่านขั้นตอนตรวจและเปิดเผยที่เหมาะสม',
    ],
    originalityStrategy: isEn
      ? 'Keep a research record, write each script from a unique angle, vary scene logic—not only colors or names—and save editing decisions that prove transformation.'
      : 'เก็บประวัติการค้นคว้า เขียนบทจากมุมเฉพาะของแต่ละเรื่อง เปลี่ยนตรรกะการเล่า ไม่ใช่แค่สีหรือชื่อ และบันทึกการตัดต่อที่แสดงการแปลงเนื้อหา',
    factCheckWorkflow: [
      isEn ? 'List every factual claim and classify it as documented, reported, disputed, or unsupported.' : 'ลิสต์ข้อกล่าวอ้างทุกข้อและแยกเป็น documented, reported, disputed หรือ unsupported',
      isEn ? 'Verify with at least two credible sources where practical; prefer primary or official records.' : 'ตรวจด้วยแหล่งน่าเชื่อถืออย่างน้อยสองแห่งเมื่อทำได้ โดยให้ความสำคัญกับเอกสารต้นทางหรือทางการ',
      isEn ? 'Add caveats directly to the narration when evidence is uncertain.' : 'ใส่ข้อจำกัดของหลักฐานลงในบทพูดโดยตรงเมื่อยังไม่แน่นอน',
      isEn ? 'Run a final visual-era, rights, and synthetic-disclosure review before publishing.' : 'ตรวจยุคของภาพ สิทธิ์การใช้ และการเปิดเผยภาพสังเคราะห์ก่อนเผยแพร่',
    ],
    sourcePolicy: isEn
      ? 'Use primary or official sources first, then reputable secondary analysis. Save URLs, publisher, access date, and the exact claim supported. Never invent a citation.'
      : 'ใช้แหล่งต้นทางหรือทางการก่อน ตามด้วยบทวิเคราะห์รองที่น่าเชื่อถือ เก็บ URL ผู้เผยแพร่ วันที่เข้าถึง และข้อกล่าวอ้างที่รองรับ ห้ามสร้างแหล่งอ้างอิงขึ้นเอง',
    decisionCriteria: [
      isEn ? 'Continue if at least two of 12 Shorts beat the channel median on retention and subscriber conversion.' : 'เดินหน้าหากอย่างน้อย 2 จาก 12 Shorts สูงกว่าค่ากลางด้าน Retention และการเปลี่ยนเป็นผู้ติดตาม',
      isEn ? 'Pivot the hook or sub-series if views rise but subscribers and returning viewers remain weak.' : 'ปรับ Hook หรือซีรีส์ย่อยหากยอดดูขึ้นแต่ผู้ติดตามและ Returning Viewers ยังอ่อน',
      isEn ? 'Stop or park the channel if production cost stays high and no repeatable winner appears after 30 tested videos.' : 'หยุดหรือพักช่องหากต้นทุนผลิตยังสูงและไม่มีรูปแบบชนะซ้ำได้หลังทดสอบ 30 คลิป',
    ],
  };
};
