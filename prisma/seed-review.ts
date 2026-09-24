import type { Prisma } from '../src/generated/prisma/client';
import { weekOf } from '../src/features/review/domain';
import { shiftDay } from '../src/features/schedule/domain';

/** New seed owners only: last week's completed review, whose priorities are this week's focus. */
export async function seedReview(
  tx: Prisma.TransactionClient,
  userId: string,
  day: string,
) {
  const lastWeek = shiftDay(weekOf(day), -7);
  const review = await tx.weeklyReview.create({
    data: {
      userId,
      weekStart: new Date(lastWeek),
      biggestWin: 'Finished the sliding window set without hints.',
      biggestBlocker: 'Thursday evening study kept slipping after work.',
      lessons: 'Explaining trade-offs before coding makes interviews calmer.',
      nextWeekChange: 'Move System Design to the Saturday block.',
      carryForward: 'Follow up with Company X.',
      completedAt: new Date(`${shiftDay(lastWeek, 6)}T23:00:00Z`),
    },
  });
  const goal = await tx.goal.findFirst({ where: { userId, id: 'seed-job' } });
  for (const [ordering, [title, category, target, targetUnit]] of [
    ['Finish Sliding Window', 'DSA', null, null],
    ['Review TypeScript Generics', 'TECHNICAL', null, null],
    ['Submit targeted applications', 'JOB_SEARCH', 5, 'applications'],
  ].entries())
    await tx.weeklyPriority.create({
      data: {
        userId,
        reviewId: review.id,
        title: title as string,
        category: category as string,
        target: target as number | null,
        targetUnit: targetUnit as string | null,
        goalId: category === 'JOB_SEARCH' ? (goal?.id ?? null) : null,
        ordering,
        completedAt: ordering === 0 ? new Date(`${day}T12:00:00Z`) : null,
      },
    });
}
