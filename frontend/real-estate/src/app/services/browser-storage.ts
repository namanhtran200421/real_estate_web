/**
 * Safe access to localStorage / sessionStorage: they are missing during server-side
 * rendering and can throw in private browsing, so every call is guarded.
 */
type Area = 'local' | 'session';

function storage(area: Area): Storage | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    if (area === 'local') return window.localStorage;
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readJson<T>(area: Area, key: string): T | undefined {
  try {
    const raw = storage(area)?.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeJson(area: Area, key: string, value: unknown): void {
  try {
    storage(area)?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the feature degrades (e.g. the guest uses the lookup form).
  }
}

export function removeItem(area: Area, key: string): void {
  try {
    storage(area)?.removeItem(key);
  } catch {
    // Ignore, as above.
  }
}
