import { Suspense } from 'react';
import { CalendarAttention } from '@/features/calendar/panel';
import { RoutineIllustration } from '@/components/illustrations';
import { Disclosure } from '@/components/disclosure';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PageShortcuts } from '@/components/shortcuts';
import { db, owner } from '@/server/db';
import { dayKey, dayBounds } from '@/lib/time';
import { generateThroughSunday } from '@/features/schedule/service';
import { dateInput, shiftDay } from '@/features/schedule/domain';
import {
  BlockForm,
  CategoryOptions,
  ReviewForm,
  RoutineForm,
} from '@/features/schedule/forms';
import { ExecutionRefresh } from '@/features/execution/refresh';
import { Chain } from '@/features/roadmap/summary';
import { todaysInterviews } from '@/features/jobs/service';
import { openNotes } from '@/features/notes/service';
import { NoteList } from '@/features/notes/forms';
import {
  agendaEntries,
  daySummary,
  launcherState,
  summaryLine,
  type RoundLike,
} from '@/features/today/domain';
import { TodayHeader } from '@/features/today/header';
import { Launcher } from '@/features/today/launcher';
import { Agenda } from '@/features/today/agenda';
import { Attention, AttentionSkeleton } from '@/features/today/attention';
import { AttentionBoundary } from '@/features/today/attention-boundary';
import { SidePanel } from '@/features/today/panels';
export const metadata = { title: 'Today' };

/**
 * Today as an agenda (WI-020): a compact launcher, the day as an open list, one bounded
 * "needs attention" list, and the review, activity and notes behind panels opened on demand.
 */
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
    bounds = dayBounds(day, user.timezone),
    isToday = day === today;
  let generationError = '';
  if (isToday)
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
    routines,
    interviews,
    notes,
    notifications,
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
    db().routineBlock.count({ where: { userId: user.id } }),
    todaysInterviews(user, day),
    isToday ? openNotes(user.id) : Promise.resolve([]),
    isToday
      ? db().notificationLog.findMany({
          where: { userId: user.id, readAt: null, scheduledFor: { lte: now } },
          orderBy: { scheduledFor: 'desc' },
          select: {
            id: true,
            type: true,
            title: true,
            scheduledFor: true,
            dedupeKey: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const blocks = plan?.blocks ?? [];
  const rounds: RoundLike[] = interviews.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    applicationId: r.applicationId,
    company: r.application.company,
    scheduledStart: r.scheduledStart,
    scheduledEnd: r.scheduledEnd,
    openPrep: r.prepItems.filter((p) => p.kind === 'PREP' && !p.completed)
      .length,
    meetingUrl: r.meetingUrl,
  }));
  const entries = agendaEntries(blocks, rounds);
  const summary = daySummary(blocks, sessions, bounds, now);
  // The launcher follows the session record first; a running session on another day is
  // reached through the shell strip, so only today's launcher shows it.
  const state = isToday
    ? launcherState(
        blocks,
        running
          ? {
              id: running.id,
              startedAt: running.startedAt,
              category: running.category,
              taskId: running.taskId,
              title: running.task?.title ?? null,
            }
          : null,
        now,
      )
    : null;
  const launcherBlockId =
    state?.kind === 'running'
      ? (state.block?.id ?? null)
      : state?.kind === 'current' || state?.kind === 'next'
        ? state.block.id
        : null;
  // Until the first routine exists Today is a single card with one job.
  const firstRun = isToday && !routines && !blocks.length && !running;
  const reviewed = !!plan?.reviewedAt && !!plan.checkIn;
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
      {firstRun ? (
        <>
          <p className="eyebrow">Today</p>
          <h1>Start here</h1>
          <section
            className="card setup-card mt-5"
            aria-labelledby="setup-heading"
          >
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
        </>
      ) : (
        <>
          <TodayHeader
            day={day}
            today={today}
            zone={user.timezone}
            bounds={bounds}
            summary={summaryLine(summary)}
            noteCount={notes.length}
            reviewed={day > today ? null : reviewed}
          />
          {generationError && (
            <p role="alert" className="form-message mb-5">
              This week could not be planned: {generationError}. Check your
              routines on Plan.
            </p>
          )}
          <Suspense fallback={null}>
            <CalendarAttention user={user} />
          </Suspense>
          <div className={`today-workspace${isToday ? ' is-today' : ''}`}>
            {state && (
              <Launcher
                state={state}
                blocks={blocks}
                rounds={rounds}
                zone={user.timezone}
                now={now}
              />
            )}
            <Agenda
              entries={entries}
              blocks={blocks}
              day={day}
              today={today}
              zone={user.timezone}
              now={now}
              goals={goals}
              launcherBlockId={launcherBlockId}
            />
            {isToday && (
              <aside className="today-rail" aria-labelledby="attention-heading">
                <AttentionBoundary>
                  <Suspense fallback={<AttentionSkeleton />}>
                    <Attention
                      user={user}
                      now={now}
                      interviews={rounds}
                      notifications={notifications}
                    />
                  </Suspense>
                </AttentionBoundary>
              </aside>
            )}
          </div>
          {day <= today && (
            <SidePanel
              id="review"
              title={reviewed ? 'Edit review' : 'Review day'}
            >
              <p className="muted">{summaryLine(summary)}</p>
              {reviewed && plan?.checkIn && (
                <p className="muted">
                  Reviewed{' '}
                  {plan.checkIn.completedAt
                    ? `· ${new Intl.DateTimeFormat('en', { timeZone: user.timezone, hour: 'numeric', minute: '2-digit' }).format(plan.checkIn.completedAt)}`
                    : ''}
                </p>
              )}
              <ReviewForm day={day} review={plan?.checkIn} />
            </SidePanel>
          )}
          {isToday && (
            <SidePanel id="activity" title="Activity">
              <p className="muted">
                The last fourteen days: a ring fills when work was recorded, a
                dot marks a reviewed day. Open a day to see it.
              </p>
              <Suspense fallback={null}>
                <Chain user={user} now={now} />
              </Suspense>
            </SidePanel>
          )}
          {isToday && (
            <SidePanel
              id="notes"
              title={
                notes.length
                  ? `Notes to self · ${notes.length}`
                  : 'Notes to self'
              }
            >
              <FeedbackOutlet channel="notes" className="mb-3" />
              {notes.length ? (
                <NoteList notes={notes} />
              ) : (
                <p className="muted">
                  Nothing waiting. The note field in the sidebar lands here.
                </p>
              )}
            </SidePanel>
          )}
        </>
      )}
    </>
  );
}
