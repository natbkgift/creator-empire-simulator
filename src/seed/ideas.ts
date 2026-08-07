import type { Idea, LanguageScore } from '../domain/types.js';
import { calculateScore } from '../domain/scoring.js';
import { clamp } from '../domain/utils.js';

interface IdeaSeed {
  en: string;
  th: string;
  enDescription: string;
  thDescription: string;
}

interface CategorySeed {
  id: string;
  en: string;
  th: string;
  base: {
    demand: number;
    monetization: number;
    evidence: number;
    productionEase: number;
    visual: number;
    affiliate: number;
    sponsor: number;
    product: number;
  };
  items: IdeaSeed[];
}

const categories: CategorySeed[] = [
  {
    id: 'history',
    en: 'Strange History & True Stories',
    th: 'ประวัติศาสตร์แปลกและเรื่องจริง',
    base: { demand: 80, monetization: 68, evidence: 76, productionEase: 70, visual: 92, affiliate: 38, sponsor: 62, product: 58 },
    items: [
      ['Animals That Changed History','สัตว์ที่เปลี่ยนประวัติศาสตร์','True stories about animals that influenced wars, science, exploration, or public life.','เรื่องจริงของสัตว์ที่มีบทบาทต่อสงคราม วิทยาศาสตร์ การสำรวจ หรือสังคม'],
      ['Forgotten People Who Changed the World','คนที่โลกเกือบลืม','Recover the stories of people whose impact was larger than their fame.','เล่าเรื่องบุคคลที่สร้างผลกระทบมากกว่าชื่อเสียงที่ได้รับ'],
      ['Real Spy Missions','ภารกิจสายลับที่เกิดขึ้นจริง','Evidence-led espionage stories with clear separation between documents and legend.','เรื่องสายลับจากหลักฐาน โดยแยกเอกสารจริงออกจากเรื่องเล่า'],
      ['Impossible Survival Stories','เรื่องรอดชีวิตเหนือความคาดหมาย','Survival cases explained through choices, environment, and probability.','วิเคราะห์เรื่องรอดชีวิตผ่านการตัดสินใจ สภาพแวดล้อม และความน่าจะเป็น'],
      ['Accidents That Changed the World','อุบัติเหตุที่เปลี่ยนโลก','Unexpected mistakes and accidents that led to discoveries or major change.','ความผิดพลาดและอุบัติเหตุที่นำไปสู่การค้นพบหรือการเปลี่ยนแปลงใหญ่'],
      ['Lost Cities and Expeditions','เมืองและคณะสำรวจที่สาบสูญ','Expeditions, abandoned places, and what evidence says happened.','คณะสำรวจ เมืองร้าง และหลักฐานที่บอกว่าเกิดอะไรขึ้น'],
      ['Historical Myths: Fact or Fiction','ตำนานประวัติศาสตร์จริงหรือเท็จ','Test familiar historical claims against credible evidence.','ตรวจสอบความเชื่อทางประวัติศาสตร์ด้วยหลักฐานที่เชื่อถือได้'],
      ['Strange Inventions from the Past','สิ่งประดิษฐ์แปลกในอดีต','Unusual inventions, the problems they tried to solve, and why they disappeared.','สิ่งประดิษฐ์แปลก ปัญหาที่พยายามแก้ และเหตุผลที่หายไป'],
      ['Hidden Origins of Everyday Objects','ที่มาที่คนไม่รู้ของสิ่งของรอบตัว','Reveal the surprising history behind ordinary objects.','เปิดที่มาที่น่าประหลาดใจของสิ่งของธรรมดา'],
      ['One Historical Event in 60 Seconds','สรุปเหตุการณ์สำคัญใน 60 วินาที','Fast, factual explainers that make one event easy to remember.','อธิบายเหตุการณ์สำคัญให้เข้าใจและจำได้ในเวลาสั้น'],
    ].map(([en, th, enDescription, thDescription]) => ({ en, th, enDescription, thDescription })),
  },
  {
    id: 'ai',
    en: 'AI Agents, Automation & Future Work',
    th: 'AI Agent ระบบอัตโนมัติ และอนาคตการทำงาน',
    base: { demand: 86, monetization: 88, evidence: 70, productionEase: 78, visual: 76, affiliate: 90, sponsor: 88, product: 92 },
    items: [
      ['One AI Tool in 60 Seconds','เครื่องมือ AI ใน 60 วินาที','Demonstrate one practical AI tool with a real task and limitation.','สาธิตเครื่องมือ AI หนึ่งตัวกับงานจริง พร้อมข้อจำกัด'],
      ['Automate One Boring Task','ทำงานน่าเบื่อให้อัตโนมัติ','Show a repeatable workflow that removes one repetitive business task.','แสดง Workflow ที่ลดงานธุรกิจซ้ำซากหนึ่งงาน'],
      ['AI Agent Builds a Workflow','ทดลองสร้าง Workflow ด้วย AI Agent','Build a complete workflow and measure time, quality, and failure points.','สร้าง Workflow จบชุดและวัดเวลา คุณภาพ และจุดพลาด'],
      ['Human vs AI Challenge','มนุษย์แข่งกับ AI','Compare speed, cost, quality, and judgment on a defined task.','เปรียบเทียบความเร็ว ต้นทุน คุณภาพ และวิจารณญาณในงานเดียวกัน'],
      ['AI Failures and Lessons','AI พลาดอย่างไรและเรียนรู้อะไรได้','Turn real failures into safeguards and better operating procedures.','เปลี่ยนความผิดพลาดจริงเป็น Guardrail และขั้นตอนที่ดีขึ้น'],
      ['Small Business AI Makeover','ปรับธุรกิจเล็กด้วย AI','Redesign a small-business process using affordable AI and automation.','ปรับกระบวนการธุรกิจเล็กด้วย AI และ Automation ที่เข้าถึงได้'],
      ['Prompt to Product','เปลี่ยน Prompt เป็นสินค้า','Document the path from an idea to a sellable digital product.','บันทึกเส้นทางจากไอเดียสู่สินค้าดิจิทัลที่ขายได้'],
      ['AI Scams and Risk Detection','ตรวจกลโกงและความเสี่ยงจาก AI','Explain common AI-enabled scams and practical detection steps.','อธิบายกลโกงที่ใช้ AI และวิธีตรวจจับที่ทำได้จริง'],
      ['AI News That Actually Matters','ข่าว AI ที่กระทบผู้ใช้จริง','Filter AI news by concrete impact on work, cost, and opportunity.','คัดข่าว AI ตามผลกระทบจริงต่อการทำงาน ต้นทุน และโอกาส'],
      ['Automated Income Experiments','ทดลองระบบหารายได้อัตโนมัติ','Run transparent experiments with costs, controls, and actual outcomes.','ทดลองระบบรายได้อย่างโปร่งใส พร้อมต้นทุน การควบคุม และผลจริง'],
    ].map(([en, th, enDescription, thDescription]) => ({ en, th, enDescription, thDescription })),
  },
  {
    id: 'business',
    en: 'Business, Marketing & Money',
    th: 'ธุรกิจ การตลาด และเงิน',
    base: { demand: 82, monetization: 90, evidence: 72, productionEase: 76, visual: 72, affiliate: 84, sponsor: 86, product: 88 },
    items: [
      ['Why This Business Won or Failed','ทำไมธุรกิจนี้สำเร็จหรือล้มเหลว','Break down a business result using evidence, decisions, and market conditions.','วิเคราะห์ผลธุรกิจจากหลักฐาน การตัดสินใจ และสภาพตลาด'],
      ['Viral Advertisement Breakdown','วิเคราะห์โฆษณาที่ทำให้คนหยุดดู','Explain why an advertisement earned attention and where it may mislead.','อธิบายว่าโฆษณาดึงความสนใจอย่างไรและจุดที่อาจทำให้เข้าใจผิด'],
      ['Pricing Psychology','จิตวิทยาการตั้งราคา','Explain pricing choices and test them with practical examples.','อธิบายการตั้งราคาและทดสอบด้วยตัวอย่างที่ใช้ได้จริง'],
      ['Sales Funnel Autopsy','ผ่าโครงสร้าง Funnel','Map a funnel from first impression to sale and find leakage.','ทำแผน Funnel ตั้งแต่เห็นครั้งแรกถึงการขายและหาจุดรั่ว'],
      ['Small Budget Business Experiment','ทดลองธุรกิจด้วยงบจำกัด','Run a controlled business test with a fixed budget and measurable outcome.','ทดลองธุรกิจแบบควบคุมด้วยงบตายตัวและผลวัดได้'],
      ['Side Hustle Reality Check','ตรวจความจริงของอาชีพเสริม','Compare claimed earnings with time, risk, capital, and real demand.','เทียบรายได้ที่อ้างกับเวลา ความเสี่ยง เงินทุน และความต้องการจริง'],
      ['Brand Positioning in 60 Seconds','สรุป Positioning ของแบรนด์','Explain one brand’s audience, promise, proof, and differentiation.','อธิบายกลุ่มเป้าหมาย คำสัญญา หลักฐาน และความแตกต่างของแบรนด์'],
      ['Negotiation and Customer Psychology','การต่อรองและพฤติกรรมลูกค้า','Turn behavioral principles into ethical negotiation scripts.','เปลี่ยนหลักพฤติกรรมเป็นสคริปต์ต่อรองที่มีจริยธรรม'],
      ['Creator Business Models','โมเดลรายได้ของ Creator','Compare advertising, affiliate, sponsorship, products, and leads.','เปรียบเทียบโฆษณา Affiliate Sponsor สินค้า และ Lead'],
      ['Hidden Money Leaks in Business','จุดรั่วไหลของเงินในธุรกิจ','Find recurring costs, operational waste, and conversion losses.','หาต้นทุนซ้ำ ความสูญเปล่าการทำงาน และการสูญเสีย Conversion'],
    ].map(([en, th, enDescription, thDescription]) => ({ en, th, enDescription, thDescription })),
  },
  {
    id: 'dhamma',
    en: 'Dhamma, Wisdom & Human Transformation',
    th: 'ธรรมะ ปัญญา และการเปลี่ยนแปลงชีวิต',
    base: { demand: 70, monetization: 55, evidence: 66, productionEase: 84, visual: 68, affiliate: 42, sponsor: 46, product: 72 },
    items: [
      ['One Dhamma Principle for Modern Life','ธรรมะหนึ่งข้อกับชีวิตสมัยใหม่','Apply one principle to a concrete modern-life problem using original writing.','ประยุกต์หลักธรรมหนึ่งข้อกับปัญหาชีวิตสมัยใหม่ด้วยงานเขียนต้นฉบับ'],
      ['True Stories with a Moral Lesson','เรื่องจริงที่ให้ข้อคิด','Tell verified human stories and draw a restrained, non-preachy lesson.','เล่าเรื่องจริงที่ตรวจสอบได้และสรุปข้อคิดโดยไม่เทศนาเกินไป'],
      ['One-Minute Guided Reflection','ทบทวนใจหนึ่งนาที','Create a safe, simple reflection for a specific emotional state.','สร้างบททบทวนใจที่ปลอดภัยและเรียบง่ายสำหรับอารมณ์เฉพาะ'],
      ['Understanding Anger, Fear and Attachment','เข้าใจโกรธ กลัว และยึดติด','Explain an emotion through Buddhist concepts and modern examples.','อธิบายอารมณ์ผ่านแนวคิดพุทธและตัวอย่างสมัยใหม่'],
      ['Buddhism and Modern Psychology','พุทธกับจิตวิทยาสมัยใหม่','Compare ideas carefully without claiming clinical equivalence.','เปรียบเทียบแนวคิดอย่างระมัดระวังโดยไม่อ้างว่าเทียบเท่าการรักษา'],
      ['Decisions Under Pressure','การตัดสินใจเมื่อถูกกดดัน','Offer a practical pause-and-decide framework rooted in wisdom.','เสนอกรอบหยุดคิดและตัดสินใจที่ใช้ได้จริงบนฐานปัญญา'],
      ['Wisdom from Ordinary People','ปัญญาจากคนธรรมดา','Share original interviews or responsibly sourced life lessons.','เล่าบทเรียนชีวิตจากบทสัมภาษณ์ต้นฉบับหรือแหล่งที่รับผิดชอบ'],
      ['Bedtime Wisdom Stories','นิทานข้อคิดก่อนนอน','Write original calming stories with a clear emotional arc.','เขียนนิทานผ่อนคลายต้นฉบับที่มีเส้นเรื่องอารมณ์ชัด'],
      ['Meditation Myths','ความเข้าใจผิดเกี่ยวกับการทำสมาธิ','Correct common misconceptions with careful, practical guidance.','แก้ความเข้าใจผิดด้วยคำแนะนำที่ระมัดระวังและทำได้จริง'],
      ['Seven-Day Mind Training Challenge','ภารกิจฝึกใจเจ็ดวัน','Design a measurable seven-day practice without exaggerated promises.','ออกแบบการฝึกเจ็ดวันที่วัดผลได้โดยไม่ให้คำสัญญาเกินจริง'],
    ].map(([en, th, enDescription, thDescription]) => ({ en, th, enDescription, thDescription })),
  },
  {
    id: 'thailand',
    en: 'Thailand, Pattaya, Property & Travel Intelligence',
    th: 'ไทย พัทยา อสังหาฯ และข้อมูลท่องเที่ยว',
    base: { demand: 76, monetization: 84, evidence: 78, productionEase: 66, visual: 90, affiliate: 76, sponsor: 82, product: 74 },
    items: [
      ['Hidden Pattaya','พัทยาที่นักท่องเที่ยวส่วนใหญ่ไม่รู้จัก','Evidence-led local discoveries beyond generic tourist lists.','ค้นพบสถานที่ท้องถิ่นจากข้อมูลจริง ไม่ใช่ลิสต์ท่องเที่ยวทั่วไป'],
      ['Real Cost of Living in Thailand','ค่าครองชีพไทยตามความเป็นจริง','Track actual costs by lifestyle, location, and date.','ติดตามต้นทุนจริงแยกตามรูปแบบชีวิต ทำเล และวันที่'],
      ['Condo Buying and Renting Mistakes','ข้อผิดพลาดในการซื้อหรือเช่าคอนโด','Explain common mistakes, documents, costs, and questions to ask.','อธิบายข้อผิดพลาด เอกสาร ต้นทุน และคำถามที่ควรถาม'],
      ['Property Project Explained','อธิบายโครงการอสังหาริมทรัพย์แบบเข้าใจง่าย','Translate project facts, risks, ownership, and buyer fit into plain language.','แปลงข้อมูลโครงการ ความเสี่ยง กรรมสิทธิ์ และความเหมาะสมให้เข้าใจง่าย'],
      ['Stories Behind Thai Food','เรื่องราวเบื้องหลังอาหารไทย','Tell the cultural and regional history behind dishes without flattening nuance.','เล่าประวัติทางวัฒนธรรมและภูมิภาคของอาหารโดยไม่ลดทอนรายละเอียด'],
      ['One-Day Thailand Itineraries','เที่ยวไทยหนึ่งวัน','Build realistic day plans with travel time, cost, and weather alternatives.','สร้างแผนหนึ่งวันที่สมจริง พร้อมเวลาเดินทาง ต้นทุน และแผนสำรองสภาพอากาศ'],
      ['Tourist and Expat Mistakes','ข้อผิดพลาดของนักท่องเที่ยวและชาวต่างชาติ','Prevent costly or disrespectful mistakes using current local information.','ป้องกันความผิดพลาดที่เสียเงินหรือไม่เคารพวัฒนธรรมด้วยข้อมูลปัจจุบัน'],
      ['Business Opportunities in Thailand','โอกาสธุรกิจในประเทศไทย','Evaluate opportunities with demand, regulation, capital, and execution risk.','ประเมินโอกาสด้วยความต้องการ กฎ เงินทุน และความเสี่ยงการทำจริง'],
      ['Neighborhood Comparisons','เปรียบเทียบทำเล','Compare areas using price, transport, lifestyle, rental demand, and trade-offs.','เปรียบเทียบทำเลด้วยราคา การเดินทาง ไลฟ์สไตล์ ความต้องการเช่า และข้อแลกเปลี่ยน'],
      ['Thailand Then and Now','ไทยในอดีตเทียบกับปัจจุบัน','Use archive evidence and current footage to show change responsibly.','ใช้หลักฐานเก่าและภาพปัจจุบันแสดงการเปลี่ยนแปลงอย่างรับผิดชอบ'],
    ].map(([en, th, enDescription, thDescription]) => ({ en, th, enDescription, thDescription })),
  },
];

const riskByCategory: Record<string, LanguageScore['copyrightRisk']> = {
  history: 'review',
  ai: 'low',
  business: 'review',
  dhamma: 'review',
  thailand: 'review',
};

const trendByCategory: Record<string, LanguageScore['trendDependency']> = {
  history: 'low',
  ai: 'high',
  business: 'medium',
  dhamma: 'low',
  thailand: 'medium',
};

const factByCategory: Record<string, LanguageScore['factCheckDifficulty']> = {
  history: 'high',
  ai: 'medium',
  business: 'medium',
  dhamma: 'medium',
  thailand: 'high',
};

const makeMetrics = (category: CategorySeed, index: number, language: 'th' | 'en'): LanguageScore => {
  const variation = ((index * 7 + category.id.length * 3) % 15) - 7;
  const englishBoost = language === 'en' ? (category.id === 'history' ? 10 : category.id === 'ai' ? 6 : category.id === 'thailand' ? 8 : 2) : 0;
  const thaiEase = language === 'th' ? 8 : 0;
  const marketFit = language === 'en'
    ? category.id === 'dhamma' ? 70 : category.id === 'thailand' ? 88 : 84
    : category.id === 'thailand' ? 90 : category.id === 'dhamma' ? 86 : 78;
  const countries = language === 'en'
    ? category.id === 'thailand'
      ? ['United States', 'United Kingdom', 'Australia', 'Singapore', 'Thailand']
      : ['United States', 'United Kingdom', 'Canada', 'Australia']
    : ['Thailand'];
  const narration = language === 'en'
    ? category.id === 'history'
      ? 'Neutral American documentary storyteller'
      : 'Neutral international English, clear and conversational'
    : 'Natural Thai, professional and conversational';
  const raw = {
    audienceDemand: clamp(category.base.demand + variation + englishBoost, 45, 98),
    repeatability: clamp(75 + ((index * 11) % 20) - 7, 50, 96),
    differentiation: clamp(68 + ((index * 13) % 24) - 8, 45, 94),
    monetizationPotential: clamp(category.base.monetization + variation / 2 + englishBoost / 2, 35, 98),
    productionEase: clamp(category.base.productionEase + thaiEase - (index % 3) * 3, 40, 96),
    evidenceAvailability: clamp(category.base.evidence + ((index * 5) % 13) - 5, 45, 96),
    languageMarketFit: marketFit,
    creatorFit: clamp(74 + (category.id === 'ai' || category.id === 'business' ? 12 : category.id === 'thailand' ? 8 : 2) - (index % 4), 50, 98),
    productionMinutes: category.id === 'history' || category.id === 'thailand' ? 155 + index * 7 : 105 + index * 6,
    estimatedCreditsLow: category.id === 'history' ? 55 + index * 3 : 35 + index * 2,
    estimatedCreditsHigh: category.id === 'history' ? 145 + index * 5 : 105 + index * 4,
    shortsSuitability: clamp(78 + ((index * 9) % 18) - 4, 55, 98),
    longFormSuitability: clamp(64 + ((index * 7) % 28), 50, 96),
    evergreen: category.id === 'ai' ? clamp(56 + index * 2, 50, 78) : clamp(78 + ((index * 5) % 17), 65, 96),
    trendDependency: trendByCategory[category.id],
    factCheckDifficulty: factByCategory[category.id],
    copyrightRisk: riskByCategory[category.id],
    aiVisualSuitability: clamp(category.base.visual + variation / 2, 45, 98),
    sponsorPotential: clamp(category.base.sponsor + englishBoost / 2 + variation / 3, 25, 98),
    affiliatePotential: clamp(category.base.affiliate + variation / 3, 20, 98),
    digitalProductPotential: clamp(category.base.product + variation / 3, 25, 98),
    recommendedCountries: countries,
    narrationStyle: narration,
  };
  return calculateScore(raw);
};

export const seedIdeas: Idea[] = categories.flatMap((category) =>
  category.items.map((item, index) => ({
    id: `${category.id}-${index + 1}`,
    categoryId: category.id,
    categoryNameEn: category.en,
    categoryNameTh: category.th,
    titleEn: item.en,
    titleTh: item.th,
    descriptionEn: item.enDescription,
    descriptionTh: item.thDescription,
    score: {
      th: makeMetrics(category, index, 'th'),
      en: makeMetrics(category, index, 'en'),
    },
    saved: false,
  })),
);

export const ideaCategories = categories.map(({ id, en, th }) => ({ id, en, th }));
