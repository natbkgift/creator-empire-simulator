import type { Workspace } from '../domain/types.js';
import { validateWorkspace } from '../domain/validation.js';
import { loadWorkspaceRecord as loadIndexedDb, saveWorkspaceRecord as saveIndexedDb } from './indexeddb.js';

export interface StorageStatus {
  mode: 'loading' | 'sqlite' | 'indexeddb';
  ok: boolean;
  detail: string;
  dbPath?: string;
  savedAt?: string;
}

let status: StorageStatus = { mode: 'loading', ok: false, detail: 'Starting storage…' };
const API_TIMEOUT_MS = 2200;

export const getStorageStatus = (): StorageStatus => status;

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const loadWorkspaceRecord = async (): Promise<Workspace | null> => {
  try {
    const payload = await fetchJson<{ workspace: unknown | null; storage?: { dbPath?: string; savedAt?: string } }>('/api/workspace');
    if (payload.workspace) {
      const validation = validateWorkspace(payload.workspace);
      if (!validation.valid || !validation.workspace) throw new Error(validation.errors.join(' '));
      status = { mode: 'sqlite', ok: true, detail: 'SQLite database connected', dbPath: payload.storage?.dbPath, savedAt: payload.storage?.savedAt };
      return validation.workspace;
    }
    status = { mode: 'sqlite', ok: true, detail: 'SQLite database ready; no workspace saved yet.', dbPath: payload.storage?.dbPath, savedAt: payload.storage?.savedAt };
    return null;
  } catch (error) {
    console.warn('SQLite API unavailable; falling back to IndexedDB.', error);
    const fallback = await loadIndexedDb();
    status = { mode: 'indexeddb', ok: Boolean(fallback), detail: 'SQLite server unavailable; using browser IndexedDB fallback.' };
    return fallback;
  }
};

export const saveWorkspaceRecord = async (workspace: Workspace): Promise<void> => {
  try {
    const payload = await fetchJson<{ ok: true; storage?: { dbPath?: string; savedAt?: string } }>('/api/workspace', {
      method: 'PUT',
      body: JSON.stringify({ workspace }),
    });
    status = { mode: 'sqlite', ok: true, detail: 'Saved to SQLite', dbPath: payload.storage?.dbPath, savedAt: payload.storage?.savedAt };
  } catch (error) {
    console.warn('SQLite save failed; using IndexedDB fallback.', error);
    await saveIndexedDb(workspace);
    status = { mode: 'indexeddb', ok: true, detail: 'Saved to browser IndexedDB fallback; start the SQLite server for persistent database storage.' };
  }
};
