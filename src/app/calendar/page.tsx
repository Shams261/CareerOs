import Link from 'next/link';
import { db, owner } from '@/server/db';
import { dayKey, clock } from '@/lib/time';
import { dateInput, weekDays, shiftDay } from '@/features/schedule/domain';
import {
  RoutineForm,
  CategoryOptions,
  GenerateForm,
} from '@/features/schedule/forms';
export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await owner(),
    query = await searchParams,
    selected = dateInput.safeParse(query.date).success
      ? query.date!
      : dayKey(new Date(), user.timezone),
    days = weekDays(selected);
  const [routines, plans, goals] = await Promise.all([
    db().routineBlock.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    }),
    db().dailyPlan.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(days[0]), lte: new Date(days[6]) },
      },
      include: { blocks: { orderBy: { plannedStart: 'asc' } } },
    }),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
  ]);
  return (
    <>
      <CategoryOptions />
      <p className="eyebrow">Protect your time · {user.timezone}</p>
      <h1>A week that fits your life.</h1>
      <p className="muted mb-5">
        Edit any day for a one-off change, or update your recurring routine
        below. No code changes needed.
      </p>
      <div className="row flex-wrap mb-5">
        <Link
          className="button secondary"
          href={`/calendar?date=${shiftDay(days[0], -7)}`}
        >
          ← Previous week
        </Link>
        <strong>
          {days[0]} — {days[6]}
        </strong>
        <Link
          className="button secondary"
          href={`/calendar?date=${shiftDay(days[0], 7)}`}
        >
          Next week →
        </Link>
      </div>
      <form className="actions" action="/calendar">
        <label>
          Jump to week containing
          <input type="date" name="date" defaultValue={selected} required />
        </label>
        <button className="button self-end mb-3">Open week</button>
      </form>
      <section className="week-grid">
        {days.map((day, index) => {
          const plan = plans.find(
            (p) => p.date.toISOString().slice(0, 10) === day,
          );
          return (
            <article className="week-day" key={day}>
              <Link className="link" href={`/today?date=${day}`}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]} ·{' '}
                {day.slice(5)}
              </Link>
              {plan?.blocks.length ? (
                plan.blocks.map((b) => (
                  <Link
                    href={`/today?date=${day}`}
                    className="week-block"
                    key={b.id}
                  >
                    <span className="muted">
                      {clock(b.plannedStart, user.timezone)}
                    </span>
                    <strong>{b.title}</strong>
                    <span className="muted">
                      {b.status.replaceAll('_', ' ')}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="muted mt-4">
                  {plan?.generatedAt ? 'No blocks' : 'Plan not generated'}
                </p>
              )}
              <Link className="muted block mt-4" href={`/today?date=${day}`}>
                Inspect / edit day →
              </Link>
            </article>
          );
        })}
      </section>
      <section className="card">
        <h2>Generate dated plans</h2>
        <GenerateForm day={days[0]} />
      </section>
      <section className="card">
        <h2>Recurring routine</h2>
        <p className="muted mb-4">
          Templates for days not yet generated. Editing an existing plan never
          changes these routines.
        </p>
        <details className="mb-5">
          <summary>Create recurring routine</summary>
          <RoutineForm goals={goals} />
        </details>
        {!routines.length && (
          <p className="empty">
            Start with one block. Your routine can change at any time.
          </p>
        )}
        {routines.map((r) => (
          <details key={r.id} className="routine-row">
            <summary>
              {r.title} ·{' '}
              {r.weekdays
                .map(
                  (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d],
                )
                .join(', ')}{' '}
              · {r.startLocal}–{r.endLocal} {r.enabled ? '' : '· Paused'}
            </summary>
            <RoutineForm routine={r} goals={goals} />
          </details>
        ))}
      </section>
    </>
  );
}
