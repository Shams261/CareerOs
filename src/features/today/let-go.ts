import 'server-only';
import { dayKey } from '@/lib/time';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { executeIn } from '@/features/execution/service';
import { blockResolution } from '@/features/schedule/row';

/**
 * Let go of a past day's blocks that have no record and no decision (WI-059), in one step
 * under the owner lock, the way Close the Day lets one go. Interview blocks are left alone.
 * Lived in `for-today/service.ts` until WI-092 removed the picks.
 */
export async function letGoDay(
  user: ScheduleUser,
  day: string,
  now = new Date(),
) {
  if (day >= dayKey(now, user.timezone))
    throw new Error('Only a past day can be let go of.');
  return locked(user.id, async (tx) => {
    const plan = await tx.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      include: { blocks: { include: { sessions: true } } },
    });
    const open = (plan?.blocks ?? []).filter(
      (b) => !b.interviewRoundId && blockResolution(b, now) === 'not-recorded',
    );
    for (const b of open)
      await executeIn(tx, user, b.id, 'skip', 'Let go', now);
    return open.map((b) => b.id);
  });
}
