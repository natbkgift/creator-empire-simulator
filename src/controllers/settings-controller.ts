import { getWorkspace, updateWorkspace } from '../app/store.js';
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
    draft.settings.sqliteStorageEnabled = data.get('sqliteStorageEnabled') === 'on';
    draft.settings.connectedAiEnabled = draft.settings.workflowMode === 'automatic';
    draft.settings.connectedAiProxyUrl = '/api/ai/generate';
    draft.settings.reducedMotion = data.get('reducedMotion') === 'on';
    draft.settings.soundEnabled = false;
  });
  showToast('บันทึก Settings แล้ว');
};
