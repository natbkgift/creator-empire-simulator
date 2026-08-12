import type { Workspace } from '../domain/types.js';
import { validateWorkspace } from '../domain/validation.js';
import { loadWorkspaceRecord as loadIndexedDb, saveWorkspaceRecord as saveIndexedDb } from './indexeddb.js';

export interface StorageStatus {
  mode: 'loading' | 'sqlite' | 'indexeddb' | 'hybrid';
  ok: boolean;
  detail: string;
  dbPath?: string;
  savedAt?: string;
  revision?: number;
  checksum?: string;
  historyCount?: number;
}

interface ServerStorageMeta {
  dbPath?: string;
  savedAt?: string;
  revision?: number;
  checksum?: string;
  historyCount?: number;
}

interface WorkspacePayload {
  workspace: unknown | null;
  storage?: ServerStorageMeta;
}

let status: StorageStatus = { mode: 'loading', ok: false, detail: 'Starting storage…' };
const API_TIMEOUT_MS = 3500;

class ServerResponseError extends Error {
  constructor(readonly statusCode: number, statusText: string) {
    super(`${statusCode} ${statusText}`);
  }
}

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
    if (!response.ok) throw new ServerResponseError(response.status, response.statusText);
    try {
      return await response.json() as T;
    } catch {
      throw new ServerResponseError(response.status, 'Invalid JSON response');
    }
  } finally {
    window.clearTimeout(timeout);
  }
};

const validWorkspace = (value: unknown): Workspace | null => {
  if (!value) return null;
  const validation = validateWorkspace(value);
  if (!validation.valid || !validation.workspace) return null;
  return validation.workspace;
};

const freshness = (workspace: Workspace | null): [number, number] => {
  if (!workspace) return [-1, -1];
  const timestamp = Number.isFinite(Date.parse(workspace.updatedAt)) ? Date.parse(workspace.updatedAt) : 0;
  return [workspace.revision ?? 0, timestamp];
};

const newer = (a: Workspace | null, b: Workspace | null): Workspace | null => {
  const [ar] = freshness(a);
  const [br] = freshness(b);
  if (ar !== br) return ar > br ? a : b;
  return a;
};

const isFresherThan = (candidate: Workspace | null, baseline: Workspace | null): boolean => {
  const [candidateRevision, candidateUpdatedAt] = freshness(candidate);
  const [baselineRevision, baselineUpdatedAt] = freshness(baseline);
  return candidateRevision > baselineRevision || (candidateRevision === baselineRevision && candidateUpdatedAt > baselineUpdatedAt);
};

const putSqlite = async (workspace: Workspace, expectedRevision: number): Promise<{ workspace: Workspace; storage?: ServerStorageMeta }> => {
  const payload = await fetchJson<{ ok: true; workspace?: unknown; storage?: ServerStorageMeta }>('/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ workspace, expectedRevision }),
  });
  const saved = validWorkspace(payload.workspace);
  if (!saved) throw new ServerResponseError(200, 'Invalid workspace response');
  return { workspace: saved, storage: payload.storage };
};

export const loadWorkspaceRecord = async (): Promise<Workspace | null> => {
  const indexedPromise = loadIndexedDb().catch(() => null);
  let serverPayload: WorkspacePayload | null = null;
  try {
    serverPayload = await fetchJson<WorkspacePayload>('/api/workspace');
  } catch (error) {
    console.warn('SQLite API unavailable during load; checking IndexedDB.', error);
  }
  const indexed = await indexedPromise;
  const sqlite = validWorkspace(serverPayload?.workspace ?? null);
  const winner = newer(sqlite, indexed);

  if (!serverPayload) {
    status = {
      mode: 'indexeddb',
      ok: Boolean(indexed),
      detail: indexed ? `Offline cache active · revision ${indexed.revision ?? 0}` : 'SQLite unavailable and no IndexedDB workspace exists.',
      revision: indexed?.revision,
    };
    return indexed;
  }

  if (!winner) {
    status = {
      mode: 'hybrid', ok: true, detail: 'SQLite + IndexedDB ready; no workspace saved yet.',
      ...serverPayload.storage,
    };
    return null;
  }

  // Reconcile only a strictly newer IndexedDB revision. SQLite is authoritative on revision ties.
  if (winner === indexed && indexed && isFresherThan(indexed, sqlite)) {
    try {
      const saved = await putSqlite(indexed, sqlite?.revision ?? 0);
      await saveIndexedDb(saved.workspace);
      status = {
        mode: 'hybrid', ok: true,
        detail: `Recovered newer IndexedDB revision ${indexed.revision ?? 0} into SQLite`,
        ...saved.storage,
      };
      return saved.workspace;
    } catch (error) {
      console.warn('Could not reconcile IndexedDB into SQLite.', error);
      if (error instanceof ServerResponseError) throw error;
      status = { mode: 'indexeddb', ok: true, detail: 'Using newer IndexedDB revision; SQLite reconciliation is pending.', revision: indexed.revision };
      return indexed;
    }
  }

  if (sqlite) await saveIndexedDb(sqlite);
  status = {
    mode: 'hybrid', ok: true,
    detail: `SQLite source of truth mirrored to IndexedDB · revision ${sqlite?.revision ?? winner.revision ?? 0}`,
    ...serverPayload.storage,
  };
  return sqlite ?? winner;
};

export const saveWorkspaceRecord = async (workspace: Workspace): Promise<Workspace> => {
  // IndexedDB is always a local crash/offline mirror, never an either/or storage mode.
  await saveIndexedDb(workspace);
  try {
    const saved = await putSqlite(workspace, Math.max(0, (workspace.revision ?? 0) - 1));
    await saveIndexedDb(saved.workspace);
    status = {
      mode: 'hybrid', ok: true, detail: `Saved transactionally · revision ${saved.workspace.revision ?? 0}`,
      ...saved.storage,
    };
    return saved.workspace;
  } catch (error) {
    if (error instanceof ServerResponseError) {
      status = {
        mode: 'hybrid', ok: false,
        detail: `SQLite rejected workspace revision ${workspace.revision ?? 0}; reload before saving again.`,
        revision: workspace.revision,
      };
      throw error;
    }
    console.warn('SQLite save is unresolved; IndexedDB mirror retained for reconciliation.', error);
    status = {
      mode: 'indexeddb', ok: true,
      detail: `SQLite unavailable; revision ${workspace.revision ?? 0} is safe in IndexedDB and will reconcile on reconnect.`,
      revision: workspace.revision,
    };
    throw error;
  }
};

export const getRecoveryHistory = async (): Promise<Array<{ revision: number; checksum: string; createdAt: string }>> => {
  try {
    const payload = await fetchJson<{ history?: Array<{ revision: number; checksum: string; createdAt: string }> }>('/api/workspace/history');
    return Array.isArray(payload.history) ? payload.history : [];
  } catch {
    return [];
  }
};

export const restoreRecoveryRevision = async (revision: number): Promise<Workspace> => {
  const payload = await fetchJson<{ workspace: unknown; storage?: ServerStorageMeta }>('/api/recovery/restore', {
    method: 'POST',
    body: JSON.stringify({ revision }),
  });
  const workspace = validWorkspace(payload.workspace);
  if (!workspace) throw new Error('Recovered workspace failed validation');
  await saveIndexedDb(workspace);
  status = { mode: 'hybrid', ok: true, detail: `Restored revision ${revision} as revision ${workspace.revision ?? 0}`, ...payload.storage };
  return workspace;
};
