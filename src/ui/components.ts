import type { Language, RiskLevel } from '../domain/types.js';
import { escapeHtml, formatNumber, formatThb } from '../domain/utils.js';
import { icon } from './icons.js';

export const chip = (text: string, tone = ''): string =>
  `<span class="chip ${tone}">${escapeHtml(text)}</span>`;

export const dataLabel = (kind: 'demo' | 'actual' | 'estimated'): string =>
  `<span class="data-label ${kind}">${kind}</span>`;

export const dataBadge = (isDemo?: boolean, estimated?: boolean): string =>
  isDemo ? dataLabel('demo') : estimated ? dataLabel('estimated') : dataLabel('actual');

export const riskChip = (risk: RiskLevel): string => {
  const label: Record<RiskLevel, string> = { low: 'Low', review: 'Review', high: 'High', blocked: 'Blocked' };
  const tone = risk === 'low' ? 'green' : risk === 'review' ? 'amber' : risk === 'high' || risk === 'blocked' ? 'red' : '';
  return `<span class="chip ${tone}"><i class="status-dot ${risk}"></i>${label[risk]}</span>`;
};

export const metricCard = (value: string | number, label: string, tone = ''): string =>
  `<div class="metric-card ${tone}"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;

export const metric = (label: string, value: string | number, detail = '', tone = ''): string =>
  `<div class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;

export const progress = (value: number, label = ''): string =>
  `<div class="progress-wrap" aria-label="${escapeHtml(label || `Progress ${Math.round(value)}%`)}"><div class="progress-track"><i style="--value:${Math.max(0, Math.min(100, value))}%;width:${Math.max(0, Math.min(100, value))}%"></i></div>${label ? `<span>${escapeHtml(label)}</span>` : ''}</div>`;

export const pageHeader = (
  title: string,
  subtitle: string,
  actions = '',
  eyebrow = '',
): string => `<div class="context-row page-header"><div>${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ''}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>${actions ? `<div class="action-group page-actions">${actions}</div>` : ''}</div>`;

export const sectionHeading = (title: string, subtitle = '', right = ''): string =>
  `<div class="section-heading"><div><h3>${escapeHtml(title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>${right}</div>`;

export const button = (
  label: string,
  action: string,
  optionsOrTone: { tone?: string; iconName?: string; attrs?: string; type?: 'button' | 'submit' } | string = {},
  legacyIconName = '',
  legacyAttrs = '',
): string => {
  const options = typeof optionsOrTone === 'string'
    ? { tone: optionsOrTone, iconName: legacyIconName, attrs: legacyAttrs, type: 'button' as const }
    : optionsOrTone;
  return `<button type="${options.type ?? 'button'}" class="btn ${options.tone ?? ''}" data-action="${escapeHtml(action)}" ${options.attrs ?? ''}>${options.iconName ? icon(options.iconName) : ''}<span>${escapeHtml(label)}</span></button>`;
};

export const iconButton = (label: string, action: string, iconName: string, attrs = ''): string =>
  `<button type="button" class="icon-button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" data-action="${escapeHtml(action)}" ${attrs}>${icon(iconName)}</button>`;

export const selectOptions = <T extends string>(
  options: Array<{ value: T; label: string }>,
  selected: T,
): string => options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');

export const languageName = (language: Language): string => language === 'en' ? 'English' : 'ไทย';

export const numberOrDash = (value: number): string => Number.isFinite(value) ? formatNumber(value) : '—';

export const moneyOrDash = (value: number): string => Number.isFinite(value) ? formatThb(value) : '—';

export const emptyState = (title: string, detail: string, action = ''): string =>
  `<div class="empty-state empty-panel"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div></div>`;

export const emptyPanel = emptyState;
