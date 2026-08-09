export const thailandThenNowProfile = {
  key: 'thailand-then-now',
  ideaId: 'thailand-10',
  primaryLanguage: 'th',
  supportedLanguages: ['th', 'en'],
  supportedFormats: ['shorts', 'long'],
  audienceCountries: ['TH', 'US', 'GB', 'AU', 'SG'],
  weeklyShortsTarget: 3,
  monthlyLongTarget: 2,
  targetAudience: 'ผู้ชมไทยเป็นหลัก รวมถึงชาวต่างชาติที่สนใจพัทยา อสังหาริมทรัพย์ การท่องเที่ยว และการเปลี่ยนแปลงของประเทศไทย',
  viewerDesire: 'เห็นความเปลี่ยนแปลงอย่างชัดเจน เข้าใจบริบท และแยกข้อเท็จจริงออกจากความทรงจำหรือภาพประชาสัมพันธ์',
  pillars: ['ไทยในอดีตเทียบปัจจุบัน', 'พัทยาและเมืองท่องเที่ยว', 'อสังหาริมทรัพย์และวิถีชีวิต', 'ข้อมูลท่องเที่ยวที่ตรวจสอบได้'],
  languageStrategy: 'Thai-first narration and metadata. Produce selected English editions from the same verified research without mixing languages inside one narration.',
  visualIdentity: 'Archive evidence paired with current footage, clear date and source labels, restrained documentary graphics, and no misleading before-after reconstruction.',
  narrationPersonality: 'อบอุ่น เป็นสารคดี เข้าใจง่าย และบอกข้อจำกัดของหลักฐานอย่างตรงไปตรงมา',
  shortsStrategy: 'หนึ่งการเปลี่ยนแปลงต่อคลิป เปิดด้วยภาพคู่เก่า-ใหม่ และสรุปบริบทภายใน 30–60 วินาที',
  longFormStrategy: 'เล่าเป็นบทตามช่วงเวลา แยกหลักฐาน ข้อถกเถียง และผลต่อคนในพื้นที่ พร้อม source list',
  sourcePolicy: 'Use licensed or public-domain archives, authoritative records, dated current footage, and preserve source URLs plus usage notes.',
  risks: ['ตรวจสิทธิ์ภาพ archive ก่อนใช้', 'ระบุวันที่และสถานที่ของภาพให้ชัด', 'หลีกเลี่ยงการสรุปเหตุและผลจากภาพเปรียบเทียบเพียงอย่างเดียว'],
} as const;

export const simpleChannelRecommendations = [
  { key: thailandThenNowProfile.key, name: 'Thailand Then and Now', niche: 'ไทยเป็นหลัก · English edition · Shorts + Long-form', promise: 'เทียบอดีตกับปัจจุบันของไทย พัทยา อสังหาฯ และการท่องเที่ยวด้วยหลักฐาน archive และภาพปัจจุบันอย่างรับผิดชอบ', aiFitScore: 84, fitLabel: '83 ไทย · 84 EN', iconName: 'map' },
  { key: 'income-ideas', name: 'ไอเดียสร้างรายได้', niche: 'รายได้เสริม · อาชีพออนไลน์', promise: 'รวมไอเดียทำเงินออนไลน์และออฟไลน์ พร้อมวิธีเริ่มต้นที่ทำตามได้', aiFitScore: 92, fitLabel: '92% AI fit', iconName: 'idea' },
  { key: 'productivity-life', name: 'Productivity Life', niche: 'ประสิทธิภาพ · ชีวิต · เครื่องมือ', promise: 'เทคนิคเพิ่มประสิทธิภาพการทำงานและการใช้ชีวิตให้ดีขึ้นทุกวัน', aiFitScore: 89, fitLabel: '89% AI fit', iconName: 'rocket' },
] as const;
