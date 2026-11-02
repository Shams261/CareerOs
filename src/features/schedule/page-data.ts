import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';
import { ownerWords } from '@/lib/action-error';
import { getConnection } from '@/features/calendar/service';
import { generateThroughSunday } from './service';

/** What Plan reads for a week (WI-129, moved from the page). */
export async function planPage(
  user: ScheduleUser,
  today: string,
  days: string[],
) {
  // Only the week's plans wait for generation; the rest starts at once (WI-061).
  const generated = generateThroughSunday(user, today).then(
    () => '',
    (error) => ownerWords(error) ?? 'Unable to plan this week.',
  );
  const [routines, plans, goals, connection, generationError] =
    await Promise.all([
      db().routineBlock.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      }),
      generated.then(() =>
        db().dailyPlan.findMany({
          where: {
            userId: user.id,
            date: { gte: new Date(days[0]), lte: new Date(days[6]) },
          },
          include: {
            blocks: {
              orderBy: { plannedStart: 'asc' },
              include: {
                sessions: {
                  select: { id: true, startedAt: true, endedAt: true },
                },
              },
            },
          },
        }),
      ),
      db().goal.findMany({
        where: { userId: user.id },
        select: { id: true, title: true },
      }),
      getConnection(user.id),
      generated,
    ]);
  // Linked interviews, so a block named "Company — Round" reads as the round here too.
  // Usually no linked block exists and this costs nothing.
  const roundIds = plans.flatMap((p) =>
    p.blocks.flatMap((b) => (b.interviewRoundId ? [b.interviewRoundId] : [])),
  );
  const rounds = roundIds.length
    ? await db().interviewRound.findMany({
        where: { id: { in: roundIds }, userId: user.id },
        select: {
          id: true,
          title: true,
          application: { select: { company: true } },
        },
      })
    : [];
  return { routines, plans, goals, connection, generationError, rounds };
}
