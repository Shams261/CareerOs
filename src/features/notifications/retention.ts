import 'server-only';
import { db } from '@/server/db';
import { recordRun } from '@/server/jobs';

/**
 * How long system records are kept (WI-134). Only what the app keeps for itself goes; the
 * owner's own records (blocks, sessions of work, notes, reviews, Rumi's conversations) never do.
 * - Sign-in sessions: 30 days after they expired or were revoked.
 * - Reminders: 180 days after they were due, once read. Unread ones still show on Today, and a
 *   job follow-up is kept because its key holds a date that can stay overdue for months.
 * - The AI ledger: 400 days (the monthly limit reads only the current month).
 */
export const RETENTION_DAYS = { sessions: 30, reminders: 180, aiUsage: 400 };
const DAY_MS = 86_400_000;

/** Deletes system records past their retention; `userId` narrows it (tests). Counts only. */
export async function pruneRecords(now = new Date(), userId?: string) {
  const before = (days: number) => new Date(+now - days * DAY_MS);
  const scope = userId ? { userId } : {};
  const [sessions, reminders, aiUsage] = await Promise.all([
    db().session.deleteMany({
      where: {
        ...scope,
        OR: [
          { expiresAt: { lt: before(RETENTION_DAYS.sessions) } },
          { revokedAt: { lt: before(RETENTION_DAYS.sessions) } },
        ],
      },
    }),
    db().notificationLog.deleteMany({
      where: {
        ...scope,
        scheduledFor: { lt: before(RETENTION_DAYS.reminders) },
        readAt: { not: null },
        type: { not: 'JOB_FOLLOW_UP' },
      },
    }),
    db().aiUsage.deleteMany({
      where: { ...scope, createdAt: { lt: before(RETENTION_DAYS.aiUsage) } },
    }),
  ]);
  return {
    sessions: sessions.count,
    reminders: reminders.count,
    aiUsage: aiUsage.count,
  };
}

/** Once a day, with the daily checks of the reminder job; recorded in JobRun as `retention`. */
export async function dailyRetention(now = new Date()) {
  const last = await db().jobRun.findUnique({ where: { name: 'retention' } });
  if (last?.lastStartedAt && +now - +last.lastStartedAt < 20 * 3600_000)
    return null;
  return recordRun('retention', async () => {
    const counts = await pruneRecords(now);
    console.info(`[retention] pruned ${JSON.stringify(counts)}`);
    return counts;
  });
}
