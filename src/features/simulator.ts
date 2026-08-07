import type { SimulationInputs, Workspace } from '../domain/types.js';
import { defaultSimulationInputs, runSimulation } from '../domain/simulator.js';
import { escapeHtml, formatNumber, formatThb } from '../domain/utils.js';
import { uncertaintyChart } from '../charts/charts.js';
import { pageHeader } from '../ui/components.js';

export const renderSimulator = (workspace: Workspace): string => {
  const saved = workspace.simulations.at(-1);
  const inputs: SimulationInputs = saved?.inputs ?? { ...defaultSimulationInputs, availableCredits:workspace.settings.capcutBalance, hoursPerWeek:workspace.settings.weeklyHoursAvailable };
  const run = saved ?? runSimulation(inputs);
  const chart = uncertaintyChart(run.results.map((result) => ({ label:result.scenario, low:result.subscribersLow, high:result.subscribersHigh, mid:(result.subscribersLow+result.subscribersHigh)/2 })),'Estimated monthly subscriber range by scenario');
  return `${pageHeader('YouTube Simulator','แบบจำลอง Deterministic 4 สถานการณ์ แสดงสมมติฐาน ช่วงความไม่แน่นอน และ Capacity จริง','<button class="btn" data-action="reset-simulator">Reset</button><a class="btn primary" href="#/analytics">Use actual data</a>')}
    <div class="simulator-layout">
      <aside class="panel simulator-controls"><div class="panel-title"><div><h3>Simulation inputs</h3><p>ผลลัพธ์เป็นช่วงวางแผน ไม่ใช่คำรับประกัน</p></div><span class="data-label estimated">estimated</span></div><form class="stack" data-form="simulation">
        <div class="form-grid"><div class="field"><label>Videos / week</label><input class="input" type="number" name="videosPerWeek" min="1" max="30" value="${inputs.videosPerWeek}"/></div><div class="field"><label>Shorts %</label><input class="input" type="number" name="shortsPercent" min="0" max="100" value="${inputs.shortsPercent}"/></div></div>
        <div class="form-grid"><div class="field"><label>Average views</label><input class="input" type="number" name="averageViews" min="0" value="${inputs.averageViews}"/></div><div class="field"><label>Subscriber conversion %</label><input class="input" type="number" name="subscriberConversionPercent" min="0" step="0.01" value="${inputs.subscriberConversionPercent}"/></div></div>
        <div class="form-grid"><div class="field"><label>Retention %</label><input class="input" type="number" name="retentionPercent" min="0" max="150" value="${inputs.retentionPercent}"/></div><div class="field"><label>CTR %</label><input class="input" type="number" name="ctrPercent" min="0" max="100" step="0.1" value="${inputs.ctrPercent}"/></div></div>
        <div class="form-grid"><div class="field"><label>Production quality</label><input class="input" type="number" name="productionQuality" min="0" max="100" value="${inputs.productionQuality}"/></div><div class="field"><label>Topic repeatability</label><input class="input" type="number" name="topicRepeatability" min="0" max="100" value="${inputs.topicRepeatability}"/></div></div>
        <div class="form-grid"><div class="field"><label>Language</label><select class="select" name="language"><option value="en" ${inputs.language === 'en' ? 'selected':''}>English</option><option value="th" ${inputs.language === 'th' ? 'selected':''}>ไทย</option></select></div><div class="field"><label>High-value audience %</label><input class="input" type="number" name="highValueAudiencePercent" min="0" max="100" value="${inputs.highValueAudiencePercent}"/></div></div>
        <div class="form-grid"><div class="field"><label>Hours / week</label><input class="input" type="number" name="hoursPerWeek" min="1" value="${inputs.hoursPerWeek}"/></div><div class="field"><label>Consistency %</label><input class="input" type="number" name="consistencyPercent" min="0" max="100" value="${inputs.consistencyPercent}"/></div></div>
        <div class="form-grid"><div class="field"><label>Monthly budget THB</label><input class="input" type="number" name="monthlyBudgetThb" min="0" value="${inputs.monthlyBudgetThb}"/></div><div class="field"><label>Available credits</label><input class="input" type="number" name="availableCredits" min="0" value="${inputs.availableCredits}"/></div></div>
        <div class="field"><label>Deterministic seed</label><input class="input" type="number" name="seed" value="${inputs.seed}"/></div>
        <button class="btn primary" type="submit">Run 90-day simulation</button>
      </form></aside>
      <section class="stack">
        <article class="panel chart-panel"><div class="panel-title"><div><h3>Scenario range</h3><p>จำนวน Subscriber ต่อเดือนโดยประมาณ</p></div><span class="chip violet">Seed ${inputs.seed}</span></div>${chart}</article>
        <div class="scenario-grid">${run.results.map((result) => `<article class="scenario-card ${result.scenario}"><h4>${escapeHtml(result.scenario)}</h4><b>${formatNumber(result.subscribersLow)}–${formatNumber(result.subscribersHigh)}</b><span>subscribers / month</span><div class="divider"></div><b style="font-size:14px">${result.watchHoursLow}–${result.watchHoursHigh} h</b><span>watch time</span><div class="divider"></div><span>Capacity ${result.publishCapacity}/week · ${formatNumber(result.creditsRequired)} credits</span><p class="muted small-copy">${escapeHtml(result.bottleneck)}</p><div class="risk"><span class="chip ${result.burnoutRisk === 'high' ? 'amber' : result.burnoutRisk === 'low' ? 'green':''}">Burnout ${result.burnoutRisk}</span></div></article>`).join('')}</div>
        <article class="panel panel-pad"><div class="panel-title"><div><h3>Decision output</h3><p>สิ่งที่เพิ่มผลกระทบสูงสุดภายใต้เวลาปัจจุบัน</p></div></div><div class="grid-2">${run.results.slice(0,2).map((result) => `<div class="inline-note"><strong>${escapeHtml(result.scenario)}</strong><br/>${escapeHtml(result.improvement)}<br/><span class="muted">Milestone range ${result.milestoneMonthsLow}–${result.milestoneMonthsHigh} months · ${formatThb(result.financialRequirementThb)}</span></div>`).join('')}</div><h3 style="font-size:12px;margin:18px 0 8px">Assumptions</h3><ul class="assumption-list">${run.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
      </section>
    </div>`;
};
