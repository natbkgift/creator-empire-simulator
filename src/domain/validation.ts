import type { Workspace } from './types.js';
import { isRecord } from './utils.js';
import { migrateWorkspace } from './migration.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  workspace?: Workspace;
}

export const validateWorkspace = (input: unknown): ValidationResult => {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ['Workspace must be a JSON object.'] };
  if (![1, 2, 3, 4].includes(Number(input.schemaVersion))) errors.push('Unsupported schemaVersion. Expected 1, 2, 3 or 4.');
  if (input.id !== 'default') errors.push('Workspace id must be "default".');
  const arrayFields = [
    'ideas', 'channels', 'projects', 'sources', 'prompts', 'calendarTasks', 'credits', 'analytics',
    'policies', 'monetization', 'simulations', 'achievements', 'earnedEvents',
  ];
  arrayFields.forEach((field) => {
    if (!Array.isArray(input[field])) errors.push(`${field} must be an array.`);
  });
  if (!isRecord(input.settings)) errors.push('settings must be an object.');
  if (!isRecord(input.skills)) errors.push('skills must be an object.');
  if (typeof input.xp !== 'number') errors.push('xp must be a number.');
  if (typeof input.level !== 'number') errors.push('level must be a number.');
  if (errors.length) return { valid: false, errors };
  try {
    return { valid: true, errors: [], workspace: migrateWorkspace(input) };
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'Workspace migration failed.'] };
  }
};

export const validatePromptResponse = (input: string): {
  valid: boolean;
  parsed?: Record<string, unknown>;
  error?: string;
} => {
  try {
    const cleaned = input.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (!isRecord(parsed)) return { valid: false, error: 'The response must be a JSON object.' };
    return { valid: true, parsed };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
};
