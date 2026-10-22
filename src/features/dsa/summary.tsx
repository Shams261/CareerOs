import Link from 'next/link';
import { dsaSnapshot } from './service';
import { todayDsaSummary } from './domain';
import type { ScheduleUser } from '@/features/schedule/service';
import { ArrowRight } from 'lucide-react';
export async function TodayDsa({
  user,
  now,
}: {
  user: ScheduleUser;
  now: Date;
}) {
  const data = await dsaSnapshot(user);
  const { queue, red, yellow } = todayDsaSummary(
    data.problems,
    now,
    user.timezone,
  );
  return (
    <section className="card" aria-label="Today's DSA">
      <h2>Today&apos;s DSA</h2>
      <p>
        Current topic: {data.currentTopic?.name ?? 'Choose a topic in Practice'}
      </p>
      {queue.length > 0 && (
        <p className="muted">
          Revisions due: {queue.length} · Red: {red} · Yellow: {yellow}
        </p>
      )}
      <ol className="dsa-list">
        {queue.slice(0, 3).map((p) => (
          <li key={p.id}>
            <Link className="link" href={`/dsa/${p.id}`}>
              {p.title}
            </Link>
          </li>
        ))}
      </ol>
      {!queue.length && <p className="muted">No revisions due.</p>}
      <Link className="link" href="/dsa#revision-queue">
        Open Practice <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
