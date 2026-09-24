import { TodayLearning } from '@/features/learning/summary';
import { TodayDsa } from '@/features/dsa/summary';
import { isDsa } from '@/features/dsa/domain';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { stopUnlinkedAction } from '@/features/schedule/actions';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { blockSummary, clock, dayKey, dayBounds, minutes } from '@/lib/time';
import { generatePlan } from '@/features/schedule/service';
import {
  dateInput,
  dayProgress,
  executionLabel,
  shiftDay,
} from '@/features/schedule/domain';
import {
  BlockForm,
  CategoryOptions,
  ExecutionControls,
  ManualSessionForm,
  ReviewForm,
  GenerateForm,
} from '@/features/schedule/forms';
import { ExecutionRefresh } from '@/features/execution/refresh';
import { readNotification } from '@/server/actions';
import { Button } from '@/components/ui/button';
export default async function Today({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await owner(),
    now = new Date(),
    today = dayKey(now, user.timezone),
    query = await searchParams;
  const day = dateInput.safeParse(query.date).success ? query.date! : today,
    bounds = dayBounds(day, user.timezone);
  let generationError = '';
  if (day === today)
    try {
      await generatePlan(user, day);
    } catch (error) {
      generationError =
        error instanceof Error ? error.message : 'Unable to generate this day.';
    }
  const [plan, sessions, running, goals, notifications, applications] =
    await Promise.all([
      db().dailyPlan.findUnique({
        where: { userId_date: { userId: user.id, date: new Date(day) } },
        include: {
          blocks: {
            orderBy: { plannedStart: 'asc' },
            include: { sessions: true },
          },
          checkIn: true,
        },
      }),
      db().actualSession.findMany({
        where: {
          userId: user.id,
          startedAt: { lt: bounds.end },
          OR: [{ endedAt: null }, { endedAt: { gt: bounds.start } }],
        },
      }),
      db().actualSession.findFirst({
        where: { userId: user.id, endedAt: null },
        include: { task: true },
      }),
      db().goal.findMany({
        where: { userId: user.id },
        select: { id: true, title: true },
      }),
      db().notificationLog.findMany({
        where: { userId: user.id, readAt: null, scheduledFor: { lte: now } },
        orderBy: { scheduledFor: 'desc' },
        take: 5,
      }),
      db().jobApplication.count({
        where: {
          userId: user.id,
          appliedAt: { gte: bounds.start, lt: bounds.end },
        },
      }),
    ]);
  const blocks = plan?.blocks ?? [],
    summary = blockSummary(blocks, now),
    progress = dayProgress(blocks, sessions, bounds.start, bounds.end, now),
    duration = (n: number) => `${Math.floor(n / 60)}h ${n % 60}m`;
  return (
    <>
      <ExecutionRefresh />
      <CategoryOptions />
      <p className="eyebrow">
        {day === today ? 'Today' : 'Daily plan'} ·{' '}
        {formatInTimeZone(bounds.start, user.timezone, 'EEEE, MMMM d, yyyy')} ·{' '}
        {user.timezone}
      </p>
      <div className="row flex-wrap">
        <h1>Your day, on your terms.</h1>
        <Link className="link" href={`/calendar?date=${day}`}>
          Week & routines →
        </Link>
      </div>
      <div className="actions mb-5">
        <Link
          className="button secondary"
          href={`/today?date=${shiftDay(day, -1)}`}
        >
          ← Previous day
        </Link>
        <Link className="button secondary" href="/today">
          Today
        </Link>
        <Link
          className="button secondary"
          href={`/today?date=${shiftDay(day, 1)}`}
        >
          Next day →
        </Link>
      </div>
      <form className="actions mb-5" action="/today">
        <label>
          Jump to date
          <input type="date" name="date" defaultValue={day} required />
        </label>
        <button className="button self-end mb-3">Open day</button>
      </form>
      {generationError && (
        <p role="alert" className="form-message">
          Automatic generation paused: {generationError}. Edit your routine,
          then generate again.
        </p>
      )}
      {running && (
        <section className="hero">
          <div>
            <p className="eyebrow">
              Active session · {duration(minutes(running.startedAt, now))}{' '}
              elapsed
            </p>
            <h2>{running.task?.title ?? running.category}</h2>
            <p className="muted">
              Started{' '}
              {formatInTimeZone(
                running.startedAt,
                user.timezone,
                'MMM d, h:mm a',
              )}
              . This session stays active across page reloads.
            </p>
            {!running.task && (
              <ActionForm action={stopUnlinkedAction}>
                <input type="hidden" name="id" value={running.id} />
                <button className="button">Stop session</button>
              </ActionForm>
            )}
            {running.task && (
              <ExecutionControls
                block={{ ...running.task, status: 'IN_PROGRESS' }}
              />
            )}
          </div>
        </section>
      )}
      <section className="card">
        <div className="form-grid">
          <div>
            <p className="eyebrow">Current planned block</p>
            <h2 className="mt-3">
              {summary.current?.title ?? 'No block scheduled right now'}
            </h2>
            {summary.current && (
              <p className="muted">
                {clock(summary.current.plannedStart, user.timezone)}–
                {clock(summary.current.plannedEnd, user.timezone)}
              </p>
            )}
          </div>
          <div>
            <p className="eyebrow">Next block in this plan</p>
            <h2 className="mt-3">
              {summary.next?.title ?? 'Nothing else upcoming'}
            </h2>
            {summary.next && (
              <p className="muted">
                {clock(summary.next.plannedStart, user.timezone)}–
                {clock(summary.next.plannedEnd, user.timezone)}
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="stats">
        {[
          ['Planned focus', duration(progress.plannedFocus)],
          ['Actual focus', duration(progress.actualFocus)],
          ['Blocks completed', `${progress.completed} / ${progress.planned}`],
          ['Applications', applications],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="muted mb-5">
        {progress.remaining} remaining · {progress.skipped} skipped ·{' '}
        {progress.percent}% of blocks complete. Focus excludes Work, Gym and
        Personal; custom study categories count. Time is shown separately from
        block counts.
      </p>
      <div className="grid-main">
        <section>
          <section className="card">
            <div className="row">
              <h2>Your timeline</h2>
              <span className="pill">
                {plan?.reviewedAt ? 'Reviewed' : 'Not reviewed'}
              </span>
            </div>
            {!blocks.length && (
              <div className="empty">
                A clear day. Add your own block or generate your weekly routine
                below.
              </div>
            )}
            {blocks.map((block) => (
              <article className="execution-block" key={block.id}>
                <div className="row flex-wrap">
                  <div>
                    <p className="eyebrow">
                      {clock(block.plannedStart, user.timezone)}–
                      {formatInTimeZone(
                        block.plannedEnd,
                        user.timezone,
                        dayKey(block.plannedEnd, user.timezone) === day
                          ? 'h:mm a'
                          : 'MMM d, h:mm a',
                      )}
                    </p>
                    <h3 className="mt-2">{block.title}</h3>
                    <p className="muted">
                      {block.category} ·{' '}
                      {block.routineKey
                        ? block.isOverride
                          ? 'Daily override'
                          : 'From recurring routine'
                        : 'One-off block'}
                    </p>
                  </div>
                  <span className="pill">{executionLabel(block, now)}</span>
                </div>
                {block.description && (
                  <p className="muted">{block.description}</p>
                )}
                {block.skipReason && (
                  <p className="muted">Skipped: {block.skipReason}</p>
                )}
                <ExecutionControls block={block} />
                {block.sessions.map((s) => (
                  <p className="muted mt-3" key={s.id}>
                    Actual:{' '}
                    {formatInTimeZone(
                      s.startedAt,
                      user.timezone,
                      'MMM d, h:mm a',
                    )}
                    –
                    {s.endedAt
                      ? formatInTimeZone(
                          s.endedAt,
                          user.timezone,
                          'MMM d, h:mm a',
                        )
                      : 'running'}{' '}
                    · {duration(minutes(s.startedAt, s.endedAt ?? now))}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </p>
                ))}
                <details className="mt-4">
                  <summary>Edit / reschedule this occurrence only</summary>
                  <BlockForm
                    block={block}
                    day={day}
                    zone={user.timezone}
                    goals={goals}
                  />
                </details>
                <details className="mt-3">
                  <summary>Log actual time</summary>
                  <ManualSessionForm
                    block={block}
                    day={day}
                    zone={user.timezone}
                  />
                </details>
              </article>
            ))}
          </section>
          <section className="card">
            <details>
              <summary>Add a block to this day</summary>
              <BlockForm day={day} zone={user.timezone} goals={goals} />
            </details>
          </section>
          <section className="card">
            <details>
              <summary>Generate routine plans</summary>
              <GenerateForm day={day} />
            </details>
          </section>
        </section>
        <aside>
          {day === today && (
            <TodayLearning user={user} now={now} blocks={blocks} />
          )}
          {day === today &&
            blocks.some(
              (b) => isDsa(b.category) && b.status !== 'CANCELLED',
            ) && <TodayDsa user={user} now={now} />}
          <section className="card">
            <h2>Daily review</h2>
            <p className="muted">
              A minute to reflect.{' '}
              {plan?.reviewedAt
                ? 'You’ve reviewed this day.'
                : 'Not reviewed yet.'}
            </p>
            <ReviewForm day={day} review={plan?.checkIn} />
          </section>
          <section className="card">
            <h2>Reminders</h2>
            {notifications.length ? (
              notifications.map((n) => (
                <div className="mb-4" key={n.id}>
                  <p className="muted">{n.title}</p>
                  <form action={readNotification}>
                    <input name="id" type="hidden" value={n.id} />
                    <Button className="secondary mt-2">Mark read</Button>
                  </form>
                </div>
              ))
            ) : (
              <p className="muted">You’re all caught up.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
