import type { Workspace } from '../domain/types.js';
import { validateWorkspace } from '../domain/validation.js';

const DB_NAME = 'creator-empire-simulator';
const STORE_NAME = 'workspaces';
const DB_VERSION = 1;
const FALLBACK_KEY = 'creator-empire-simulator-workspace-v1';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'));
  });

export const loadWorkspaceRecord = async (): Promise<Workspace | null> => {
  try {
    const db = await openDb();
    const result = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get('default');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read workspace.'));
    });
    db.close();
    if (result === null) return null;
    const validation = validateWorkspace(result);
    if (!validation.valid || !validation.workspace) {
      console.warn('Stored workspace failed validation.', validation.errors);
      return null;
    }
    return validation.workspace;
  } catch (error) {
    console.warn('IndexedDB unavailable; using localStorage fallback.', error);
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const validation = validateWorkspace(parsed);
      return validation.valid ? validation.workspace ?? null : null;
    } catch {
      return null;
    }
  }
};

export const saveWorkspaceRecord = async (workspace: Workspace): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(workspace);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save workspace.'));
    });
    db.close();
  } catch (error) {
    console.warn('IndexedDB save failed; using localStorage fallback.', error);
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(workspace));
  }
};

export const deleteWorkspaceRecord = async (): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete('default');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to delete workspace.'));
    });
    db.close();
  } catch {
    localStorage.removeItem(FALLBACK_KEY);
  }
};
