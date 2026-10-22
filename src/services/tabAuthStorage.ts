import type { SupportedStorage } from '@supabase/supabase-js';

export const authStorageKey = 'golf.auth.session.v2';
const legacyPrefix = 'golf.auth.tab.v1.session';
const memory = new Map<string, string>();
let storage: Storage | null = null;

try {
  storage = window.localStorage;
  const probe = `${authStorageKey}.probe`;
  storage.setItem(probe, '1');
  storage.removeItem(probe);
} catch { storage = null; }

const read = (key: string) => { try { return storage ? storage.getItem(key) : memory.get(key) ?? null; } catch { storage = null; return memory.get(key) ?? null; } };
const write = (key: string, value: string) => { memory.set(key, value); try { storage?.setItem(key, value); } catch { storage = null; } };
const remove = (key: string) => { memory.delete(key); try { storage?.removeItem(key); } catch { storage = null; } };

// Adopt the previous tab session once, unless a persistent session already exists.
try {
  if (!read(authStorageKey)) {
    const legacySession = window.sessionStorage.getItem(legacyPrefix);
    if (legacySession) write(authStorageKey, legacySession);
  }
  for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(legacyPrefix)) window.sessionStorage.removeItem(key);
  }
} catch { /* The memory fallback remains usable. */ }

export const persistentAuthStorage: SupportedStorage = {
  getItem: async (key) => read(key),
  setItem: async (key, value) => write(key, value),
  removeItem: async (key) => remove(key),
};

export async function clearPersistentAuthSession() {
  const keys = new Set(memory.keys());
  try { if (storage) for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key) keys.add(key); } } catch { /* Memory fallback. */ }
  for (const key of keys) if (key === authStorageKey || key.startsWith(`${authStorageKey}-`)) remove(key);
}
