import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';

/** The owner's running session, for Focus (WI-129, moved from the page). */
export const runningSession = (user: ScheduleUser) =>
  db().actualSession.findFirst({
    where: { userId: user.id, endedAt: null },
    select: {
      id: true,
      taskId: true,
      startedAt: true,
      notes: true,
      category: true,
    },
  });

/** A block Focus runs, with the time recorded before a pause. */
export const focusBlock = (user: ScheduleUser, blockId: string) =>
  db().timeBlock.findFirst({
    where: { id: blockId, dailyPlan: { userId: user.id } },
    include: {
      dailyPlan: { select: { date: true } },
      // Time recorded before a pause: a resume continues from it (WI-068).
      sessions: {
        where: { endedAt: { not: null } },
        select: { startedAt: true, endedAt: true },
      },
    },
  });
