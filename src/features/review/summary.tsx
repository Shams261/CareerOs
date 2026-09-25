import Link from 'next/link';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/features/schedule/service';
import { currentWeek, weeklyPromptDue } from './domain';

/** Small Sunday prompt on Today while this week's review is not completed. */
export async function WeeklyReviewPrompt({
  user,
  now,
}: {
  user: ScheduleUser;
  now: Date;
}) {
  const week = currentWeek(now, user.timezone);
  const review = await db().weeklyReview.findUnique({
    where: { userId_weekStart: { userId: user.id, weekStart: new Date(week) } },
    select: { completedAt: true },
  });
  if (!weeklyPromptDue(now, user.timezone, review)) return null;
  return (
    <section className="card" aria-label="Weekly review">
      <h2>Weekly review</h2>
      <p className="muted">Your weekly review is not completed.</p>
      <Link className="button" href="/review">
        Review week
      </Link>
    </section>
  );
}
