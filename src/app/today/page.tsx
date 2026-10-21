import { TodayLearning } from '@/features/learning/summary';
import { TodayDsa } from '@/features/dsa/summary';
import { TodayInterview, TodayJobs } from '@/features/jobs/summary';
import { CalendarAttention } from '@/features/calendar/panel';
import { WeeklyReviewPrompt } from '@/features/review/summary';
import { isDsa } from '@/features/dsa/domain';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Disclosure, DisclosureTabs } from '@/components/disclosure';
import { DateJump } from '@/components/date-jump';
import { stopUnlinkedAction } from '@/features/schedule/actions';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { blockSummary, clock, dayKey, dayBounds, minutes } from '@/lib/time';
import { generateThroughSunday } from '@/features/schedule/service';
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
  RoutineForm,
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
      await generateThroughSunday(user, today);
    } catch (error) {
      generationError =
        error instanceof Error ? error.message : 'Unable to plan this week.';
    }
  const [
    plan,
    sessions,
    running,
    goals,
    notifications,
    applications,
    routines,
  ] = await Promise.all([
    db().dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      include: {
        blocks: {
          orderBy: { plannedStart: 'asc' },
          include: { sessions: { orderBy: { startedAt: 'asc' } } },
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
      where: { userId: user.id, appliedAt: new Date(day) },
    }),
    db().routineBlock.count({ where: { userId: user.id } }),
  ]);
  const blocks = plan?.blocks ?? [],
    summary = blockSummary(blocks, now),
    progress = dayProgress(blocks, sessions, bounds.start, bounds.end, now),
    duration = (n: number) => `${Math.floor(n / 60)}h ${n % 60}m`,
    // A finished session shorter than a minute is real work, not zero.
    sessionLength = (n: number, ended: boolean) =>
      ended && n < 1 ? 'under a minute' : duration(n),
    origin = (b: (typeof blocks)[number]) =>
      b.routineKey
        ? b.isOverride
          ? 'Changed for this day'
          : 'Routine'
        : 'Added for this day',
    // Until the first routine exists Today is a single card with one job.
    firstRun = day === today && !routines && !blocks.length && !running;
  return (
    <>
      <ExecutionRefresh />
      <CategoryOptions />
      <p className="eyebrow">
        {day === today ? 'Today' : day < today ? 'Past day' : 'Upcoming day'} ·{' '}
        {user.timezone}
      </p>
      <div className="page-head">
        <h1>{formatInTimeZone(bounds.start, user.timezone, 'EEEE, MMMM d')}</h1>
        <nav className="day-nav" aria-label="Day navigation">
          <Link
            className="button secondary"
            href={`/today?date=${shiftDay(day, -1)}`}
            aria-label="Previous day"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          {day !== today && (
            <Link className="button secondary" href="/today">
              Today
            </Link>
          )}
          <Link
            className="button secondary"
            href={`/today?date=${shiftDay(day, 1)}`}
            aria-label="Next day"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <DateJump value={day} path="/today" label="Open a date" />
        </nav>
      </div>
      {generationError && (
        <p role="alert" className="form-message mb-5">
          This week could not be planned: {generationError}. Check your routines
          on Plan.
        </p>
      )}
      <CalendarAttention user={user} />
      <TodayInterview user={user} day={day} />
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
      {firstRun ? (
        <section className="card setup-card" aria-labelledby="setup-heading">
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">Silsila works from a weekly routine.</h2>
          <p>
            Add your first block: what, which days, what time. Today fills in
            from it, and so does the rest of the week.
          </p>
          <RoutineForm goals={goals} compact />
          <div className="mt-5">
            <Disclosure variant="link" label="Just today? Add a one-time block">
              <BlockForm day={day} zone={user.timezone} goals={goals} />
            </Disclosure>
          </div>
        </section>
      ) : (
        <>
          {blocks.length > 0 && (
            <section className="card today-focus">
              <div className="form-grid">
                <div>
                  <p className="eyebrow">Now</p>
                  <h2 className="mt-3">
                    {summary.current?.title ?? 'Nothing scheduled right now'}
                  </h2>
                  {summary.current && (
                    <p className="muted">
                      {clock(summary.current.plannedStart, user.timezone)}–
                      {clock(summary.current.plannedEnd, user.timezone)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="eyebrow">Next</p>
                  <h2 className="mt-3">
                    {summary.next?.title ?? 'Nothing else today'}
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
          )}
          {blocks.length > 0 && (
            <div className="stats">
              {[
                ['Planned focus', duration(progress.plannedFocus)],
                ['Actual focus', duration(progress.actualFocus)],
                [
                  'Blocks completed',
                  `${progress.completed} / ${progress.planned}`,
                ],
                ['Applications', applications],
              ].map(([label, value]) => (
                <div className="stat" key={label}>
                  <span className="muted">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="grid-main">
            <section>
              <section className="card" aria-labelledby="timeline-heading">
                <div className="section-head">
                  <h2 id="timeline-heading">Timeline</h2>
                  <span className="pill">
                    {plan?.reviewedAt ? 'Reviewed' : 'Not reviewed'}
                  </span>
                </div>
                <Disclosure
                  label="Add a block"
                  variant={blocks.length ? 'secondary' : 'primary'}
                >
                  <BlockForm day={day} zone={user.timezone} goals={goals} />
                </Disclosure>
                {!blocks.length && (
                  <p className="empty mt-5">
                    {day === today
                      ? 'Nothing planned for today.'
                      : day < today
                        ? 'Nothing was planned for this day.'
                        : 'Nothing planned yet.'}{' '}
                    <Link className="link" href="/calendar">
                      Routines →
                    </Link>
                  </p>
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
                        <p className="muted block-origin">
                          {block.category} · {origin(block)}
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
                    <ExecutionControls block={block} canStart={day <= today} />
                    {block.sessions.map((s) => (
                      <p className="recorded" key={s.id}>
                        Recorded{' '}
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
                        ·{' '}
                        {sessionLength(
                          minutes(s.startedAt, s.endedAt ?? now),
                          !!s.endedAt,
                        )}
                        {s.notes ? ` · ${s.notes}` : ''}
                      </p>
                    ))}
                    <DisclosureTabs
                      items={[
                        {
                          label: 'Edit this day',
                          content: (
                            <BlockForm
                              block={block}
                              day={day}
                              zone={user.timezone}
                              goals={goals}
                            />
                          ),
                        },
                        {
                          label: 'Log time',
                          content: (
                            <ManualSessionForm
                              block={block}
                              day={day}
                              zone={user.timezone}
                            />
                          ),
                        },
                      ]}
                    />
                  </article>
                ))}
              </section>
            </section>
            <aside>
              {day === today && <WeeklyReviewPrompt user={user} now={now} />}
              {day === today && <TodayJobs user={user} now={now} />}
              {day === today && (
                <TodayLearning user={user} now={now} blocks={blocks} />
              )}
              {day === today &&
                blocks.some(
                  (b) => isDsa(b.category) && b.status !== 'CANCELLED',
                ) && <TodayDsa user={user} now={now} />}
              <section className="card" aria-labelledby="review-heading">
                <h2 id="review-heading">Daily review</h2>
                <p className="muted">
                  {plan?.reviewedAt ? 'Reviewed.' : 'Not reviewed yet.'}
                </p>
                <ReviewForm day={day} review={plan?.checkIn} />
              </section>
              {notifications.length > 0 && (
                <section className="card" aria-labelledby="reminders-heading">
                  <h2 id="reminders-heading">Reminders</h2>
                  {notifications.map((n) => (
                    <div className="mb-4" key={n.id}>
                      <p className="muted">{n.title}</p>
                      <form action={readNotification}>
                        <input name="id" type="hidden" value={n.id} />
                        <Button className="secondary mt-2">Mark read</Button>
                      </form>
                    </div>
                  ))}
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
