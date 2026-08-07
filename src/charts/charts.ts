import { escapeHtml, formatNumber, round } from '../domain/utils.js';

interface Point { label: string; value: number; secondary?: number; }

const chartDimensions = { width: 620, height: 240, left: 54, right: 24, top: 20, bottom: 44 };

const emptyState = (label: string): string =>
  `<div class="chart-empty"><strong>No actual data yet</strong><span>${escapeHtml(label)}</span></div>`;

export const barChart = (data: Point[], ariaLabel: string, suffix = ''): string => {
  if (!data.length) return emptyState(ariaLabel);
  const { width, height, left, right, top, bottom } = chartDimensions;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.min(58, plotWidth / data.length - 16);
  const bars = data.map((d, index) => {
    const x = left + (index + 0.5) * (plotWidth / data.length) - barWidth / 2;
    const barHeight = (d.value / max) * plotHeight;
    const y = top + plotHeight - barHeight;
    return `<g><rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="7" class="chart-bar"/><text x="${x + barWidth / 2}" y="${Math.max(14, y - 8)}" text-anchor="middle" class="chart-value">${escapeHtml(formatNumber(d.value))}${escapeHtml(suffix)}</text><text x="${x + barWidth / 2}" y="${height - 17}" text-anchor="middle" class="chart-label">${escapeHtml(d.label)}</text></g>`;
  }).join('');
  return `<figure class="chart-figure" role="img" aria-label="${escapeHtml(ariaLabel)}"><svg viewBox="0 0 ${width} ${height}" class="chart-svg"><line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis"/>${bars}</svg><figcaption>${escapeHtml(ariaLabel)}. Values are directly labelled.</figcaption></figure>`;
};

export const lineChart = (data: Point[], ariaLabel: string, suffix = ''): string => {
  if (!data.length) return emptyState(ariaLabel);
  const { width, height, left, right, top, bottom } = chartDimensions;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = data.map((d) => d.value);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const coords = data.map((d, index) => ({
    ...d,
    x: left + (index / Math.max(1, data.length - 1)) * plotWidth,
    y: top + plotHeight - ((d.value - min) / range) * plotHeight,
  }));
  const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${round(point.x, 1)} ${round(point.y, 1)}`).join(' ');
  const points = coords.map((point, index) => `<g><circle cx="${point.x}" cy="${point.y}" r="5" class="chart-point"/><text x="${point.x}" y="${Math.max(14, point.y - 11)}" text-anchor="middle" class="chart-value">${escapeHtml(formatNumber(point.value))}${escapeHtml(suffix)}</text>${index % Math.max(1, Math.ceil(data.length / 6)) === 0 || index === data.length - 1 ? `<text x="${point.x}" y="${height - 17}" text-anchor="middle" class="chart-label">${escapeHtml(point.label)}</text>` : ''}</g>`).join('');
  return `<figure class="chart-figure" role="img" aria-label="${escapeHtml(ariaLabel)}"><svg viewBox="0 0 ${width} ${height}" class="chart-svg"><line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis"/><path d="${path}" class="chart-line"/>${points}</svg><figcaption>${escapeHtml(ariaLabel)}. Values are directly labelled.</figcaption></figure>`;
};

export const retentionChart = (points: number[], ariaLabel: string): string => {
  const data = points.map((value, index) => ({ label: `${index * 10}%`, value }));
  return lineChart(data, ariaLabel, '%');
};

export const scatterChart = (data: Array<{ label: string; x: number; y: number; winner?: boolean }>, ariaLabel: string): string => {
  if (!data.length) return emptyState(ariaLabel);
  const { width, height, left, right, top, bottom } = chartDimensions;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxX = Math.max(...data.map((d) => d.x), 1);
  const maxY = Math.max(...data.map((d) => d.y), 1);
  const marks = data.map((d) => {
    const x = left + (d.x / maxX) * plotWidth;
    const y = top + plotHeight - (d.y / maxY) * plotHeight;
    return `<g><circle cx="${x}" cy="${y}" r="${d.winner ? 10 : 7}" class="chart-scatter ${d.winner ? 'winner' : ''}"/><text x="${x + 12}" y="${y - 6}" class="chart-label">${escapeHtml(d.label)}</text><text x="${x + 12}" y="${y + 8}" class="chart-subvalue">CTR ${round(d.x, 1)}% · Ret ${round(d.y, 1)}%</text></g>`;
  }).join('');
  return `<figure class="chart-figure" role="img" aria-label="${escapeHtml(ariaLabel)}"><svg viewBox="0 0 ${width} ${height}" class="chart-svg"><line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="chart-axis"/><text x="${width - right}" y="${height - 4}" text-anchor="end" class="chart-axis-label">CTR →</text><text x="10" y="${top}" class="chart-axis-label">Retention ↑</text>${marks}</svg><figcaption>${escapeHtml(ariaLabel)}. Each point is labelled.</figcaption></figure>`;
};

export const uncertaintyChart = (
  rows: Array<{ label: string; low: number; high: number; mid: number }>,
  ariaLabel: string,
): string => {
  if (!rows.length) return emptyState(ariaLabel);
  const width = 620;
  const height = 250;
  const left = 64;
  const right = 32;
  const top = 26;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...rows.map((r) => r.high), 1);
  const xFor = (index: number) => left + (index / Math.max(1, rows.length - 1)) * plotWidth;
  const yFor = (value: number) => top + plotHeight - (value / max) * plotHeight;
  const upper = rows.map((row, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yFor(row.high)}`).join(' ');
  const lower = rows.slice().reverse().map((row, reverseIndex) => {
    const index = rows.length - 1 - reverseIndex;
    return `L ${xFor(index)} ${yFor(row.low)}`;
  }).join(' ');
  const mid = rows.map((row, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yFor(row.mid)}`).join(' ');
  const labels = rows.map((row, index) => `<g><text x="${xFor(index)}" y="${height - 18}" text-anchor="middle" class="chart-label">${escapeHtml(row.label)}</text><text x="${xFor(index)}" y="${Math.max(15, yFor(row.mid) - 10)}" text-anchor="middle" class="chart-value">${formatNumber(row.low)}–${formatNumber(row.high)}</text></g>`).join('');
  return `<figure class="chart-figure" role="img" aria-label="${escapeHtml(ariaLabel)}"><svg viewBox="0 0 ${width} ${height}" class="chart-svg"><line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis"/><path d="${upper} ${lower} Z" class="chart-band"/><path d="${mid}" class="chart-line violet"/>${labels}</svg><figcaption>${escapeHtml(ariaLabel)}. Ranges are estimates, not guarantees.</figcaption></figure>`;
};

export const heatmap = (data: Array<{ day: string; value: number }>, ariaLabel: string): string => {
  if (!data.length) return emptyState(ariaLabel);
  const max = Math.max(...data.map((d) => d.value), 1);
  const cells = data.map((d) => {
    const intensity = Math.max(0.12, d.value / max);
    return `<div class="heat-cell" style="--heat:${intensity}" title="${escapeHtml(d.day)}: ${d.value}"><b>${escapeHtml(d.day)}</b><span>${d.value}</span></div>`;
  }).join('');
  return `<figure class="heatmap" role="img" aria-label="${escapeHtml(ariaLabel)}">${cells}<figcaption>${escapeHtml(ariaLabel)}. Darker cells represent more published items.</figcaption></figure>`;
};
