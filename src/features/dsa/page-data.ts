import 'server-only';
import { db } from '@/server/db';
import { memo } from '@/server/memo';
import type { ScheduleUser } from '@/server/lock';

/** Practice's facts line: attempts this week and the last one (WI-129, moved from the page). */
export async function practiceFacts(
  user: ScheduleUser,
  weekStart: Date,
  now: Date,
) {
  const [weekCount, lastAttempt] = await Promise.all([
    db().dsaAttempt.count({
      where: { userId: user.id, attemptedAt: { gte: weekStart, lte: now } },
    }),
    db().dsaAttempt.findFirst({
      where: { userId: user.id },
      orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
      select: {
        attemptedAt: true,
        problem: { select: { id: true, title: true } },
      },
    }),
  ]);
  return { weekCount, lastAttempt };
}

/** The tab's name for a problem; null when it is not the owner's (WI-090). */
export const problemName = (user: ScheduleUser, id: string) =>
  memo(user.id, `problem-name:${id}`, () =>
    db().dsaProblem.findFirst({
      where: { id, userId: user.id },
      select: { title: true },
    }),
  );

/** A problem page's reads; null when the problem is not the owner's (WI-129). */
export async function problemPage(
  user: ScheduleUser,
  id: string,
  from: string | undefined,
) {
  const p = await db().dsaProblem.findFirst({
    where: { id, userId: user.id },
    include: {
      topic: true,
      resources: true,
      attempts: { orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }] },
    },
  });
  if (!p) return null;
  const [topics, origin, running, imported] = await Promise.all([
    db().dsaTopic.findMany({ orderBy: [{ ordering: 'asc' }, { name: 'asc' }] }),
    // The roadmap item this problem stands for: the one the owner came from, else the first.
    db().roadmapItem.findFirst({
      where: {
        userId: user.id,
        dsaProblemId: p.id,
        ...(from ? { id: from } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        section: true,
        roadmapId: true,
        scope: true,
        checkpoint: true,
        priority: true,
        estimateMinutes: true,
        references: true,
        notes: true,
        url: true,
        roadmap: {
          select: { title: true, promptTemplate: true, scenarios: true },
        },
      },
    }),
    db().actualSession.findFirst({
      where: { userId: user.id, endedAt: null },
      select: { startedAt: true, category: true },
    }),
    // From the imported curriculum: Hide, not Delete, since an import brings it back (WI-060).
    db().roadmapItem.count({
      where: { userId: user.id, dsaProblemId: p.id, slug: { not: null } },
    }),
  ]);
  return { p, topics, origin, running, imported };
}
