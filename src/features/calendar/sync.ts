import 'server-only';
import { getConnection, log, type CalendarDeps } from './core';
import { CalendarError, codeOf, fatal, type CalendarErrorCode } from './errors';
import { tokenSource } from './oauth';
import { ensureWatch } from './watch';
import { forgetAll } from '@/server/memo';
import { db } from '@/server/db';
import { Prisma } from '@/generated/prisma/client';
import type { CalendarConnection, TimeBlock } from '@/generated/prisma/client';
import { dayKey } from '@/lib/time';
import { clearBlockReminders, generatePlan } from '@/features/schedule/service';
import { locked, type ScheduleUser } from '@/server/lock';
import { GoogleApiError, type CalendarApi, type GoogleEvent } from './google';
import {
  syncGenerationDays,
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

/** The sync engine: the lease, pull, reconcile, conflicts and push (WI-131). */
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
export type Ctx = {
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
  try {
    return await syncCalendarInner(user, deps, opts);
  } finally {
    // Background syncs do not pass through recordRun; the snapshots must still refresh.
    forgetAll();
  }
}
async function syncCalendarInner(
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
    for (const day of syncGenerationDays(today))
      await generatePlan(user, day).catch(() => {
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
  // No Silsila private properties: someone else's event. Never read into or mutate it.
  if (!blockId) return void summary.foreignIgnored++;
  const block = await findBlock(ctx.user.id, blockId);
  if (!block) return void summary.orphans++;
  const now = ctx.deps.now();
  const mapped =
    block.externalCalendarId === calendarId && !!block.externalCalendarEventId;
  if (mapped && block.externalCalendarEventId !== event.id) {
    // A second Silsila event for the same block (e.g. an earlier lost create): remove the copy.
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
    // All-day/untitled edits cannot represent a TimeBlock: keep Silsila and restore on push.
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
    // Re-check inside the lock: a Silsila edit since the read turns this into a conflict.
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
      // Deleted in Google while edited in Silsila: both changed.
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
      // Google copy is gone: publish Silsila as a new event (or nothing if cancelled locally).
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
