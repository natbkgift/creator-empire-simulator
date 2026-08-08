import type { Workspace } from '../domain/types.js';
import { activeChannel, activeProject, analyticsInFocus, channelById, projectsInFocus, projectById, statusLabels } from '../app/selectors.js';
import { barChart } from '../charts/charts.js';
import { escapeHtml, formatNumber } from '../domain/utils.js';
import { routeHref } from '../app/router.js';
import { chip, dataLabel, metricCard, pageHeader } from '../ui/components.js';
import { isProductionComplete } from '../domain/workflow.js';

export const renderAnalytics = (workspace: Workspace, params: URLSearchParams): string => {
  const requestedProject = projectById(workspace, params.get('project') ?? undefined);
  const project = requestedProject ?? activeProject(workspace);
  const channel = requestedProject ? channelById(workspace, requestedProject.channelId) : activeChannel(workspace);
  const entries = analyticsInFocus(workspace, requestedProject?.id).toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const views = entries.reduce((sum, entry) => sum + entry.views, 0);
  const subscribers = entries.reduce((sum, entry) => sum + entry.subscribersGained, 0);
  const avgRetention = entries.length ? entries.reduce((sum, entry) => sum + entry.averagePercentageViewed, 0) / entries.length : 0;
  const avgCtr = entries.length ? entries.reduce((sum, entry) => sum + entry.ctr, 0) / entries.length : 0;
  const chart = barChart(entries.slice(-12).map((entry) => ({ label: entry.recordedAt.slice(5, 10), value: entry.views })), 'Views by recent publish');
  const nextInsight = !entries.length
    ? 'ยังไม่มี Actual analytics — บันทึกข้อมูลคลิปแรกเพื่อเริ่ม Growth Loop'
    : avgRetention < 70
      ? 'Retention เป็นคอขวด: ลด Setup และทำให้ Opening promise ชัดขึ้นใน 3 วินาทีแรก'
      : avgCtr < 4.5
        ? 'Retention แข็งแรงกว่า CTR: ทดสอบ Title / Thumbnail ก่อนเปลี่ยนโครงเรื่อง'
        : 'Topic และ Retention แข็งแรง: ทำภาคต่อจากรูปแบบที่ Views สูงสุด';
  const scopedProjects = projectsInFocus(workspace);
  const recentPublished = scopedProjects.filter(isProductionComplete).toSorted((a, b) => (b.productionCompletedAt ?? b.updatedAt).localeCompare(a.productionCompletedAt ?? a.updatedAt)).slice(0, 8);

  return `${pageHeader('Insights', 'Learn from published work without turning the workspace into a wall of metrics.', `<label class="btn" for="analytics-csv">Import CSV</label><input id="analytics-csv" class="file-input" type="file" accept=".csv,text/csv"/><a class="btn primary" href="${routeHref('mission', project ? { project: project.id } : undefined)}">Current Mission</a>`)}
    <section class="insights-scope"><div><span class="kicker">INSIGHT SCOPE</span><h3>${escapeHtml(requestedProject?.title ?? channel?.name ?? 'Portfolio · All Channels')}</h3><p>${requestedProject ? `${statusLabels[requestedProject.status]} · Project-specific` : channel ? `All published work in ${channel.name}` : 'All creator channels'}</p></div><div class="row wrap">${channel ? chip(channel.name, 'violet') : chip('Portfolio', 'violet')}${requestedProject ? chip(requestedProject.title, 'amber') : ''}</div></section>

    <section class="featured-insights">${metricCard(formatNumber(views), 'Total Views', 'violet')}${metricCard(formatNumber(subscribers), 'Subscriber Growth', 'green')}</section>

    <section class="panel dominant-insight-chart"><div class="panel-title"><div><span class="kicker">LAST 12 RECORDS</span><h3>Views by publish</h3><p>Actual analytics in the current Channel Focus.</p></div></div>${chart}</section>

    <div class="insights-two-column">
      <section class="panel decision-signal"><div class="row between"><h3>Decision signal</h3>${entries.some((entry) => entry.isDemo) ? dataLabel('demo') : dataLabel(entries.length ? 'actual' : 'no data')}</div><p class="decision-copy">${escapeHtml(nextInsight)}</p><div class="decision-metrics"><div><span>Avg retention</span><b>${avgRetention.toFixed(1)}%</b></div><div><span>Avg CTR</span><b>${avgCtr.toFixed(1)}%</b></div><div><span>Records</span><b>${entries.length}</b></div></div></section>
      <section class="panel recent-publishes"><div class="panel-title"><div><h3>Recent Publishes</h3><p>Production is already complete; Growth Loop can continue separately.</p></div></div><div class="recent-table-wrap"><table><thead><tr><th>Title</th><th>Channel</th><th>Published</th><th>Views</th><th>Watch</th></tr></thead><tbody>${recentPublished.map((item) => { const itemChannel = channelById(workspace, item.channelId); const latest = workspace.analytics.filter((entry) => entry.projectId === item.id).toSorted((a,b) => b.recordedAt.localeCompare(a.recordedAt))[0]; return `<tr><td><strong>${escapeHtml(item.title)}</strong><span>VIDEO COMPLETE</span></td><td>${escapeHtml(itemChannel?.name ?? '')}</td><td>${escapeHtml((item.productionCompletedAt ?? item.updatedAt).slice(0,10))}</td><td>${latest ? formatNumber(latest.views) : '—'}</td><td>${latest ? `${Math.round(latest.averageViewDurationSeconds)}s` : '—'}</td></tr>`; }).join('') || '<tr><td colspan="5"><span class="muted">No published videos in this focus yet.</span></td></tr>'}</tbody></table></div></section>
    </div>

    <details class="panel insights-workbench"><summary>Analytics workbench · record actual data</summary><div class="insights-workbench-body"><form class="stack" data-form="analytics-entry"><div class="field"><label>Project</label><select class="select" name="projectId">${scopedProjects.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === project?.id ? 'selected' : ''}>${escapeHtml(item.title)} · ${escapeHtml(statusLabels[item.status])}</option>`).join('')}</select></div><div class="form-grid cols-3"><div class="field"><label>Platform</label><select class="select" name="platform"><option value="youtube">YouTube</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="other">Other</option></select></div><div class="field"><label>Views</label><input class="input" type="number" name="views" min="0" value="1000"/></div><div class="field"><label>Impressions</label><input class="input" type="number" name="impressions" min="0" value="1500"/></div></div><div class="form-grid cols-3"><div class="field"><label>Viewed vs swiped %</label><input class="input" type="number" name="viewedVsSwiped" step="0.1" value="65"/></div><div class="field"><label>CTR %</label><input class="input" type="number" name="ctr" step="0.1" value="5"/></div><div class="field"><label>Retention %</label><input class="input" type="number" name="averagePercentageViewed" step="0.1" value="75"/></div></div><div class="form-grid cols-3"><div class="field"><label>Avg view duration sec</label><input class="input" type="number" name="averageViewDurationSeconds" value="40"/></div><div class="field"><label>Subscribers</label><input class="input" type="number" name="subscribersGained" value="10"/></div><div class="field"><label>Watch hours</label><input class="input" type="number" name="watchHours" step="0.1" value="12"/></div></div><div class="form-grid cols-3"><div class="field"><label>Credits</label><input class="input" type="number" name="creditsUsed" value="80"/></div><div class="field"><label>Cost THB</label><input class="input" type="number" name="financialCostThb" value="100"/></div><div class="field"><label>Revenue THB</label><input class="input" type="number" name="revenueThb" value="0"/></div></div><button class="btn primary" type="submit">Save Actual Data & Update Growth Mission</button></form></div></details>`;
};
