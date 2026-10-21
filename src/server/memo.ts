import 'server-only';

/**
 * A short in-process cache for read-only snapshots (ADR-017). One owner, one process: entries are
 * keyed by owner and name, live for a few seconds, and are dropped by every server action and
 * scheduler run, so a change is never read stale. Disabled under test so service tests stay exact.
 */
type Entry = { value: Promise<unknown>; expires: number };
const store = new Map<string, Entry>();
export const SNAPSHOT_TTL_MS = 20000;
/** SNAPSHOT_CACHE=off disables it anywhere; =on enables it under test. */
const enabled = () =>
  process.env.SNAPSHOT_CACHE === 'on' ||
  (process.env.NODE_ENV !== 'test' && process.env.SNAPSHOT_CACHE !== 'off');

export function memo<T>(
  owner: string,
  name: string,
  load: () => Promise<T>,
  ttl = SNAPSHOT_TTL_MS,
): Promise<T> {
  if (!enabled()) return load();
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
/** Drop every snapshot. Called after any write, so the next read is fresh. */
export function forgetAll() {
  store.clear();
}
