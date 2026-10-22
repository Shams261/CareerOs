import Link from 'next/link';
import type { ScheduleUser } from '@/features/schedule/service';
import { dayKey } from '@/lib/time';
import { formatInTimeZone } from 'date-fns-tz';
import { chainDays, goalsOverview, revisionDue } from './service';
import { targetLabel } from './domain';
import { ArrowRight } from 'lucide-react';

const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;

/** One line per active goal on Today; hidden until a goal exists. */
export async function TodayGoals({
  user,
  now,
}: {
  user: ScheduleUser;
  now: Date;
}) {
  const goals = (await goalsOverview(user, now)).filter(
    (g) => g.status === 'ACTIVE',
  );
  if (!goals.length) return null;
  const today = dayKey(now, user.timezone);
  return (
    <section className="card" aria-labelledby="goals-heading">
      <h2 id="goals-heading">Goals</h2>
      {goals.slice(0, 3).map((g) => (
        <div className="goal-line" key={g.id}>
          <Link className="link" href="/roadmap">
            {g.title}
          </Link>
          <p className="muted">
            {targetLabel(
              g.targetDate?.toISOString().slice(0, 10) ?? null,
              today,
            )}
            {g.week.planned || g.week.actual
              ? ` · ${hours(g.week.actual)} of ${hours(g.week.planned)} this week`
              : ''}
            {g.roadmap.total
              ? ` · roadmap ${g.roadmap.done} of ${g.roadmap.total}`
              : ''}
          </p>
          {g.roadmap.total > 0 && (
            <p className="muted">
              {g.doneThisWeek} roadmap item{g.doneThisWeek === 1 ? '' : 's'}{' '}
              done this week
            </p>
          )}
          {g.upNext.length > 0 && (
            <ol className="plain-list goal-upnext-list">
              {g.upNext.map((n) => (
                <li key={n.id}>
                  <Link
                    className="link"
                    href={`/roadmap/${n.roadmapId}?section=${encodeURIComponent(n.section)}#item-${n.id}`}
                  >
                    {n.title}
                  </Link>
                  <span className="muted"> · {n.roadmapTitle}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}

/** The last fourteen days as rings. Filled: recorded work; dot: reviewed. */
export async function Chain({ user, now }: { user: ScheduleUser; now: Date }) {
  const days = await chainDays(user, now);
  if (!days.some((d) => d.worked || d.reviewed)) return null;
  const active = days.filter((d) => d.worked || d.reviewed).length;
  return (
    <ol
      className="chain"
      aria-label={`The chain: ${active} of the last ${days.length} days with recorded work or a review`}
    >
      {days.map((d) => {
        const text = `${formatInTimeZone(new Date(`${d.day}T12:00:00Z`), 'UTC', 'EEE MMM d')}${
          d.worked && d.reviewed
            ? ' · worked and reviewed'
            : d.worked
              ? ' · worked'
              : d.reviewed
                ? ' · reviewed'
                : ' · nothing recorded'
        }`;
        return (
          <li
            key={d.day}
            className={`chain-ring${d.worked ? ' is-worked' : ''}${d.reviewed ? ' is-reviewed' : ''}${d.today ? ' is-today' : ''}`}
            title={text}
          >
            <Link href={`/today?date=${d.day}`} aria-label={text} />
          </li>
        );
      })}
    </ol>
  );
}

/** Roadmap items due for revision today or earlier; hidden when nothing is due. */
export async function TodayRevision({
  user,
  now,
}: {
  user: ScheduleUser;
  now: Date;
}) {
  const due = await revisionDue(user, now);
  if (!due.length) return null;
  return (
    <section className="card" aria-labelledby="revision-heading">
      <h2 id="revision-heading">Revise today</h2>
      <p className="muted">
        {due.length} item{due.length === 1 ? '' : 's'} from your roadmaps. Study
        again, then press Revised.
      </p>
      <ol className="dsa-list">
        {due.slice(0, 5).map((i) => (
          <li key={i.id}>
            <Link
              className="link"
              href={`/roadmap/${i.roadmap.id}?section=${encodeURIComponent(i.section)}&show=revision#item-${i.id}`}
            >
              {i.title}
            </Link>
            <span className="muted"> · {i.roadmap.title}</span>
          </li>
        ))}
      </ol>
      {due.length > 5 && (
        <Link className="link" href="/roadmap">
          All roadmaps <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
