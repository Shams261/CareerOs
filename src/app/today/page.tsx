import { TodayLearning } from '@/features/learning/summary';
import { TodayDsa } from '@/features/dsa/summary';
import { TodayJobs } from '@/features/jobs/summary';
import { todaysInterviews } from '@/features/jobs/service';
import { label as roundLabel } from '@/features/jobs/domain';
import { ResourceLink } from '@/components/resource-link';
import { RoutineIllustration } from '@/components/illustrations';
import { CalendarAttention } from '@/features/calendar/panel';
import { WeeklyReviewPrompt } from '@/features/review/summary';
import { isDsa } from '@/features/dsa/domain';
import Link from 'next/link';
import { Suspense } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Briefcase } from 'lucide-react';
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
  executionTone,
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
import { LiveTimer } from '@/features/execution/live';
import { PageShortcuts } from '@/components/shortcuts';
import { CategoryIcon } from '@/components/category-icon';
import { Chain, TodayGoals, TodayRevision } from '@/features/roadmap/summary';
import { revisionDue } from '@/features/roadmap/service';
import { openNotes } from '@/features/notes/service';
import { NoteList } from '@/features/notes/forms';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { readNotification } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { categoryGroup } from '@/features/review/domain';
/** "Good morning" by the owner's clock; a fact line, not a mood. */
const greeting = (now: Date, zone: string) => {
  const hour = Number(formatInTimeZone(now, zone, 'H'));
  return hour < 12
    ? 'Good morning'
    : hour < 18
      ? 'Good afternoon'
      : 'Good evening';
};
export const metadata = { title: 'Today' };
/** A quiet placeholder while an aside card is still loading. */
const CardSkeleton = () => (
  <section className="card skeleton" aria-hidden="true">
    <span className="skeleton-line w-40" />
    <span className="skeleton-line" />
    <span className="skeleton-line w-60" />
  </section>
);
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
    notes,
    interviews,
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
    openNotes(user.id),
    todaysInterviews(user, day),
  ]);
  const dueCount = day === today ? (await revisionDue(user, now)).length : 0;
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
    firstRun = day === today && !routines && !blocks.length && !running,
    // "Starts in 40 min" for the launcher; never a countdown that ticks.
    startsIn = (d: Date) => {
      const m = Math.max(1, Math.round((+d - +now) / 60000));
      return m < 60
        ? `${m} min`
        : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
    },
    openPrep = (r: (typeof interviews)[number]) =>
      r.prepItems.filter((p) => p.kind === 'PREP' && !p.completed).length;
  // Blocks and interviews in one timeline, in time order.
  const timeline = [
    ...blocks.map((block) => ({ at: +block.plannedStart, block })),
    ...interviews.map((round) => ({ at: +round.scheduledStart, round })),
  ].sort((a, b) => a.at - b.at);
  const interviewLine = interviews[0] ? (
    <>
      {' · '}Interview: {interviews[0].application.company} —{' '}
      {interviews[0].title} at{' '}
      {clock(interviews[0].scheduledStart, user.timezone)}
      {' · '}
      <Link
        className="link"
        href={`/jobs/${interviews[0].applicationId}#round-${interviews[0].id}`}
      >
        Open prep
        {openPrep(interviews[0]) ? ` (${openPrep(interviews[0])} open)` : ''}
      </Link>
    </>
  ) : null;
  return (
    <>
      <ExecutionRefresh />
      <PageShortcuts
        shortcuts={[
          { key: 'n', label: 'Add a block', press: 'add-block' },
          { key: 's', label: 'Start the current block', press: 'start' },
          { key: 't', label: 'Go to today', href: '/today' },
        ]}
        prev={`/today?date=${shiftDay(day, -1)}`}
        next={`/today?date=${shiftDay(day, 1)}`}
      />
      <CategoryOptions />
      <p className="eyebrow">
        {day === today ? 'Today' : day < today ? 'Past day' : 'Upcoming day'}
      </p>
      <div className="page-head">
        <div>
          <h1>
            {formatInTimeZone(bounds.start, user.timezone, 'EEEE, MMMM d')}
          </h1>
          {day === today && (
            <p className="day-facts">
              {greeting(now, user.timezone)}
              {' · '}
              {[
                `${blocks.filter((b) => b.status !== 'CANCELLED').length} block${blocks.filter((b) => b.status !== 'CANCELLED').length === 1 ? '' : 's'} planned`,
                dueCount
                  ? `${dueCount} revision${dueCount === 1 ? '' : 's'} due`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
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
          <DateJump key={day} value={day} path="/today" label="Open a date" />
          <span className="kbd-hint muted" aria-hidden="true">
            N add · S start · ? help
          </span>
        </nav>
      </div>
      {!firstRun && (
        <Suspense fallback={null}>
          <Chain user={user} now={now} />
        </Suspense>
      )}
      {generationError && (
        <p role="alert" className="form-message mb-5">
          This week could not be planned: {generationError}. Check your routines
          on Plan.
        </p>
      )}
      <Suspense fallback={null}>
        <CalendarAttention user={user} />
      </Suspense>
      {running && (
        <section className="hero">
          <div>
            <p className="eyebrow">Running now</p>
            <h2>{running.task?.title ?? categoryGroup(running.category)}</h2>
            <LiveTimer
              startedAt={running.startedAt.toISOString()}
              className="live-timer-hero"
            />
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
                <Button>Stop session</Button>
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
          <RoutineIllustration className="setup-illustration" />
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">Silsila works from a weekly routine.</h2>
          <p>
            Add your first block: what, which days, what time. Today fills in
            from it, and so does the rest of the week.
          </p>
          <RoutineForm goals={goals} compact />
          <div className="mt-5">
            <Disclosure
              variant="link"
              label="Just today? Add a one-time block"
              draft={`block:${day}`}
            >
              <BlockForm day={day} zone={user.timezone} goals={goals} />
            </Disclosure>
          </div>
        </section>
      ) : (
        <>
          {blocks.length > 0 && day === today && !running && (
            <section
              className={`card launcher${summary.current ? ' is-live' : ''}`}
              aria-label="What now"
            >
              {summary.current ? (
                <>
                  <div className="launcher-main">
                    <p className="eyebrow">
                      Now · {clock(summary.current.plannedStart, user.timezone)}
                      –{clock(summary.current.plannedEnd, user.timezone)}
                    </p>
                    <h2>{summary.current.title}</h2>
                    <p className="launcher-meta">
                      {summary.next
                        ? `Next: ${summary.next.title} at ${clock(summary.next.plannedStart, user.timezone)}`
                        : 'Last block of the day'}
                      {interviewLine}
                    </p>
                  </div>
                  <ExecutionControls block={summary.current} current />
                </>
              ) : summary.next ? (
                <>
                  <div className="launcher-main">
                    <p className="eyebrow">
                      Next · {clock(summary.next.plannedStart, user.timezone)}–
                      {clock(summary.next.plannedEnd, user.timezone)}
                    </p>
                    <h2>{summary.next.title}</h2>
                    <p className="launcher-meta">
                      Starts in {startsIn(summary.next.plannedStart)}
                      {interviewLine}
                    </p>
                  </div>
                  <ExecutionControls block={summary.next} current />
                </>
              ) : (
                <>
                  <div className="launcher-main">
                    <p className="eyebrow">
                      {plan?.reviewedAt ? 'Day closed' : 'Nothing more planned'}
                    </p>
                    <h2>
                      {plan?.reviewedAt
                        ? plan.checkIn?.rating
                          ? `${plan.checkIn.rating} / 5`
                          : 'Reviewed'
                        : 'Close the day'}
                    </h2>
                    <p className="launcher-meta">
                      {progress.completed} of {progress.planned} blocks ·{' '}
                      {duration(progress.actualFocus)} recorded
                      {interviewLine}
                    </p>
                  </div>
                  {!plan?.reviewedAt && (
                    <a className="button" href="#review-heading">
                      Close the day
                    </a>
                  )}
                </>
              )}
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
                <FeedbackOutlet channel="blocks" className="mb-3" />
                <Disclosure
                  label="Add a block"
                  variant={blocks.length ? 'secondary' : 'primary'}
                  shortcut="add-block"
                  draft={`block:${day}`}
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
                      Set up routines on Plan{' '}
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </p>
                )}
                {timeline.map((entry) => {
                  if ('round' in entry) {
                    const r = entry.round;
                    return (
                      <article
                        className="execution-block is-interview"
                        key={`round-${r.id}`}
                      >
                        <div className="block-time">
                          <strong>
                            {clock(r.scheduledStart, user.timezone)}
                          </strong>
                          {r.scheduledEnd && (
                            <span className="muted">
                              {clock(r.scheduledEnd, user.timezone)}
                            </span>
                          )}
                        </div>
                        <div className="block-body">
                          <div className="row flex-wrap">
                            <div>
                              <h3>
                                <Briefcase
                                  size={16}
                                  aria-hidden="true"
                                  className="category-icon"
                                />
                                {r.application.company} — {r.title}
                              </h3>
                              <p className="muted block-origin">
                                {roundLabel(r.type)} · Interview
                              </p>
                            </div>
                            <span className="pill info">Interview</span>
                          </div>
                          <div className="actions">
                            <Link
                              className="button secondary"
                              href={`/jobs/${r.applicationId}#round-${r.id}`}
                            >
                              Open prep
                              {openPrep(r) ? ` (${openPrep(r)} open)` : ''}
                            </Link>
                            {r.meetingUrl && (
                              <ResourceLink url={r.meetingUrl}>
                                Meeting link
                              </ResourceLink>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  }
                  const block = entry.block;
                  return (
                    <article
                      className={`execution-block is-${executionTone(executionLabel(block, now)) || 'planned'}`}
                      key={block.id}
                    >
                      <div className="block-time">
                        <strong>
                          {clock(block.plannedStart, user.timezone)}
                        </strong>
                        <span className="muted">
                          {formatInTimeZone(
                            block.plannedEnd,
                            user.timezone,
                            dayKey(block.plannedEnd, user.timezone) === day
                              ? 'h:mm a'
                              : 'MMM d, h:mm a',
                          )}
                        </span>
                      </div>
                      <div className="block-body">
                        <div className="row flex-wrap">
                          <div>
                            <h3>
                              <CategoryIcon category={block.category} />
                              {block.title}
                            </h3>
                            <p className="muted block-origin">
                              {categoryGroup(block.category)} · {origin(block)}
                            </p>
                          </div>
                          <span
                            className={`pill ${executionTone(executionLabel(block, now))}`}
                          >
                            {executionLabel(block, now)}
                          </span>
                        </div>
                        {block.description && (
                          <p className="muted">{block.description}</p>
                        )}
                        {block.skipReason && (
                          <p className="muted">Skipped: {block.skipReason}</p>
                        )}
                        <ExecutionControls
                          block={block}
                          canStart={day === today}
                        />
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
                      </div>
                    </article>
                  );
                })}
              </section>
            </section>
            <aside>
              {plan?.reviewedAt && plan.checkIn ? (
                <section
                  className="card day-closed daily-review"
                  aria-labelledby="review-heading"
                >
                  <p className="eyebrow">Day closed</p>
                  <h2 id="review-heading">
                    {plan.checkIn.rating
                      ? `${plan.checkIn.rating} / 5`
                      : 'Reviewed'}
                  </h2>
                  <p className="muted">
                    {progress.completed} of {progress.planned} blocks ·{' '}
                    {duration(progress.actualFocus)} recorded
                  </p>
                  {plan.checkIn.notes && <p>{plan.checkIn.notes}</p>}
                  {plan.checkIn.blocker && (
                    <p className="muted">Blocker: {plan.checkIn.blocker}</p>
                  )}
                  {plan.checkIn.carryForward && (
                    <p className="muted">
                      Tomorrow: {plan.checkIn.carryForward}
                    </p>
                  )}
                  <Disclosure
                    variant="link"
                    label="Edit review"
                    className="mt-3"
                  >
                    <ReviewForm day={day} review={plan.checkIn} />
                  </Disclosure>
                </section>
              ) : (
                <section
                  className="card daily-review"
                  aria-labelledby="review-heading"
                >
                  <h2 id="review-heading">Daily review</h2>
                  <ReviewForm day={day} review={plan?.checkIn} />
                </section>
              )}
              {day === today && <FeedbackOutlet channel="notes" />}
              {notes.length > 0 && day === today && (
                <section className="card" aria-labelledby="notes-heading">
                  <h2 id="notes-heading">Notes to self</h2>
                  <NoteList notes={notes} />
                </section>
              )}
              {day === today && (
                <Suspense fallback={<CardSkeleton />}>
                  <TodayGoals user={user} now={now} />
                  <TodayRevision user={user} now={now} />
                  <WeeklyReviewPrompt user={user} now={now} />
                  <TodayJobs user={user} now={now} />
                  <TodayLearning user={user} now={now} blocks={blocks} />
                  {blocks.some(
                    (b) => isDsa(b.category) && b.status !== 'CANCELLED',
                  ) && <TodayDsa user={user} now={now} />}
                </Suspense>
              )}
              {notifications.length > 0 && (
                <section className="card" aria-labelledby="reminders-heading">
                  <h2 id="reminders-heading">Reminders</h2>
                  {notifications.map((n) => (
                    <div className="mb-4" key={n.id}>
                      <p>{n.title}</p>
                      <p className="muted reminder-when">
                        {formatInTimeZone(
                          n.scheduledFor,
                          user.timezone,
                          'EEE, MMM d · h:mm a',
                        )}
                      </p>
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
