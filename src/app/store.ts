import type { Workspace } from '../domain/types.js';
import { deepClone } from '../domain/utils.js';
import { loadWorkspaceRecord, saveWorkspaceRecord } from '../db/storage.js';
import { createSeedWorkspace } from '../seed/demo.js';
import { migrateWorkspace } from '../domain/migration.js';
import { normalizeWorkspaceFocus } from '../domain/focus.js';
import { syncNextWorkflowMission } from '../domain/workflow.js';

export type StoreListener = (workspace: Workspace) => void;

let workspace: Workspace = migrateWorkspace(createSeedWorkspace());
let loaded = false;
let saveQueue: Promise<void> = Promise.resolve();
const listeners = new Set<StoreListener>();

const computeLevel = (xp: number): number => Math.max(1, Math.floor(Math.sqrt(xp / 18)) + 1);
const notify = (): void => { listeners.forEach((listener) => listener(workspace)); };

const queueSave = (): void => {
  const snapshot = deepClone(workspace);
  saveQueue = saveQueue.catch(() => undefined).then(async () => {
    const saved = await saveWorkspaceRecord(snapshot);
    if ((saved.revision ?? 0) > (workspace.revision ?? 0)) workspace.revision = saved.revision;
  });
};

export const initializeStore = async (): Promise<Workspace> => {
  if (loaded) return workspace;
  const stored = await loadWorkspaceRecord();
  workspace = migrateWorkspace(stored ?? createSeedWorkspace());
  loaded = true;
  const storedSettings = stored?.settings;
  const needsSchemaFiveSave = !stored
    || stored.schemaVersion !== 5
    || storedSettings?.openAiInputUsdPer1M === undefined
    || storedSettings?.openAiOutputUsdPer1M === undefined
    || storedSettings?.openAiAdvancedInputUsdPer1M === undefined
    || storedSettings?.openAiAdvancedOutputUsdPer1M === undefined
    || storedSettings?.experienceMode === undefined;
  if (needsSchemaFiveSave) queueSave();
  return workspace;
};

export const getWorkspace = (): Workspace => workspace;
export const subscribe = (listener: StoreListener): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };

export const replaceWorkspace = (next: Workspace): void => {
  workspace = migrateWorkspace(deepClone(next));
  workspace.revision = Math.max(0, workspace.revision ?? 0) + 1;
  workspace.updatedAt = new Date().toISOString();
  workspace.level = computeLevel(workspace.xp);
  queueSave();
  notify();
};

export const updateWorkspace = (mutator: (draft: Workspace) => void): void => {
  const draft = deepClone(workspace);
  mutator(draft);
  // Run migration/normalization on every mutation so newly-created entities immediately receive
  // v4 fields (publishAt, growth status, task metadata) before the planner runs.
  const normalized = migrateWorkspace(draft);
  normalizeWorkspaceFocus(normalized);
  normalized.projects.filter((project) => project.status !== 'archived').forEach((project) => syncNextWorkflowMission(normalized, project.id));
  normalized.revision = Math.max(0, workspace.revision ?? 0) + 1;
  normalized.updatedAt = new Date().toISOString();
  normalized.level = computeLevel(normalized.xp);
  workspace = normalized;
  queueSave();
  notify();
};

export const awardXp = (draft: Workspace, eventId: string, amount: number, skill?: keyof Workspace['skills']): boolean => {
  if (draft.earnedEvents.includes(eventId)) return false;
  draft.earnedEvents.push(eventId);
  draft.xp += amount;
  if (skill) draft.skills[skill] = Math.min(100, draft.skills[skill] + Math.max(1, Math.round(amount / 12)));
  draft.level = computeLevel(draft.xp);
  return true;
};

export const flushStore = async (): Promise<void> => saveQueue;
