import assert from 'node:assert/strict';
import {
  button,
  chip,
  dataBadge,
  dataLabel,
  emptyPanel,
  emptyState,
  iconButton,
  languageName,
  metric,
  metricCard,
  moneyOrDash,
  numberOrDash,
  pageHeader,
  progress,
  riskChip,
  sectionHeading,
  selectOptions,
} from '../dist/src/ui/components.js';
import { createSeedWorkspace } from '../dist/src/seed/demo.js';
import { renderShell } from '../dist/src/app/shell.js';
import { renderBlueprint } from '../dist/src/features/blueprint.js';
import { renderHq } from '../dist/src/features/hq.js';
import { renderAnalytics } from '../dist/src/features/analytics.js';
import { renderPrompts } from '../dist/src/features/prompts.js';
import { renderSettings } from '../dist/src/features/settings.js';
import { renderPolicy } from '../dist/src/features/policy.js';
import { routeTitle } from '../dist/src/app/navigation.js';
import { renderSimpleShell } from '../dist/src/app/simple-shell.js';
import { renderSimpleCreate, renderSimpleChannels, renderSimpleProjects } from '../dist/src/features/simple.js';
import { simpleChannelRecommendations, thailandThenNowProfile } from '../dist/src/domain/simple-channels.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('chip renders text with escaped HTML and optional tone class', () => {
  assert.equal(chip('Test', 'green'), '<span class="chip green">Test</span>');
  assert.equal(chip('<script>alert("xss")</script>'), '<span class="chip ">&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</span>');
});

test('dataLabel and dataBadge return correct demo/estimated/actual badges', () => {
  assert.equal(dataLabel('demo'), '<span class="data-label demo">demo</span>');
  assert.equal(dataBadge(true), '<span class="data-label demo">demo</span>');
  assert.equal(dataBadge(false, true), '<span class="data-label estimated">estimated</span>');
  assert.equal(dataBadge(false, false), '<span class="data-label actual">actual</span>');
});

test('riskChip maps risk levels to appropriate classes and labels', () => {
  assert.ok(riskChip('low').includes('green') && riskChip('low').includes('Low'));
  assert.ok(riskChip('review').includes('amber') && riskChip('review').includes('Review'));
  assert.ok(riskChip('high').includes('red') && riskChip('high').includes('High'));
  assert.ok(riskChip('blocked').includes('red') && riskChip('blocked').includes('Blocked'));
});

test('Policy Shield exposes saved music and footage rights evidence for editing', () => {
  const workspace = createSeedWorkspace();
  const project = workspace.projects[0];
  project.policyEvidence = { musicLicensed: 'Track & footage <license>' };
  const html = renderPolicy(workspace, new URLSearchParams({ project: project.id }));
  assert.ok(html.includes('data-change="policy-evidence"'));
  assert.ok(html.includes('data-evidence-key="musicLicensed"'));
  assert.ok(html.includes('Track &amp; footage &lt;license&gt;'));

  project.policyChecks = { originalScript: true, sourcesPresent: true, claimsClassified: true, aiDisclosureReviewed: true, musicLicensed: true, templateRiskReviewed: true };
  project.policyEvidence = {};
  project.riskLevel = 'low';
  const blockedHtml = renderPolicy(workspace, new URLSearchParams({ project: project.id }));
  assert.ok(!blockedHtml.includes('>Low<'));
  assert.ok(blockedHtml.includes('Blocked'));
});

test('metricCard and metric render structured values with escaping', () => {
  assert.equal(metricCard(100, 'Total Views'), '<div class="metric-card "><b>100</b><span>Total Views</span></div>');
  assert.equal(metric('Views', 5000, '+10% past week', 'violet'), '<div class="metric violet"><span>Views</span><strong>5000</strong><small>+10% past week</small></div>');
});

test('progress bar handles clamped percentages and custom labels', () => {
  assert.ok(progress(50).includes('--value:50%'));
  assert.ok(progress(-10).includes('--value:0%'));
  assert.ok(progress(150).includes('--value:100%'));
  assert.ok(progress(75, 'Progress 75%').includes('Progress 75%'));
});

test('pageHeader renders title, subtitle, eyebrow, and actions', () => {
  const html = pageHeader('Mission Control', 'Execute tasks', '<button>Do</button>', 'WORKSPACE');
  assert.ok(html.includes('Mission Control'));
  assert.ok(html.includes('Execute tasks'));
  assert.ok(html.includes('WORKSPACE'));
  assert.ok(html.includes('<button>Do</button>'));
});

test('sectionHeading renders title, optional subtitle, and right elements', () => {
  const html = sectionHeading('Active Channels', 'Overview of channels', '<span>2 active</span>');
  assert.ok(html.includes('Active Channels'));
  assert.ok(html.includes('Overview of channels'));
  assert.ok(html.includes('2 active'));
});

test('button and iconButton format actions and parameters', () => {
  const btn = button('Create', 'create-channel', { tone: 'primary', iconName: 'plus' });
  assert.ok(btn.includes('data-action="create-channel"'));
  assert.ok(btn.includes('class="btn primary"'));
  assert.ok(btn.includes('Create'));
  const iconBtn = iconButton('Delete item', 'delete-item', 'trash');
  assert.ok(iconBtn.includes('data-action="delete-item"'));
  assert.ok(iconBtn.includes('aria-label="Delete item"'));
});

test('selectOptions maps option array and marks selected option', () => {
  const options = [{ value: 'en', label: 'English' }, { value: 'th', label: 'Thai' }];
  const html = selectOptions(options, 'th');
  assert.ok(html.includes('<option value="en" >English</option>'));
  assert.ok(html.includes('<option value="th" selected>Thai</option>'));
});

test('languageName, numberOrDash, moneyOrDash formatting helpers', () => {
  assert.equal(languageName('en'), 'English');
  assert.equal(languageName('th'), 'ไทย');
  assert.equal(numberOrDash(NaN), '—');
  assert.equal(numberOrDash(1234), '1,234');
  assert.equal(moneyOrDash(NaN), '—');
  assert.ok(moneyOrDash(500).includes('500'));
});

test('emptyState and emptyPanel render container with title and detail', () => {
  const html = emptyState('No data', 'Please add an entry', '<button>Add</button>');
  assert.ok(html.includes('No data'));
  assert.ok(html.includes('Please add an entry'));
  assert.ok(html.includes('<button>Add</button>'));
  assert.equal(emptyState, emptyPanel);
});

test('renderShell builds frozen Creator OS command header and five navigation areas', () => {
  const workspace = createSeedWorkspace();
  const html = renderShell(workspace, 'hq', '<main id="hq-view">HQ Content</main>');
  assert.ok(html.includes('app-shell'));
  assert.ok(html.includes('HQ Content'));
  assert.ok(html.includes('global-command-header'));
  assert.ok(html.includes('global-search'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('Search or jump to'));
  assert.equal((html.match(/class="nav-dot /g) ?? []).length, 5);
  const order = ['Today', 'Channels', 'Production', 'Calendar', 'Insights'].map((label) => html.indexOf(`nav-label">${label}`));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual([...order].sort((a,b) => a-b), order);
});

test('Today renders mission-first stage rail and Insights hides native CSV input', () => {
  const workspace = createSeedWorkspace();
  const hq = renderHq(workspace);
  assert.ok(hq.indexOf('mission-title') < hq.indexOf('progress-orbit'));
  assert.equal((hq.match(/mission-stage-step/g) ?? []).length, 5);
  assert.ok(hq.includes('aria-current="step"'));
  const insights = renderAnalytics(workspace, new URLSearchParams());
  assert.ok(insights.includes('class="file-input sr-only"'));
});

test('Today makes an overdue mission explicit and contextual routes keep their page titles', () => {
  const workspace = createSeedWorkspace();
  const activeTask = workspace.calendarTasks.find((task) => !task.completed && task.projectId === workspace.focus.activeProjectId);
  assert.ok(activeTask);
  activeTask.date = '2000-01-01';
  const hq = renderHq(workspace);
  assert.ok(hq.includes('OVERDUE MISSION'));
  assert.ok(hq.includes('Overdue since 2000-01-01'));
  assert.equal(routeTitle('settings'), 'Settings');
});

test('Channels portfolio and Channel Workspace preserve strategy plus 30-day production plan', () => {
  const workspace = createSeedWorkspace();
  const portfolio = renderBlueprint(workspace, new URLSearchParams('portfolio=1'));
  assert.ok(portfolio.includes('channel-portfolio-card'));
  const channel = workspace.channels[0];
  assert.ok(channel);
  const detail = renderBlueprint(workspace, new URLSearchParams(`channel=${encodeURIComponent(channel.id)}`));
  assert.ok(detail.includes('Channel Blueprint'));
  assert.ok(detail.includes('Originality & Sources'));
  assert.ok(detail.includes('Monetization'));
  assert.ok(detail.includes('30-Day Content Plan'));
  assert.ok(detail.includes('data-action="open-plan-idea"'));
  assert.ok(detail.includes('data-action="add-plan-idea"'));
});

test('OpenAI router UI exposes Luna default, Terra auto-route, and important-script override', () => {
  const workspace = createSeedWorkspace();
  workspace.settings.workflowMode = 'automatic';
  workspace.settings.aiProvider = 'openai';
  const settings = renderSettings(workspace);
  const luna = renderPrompts(workspace, new URLSearchParams({ project: workspace.projects[0].id, type: 'shorts-script' }), '');
  const terra = renderPrompts(workspace, new URLSearchParams({ project: workspace.projects[0].id, type: 'fact-check' }), '');
  assert.ok(settings.includes('81.25% Luna / 18.75% Terra') && settings.includes('name="openAiAdvancedModel"'));
  assert.ok(luna.includes('Use Terra for this run') && luna.includes('Generate with Luna'));
  assert.ok(terra.includes('Terra · auto-routed') && terra.includes('Generate with Terra'));
});

test('Settings exposes a non-destructive first-time setup replay', () => {
  const workspace = createSeedWorkspace();
  workspace.settings.onboardingComplete = true;
  const settings = renderSettings(workspace);
  assert.ok(settings.includes('Run setup again'));
  assert.ok(settings.includes('data-action="restart-onboarding"'));
  assert.ok(settings.includes('ไม่ลบ Channel, Video, Calendar หรือ Analytics'));
});

test('Light Studio Simple Mode exposes one primary Autopilot action and four clear destinations', () => {
  const workspace = createSeedWorkspace();
  const createView = renderSimpleCreate(workspace);
  const html = renderSimpleShell(workspace, 'beta/create', createView.html);
  assert.ok(html.includes('มาจากไอเดียเดียว สู่คลิปพร้อมอัปโหลด'));
  assert.ok(html.includes('สร้างชุดวิดีโอทั้งหมด'));
  assert.equal((html.match(/class="simple-nav-link /g) ?? []).length, 4);
  assert.equal((html.match(/class="channel-choice /g) ?? []).length, 3);
  ['สร้างวิดีโอ', 'ช่องของฉัน', 'ผลงาน', 'Expert'].forEach((label) => assert.ok(html.includes(label)));
  assert.ok(html.includes('Simple Mode'));
  assert.ok(!html.includes('Simple Beta'));
  assert.ok(renderSimpleChannels(workspace).html.includes('ช่องของฉัน'));
  assert.ok(renderSimpleProjects(workspace).html.includes('ผลงาน'));
});

test('Thailand Then and Now is Thai-first while supporting bilingual short and long content', () => {
  const workspace = createSeedWorkspace();
  const createView = renderSimpleCreate(workspace);
  assert.equal(simpleChannelRecommendations[0].key, 'thailand-then-now');
  assert.equal(simpleChannelRecommendations[0].name, 'Thailand Then and Now');
  assert.equal(simpleChannelRecommendations[0].fitLabel, '83 ไทย · 84 EN');
  assert.equal(thailandThenNowProfile.ideaId, 'thailand-10');
  assert.equal(thailandThenNowProfile.primaryLanguage, 'th');
  assert.deepEqual(thailandThenNowProfile.supportedLanguages, ['th', 'en']);
  assert.deepEqual(thailandThenNowProfile.supportedFormats, ['shorts', 'long']);
  assert.ok(createView.html.includes('พัทยาในอดีตเทียบกับปัจจุบัน'));
  assert.ok(createView.html.includes('ไทยเป็นหลัก'));
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`PASS ${t.name}`);
  } catch (error) {
    console.error(`FAIL ${t.name}`);
    console.error(error);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} UI component tests passed.`);
