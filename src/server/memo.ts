import 'server-only';

/**
 * A short in-process cache for read-only snapshots (ADR-017). One owner, one process: entries are
 * keyed by owner and name, live for a few seconds, and are dropped by every server action and
 * scheduler run, so a change is never read stale. Disabled under test so service tests stay exact.
 */
type Entry = { value: Promise<unknown>; expires: number };
/**
 * On globalThis (WI-062): the build compiles this module once per layer (pages, and server
 * actions imported by client components), and each copy would otherwise hold its own map, so an
 * action's `forgetAll` would leave the pages' snapshots in place. One map and one listener set
 * per process, whichever copy runs.
 */
const shared = globalThis as unknown as {
  silsilaSnapshots?: Map<string, Entry>;
  silsilaForgetListeners?: Set<() => void>;
};
const store = (shared.silsilaSnapshots ??= new Map());
/**
 * Every write and every scheduled job clears the snapshots (ADR-017), so their age only guards
 * against time passing (a due date turning overdue). Three minutes since WI-061: most visits
 * now read a warm snapshot, which measured 2–3× faster than a cold one.
 */
export const SNAPSHOT_TTL_MS = 180_000;
/** SNAPSHOT_CACHE=off disables it anywhere; =on enables it under test. */
export const cacheEnabled = () =>
  process.env.SNAPSHOT_CACHE === 'on' ||
  (process.env.NODE_ENV !== 'test' && process.env.SNAPSHOT_CACHE !== 'off');

export function memo<T>(
  owner: string,
  name: string,
  load: () => Promise<T>,
  ttl = SNAPSHOT_TTL_MS,
): Promise<T> {
  if (!cacheEnabled()) return load();
  const key = `${owner}:${name}`,
    now = Date.now(),
    hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { value, expires: now + ttl });
  // A failed load must not be served again.
  value.catch(() => store.delete(key));
  return value;
}
const listeners = (shared.silsilaForgetListeners ??= new Set());
/** Other in-process caches (the session cache, WI-061) clear with the snapshots. */
export function onForget(fn: () => void) {
  listeners.add(fn);
}
/** Drop every snapshot. Called after any write, so the next read is fresh. */
export function forgetAll() {
  store.clear();
  for (const fn of listeners) fn();
}
