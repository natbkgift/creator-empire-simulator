export interface RequestKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const fallbackKeys = new Map<string, string>();
const fallbackPending = new Map<string, unknown>();
const storageKey = (scope: string): string => `creator-idempotency:${scope}`;
const pendingStorageKey = (scope: string): string => `creator-pending:${scope}`;

export const requestFingerprint = (value: unknown): string => {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalize(child)]));
  };
  const text = JSON.stringify(canonicalize(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const peekRequestKey = (storage: RequestKeyStorage | undefined, scope: string): string | undefined => {
  const key = storageKey(scope);
  try {
    const stored = storage?.getItem(key);
    if (stored) return stored;
  } catch { /* in-memory fallback still protects retries in this page */ }
  return fallbackKeys.get(key);
};

export const getOrCreateRequestKey = (
  storage: RequestKeyStorage | undefined,
  scope: string,
  create: () => string = () => crypto.randomUUID(),
): string => {
  const key = storageKey(scope);
  const existing = peekRequestKey(storage, scope);
  if (existing) return existing;
  const safeScope = scope.replace(/[^a-z0-9_.:-]/gi, '-').slice(0, 48);
  const safeIdentity = create().replace(/[^a-z0-9_.:-]/gi, '-').slice(0, 64);
  const value = `request:${safeScope}:${safeIdentity}`;
  fallbackKeys.set(key, value);
  try { storage?.setItem(key, value); } catch { /* storage is optional */ }
  return value;
};

export const clearRequestKey = (storage: RequestKeyStorage | undefined, scope: string): void => {
  const key = storageKey(scope);
  fallbackKeys.delete(key);
  try { storage?.removeItem(key); } catch { /* storage is optional */ }
};

export const savePendingRequest = <T>(storage: RequestKeyStorage | undefined, scope: string, value: T): void => {
  const key = pendingStorageKey(scope);
  fallbackPending.set(key, value);
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
};

export const loadPendingRequest = <T>(storage: RequestKeyStorage | undefined, scope: string): T | undefined => {
  const key = pendingStorageKey(scope);
  try {
    const stored = storage?.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch { /* malformed or unavailable storage falls back to memory */ }
  return fallbackPending.get(key) as T | undefined;
};

export const clearPendingRequest = (storage: RequestKeyStorage | undefined, scope: string): void => {
  const key = pendingStorageKey(scope);
  fallbackPending.delete(key);
  try { storage?.removeItem(key); } catch { /* storage is optional */ }
};
