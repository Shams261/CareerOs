import 'server-only';
import { getConnection, key, log, type CalendarDeps } from './core';
import { CalendarError, codeOf } from './errors';
import { tokenSource } from './oauth';
import { memo } from '@/server/memo';
import { db } from '@/server/db';
import { type ScheduleUser } from '@/server/lock';
import { decryptSecret } from '@/lib/token-crypto';

/** The connection's settings, disconnect and the overview Settings reads (WI-131). */
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

/**
 * Forgets credentials and stops push; Silsila data always stays. Events stay in the dedicated
 * calendar unless removal is explicitly confirmed, which deletes only the stored Silsila calendar.
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
async function loadCalendarOverview(user: ScheduleUser) {
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
/** Cached for a few seconds per owner; every write drops it (see src/server/memo.ts). */
export const calendarOverview = (user: ScheduleUser) =>
  memo(user.id, 'calendar', () => loadCalendarOverview(user));
