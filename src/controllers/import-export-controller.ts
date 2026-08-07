import { getWorkspace, replaceWorkspace } from '../app/store.js';
import { parseCsv, toCsv, downloadText, uid } from '../domain/utils.js';
import { validateWorkspace } from '../domain/validation.js';
import { showToast, confirmDialog } from '../ui/feedback.js';
import { navigate } from '../app/router.js';
import { activeProject } from '../app/selectors.js';
import { recordWorkflowEvent, syncNextWorkflowMission, workflowReadiness } from '../domain/workflow.js';
import { updateWorkspace, awardXp } from '../app/store.js';
import { applyProjectFocus } from '../domain/focus.js';
import type { AnalyticsEntry } from '../domain/types.js';

export const retentionSeries = (percentage: number): number[] => {
  const safe = Math.max(0, Math.min(150, percentage));
  return Array.from({ length: 11 }, (_, index) => {
    if (index === 0) return 100;
    const progress = index / 10;
    return Math.max(0, Math.round(100 - (100 - safe * 0.72) * progress));
  });
};

export const escapeIcs = (value: string): string => value
  .replaceAll('\\', '\\\\')
  .replaceAll(';', '\\;')
  .replaceAll(',', '\\,')
  .replaceAll(/\r?\n/g, '\\n');

export const toIcsDateTime = (date: string, time: string): string => `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;

export const exportIcs = (): void => {
  const workspace = getWorkspace();
  const events = workspace.calendarTasks.map((task) => {
    const start = new Date(`${task.date}T${task.startTime}:00`);
    const end = new Date(start.getTime() + task.durationMinutes * 60000);
    const endDate = end.toISOString().slice(0, 10);
    const endTime = end.toTimeString().slice(0, 5);
    return [
      'BEGIN:VEVENT',
      `UID:${task.id}@creator-empire.local`,
      `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
      `DTSTART;TZID=${workspace.settings.timezone}:${toIcsDateTime(task.date, task.startTime)}`,
      `DTEND;TZID=${workspace.settings.timezone}:${toIcsDateTime(endDate, endTime)}`,
      `SUMMARY:${escapeIcs(task.title)}`,
      `DESCRIPTION:${escapeIcs(`Creator Empire · ${task.type}${task.projectId ? ` · Project ${task.projectId}` : ''}`)}`,
      'END:VEVENT',
    ].join('\r\n');
  });
  const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FlowBiz//Creator Empire Simulator//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR'].join('\r\n');
  downloadText('creator-empire-calendar.ics', content, 'text/calendar;charset=utf-8');
  showToast('ส่งออก Calendar .ics แล้ว');
};

export const exportWorkspace = (): void => {
  downloadText('creator-empire-workspace.json', JSON.stringify(getWorkspace(), null, 2), 'application/json;charset=utf-8');
  showToast('Export Workspace JSON แล้ว');
};

export const exportProjectsCsv = (): void => {
  const workspace = getWorkspace();
  const rows: Array<Array<string | number | boolean>> = [[
    'id','title','channelId','language','format','status','deadline','estimatedMinutes','actualCredits','riskLevel','isDemo',
  ]];
  workspace.projects.forEach((project) => rows.push([
    project.id, project.title, project.channelId, project.language, project.format, project.status,
    project.deadline, project.estimatedMinutes, project.actualCredits, project.riskLevel, Boolean(project.isDemo),
  ]));
  downloadText('creator-empire-projects.csv', toCsv(rows), 'text/csv;charset=utf-8');
};

export const exportAnalyticsCsv = (): void => {
  const workspace = getWorkspace();
  const rows: Array<Array<string | number | boolean>> = [[
    'projectId','platform','recordedAt','impressions','views','viewedVsSwiped','ctr','averageViewDurationSeconds',
    'averagePercentageViewed','watchHours','subscribersGained','revenueThb','creditsUsed','financialCostThb','isDemo',
  ]];
  workspace.analytics.forEach((entry) => rows.push([
    entry.projectId, entry.platform, entry.recordedAt, entry.impressions, entry.views, entry.viewedVsSwiped,
    entry.ctr, entry.averageViewDurationSeconds, entry.averagePercentageViewed, entry.watchHours,
    entry.subscribersGained, entry.revenueThb, entry.creditsUsed, entry.financialCostThb, Boolean(entry.isDemo),
  ]));
  downloadText('creator-empire-analytics.csv', toCsv(rows), 'text/csv;charset=utf-8');
};

export const importWorkspaceFile = async (file: File): Promise<void> => {
  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    const validation = validateWorkspace(parsed);
    if (!validation.valid || !validation.workspace) {
      showToast(`Import ไม่ผ่าน: ${validation.errors.slice(0, 2).join(' ')}`, 'danger');
      return;
    }
    replaceWorkspace(validation.workspace);
    showToast('Import Workspace สำเร็จ');
    navigate('hq');
  } catch (error) {
    showToast(`อ่านไฟล์ไม่ได้: ${error instanceof Error ? error.message : 'Invalid JSON'}`, 'danger');
  }
};

export const importAnalyticsCsv = async (file: File): Promise<void> => {
  try {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error('CSV ไม่มีข้อมูล');
    const headers = rows[0].map((item) => item.trim());
    const index = (name: string): number => headers.indexOf(name);
    const workspace = getWorkspace();
    const imported: AnalyticsEntry[] = [];
    rows.slice(1).forEach((row) => {
      const projectId = row[index('projectId')] || activeProject(workspace)?.id || workspace.projects[0]?.id;
      const project = workspace.projects.find((item) => item.id === projectId);
      if (!project) return;
      const views = Number(row[index('views')]) || 0;
      const revenue = Number(row[index('revenueThb')]) || 0;
      const retention = Number(row[index('averagePercentageViewed')]) || 0;
      imported.push({
        id: uid('analytics'), projectId: project.id, channelId: project.channelId,
        recordedAt: row[index('recordedAt')] || new Date().toISOString(),
        platform: (row[index('platform')] || 'youtube') as AnalyticsEntry['platform'],
        impressions: Number(row[index('impressions')]) || 0, views,
        viewedVsSwiped: Number(row[index('viewedVsSwiped')]) || 0,
        ctr: Number(row[index('ctr')]) || 0,
        averageViewDurationSeconds: Number(row[index('averageViewDurationSeconds')]) || 0,
        averagePercentageViewed: retention, retentionPoints: retentionSeries(retention),
        watchHours: Number(row[index('watchHours')]) || 0,
        subscribersGained: Number(row[index('subscribersGained')]) || 0,
        returningViewers: Number(row[index('returningViewers')]) || 0,
        topCountries: (row[index('topCountries')] || '').split('|').filter(Boolean),
        revenueThb: revenue, rpmThb: views ? revenue / views * 1000 : 0,
        productionMinutes: Number(row[index('productionMinutes')]) || project.estimatedMinutes,
        creditsUsed: Number(row[index('creditsUsed')]) || 0,
        financialCostThb: Number(row[index('financialCostThb')]) || 0,
        isDemo: false,
      });
    });
    if (!imported.length) throw new Error('ไม่พบ Project id ที่ตรงกับ Workspace');
    let advancedCount = 0;
    updateWorkspace((draft) => {
      draft.analytics.push(...imported);
      const projectIds = new Set(imported.map((entry) => entry.projectId));
      projectIds.forEach((projectId) => {
        const target = draft.projects.find((item) => item.id === projectId);
        if (!target) return;
        const count = imported.filter((entry) => entry.projectId === projectId).length;
        recordWorkflowEvent(target, { type: 'analytics-recorded', note: `Imported ${count} actual analytics record(s).` });
        if (target.status === 'published' && workflowReadiness(draft, target, 'analytics-review').ready) {
          const task = draft.calendarTasks.find((item) => item.projectId === target.id && !item.completed && item.sourceStatus === 'published');
          if (task) { task.completed = true; task.completedAt = new Date().toISOString(); }
          target.status = 'analytics-review';
          target.updatedAt = new Date().toISOString();
          advancedCount += 1;
          recordWorkflowEvent(target, { type: 'stage-advanced', note: 'Actual analytics imported.', fromStatus: 'published', toStatus: 'analytics-review', taskId: task?.id });
          syncNextWorkflowMission(draft, target.id);
        }
      });
      const focusProject = draft.projects.find((item) => projectIds.has(item.id)) ?? activeProject(draft);
      if (focusProject) {
        const next = syncNextWorkflowMission(draft, focusProject.id);
        applyProjectFocus(draft, focusProject.id, next?.id);
      }
      awardXp(draft, `analytics-import:${Date.now()}`, Math.min(100, imported.length * 10), 'analytics');
    });
    showToast(`Import Analytics ${imported.length} records แล้ว${advancedCount ? ` · เปิด Post-mortem ${advancedCount} Project` : ''}`);
    if (advancedCount) navigate('mission', { project: activeProject(getWorkspace())?.id });
  } catch (error) {
    showToast(`Import CSV ไม่สำเร็จ: ${error instanceof Error ? error.message : 'Invalid CSV'}`, 'danger');
  }
}

export const removeDemoData = (): void => {
  updateWorkspace((draft) => {
    const demoProjectIds = new Set(draft.projects.filter((item) => item.isDemo).map((item) => item.id));
    const demoChannelIds = new Set(draft.channels.filter((item) => item.isDemo).map((item) => item.id));
    draft.channels = draft.channels.filter((item) => !item.isDemo);
    draft.projects = draft.projects.filter((item) => !item.isDemo);
    draft.analytics = draft.analytics.filter((item) => !item.isDemo && !demoProjectIds.has(item.projectId));
    draft.calendarTasks = draft.calendarTasks.filter((item) => !item.isDemo && !demoProjectIds.has(item.projectId ?? ''));
    draft.sources = draft.sources.filter((item) => !demoProjectIds.has(item.projectId));
    draft.credits = draft.credits.filter((item) => !item.projectId || !demoProjectIds.has(item.projectId));
    draft.monetization = draft.monetization.filter((item) => !demoChannelIds.has(item.channelId));
  });
  showToast('ลบ Demo Data แล้ว');
};
