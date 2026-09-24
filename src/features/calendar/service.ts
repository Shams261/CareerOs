import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { Prisma } from '@/generated/prisma/client';
import type { CalendarConnection, TimeBlock } from '@/generated/prisma/client';
import { calendarConfig, type CalendarConfig } from '@/lib/env';
import { dayKey } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import {
  clearBlockReminders,
  generatePlan,
  locked,
  type ScheduleUser,
} from '@/features/schedule/service';
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  randomToken,
  safeEqual,
  sha256,
} from '@/lib/token-crypto';
import {
  CALENDAR_SCOPE,
  GoogleApiError,
  googleCalendar,
  googleOAuth,
  idTokenEmail,
  type CalendarApi,
  type GoogleEvent,
  type OAuthApi,
} from './google';
import {
  CALENDAR_NAME,
  GENERATE_AHEAD_DAYS,
  SYNC_WINDOW,
  UNSUPPORTED_REMOTE,
  decide,
  eligible,
  eventBody,
  eventPatch,
  fingerprint,
  localSnapshot,
  managedBlockId,
  newEventId,
  remoteSnapshot,
  type Snapshot,
} from './domain';

export type CalendarDeps = {
  config: CalendarConfig;
  oauth: OAuthApi;
  calendar: (accessToken: () => Promise<string>) => CalendarApi;
  now: () => Date;
};
export function defaultDeps(): CalendarDeps | null {
  const config = calendarConfig();
  if (!config) return null;
  return {
    config,
    oauth: googleOAuth(config),
    calendar: (token) => googleCalendar(config, token),
    now: () => new Date(),
  };
}

export type CalendarErrorCode =
  | 'not_configured'
  | 'access_denied'
  | 'state_mismatch'
  | 'state_expired'
  | 'missing_refresh_token'
  | 'scope_denied'
  | 'exchange_failed'
  | 'not_connected'
  | 'busy'
  | 'reauth_required'
  | 'calendar_missing'
  | 'remote_unsupported'
  | 'google_unavailable'
  | 'unexpected';
/** Sanitized, user-safe errors. Raw Google/OAuth errors are never shown or stored. */
export class CalendarError extends Error {
  constructor(public code: CalendarErrorCode) {
    super(code);
  }
}
export const errorMessages: Record<CalendarErrorCode, string> = {
  not_configured: 'Google Calendar is not configured on this server.',
  access_denied: 'Google access was not granted.',
  state_mismatch:
    'The Google sign-in could not be verified. Try connecting again.',
  state_expired: 'The Google sign-in took too long. Try connecting again.',
  missing_refresh_token:
    'Google did not grant offline access. Remove CareerOS from your Google account permissions, then connect again.',
  scope_denied:
    'CareerOS needs permission to manage its own calendar. Connect again and allow calendar access.',
  exchange_failed: 'Google sign-in failed. Try connecting again.',
  not_connected: 'Google Calendar is not connected.',
  busy: 'A sync is already running. Try again in a moment.',
  reauth_required:
    'Reconnect required: Google no longer accepts the saved permission.',
  calendar_missing:
    'The CareerOS calendar no longer exists in Google. Reconnect to create a new one.',
  remote_unsupported:
    'The Google version is an all-day or untitled event that CareerOS cannot use. Keep the CareerOS version.',
  google_unavailable:
    'Google Calendar is temporarily unavailable. Sync will retry.',
  unexpected: 'Sync failed unexpectedly. Details were logged on the server.',
};
function codeOf(error: unknown): CalendarErrorCode {
  if (error instanceof CalendarError) return error.code;
  if (error instanceof GoogleApiError)
    return error.kind === 'auth'
      ? 'reauth_required'
      : error.kind === 'notFound'
        ? 'calendar_missing'
        : error.kind === 'transient'
          ? 'google_unavailable'
          : 'unexpected';
  return 'unexpected';
}
const fatal = (code: CalendarErrorCode) =>
  ['reauth_required', 'calendar_missing'].includes(code);
function log(event: string, fields: Record<string, unknown>) {
  // Sanitized: ids, codes and counts only. Never tokens, keys, event bodies or notes.
  console.info(`[calendar] ${event} ${JSON.stringify(fields)}`);
}

const key = (deps: CalendarDeps) =>
  parseEncryptionKey(deps.config.encryptionKey);
export const getConnection = (userId: string) =>
  db().calendarConnection.findUnique({ where: { userId } });

// ---------------------------------------------------------------- OAuth

const OAUTH_TTL_MS = 10 * 60000;
/** Starts Authorization Code + PKCE. State, verifier and owner travel in an encrypted cookie. */
export function beginOAuth(user: ScheduleUser, deps: CalendarDeps) {
  const state = randomToken(),
    verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const cookie = encryptSecret(
    JSON.stringify({
      state,
      verifier,
      userId: user.id,
      exp: +deps.now() + OAUTH_TTL_MS,
    }),
    key(deps),
  );
  return { url: deps.oauth.authorizationUrl(state, challenge), cookie };
}

export async function completeOAuth(
  user: ScheduleUser,
  input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
    cookie?: string;
  },
  deps: CalendarDeps,
) {
  if (input.error) throw new CalendarError('access_denied');
  let saved: { state: string; verifier: string; userId: string; exp: number };
  try {
    saved = JSON.parse(decryptSecret(input.cookie ?? '', key(deps)));
  } catch {
    throw new CalendarError('state_mismatch');
  }
  if (
    !input.state ||
    !safeEqual(saved.state, input.state) ||
    saved.userId !== user.id
  )
    throw new CalendarError('state_mismatch');
  if (+deps.now() > saved.exp) throw new CalendarError('state_expired');
  if (!input.code) throw new CalendarError('exchange_failed');
  let tokens;
  try {
    tokens = await deps.oauth.exchangeCode(input.code, saved.verifier);
  } catch {
    throw new CalendarError('exchange_failed');
  }
  if (!tokens.scope?.split(' ').includes(CALENDAR_SCOPE)) {
    await deps.oauth.revoke(tokens.accessToken).catch(() => {});
    throw new CalendarError('scope_denied');
  }
  if (!tokens.refreshToken) throw new CalendarError('missing_refresh_token');
  const api = deps.calendar(async () => tokens.accessToken);
  const existing = await getConnection(user.id);
  // Reuse the calendar CareerOS created earlier; otherwise create the dedicated one.
  let calendar = existing?.calendarId
    ? await api.getCalendar(existing.calendarId)
    : null;
  if (!calendar)
    calendar = await api.createCalendar(CALENDAR_NAME, user.timezone);
  const now = deps.now();
  const data = {
    status: 'CONNECTED' as const,
    encryptedRefreshToken: encryptSecret(tokens.refreshToken, key(deps)),
    scope: tokens.scope,
    accountEmail: idTokenEmail(tokens.idToken),
    calendarId: calendar.id,
    calendarName: calendar.summary,
    // A reconnect always reconciles from a full list before trusting incremental tokens.
    syncToken: null,
    syncLeaseUntil: null,
    lastSyncError: null,
    connectedAt: now,
    disconnectedAt: null,
  };
  const connection = await db().calendarConnection.upsert({
    where: { userId: user.id },
    create: { ...data, userId: user.id },
    update: data,
  });
  log('connected', {
    userId: user.id,
    reusedCalendar: calendar.id === existing?.calendarId,
  });
  return connection;
}

function tokenSource(conn: CalendarConnection, deps: CalendarDeps) {
  let cached: string | undefined;
  return async () => {
    if (cached) return cached;
    if (!conn.encryptedRefreshToken) throw new CalendarError('reauth_required');
    let refresh: string;
    try {
      refresh = decryptSecret(conn.encryptedRefreshToken, key(deps));
    } catch {
      // Wrong or rotated key: fail closed and ask for a reconnect.
      throw new CalendarError('reauth_required');
    }
    try {
      cached = (await deps.oauth.refresh(refresh)).accessToken;
    } catch (error) {
      if (error instanceof GoogleApiError && error.kind === 'auth')
        throw new CalendarError('reauth_required');
      throw error;
    }
    return cached;
  };
}

// ---------------------------------------------------------------- sync engine

const LEASE_MS = 5 * 60000;
type Summary = Record<
  | 'creates'
  | 'recoveredCreates'
  | 'patches'
  | 'deletes'
  | 'inboundUpdates'
  | 'inboundCancels'
  | 'detached'
  | 'conflicts'
  | 'adopted'
  | 'duplicatesRemoved'
  | 'foreignIgnored'
  | 'orphans'
  | 'restored'
  | 'errors'
  | 'full'
  | 'incremental'
  | 'tokenExpired',
  number
>;
const emptySummary = (): Summary => ({
  creates: 0,
  recoveredCreates: 0,
  patches: 0,
  deletes: 0,
  inboundUpdates: 0,
  inboundCancels: 0,
  detached: 0,
  conflicts: 0,
  adopted: 0,
  duplicatesRemoved: 0,
  foreignIgnored: 0,
  orphans: 0,
  restored: 0,
  errors: 0,
  full: 0,
  incremental: 0,
  tokenExpired: 0,
});
type Ctx = {
  user: ScheduleUser;
  conn: CalendarConnection;
  calendarId: string;
  api: CalendarApi;
  deps: CalendarDeps;
  summary: Summary;
};
type Block = TimeBlock;
type SyncMeta = Partial<{
  externalCalendarEventId: string | null;
  externalCalendarId: string | null;
  calendarEtag: string | null;
  calendarSyncedHash: string | null;
  calendarSyncStatus:
    'NOT_SYNCED' | 'SYNCED' | 'ERROR' | 'CONFLICT' | 'DETACHED';
  calendarSyncError: string | null;
  calendarSyncAttempts: number;
  calendarRetryAt: Date | null;
  calendarSyncedAt: Date | null;
}>;
/**
 * Writes sync metadata without touching TimeBlock.updatedAt, so background syncs never trip the
 * edit form's "changed in another tab" check. Content changes use normal Prisma updates.
 */
async function setSyncMeta(
  id: string,
  meta: SyncMeta,
  client: Prisma.TransactionClient = db(),
) {
  const sets = Object.entries(meta).map(([column, value]) =>
    column === 'calendarSyncStatus'
      ? Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}::"CalendarSyncStatus"`
      : Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}`,
  );
  if (sets.length)
    await client.$executeRaw`UPDATE "TimeBlock" SET ${Prisma.join(sets)} WHERE id = ${id}`;
}
const mappingCleared: SyncMeta = {
  externalCalendarEventId: null,
  calendarEtag: null,
  calendarSyncedHash: null,
  calendarSyncStatus: 'NOT_SYNCED',
  calendarSyncError: null,
  calendarSyncAttempts: 0,
  calendarRetryAt: null,
};
const synced = (
  hash: string,
  etag: string | undefined,
  now: Date,
): SyncMeta => ({
  calendarSyncedHash: hash,
  calendarEtag: etag ?? null,
  calendarSyncStatus: 'SYNCED',
  calendarSyncError: null,
  calendarSyncAttempts: 0,
  calendarRetryAt: null,
  calendarSyncedAt: now,
});
const cancelledRemote = (title = ''): Snapshot => ({
  title,
  start: null,
  end: null,
  cancelled: true,
});

/**
 * One sync run. A lease row keeps cron, webhook and "Sync now" from interleaving. Remote calls
 * never run inside a database transaction; local writes are short owner-locked transactions.
 */
export async function syncCalendar(
  user: ScheduleUser,
  deps: CalendarDeps,
  opts: { full?: boolean } = {},
) {
  const now = deps.now();
  const lease = await db().calendarConnection.updateMany({
    where: {
      userId: user.id,
      status: { in: ['CONNECTED', 'ERROR'] },
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }],
    },
    data: { syncLeaseUntil: new Date(+now + LEASE_MS), lastSyncAttemptAt: now },
  });
  if (!lease.count) {
    const conn = await getConnection(user.id);
    return {
      ok: false as const,
      code: (conn && ['CONNECTED', 'ERROR'].includes(conn.status)
        ? 'busy'
        : 'not_connected') as CalendarErrorCode,
    };
  }
  const conn = await db().calendarConnection.findUniqueOrThrow({
    where: { userId: user.id },
  });
  const summary = emptySummary();
  let full = !conn.syncToken || !!opts.full;
  try {
    if (!conn.calendarId) throw new CalendarError('calendar_missing');
    const ctx: Ctx = {
      user,
      conn,
      calendarId: conn.calendarId,
      api: deps.calendar(tokenSource(conn, deps)),
      deps,
      summary,
    };
    const today = dayKey(now, user.timezone);
    for (let i = 0; i < GENERATE_AHEAD_DAYS; i++)
      await generatePlan(user, shiftDay(today, i)).catch(() => {
        // A routine hitting a DST gap already reports on Today; sync continues.
      });
    let token: string;
    if (full) token = await fullSync(ctx);
    else {
      await pushPending(ctx);
      try {
        token = await pull(ctx, conn.syncToken);
        summary.incremental = 1;
      } catch (error) {
        if (!(error instanceof GoogleApiError && error.kind === 'gone'))
          throw error;
        // 410: discard the token and rebuild the baseline from a full list.
        summary.tokenExpired = 1;
        full = true;
        token = await fullSync(ctx);
      }
    }
    await ensureWatch(ctx).catch((error) =>
      log('watch-failed', { userId: user.id, code: codeOf(error) }),
    );
    const finished = deps.now();
    // The sync token only advances after every page and write above succeeded.
    await db().calendarConnection.update({
      where: { id: conn.id },
      data: {
        syncToken: token,
        syncLeaseUntil: null,
        status: 'CONNECTED',
        lastSyncError: null,
        lastSuccessfulSyncAt: finished,
        lastSyncSummary: summary,
        ...(full
          ? { lastFullSyncAt: finished }
          : { lastIncrementalSyncAt: finished }),
      },
    });
    log('synced', { userId: user.id, ...summary });
    return { ok: true as const, summary };
  } catch (error) {
    const code = codeOf(error);
    await db().calendarConnection.update({
      where: { id: conn.id },
      data: {
        syncLeaseUntil: null,
        lastSyncError: code,
        lastSyncSummary: summary,
        status:
          code === 'reauth_required'
            ? 'REAUTH_REQUIRED'
            : code === 'calendar_missing'
              ? 'ERROR'
              : conn.status,
      },
    });
    log('sync-failed', {
      userId: user.id,
      code,
      detail:
        error instanceof GoogleApiError
          ? error.message
          : error instanceof Error
            ? error.name
            : 'unknown',
    });
    return { ok: false as const, code, summary };
  }
}

/** Full reconciliation: list everything (adopt/dedupe mappings), then push. */
async function fullSync(ctx: Ctx) {
  ctx.summary.full = 1;
  const token = await pull(ctx, null);
  await pushPending(ctx);
  return token;
}

async function pull(ctx: Ctx, syncToken: string | null) {
  let pageToken: string | undefined;
  let next: string | undefined;
  do {
    const page = await ctx.api.listEvents(ctx.calendarId, {
      pageToken,
      syncToken: syncToken ?? undefined,
    });
    for (const event of page.items) await reconcileEvent(ctx, event);
    pageToken = page.nextPageToken;
    next = page.nextSyncToken;
  } while (pageToken);
  if (!next) throw new CalendarError('unexpected');
  return next;
}

const findBlock = (userId: string, id: string) =>
  db().timeBlock.findFirst({ where: { id, dailyPlan: { userId } } });

async function reconcileEvent(ctx: Ctx, event: GoogleEvent) {
  const { summary, calendarId } = ctx;
  const blockId = managedBlockId(event);
  // No CareerOS private properties: someone else's event. Never read into or mutate it.
  if (!blockId) return void summary.foreignIgnored++;
  const block = await findBlock(ctx.user.id, blockId);
  if (!block) return void summary.orphans++;
  const now = ctx.deps.now();
  const mapped =
    block.externalCalendarId === calendarId && !!block.externalCalendarEventId;
  if (mapped && block.externalCalendarEventId !== event.id) {
    // A second CareerOS event for the same block (e.g. an earlier lost create): remove the copy.
    if (event.status !== 'cancelled') {
      await ctx.api.deleteEvent(calendarId, event.id);
      summary.duplicatesRemoved++;
    }
    return;
  }
  const remote = remoteSnapshot(event);
  if (!mapped || block.calendarSyncedHash === null) {
    if (!mapped && event.status === 'cancelled') return;
    // Adopt: the event exists (proven by private properties) but the local record was lost.
    await setSyncMeta(block.id, {
      externalCalendarEventId: event.id,
      externalCalendarId: calendarId,
      ...synced(
        remote ? fingerprint(remote) : UNSUPPORTED_REMOTE,
        event.etag,
        now,
      ),
    });
    summary.adopted++;
    if (remote?.cancelled)
      await applyRemote(ctx, block.id, remote, event, true);
    return;
  }
  if (block.calendarSyncStatus === 'CONFLICT') {
    await db().calendarSyncConflict.updateMany({
      where: { timeBlockId: block.id, status: 'OPEN' },
      data: { remoteSnapshot: remote ?? cancelledRemote(event.summary) },
    });
    return;
  }
  if (block.calendarSyncStatus === 'DETACHED') return;
  if (!remote) {
    // All-day/untitled edits cannot represent a TimeBlock: keep CareerOS and restore on push.
    await setSyncMeta(block.id, {
      calendarSyncedHash: UNSUPPORTED_REMOTE,
      calendarEtag: event.etag ?? null,
    });
    return void summary.restored++;
  }
  const isEligible = eligible(block, ctx.conn.excludedCategories);
  const local = localSnapshot(block, isEligible);
  const localHash = fingerprint(local),
    remoteHash = fingerprint(remote);
  switch (decide(block.calendarSyncedHash, localHash, remoteHash)) {
    case 'noop':
    case 'push':
      // Content unchanged remotely: remember the newer etag. Local changes push next run.
      if (event.etag !== block.calendarEtag)
        await setSyncMeta(block.id, { calendarEtag: event.etag ?? null });
      return;
    case 'converged':
      await setSyncMeta(
        block.id,
        remote.cancelled ? mappingCleared : synced(localHash, event.etag, now),
      );
      return;
    case 'pull':
      return applyRemote(ctx, block.id, remote, event);
    case 'conflict':
      return openConflict(ctx, block, local, remote, event.id, event.etag);
  }
}

/**
 * Applies a Google edit to the dated occurrence only (WI-002 override semantics). Routine
 * templates, sessions, completion and domain state are never touched.
 */
async function applyRemote(
  ctx: Ctx,
  blockId: string,
  remote: Snapshot,
  event: GoogleEvent,
  force = false,
) {
  const { user, summary } = ctx;
  const now = ctx.deps.now();
  const outcome = await locked(user.id, async (tx) => {
    const b = await tx.timeBlock.findFirst({
      where: { id: blockId, dailyPlan: { userId: user.id } },
      include: { sessions: true, interviewRound: true },
    });
    if (!b) return 'gone';
    const local = localSnapshot(b, eligible(b, ctx.conn.excludedCategories));
    // Re-check inside the lock: a CareerOS edit since the read turns this into a conflict.
    if (!force && fingerprint(local) !== b.calendarSyncedHash)
      return { conflict: local };
    if (b.sessions.some((s) => !s.endedAt)) return { conflict: local };
    if (remote.cancelled) {
      if (b.status === 'PLANNED') {
        await tx.timeBlock.update({
          where: { id: b.id },
          data: { status: 'CANCELLED', isOverride: true },
        });
        await setSyncMeta(b.id, mappingCleared, tx);
        await clearBlockReminders(tx, user.id, b.id);
        summary.inboundCancels++;
      } else {
        // Done/skipped history stays; the block is never re-published.
        await setSyncMeta(
          b.id,
          { ...mappingCleared, calendarSyncStatus: 'DETACHED' },
          tx,
        );
        summary.detached++;
      }
      return 'applied';
    }
    const start = new Date(remote.start!),
      end = new Date(remote.end!);
    const day = dayKey(start, user.timezone);
    const plan = await tx.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      create: { userId: user.id, date: new Date(day) },
      update: {},
    });
    // Moving plan keeps routineKey/occurrenceDate, so generation never recreates the original.
    await tx.timeBlock.update({
      where: { id: b.id },
      data: {
        dailyPlanId: plan.id,
        title: remote.title,
        plannedStart: start,
        plannedEnd: end,
        isOverride: true,
      },
    });
    await setSyncMeta(b.id, synced(fingerprint(remote), event.etag, now), tx);
    await clearBlockReminders(tx, user.id, b.id);
    const round = b.interviewRound;
    if (
      round &&
      round.status === 'SCHEDULED' &&
      +round.scheduledStart !== +start
    ) {
      // The scheduled interview and its calendar block are one appointment.
      await tx.interviewRound.update({
        where: { id: round.id },
        data: { scheduledStart: start, scheduledEnd: end },
      });
      await tx.jobActivity.create({
        data: {
          userId: user.id,
          applicationId: round.applicationId,
          interviewRoundId: round.id,
          type: 'INTERVIEW_RESCHEDULED',
          occurredAt: now,
          previousStart: round.scheduledStart,
          newStart: start,
          note: `${round.title} — moved in Google Calendar`,
        },
      });
    }
    summary.inboundUpdates++;
    return 'applied';
  });
  if (typeof outcome === 'object') {
    const block = await findBlock(user.id, blockId);
    if (block)
      await openConflict(
        ctx,
        block,
        outcome.conflict,
        remote,
        event.id,
        event.etag,
      );
  }
}

async function openConflict(
  ctx: Ctx,
  block: Block,
  local: Snapshot,
  remote: Snapshot,
  eventId: string,
  etag?: string,
) {
  const now = ctx.deps.now();
  await locked(ctx.user.id, async (tx) => {
    const open = await tx.calendarSyncConflict.findFirst({
      where: { timeBlockId: block.id, status: 'OPEN' },
    });
    if (open)
      await tx.calendarSyncConflict.update({
        where: { id: open.id },
        data: { localSnapshot: local, remoteSnapshot: remote, detectedAt: now },
      });
    else
      await tx.calendarSyncConflict.create({
        data: {
          userId: ctx.user.id,
          timeBlockId: block.id,
          providerEventId: eventId,
          localSnapshot: local,
          remoteSnapshot: remote,
          detectedAt: now,
        },
      });
    await setSyncMeta(
      block.id,
      { calendarSyncStatus: 'CONFLICT', calendarEtag: etag ?? null },
      tx,
    );
  });
  ctx.summary.conflicts++;
}

/** Pushes every block whose local fingerprint differs from the agreed one (derived "pending"). */
async function pushPending(ctx: Ctx) {
  const now = ctx.deps.now();
  const blocks = await db().timeBlock.findMany({
    where: {
      dailyPlan: { userId: ctx.user.id },
      calendarSyncStatus: { in: ['NOT_SYNCED', 'SYNCED', 'ERROR'] },
      OR: [{ calendarRetryAt: null }, { calendarRetryAt: { lte: now } }],
      plannedEnd: { gte: new Date(+now - SYNC_WINDOW.pastDays * 86400000) },
      plannedStart: { lte: new Date(+now + SYNC_WINDOW.futureDays * 86400000) },
    },
    orderBy: { plannedStart: 'asc' },
  });
  for (const block of blocks)
    try {
      await pushOne(ctx, block);
    } catch (error) {
      const code = codeOf(error);
      if (fatal(code)) throw error;
      const attempts = block.calendarSyncAttempts + 1;
      await setSyncMeta(block.id, {
        calendarSyncStatus: 'ERROR',
        calendarSyncError: code,
        calendarSyncAttempts: attempts,
        // Local data stays authoritative; the block retries with capped backoff.
        calendarRetryAt: new Date(
          +now + Math.min(6 * 3600000, 60000 * 2 ** attempts),
        ),
      });
      ctx.summary.errors++;
    }
}

async function pushOne(ctx: Ctx, block: Block) {
  const { api, calendarId, user, summary } = ctx;
  const now = ctx.deps.now();
  const isEligible = eligible(block, ctx.conn.excludedCategories);
  const local = localSnapshot(block, isEligible);
  const localHash = fingerprint(local);
  const mapped =
    block.externalCalendarId === calendarId && !!block.externalCalendarEventId;
  if (!mapped && !isEligible) return;
  let eventId = block.externalCalendarEventId!;
  if (!mapped) {
    // Persist the intended event ID before calling Google so a retry cannot duplicate it.
    eventId = newEventId();
    await setSyncMeta(block.id, {
      externalCalendarEventId: eventId,
      externalCalendarId: calendarId,
      calendarSyncedHash: null,
      calendarEtag: null,
    });
  }
  if (!mapped || block.calendarSyncedHash === null) {
    if (!isEligible) {
      await api.deleteEvent(calendarId, eventId);
      return setSyncMeta(block.id, mappingCleared);
    }
    let event: GoogleEvent | null;
    try {
      event = await api.insertEvent(calendarId, {
        id: eventId,
        ...eventBody(block, user.timezone),
      });
      summary.creates++;
    } catch (error) {
      if (error instanceof GoogleApiError && error.kind === 'notFound')
        throw new CalendarError('calendar_missing');
      if (!(error instanceof GoogleApiError && error.kind === 'conflict'))
        throw error;
      // 409: an earlier attempt created it. Adopt only if it is provably this block's event.
      event = await api.getEvent(calendarId, eventId);
      if (!event || managedBlockId(event) !== block.id) throw error;
      summary.recoveredCreates++;
    }
    const remote = remoteSnapshot(event);
    await setSyncMeta(
      block.id,
      synced(
        remote ? fingerprint(remote) : UNSUPPORTED_REMOTE,
        event.etag,
        now,
      ),
    );
    if (remote?.cancelled) {
      await setSyncMeta(block.id, { calendarSyncedHash: localHash });
      await applyRemote(ctx, block.id, remote, event, true);
    }
    return;
  }
  if (localHash === block.calendarSyncedHash) {
    if (block.calendarSyncStatus === 'ERROR')
      await setSyncMeta(
        block.id,
        synced(localHash, block.calendarEtag ?? undefined, now),
      );
    return;
  }
  const write = async (etag: string | null) => {
    if (local.cancelled) {
      await api.deleteEvent(calendarId, eventId, etag);
      await setSyncMeta(block.id, mappingCleared);
      summary.deletes++;
    } else {
      const event = await api.patchEvent(
        calendarId,
        eventId,
        eventPatch(block, user.timezone),
        etag,
      );
      await setSyncMeta(block.id, synced(localHash, event.etag, now));
      summary.patches++;
    }
  };
  try {
    await write(block.calendarEtag);
  } catch (error) {
    if (!(error instanceof GoogleApiError)) throw error;
    if (error.kind === 'notFound' || error.kind === 'gone') {
      if (local.cancelled) return setSyncMeta(block.id, mappingCleared);
      // Deleted in Google while edited in CareerOS: both changed.
      return openConflict(
        ctx,
        block,
        local,
        cancelledRemote(block.title),
        eventId,
      );
    }
    if (error.kind !== 'precondition') throw error;
    // If-Match failed: Google changed since our etag. Decide with the current remote version.
    const current = await api.getEvent(calendarId, eventId);
    const remote = current
      ? remoteSnapshot(current)
      : cancelledRemote(block.title);
    if (!remote) {
      await write(current!.etag ?? null);
      return void summary.restored++;
    }
    const remoteHash = fingerprint(remote);
    if (remoteHash === block.calendarSyncedHash)
      return write(current?.etag ?? null);
    if (remoteHash === localHash)
      return setSyncMeta(block.id, synced(localHash, current?.etag, now));
    return openConflict(ctx, block, local, remote, eventId, current?.etag);
  }
}

// ---------------------------------------------------------------- conflicts, settings, watch

/** Applies the chosen side, writes the other side, and closes the conflict. No field merge. */
export async function resolveConflict(
  user: ScheduleUser,
  conflictId: string,
  choice: 'local' | 'remote',
  deps: CalendarDeps,
) {
  const conn = await getConnection(user.id);
  if (!conn || conn.status !== 'CONNECTED' || !conn.calendarId)
    throw new CalendarError(
      conn?.status === 'REAUTH_REQUIRED' ? 'reauth_required' : 'not_connected',
    );
  const conflict = await db().calendarSyncConflict.findFirst({
    where: { id: conflictId, userId: user.id, status: 'OPEN' },
  });
  if (!conflict) throw new CalendarError('unexpected');
  const now = deps.now();
  const lease = await db().calendarConnection.updateMany({
    where: {
      id: conn.id,
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }],
    },
    data: { syncLeaseUntil: new Date(+now + LEASE_MS) },
  });
  if (!lease.count) throw new CalendarError('busy');
  const ctx: Ctx = {
    user,
    conn,
    calendarId: conn.calendarId,
    api: deps.calendar(tokenSource(conn, deps)),
    deps,
    summary: emptySummary(),
  };
  try {
    const block = await findBlock(user.id, conflict.timeBlockId);
    if (!block) throw new CalendarError('unexpected');
    const event = await ctx.api.getEvent(
      conn.calendarId,
      conflict.providerEventId,
    );
    const remote = event ? remoteSnapshot(event) : cancelledRemote(block.title);
    const local = localSnapshot(
      block,
      eligible(block, conn.excludedCategories),
    );
    if (choice === 'remote') {
      if (!remote) throw new CalendarError('remote_unsupported');
      await setSyncMeta(block.id, {
        calendarSyncStatus: 'SYNCED',
        calendarSyncedHash: fingerprint(local),
      });
      await applyRemote(
        ctx,
        block.id,
        remote,
        event ?? { id: conflict.providerEventId },
        true,
      );
    } else if (!event || event.status === 'cancelled') {
      // Google copy is gone: publish CareerOS as a new event (or nothing if cancelled locally).
      await setSyncMeta(block.id, mappingCleared);
      await pushOne(ctx, (await findBlock(user.id, block.id))!);
    } else if (local.cancelled) {
      await ctx.api.deleteEvent(conn.calendarId, event.id, event.etag);
      await setSyncMeta(block.id, mappingCleared);
    } else {
      const written = await ctx.api.patchEvent(
        conn.calendarId,
        event.id,
        eventPatch(block, user.timezone),
        event.etag,
      );
      await setSyncMeta(
        block.id,
        synced(fingerprint(local), written.etag, now),
      );
    }
    await db().calendarSyncConflict.update({
      where: { id: conflict.id },
      data: {
        status: choice === 'local' ? 'RESOLVED_LOCAL' : 'RESOLVED_REMOTE',
        resolvedAt: now,
      },
    });
    log('conflict-resolved', { userId: user.id, choice });
  } catch (error) {
    const code = codeOf(error);
    if (code === 'reauth_required')
      await db().calendarConnection.update({
        where: { id: conn.id },
        data: { status: 'REAUTH_REQUIRED', lastSyncError: code },
      });
    throw error instanceof CalendarError ? error : new CalendarError(code);
  } finally {
    await db().calendarConnection.update({
      where: { id: conn.id },
      data: { syncLeaseUntil: null },
    });
  }
}

export async function saveExcludedCategories(
  user: ScheduleUser,
  categories: string[],
) {
  const unique = [
    ...new Set(categories.map((c) => c.trim()).filter(Boolean)),
  ].slice(0, 50);
  return db().calendarConnection.update({
    where: { userId: user.id },
    data: { excludedCategories: unique },
  });
}

const WATCH_TTL_SECONDS = 7 * 86400;
const RENEW_BEFORE_MS = 24 * 3600000;
/** Push channels exist only with a public HTTPS base URL; they are renewed a day before expiry. */
async function ensureWatch(ctx: Ctx) {
  const base = ctx.deps.config.webhookBaseUrl;
  if (!base) return;
  const now = ctx.deps.now();
  const active = await db().calendarWatchChannel.findMany({
    where: { connectionId: ctx.conn.id, stoppedAt: null },
  });
  if (active.some((c) => +c.expiration - +now > RENEW_BEFORE_MS)) return;
  const token = randomToken();
  const channelId = randomUUID();
  const created = await ctx.api.watchEvents(ctx.calendarId, {
    id: channelId,
    address: `${base.replace(/\/$/, '')}/api/calendar/webhook`,
    token,
    ttlSeconds: WATCH_TTL_SECONDS,
  });
  await db().calendarWatchChannel.create({
    data: {
      connectionId: ctx.conn.id,
      channelId,
      resourceId: created.resourceId,
      tokenHash: sha256(token),
      expiration: created.expiration,
    },
  });
  for (const old of active) {
    await ctx.api
      .stopChannel(old.channelId, old.resourceId ?? '')
      .catch(() => {});
    await db().calendarWatchChannel.update({
      where: { id: old.id },
      data: { stoppedAt: now },
    });
  }
  log('watch-renewed', { userId: ctx.user.id, replaced: active.length });
}

/**
 * Validates a Google push notification. Every check must pass; the message is only a signal to
 * run an incremental sync, never event data. Returns the owner to sync, if any.
 */
export async function verifyWebhook(
  headers: {
    channelId: string | null;
    resourceId: string | null;
    token: string | null;
    state: string | null;
  },
  now = new Date(),
) {
  if (
    !headers.channelId ||
    !headers.resourceId ||
    !headers.token ||
    !headers.state
  )
    return { status: 400 as const };
  const channel = await db().calendarWatchChannel.findUnique({
    where: { channelId: headers.channelId },
    include: { connection: true },
  });
  if (
    !channel ||
    channel.stoppedAt ||
    channel.expiration <= now ||
    channel.resourceId !== headers.resourceId ||
    !safeEqual(channel.tokenHash, sha256(headers.token)) ||
    channel.connection.status !== 'CONNECTED'
  )
    return { status: 404 as const };
  if (headers.state === 'sync') return { status: 200 as const };
  if (!['exists', 'not_exists'].includes(headers.state))
    return { status: 400 as const };
  return { status: 200 as const, userId: channel.connection.userId };
}

/**
 * Forgets credentials and stops push; CareerOS data always stays. Events stay in the dedicated
 * calendar unless removal is explicitly confirmed, which deletes only the stored CareerOS calendar.
 */
export async function disconnectCalendar(
  user: ScheduleUser,
  opts: { removeCalendar: boolean },
  deps: CalendarDeps,
) {
  const conn = await getConnection(user.id);
  if (!conn || conn.status === 'DISCONNECTED')
    throw new CalendarError('not_connected');
  const now = deps.now();
  let removed = false;
  const channels = await db().calendarWatchChannel.findMany({
    where: { connectionId: conn.id, stoppedAt: null },
  });
  try {
    const api = deps.calendar(tokenSource(conn, deps));
    for (const c of channels)
      await api.stopChannel(c.channelId, c.resourceId ?? '').catch(() => {});
    if (
      opts.removeCalendar &&
      conn.calendarId &&
      conn.calendarId !== 'primary'
    ) {
      await api.deleteCalendar(conn.calendarId);
      removed = true;
    }
  } catch (error) {
    if (opts.removeCalendar)
      throw error instanceof CalendarError
        ? error
        : new CalendarError(codeOf(error));
    // Credentials already unusable: forgetting them locally is still correct.
  }
  if (conn.encryptedRefreshToken)
    try {
      await deps.oauth.revoke(
        decryptSecret(conn.encryptedRefreshToken, key(deps)),
      );
    } catch {
      // Revocation is best-effort (already revoked, or key rotated).
    }
  await db().$transaction(async (tx) => {
    await tx.calendarWatchChannel.updateMany({
      where: { connectionId: conn.id, stoppedAt: null },
      data: { stoppedAt: now },
    });
    if (removed)
      await tx.$executeRaw`UPDATE "TimeBlock" SET "externalCalendarEventId" = NULL, "calendarEtag" = NULL,
        "calendarSyncedHash" = NULL, "calendarSyncStatus" = 'NOT_SYNCED', "calendarSyncError" = NULL
        WHERE "externalCalendarId" = ${conn.calendarId}`;
    await tx.calendarConnection.update({
      where: { id: conn.id },
      data: {
        status: 'DISCONNECTED',
        encryptedRefreshToken: null,
        syncToken: null,
        syncLeaseUntil: null,
        disconnectedAt: now,
        lastSyncError: null,
        ...(removed ? { calendarId: null, calendarName: null } : {}),
      },
    });
  });
  log('disconnected', { userId: user.id, removedCalendar: removed });
  return { removed };
}

/** Read model for /calendar: connection, derived counts and open conflicts. */
export async function calendarOverview(user: ScheduleUser) {
  const [conn, conflicts] = await Promise.all([
    getConnection(user.id),
    db().calendarSyncConflict.findMany({
      where: { userId: user.id, status: 'OPEN' },
      include: { timeBlock: { select: { title: true, category: true } } },
      orderBy: { detectedAt: 'asc' },
    }),
  ]);
  return { conn, conflicts };
}
