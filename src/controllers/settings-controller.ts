import { updateWorkspace } from '../app/store.js';
import { showToast } from '../ui/feedback.js';
import { stringFrom, numberFrom } from './helpers.js';

export const saveSettings = (form: HTMLFormElement): void => {
  const data = new FormData(form);
  updateWorkspace((draft) => {
    draft.settings.locale = stringFrom(data, 'locale') === 'en' ? 'en' : 'th';
    draft.settings.timezone = stringFrom(data, 'timezone', 'Asia/Bangkok');
    draft.settings.weeklyHoursAvailable = Math.max(1, numberFrom(data, 'weeklyHoursAvailable', 12));
    draft.settings.activeChannelLimit = Math.max(1, numberFrom(data, 'activeChannelLimit', 2));
    draft.settings.capcutBalance = Math.max(0, numberFrom(data, 'capcutBalance'));
    draft.settings.workflowMode = stringFrom(data, 'workflowMode') === 'automatic' ? 'automatic' : 'manual';
    draft.settings.aiProvider = stringFrom(data, 'aiProvider') === 'gemini' ? 'gemini' : 'openai';
    draft.settings.openAiModel = stringFrom(data, 'openAiModel', 'gpt-5.1') || 'gpt-5.1';
    draft.settings.geminiModel = stringFrom(data, 'geminiModel', 'gemini-3.5-flash') || 'gemini-3.5-flash';
    draft.settings.connectedAiEnabled = draft.settings.workflowMode === 'automatic';
    draft.settings.connectedAiProxyUrl = '/api/ai/generate';
    draft.settings.sqliteStorageEnabled = true;
    draft.settings.aiMaxOutputTokens = Math.min(16000, Math.max(128, numberFrom(data, 'aiMaxOutputTokens', 2500)));
    draft.settings.aiRequestTimeoutSeconds = Math.min(180, Math.max(10, numberFrom(data, 'aiRequestTimeoutSeconds', 60)));
    draft.settings.aiDailyBudgetUsd = Math.max(0, numberFrom(data, 'aiDailyBudgetUsd', 2));
    draft.settings.aiMonthlyBudgetUsd = Math.max(0, numberFrom(data, 'aiMonthlyBudgetUsd', 20));
    draft.settings.openAiInputUsdPer1M = Math.max(0, numberFrom(data, 'openAiInputUsdPer1M', 0));
    draft.settings.openAiOutputUsdPer1M = Math.max(0, numberFrom(data, 'openAiOutputUsdPer1M', 0));
    draft.settings.geminiInputUsdPer1M = Math.max(0, numberFrom(data, 'geminiInputUsdPer1M', 0));
    draft.settings.geminiOutputUsdPer1M = Math.max(0, numberFrom(data, 'geminiOutputUsdPer1M', 0));
    draft.settings.workdayStart = stringFrom(data, 'workdayStart', '09:00') || '09:00';
    draft.settings.workdayEnd = stringFrom(data, 'workdayEnd', '18:00') || '18:00';
    draft.settings.defaultPublishTime = stringFrom(data, 'defaultPublishTime', '19:00') || '19:00';
    draft.settings.reducedMotion = data.get('reducedMotion') === 'on';
    draft.settings.soundEnabled = false;
  });
  showToast('บันทึก Settings และ AI guardrails แล้ว');
};
