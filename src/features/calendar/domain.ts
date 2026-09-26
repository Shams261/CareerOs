import { createHash, randomBytes } from 'node:crypto';
import { formatInTimeZone } from 'date-fns-tz';
import type { EventWrite, GoogleEvent } from './google';
import { weekDays } from '../schedule/domain';

/** Private extended property keys that prove CareerOS created an event (ADR-010). */
export const PROP = {
  managed: 'careerosManaged',
  block: 'careerosTimeBlockId',
  version: 'careerosSchemaVersion',
} as const;
export const SCHEMA_VERSION = '1';
/** Outbound window: recent history plus the planning horizon, never a lifetime backfill. */
export const SYNC_WINDOW = { pastDays: 30, futureDays: 90 };
/**
 * Sync completes the current owner week from routines (today → Sunday). Later weeks are generated
 * deliberately with "Prepare next week" in the weekly review (WI-007), so the review can show them
 * as a routine preview first.
 */
export const syncGenerationDays = (today: string) =>
  weekDays(today).filter((day) => day >= today);
export const CALENDAR_NAME = 'Silsila';

/** The only fields CareerOS and Google exchange. Notes, sessions and status never leave. */
export type Snapshot = {
  title: string;
  start: string | null;
  end: string | null;
  cancelled: boolean;
};
export const fingerprint = (s: Snapshot) =>
  createHash('sha256')
    .update(JSON.stringify([s.title, s.start, s.end, s.cancelled]))
    .digest('hex');
/** Base marker forcing CareerOS to restore an event Google changed into a shape it cannot hold. */
export const UNSUPPORTED_REMOTE = 'unsupported-remote';

export const categoryKey = (c: string) =>
  c
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

type BlockLike = {
  id: string;
  title: string;
  category: string;
  status: string;
  plannedStart: Date;
  plannedEnd: Date;
};
/** Planned time syncs; cancelled blocks and owner-excluded categories do not. Done/skipped stay. */
export const eligible = (b: BlockLike, excluded: string[]) =>
  b.status !== 'CANCELLED' &&
  !excluded.map(categoryKey).includes(categoryKey(b.category));
export function inWindow(
  b: { plannedStart: Date; plannedEnd: Date },
  now: Date,
) {
  return (
    +b.plannedEnd >= +now - SYNC_WINDOW.pastDays * 86400000 &&
    +b.plannedStart <= +now + SYNC_WINDOW.futureDays * 86400000
  );
}
export function localSnapshot(b: BlockLike, isEligible: boolean): Snapshot {
  return isEligible
    ? {
        title: b.title,
        start: b.plannedStart.toISOString(),
        end: b.plannedEnd.toISOString(),
        cancelled: false,
      }
    : { title: b.title, start: null, end: null, cancelled: true };
}

/** Google event → snapshot. All-day, untitled or inverted events are unsupported, not guessed. */
export function remoteSnapshot(e: GoogleEvent): Snapshot | null {
  if (e.status === 'cancelled')
    return { title: e.summary ?? '', start: null, end: null, cancelled: true };
  const title = e.summary?.trim() ?? '';
  const start = e.start?.dateTime ? new Date(e.start.dateTime) : null;
  const end = e.end?.dateTime ? new Date(e.end.dateTime) : null;
  if (!title || title.length > 160 || !start || !end || !(end > start))
    return null;
  return {
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    cancelled: false,
  };
}

/** Ownership proof: CareerOS private properties naming a block. Titles never count. */
export function managedBlockId(e: GoogleEvent) {
  const p = e.extendedProperties?.private;
  return p?.[PROP.managed] === '1' && typeof p[PROP.block] === 'string'
    ? p[PROP.block]
    : null;
}

/** Minimal event body: title, exact instants in the owner's zone and a generic description. */
export function eventBody(b: BlockLike, zone: string): EventWrite {
  return {
    summary: b.title,
    description: `Managed by Silsila\nCategory: ${b.category}`,
    start: { dateTime: b.plannedStart.toISOString(), timeZone: zone },
    end: { dateTime: b.plannedEnd.toISOString(), timeZone: zone },
    extendedProperties: {
      private: {
        [PROP.managed]: '1',
        [PROP.block]: b.id,
        [PROP.version]: SCHEMA_VERSION,
      },
    },
  };
}
export const eventPatch = (b: BlockLike, zone: string): EventWrite => {
  const { summary, start, end } = eventBody(b, zone);
  return { summary, start, end };
};
/** Client-chosen IDs (base32hex) make a retried insert return 409 instead of duplicating. */
export const newEventId = () => `careeros${randomBytes(12).toString('hex')}`;

export type Decision = 'noop' | 'push' | 'pull' | 'converged' | 'conflict';
/** Three-way comparison against the last agreed fingerprint. Never last-writer-wins. */
export function decide(
  base: string | null,
  local: string,
  remote: string,
): Decision {
  const localChanged = local !== base,
    remoteChanged = remote !== base;
  if (!localChanged && !remoteChanged) return 'noop';
  if (!localChanged) return 'pull';
  if (!remoteChanged) return 'push';
  return local === remote ? 'converged' : 'conflict';
}

export type BlockSyncView =
  'Synced' | 'Pending' | 'Conflict' | 'Error' | 'Not synced' | 'Detached';
/** Pending is derived (local fingerprint differs from the agreed one), not stored. */
export function blockSyncView(
  b: BlockLike & {
    externalCalendarEventId: string | null;
    externalCalendarId: string | null;
    calendarSyncedHash: string | null;
    calendarSyncStatus: string;
  },
  calendarId: string | null,
  excluded: string[],
): BlockSyncView {
  if (b.calendarSyncStatus === 'CONFLICT') return 'Conflict';
  if (b.calendarSyncStatus === 'DETACHED') return 'Detached';
  if (b.calendarSyncStatus === 'ERROR') return 'Error';
  const isEligible = eligible(b, excluded);
  const mapped =
    !!b.externalCalendarEventId && b.externalCalendarId === calendarId;
  if (!mapped) return isEligible ? 'Pending' : 'Not synced';
  return fingerprint(localSnapshot(b, isEligible)) === b.calendarSyncedHash
    ? 'Synced'
    : 'Pending';
}
export function snapshotLabel(s: Snapshot, zone: string) {
  if (s.cancelled || !s.start || !s.end)
    return `${s.title || 'Event'} · deleted`;
  return `${s.title} · ${formatInTimeZone(new Date(s.start), zone, 'EEE MMM d, h:mm')}–${formatInTimeZone(new Date(s.end), zone, 'h:mm a')}`;
}
/** httpOnly cookie carrying the encrypted OAuth state + PKCE verifier between redirects. */
export const OAUTH_COOKIE = 'careeros_google_oauth';
