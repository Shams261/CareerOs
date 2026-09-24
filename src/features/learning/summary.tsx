import Link from 'next/link';
import type { ScheduleUser } from '@/features/schedule/service';
import { dayKey } from '@/lib/time';
import { learningSnapshot } from './service';
import { isTechnical, learningSuggestions } from './domain';
export async function TodayLearning({
  user,
  now,
  blocks,
}: {
  user: ScheduleUser;
  now: Date;
  blocks: { category: string; goalId: string | null; status: string }[];
}) {
  const data = await learningSnapshot(user, now),
    goals = new Set(
      data.subjects
        .filter((s) => s.status === 'ACTIVE')
        .map((s) => s.goalId)
        .filter(Boolean),
    );
  if (
    !blocks.some(
      (b) =>
        b.status !== 'CANCELLED' &&
        (isTechnical(b.category) || (b.goalId && goals.has(b.goalId))),
    )
  )
    return null;
  const { queue, next } = learningSuggestions(
    data.topics,
    data.currentSubjectId,
    dayKey(now, user.timezone),
  );
  return (
    <section className="card" aria-label="Technical prep">
      <h2>Technical prep</h2>
      <p>
        Current focus:{' '}
        {data.subjects.find((s) => s.id === data.currentSubjectId)?.name ??
          'Choose a subject'}
      </p>
      <p className="muted">
        Reviews due: {queue.length} · Next topic:{' '}
        {next?.title ?? 'Choose in Learning'}
      </p>
      <ol className="dsa-list">
        {queue.slice(0, 2).map((t) => (
          <li key={t.id}>
            <Link className="link" href={`/learn/topics/${t.id}`}>
              {t.title} — review
            </Link>
          </li>
        ))}
        {next && (
          <li>
            <Link className="link" href={`/learn/topics/${next.id}`}>
              {next.title} — new
            </Link>
          </li>
        )}
      </ol>
      <Link className="link" href="/learn#review-queue">
        Open Learning Queue →
      </Link>
    </section>
  );
}
