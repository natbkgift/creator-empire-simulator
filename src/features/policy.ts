import type { Workspace } from '../domain/types.js';
import { activeProject, projectsInFocus, projectById, statusLabels } from '../app/selectors.js';
import { routeHref } from '../app/router.js';
import { escapeHtml } from '../domain/utils.js';
import { workflowReadiness } from '../domain/workflow.js';
import { chip, pageHeader, riskChip } from '../ui/components.js';

const checks = [
  ['originalScript', 'Script เป็นงานต้นฉบับและไม่คัดลอกโครงประโยคจากแหล่งเดียว'],
  ['sourcesPresent', 'มีแหล่งข้อมูลที่เพียงพอและตรวจวันเข้าถึงแล้ว'],
  ['claimsClassified', 'แยก Documented, Reported, Disputed และ Unsupported claims'],
  ['aiDisclosureReviewed', 'ตรวจว่าต้องเปิดเผย realistic AI reconstruction หรือไม่'],
  ['musicLicensed', 'เพลง เสียง และ Footage มีสิทธิ์ใช้งาน'],
  ['templateRiskReviewed', 'ตรวจความเสี่ยง Template ซ้ำและความแตกต่างจากคลิปก่อน'],
  ['sensitiveContentReviewed', 'ตรวจบุคคลจริง เหตุการณ์รุนแรง สุขภาพ การเงิน หรือกฎหมาย'],
  ['trademarkReviewed', 'ตรวจ Logo, Trademark, Product claim และภาพบรรจุภัณฑ์'],
] as const;

export const renderPolicy = (workspace: Workspace, params: URLSearchParams): string => {
  const project = projectById(workspace, params.get('project') ?? undefined) ?? activeProject(workspace) ?? workspace.projects[0];
  const scopedProjects = projectsInFocus(workspace);
  const completed = project ? checks.filter(([key]) => project.policyChecks[key]).length : 0;
  const derivedRisk = !project ? 'review' : completed >= 6 && project.riskLevel === 'low' ? 'low' : completed < 3 ? 'high' : 'review';
  const readiness = project ? workflowReadiness(workspace, project, 'scheduled') : { ready: false, completed: [], blockers: [] };
  return `${pageHeader('Policy Shield', 'Policy Gate ถูกผูกกับ Active Project และต้องผ่านก่อนเลื่อน QA → Scheduled', `${project ? `<a class="btn" href="${routeHref('mission', { project: project.id })}">Mission Control</a><a class="btn primary" href="${routeHref('prompts', { project: project.id, type: 'fact-check' })}">Fact-check prompt</a>` : ''}`)}
    ${project ? `<section class="policy-mission-strip"><div><span class="kicker">Active Project</span><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(statusLabels[project.status])} · Completion gate ${readiness.ready ? 'พร้อม' : 'ยังมี Blocker'}</p></div><div class="row wrap">${riskChip(project.riskLevel)}${chip(`${completed}/${checks.length} checks`, completed >= 6 ? 'green' : 'amber')}<button class="btn ${readiness.ready ? 'primary' : ''}" data-action="complete-mission" data-project-id="${escapeHtml(project.id)}">Complete & advance</button></div></section>` : ''}
    <div class="grid-2">
      <section class="panel panel-pad"><div class="panel-title"><div><h3>Project release checklist</h3><p>เลือก Project ภายใน Channel Focus และปิดรายการตรวจทีละข้อ</p></div>${riskChip(derivedRisk)}</div><div class="field" style="margin-bottom:13px"><label>Project</label><select class="select" data-change="policy-project">${scopedProjects.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === project?.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('')}</select></div><div class="inline-note ${derivedRisk === 'high' ? 'danger' : derivedRisk === 'review' ? 'warning' : ''}"><strong>${completed}/${checks.length} checks complete</strong><br/>${derivedRisk === 'low' ? 'Checklist complete; still review platform-specific policy before publishing.' : 'ยังมี Gate ที่ต้องตรวจ ห้ามถือว่า Checklist นี้เป็น Legal conclusion'}</div><div class="checklist" style="margin-top:14px">${project ? checks.map(([key, label]) => `<label class="check-item"><input type="checkbox" data-change="policy-check" data-project-id="${escapeHtml(project.id)}" data-check-key="${escapeHtml(key)}" ${project.policyChecks[key] ? 'checked' : ''}/><span>${escapeHtml(label)}</span></label>`).join('') : ''}</div>${project ? `<div class="row wrap" style="margin-top:14px"><button class="btn primary" data-action="recalculate-risk" data-project-id="${escapeHtml(project.id)}">Update risk</button><a class="btn" href="${routeHref('prompts', { project: project.id, type: 'fact-check' })}">Open Fact-check</a></div>` : ''}</section>
      <aside class="stack"><section class="panel panel-pad"><div class="panel-title"><div><h3>Completion gate</h3><p>สิ่งที่ระบบตรวจได้จากข้อมูลใน Project</p></div>${readiness.ready ? chip('Ready', 'green') : chip('Blocked', 'amber')}</div><h4>Passed</h4><ul class="bullet-list">${readiness.completed.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>ยังไม่มี</li>'}</ul><div class="divider"></div><h4>Blockers</h4><ul class="bullet-list">${readiness.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>ไม่มี Blocker</li>'}</ul></section><section class="panel panel-pad"><h3>Policy Registry</h3><p class="muted small-copy">ข้อมูลเปลี่ยนแปลงได้จึงเก็บ Source และ Last verified date</p>${workspace.policies.slice(0, 8).map((rule) => `<article class="policy-rule"><div><strong>${escapeHtml(rule.topic)}</strong><span>${escapeHtml(rule.platform)} · ${escapeHtml(rule.country)}</span></div><em>${escapeHtml(rule.lastVerifiedAt)}</em><p>${escapeHtml(rule.summary)}</p></article>`).join('')}</section></aside>
    </div>`;
};
