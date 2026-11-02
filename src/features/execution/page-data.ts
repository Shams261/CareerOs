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

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * The shell's session card (WI-068, WI-130): the running session, else the one that ended last
 * within a day, with its block and that block's finished sessions. One statement.
 */
export const latestSession = (userId: string, now: Date) =>
  db().actualSession.findFirst({
    where: {
      userId,
      OR: [{ endedAt: null }, { endedAt: { gte: new Date(+now - DAY_MS) } }],
    },
    orderBy: { endedAt: { sort: 'desc', nulls: 'first' } },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          plannedStart: true,
          plannedEnd: true,
          sessions: {
            where: { endedAt: { not: null } },
            select: { startedAt: true, endedAt: true },
          },
        },
      },
    },
  });
