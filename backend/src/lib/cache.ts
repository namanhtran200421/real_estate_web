/**
 * Small in-process cache for hot public reads (apartment list and availability, reviews).
 *
 * - Concurrent misses for one key share a single load, so a burst of page renders (or a flood)
 *   costs one database query instead of one per request.
 * - Entries expire after `ttlMs`, which bounds staleness when several instances run.
 * - `invalidateCaches()` empties every cache; the app calls it after each successful write,
 *   so this instance never serves data older than its own last change.
 * - Failed loads are not kept: the next request tries again.
 */
const caches = new Set<TtlCache<unknown>>();

interface Entry<T> {
  expiresAt: number;
  value: Promise<T>;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 100,
  ) {
    caches.add(this as TtlCache<unknown>);
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const value = load();
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: now + this.ttlMs, value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });

    // Maps keep insertion order: the first key is the oldest.
    if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Drops every cached value, e.g. after a booking or an admin edit. */
export function invalidateCaches(): void {
  for (const cache of caches) cache.clear();
}
