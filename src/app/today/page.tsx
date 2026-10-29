import { ConfirmDelete } from '@/components/confirm-delete';
import { deleteGoalAction } from '@/features/deletes/actions';
import { Suspense } from 'react';
import { SetupRail } from '@/features/setup/rail';
import { FirstRunToday } from '@/features/today/first-run';
import { CalendarAttention } from '@/features/calendar/panel';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PageShortcuts } from '@/components/shortcuts';
import { db, owner } from '@/server/db';
import { dayKey, dayBounds, hhmm, weekdayDate } from '@/lib/time';
import { generateThroughSunday } from '@/features/schedule/service';
import { dateInput, shiftDay } from '@/features/schedule/domain';
import { CategoryOptions, ReviewForm } from '@/features/schedule/forms';
import { ExecutionRefresh } from '@/features/execution/refresh';
import { Chain } from '@/features/roadmap/summary';
import { todaysInterviews } from '@/features/jobs/service';
import { openNotes } from '@/features/notes/service';
import { CaptureForm, NoteList } from '@/features/notes/forms';
import {
  agendaEntries,
  daySummary,
  factsLine,
  launcherState,
  quietYesterday,
  recentFacts,
  summaryLine,
  type RoundLike,
} from '@/features/today/domain';
import { forTodayPicks } from '@/features/for-today/service';
import { jobTodaySummary } from '@/features/jobs/service';
import { revisionDue } from '@/features/roadmap/service';
import { dsaSnapshot } from '@/features/dsa/service';
import { noticedFor } from '@/features/noticed/service';
import { setupState } from '@/features/setup/service';
import { isDeleted } from '@/features/deletes/domain';
import { TodayHeader } from '@/features/today/header';
import { Launcher } from '@/features/today/launcher';
import { Agenda } from '@/features/today/agenda';
import { Attention, AttentionSkeleton } from '@/features/today/attention';
import { AttentionBoundary } from '@/features/today/attention-boundary';
import { PanelButton, SidePanel } from '@/features/today/panels';
import { targetLabel } from '@/features/roadmap/domain';
import { headerLine, weekProgress } from '@/features/today/home';
import { WeekCard } from '@/features/today/week-card';
import { horizonLabel } from '@/features/goals/horizon';
import { GoalForm } from '@/features/roadmap/forms';
import { NudgeCard } from '@/features/nudges/card';
import { NudgesOffCard } from '@/features/nudges/off-card';
import { todaysNudge } from '@/features/nudges/service';
import { CloseDayForm } from '@/features/close-day/form';
import { DayPrintCard } from '@/features/day-print/print';
import { dayPrint } from '@/features/day-print/domain';
import { closeDayOpen } from '@/features/close-day/domain';
import { previewSlots, stopTime } from '@/features/close-day/service';

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
  // The week so far as facts (WI-059): yesterday's blocks and this week's time, today only.
  const yesterday = shiftDay(today, -1);
  const monday = shiftDay(
    today,
    -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7),
  );
  const from = monday < yesterday ? monday : yesterday;
  // Start the snapshots the streamed parts and For today read, so they load alongside the page
  // instead of after it (WI-061). They are memoized: the parts below take the same promises.
  if (isToday)
    for (const preload of [
      jobTodaySummary(user, now),
      revisionDue(user, now),
      dsaSnapshot(user),
      noticedFor(user, now),
      setupState(user),
      forTodayPicks(user, now),
    ])
      preload.catch(() => undefined);
  // Everything independent starts together; only today's plan waits for the week's generation.
  const [
    plan,
    sessions,
    running,
    goals,
    routines,
    interviews,
    notes,
    nudge,
    stop,
    pastBlocks,
    weekSessions,
    weekBlocks,
  ] = await Promise.all([
    (isToday
      ? generateThroughSunday(user, today).catch((error) => {
          generationError =
            error instanceof Error
              ? error.message
              : 'Unable to plan this week.';
        })
      : Promise.resolve()
    ).then(() =>
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
    ),
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
    // Full rows: the block form lists them, and the nearest active one is Today's goal line.
    db().goal.findMany({ where: { userId: user.id } }),
    db().routineBlock.count({ where: { userId: user.id } }),
    todaysInterviews(user, day),
    isToday ? openNotes(user.id) : Promise.resolve([]),
    isToday ? todaysNudge(user, day) : Promise.resolve(null),
    day <= today ? stopTime(user.id) : Promise.resolve(null),
    isToday
      ? db().timeBlock.findMany({
          where: {
            dailyPlan: {
              userId: user.id,
              date: { gte: new Date(from), lte: new Date(yesterday) },
            },
          },
          select: {
            status: true,
            plannedStart: true,
            plannedEnd: true,
            dailyPlan: { select: { date: true } },
            _count: { select: { sessions: true } },
          },
        })
      : Promise.resolve([]),
    isToday
      ? db().actualSession.findMany({
          where: {
            userId: user.id,
            startedAt: {
              gte: dayBounds(monday, user.timezone).start,
              lte: now,
            },
          },
          select: { startedAt: true, endedAt: true },
        })
      : Promise.resolve([]),
    // This week's blocks, Monday to Sunday, for the rail's This week (WI-065).
    isToday
      ? db().timeBlock.findMany({
          where: {
            dailyPlan: {
              userId: user.id,
              date: {
                gte: new Date(monday),
                lte: new Date(shiftDay(monday, 6)),
              },
            },
          },
          select: { status: true, skipReason: true },
        })
      : Promise.resolve([]),
  ]);
  // A deleted block stays only for the calendar sync and Undo (WI-060).
  const blocks = (plan?.blocks ?? []).filter((b) => !isDeleted(b));
  // The goal on Today (WI-060): the nearest active goal by date, edited in a panel here. It
  // comes from the goals already loaded; Roadmap keeps the item counts.
  const nearestGoal =
    goals
      .filter((g) => g.status === 'ACTIVE')
      .sort(
        (a, b) => +(a.targetDate ?? Infinity) - +(b.targetDate ?? Infinity),
      )[0] ?? null;
  const facts = isToday
    ? recentFacts({
        past: pastBlocks.map((b) => ({
          day: b.dailyPlan.date.toISOString().slice(0, 10),
          status: b.status,
          plannedStart: b.plannedStart,
          plannedEnd: b.plannedEnd,
          sessions: b._count.sessions,
        })),
        todayBlocks: blocks,
        sessions: weekSessions,
        monday,
        yesterday,
        now,
      })
    : null;

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
              notes: running.notes,
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
  // Close the Day (WI-029) takes over the review on a past day and from the stop time.
  const closing =
    !!stop &&
    closeDayOpen({
      day,
      today,
      now,
      zone: user.timezone,
      stopTime: stop,
      reviewed,
    });
  const preview = closing ? await previewSlots(user, blocks, today, now) : null;
  // Nothing current or next and the day still open: the launcher offers the first "For
  // today" pick instead of looking back (WI-059). A failed read only drops the offer.
  const free =
    isToday &&
    !closing &&
    !!state &&
    (state.kind === 'reconcile' || (state.kind === 'done' && !reviewed));
  const picks = free ? await forTodayPicks(user, now).catch(() => []) : [];
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
        <FirstRunToday
          user={user}
          day={day}
          bounds={bounds}
          goals={goals}
          picks={await forTodayPicks(user, now).catch(() => [])}
        />
      ) : (
        <>
          <TodayHeader
            day={day}
            today={today}
            zone={user.timezone}
            bounds={bounds}
            summary={summary}
            running={!!running}
            renderedAt={now.toISOString()}
            noteCount={notes.length}
            reviewed={day > today ? null : reviewed}
            closing={closing}
            rested={!!plan?.restAt}
            cheer={
              isToday
                ? headerLine({
                    completed: summary.completed,
                    planned: summary.planned,
                    day,
                  })
                : ''
            }
            goalChip={
              isToday ? (
                <PanelButton panel="goal" className="today-chip-button">
                  <span className="today-chip-label">Your goal</span>
                  {nearestGoal ? (
                    <>
                      <strong>
                        {targetLabel(
                          nearestGoal.targetDate?.toISOString().slice(0, 10) ??
                            null,
                          today,
                        )}
                      </strong>
                      {/* "This week · Finish Arrays & Hashing" (WI-064). */}
                      <span className="today-chip-sub">
                        {[
                          horizonLabel(
                            nearestGoal.targetDate
                              ?.toISOString()
                              .slice(0, 10) ?? null,
                            today,
                          ),
                          nearestGoal.title,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </>
                  ) : (
                    <strong>Set a goal</strong>
                  )}
                </PanelButton>
              ) : null
            }
            goalAction={
              isToday ? (
                <PanelButton panel="goal" className="link-button today-util">
                  {nearestGoal ? 'Edit goal' : 'Set a goal'}
                </PanelButton>
              ) : null
            }
          />
          {isToday && (
            <SidePanel
              id="goal"
              title={nearestGoal ? 'Edit goal' : 'Set a goal'}
            >
              {/* A new goal is the short form; editing shows status, so it can be marked done. */}
              <GoalForm
                goal={nearestGoal ?? undefined}
                compact={!nearestGoal}
              />
              {nearestGoal && (
                <div className="panel-danger">
                  <ConfirmDelete
                    action={deleteGoalAction}
                    id={nearestGoal.id}
                    label="Delete goal"
                    question={`Delete the goal ${nearestGoal.title}? Its roadmaps, routines and blocks stay, no longer linked to it.`}
                  />
                </div>
              )}
            </SidePanel>
          )}
          {generationError && (
            <p role="alert" className="form-message mb-5">
              This week could not be planned: {generationError}. Check your
              routines on Plan.
            </p>
          )}
          {/* Outside the card: the answer stays visible after the card closes. */}
          {isToday && <FeedbackOutlet channel="nudge" className="mb-4" />}
          {nudge &&
            (() => {
              const b = nudge.blockId
                ? blocks.find((x) => x.id === nudge.blockId)
                : null;
              const tomorrow = shiftDay(day, 1);
              return (
                <>
                  <NudgeCard
                    nudge={nudge}
                    day={day}
                    block={
                      b
                        ? {
                            id: b.id,
                            title: b.title,
                            status: b.status,
                            window: `${hhmm(b.plannedStart, user.timezone)}–${hhmm(b.plannedEnd, user.timezone)}`,
                            tomorrow: `${weekdayDate(tomorrow)} · ${hhmm(b.plannedStart, user.timezone)}–${hhmm(b.plannedEnd, user.timezone)}`,
                          }
                        : null
                    }
                  />
                </>
              );
            })()}
          {/* The Day Print (WI-033): a closed day's records as a picture, unless removed. */}
          <FeedbackOutlet channel="day-print" className="mb-4" />
          {reviewed && user.dayPrint !== false && (
            <DayPrintCard
              model={dayPrint({
                day,
                bounds,
                sessions,
                letGo: blocks.filter(
                  (b) => b.status === 'SKIPPED' && b.skipReason === 'Let go',
                ).length,
                rested: !!plan?.restAt,
                now,
              })}
              day={day}
              isToday={isToday}
              ask={user.dayPrint == null}
            />
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
                closing={closing}
                closed={reviewed}
                pick={picks[0] ?? null}
                quiet={
                  facts?.yesterday && quietYesterday(facts)
                    ? { ...facts.yesterday, day: yesterday }
                    : null
                }
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
              hasRoutines={routines > 0}
            />
            {isToday && (
              <aside className="today-rail" aria-labelledby="attention-heading">
                {/* This week first, then what needs attention (WI-065). */}
                <WeekCard
                  week={weekProgress({
                    done: weekBlocks.filter((b) => b.status === 'COMPLETED')
                      .length,
                    planned: weekBlocks.filter(
                      (b) => b.status !== 'CANCELLED' && !isDeleted(b),
                    ).length,
                  })}
                  weekKey={monday}
                  facts={facts ? factsLine(facts) : ''}
                />
                <AttentionBoundary>
                  <Suspense fallback={<AttentionSkeleton />}>
                    <Attention
                      user={user}
                      now={now}
                      interviews={rounds}
                      blocks={blocks}
                    />
                  </Suspense>
                </AttentionBoundary>
                <Suspense fallback={null}>
                  <SetupRail user={user} />
                </Suspense>
                <Suspense fallback={null}>
                  <NudgesOffCard user={user} />
                </Suspense>
              </aside>
            )}
          </div>
          {day <= today && (
            <SidePanel
              id="review"
              title={
                closing
                  ? 'Close the day'
                  : reviewed
                    ? 'Edit review'
                    : 'Review day'
              }
            >
              {/* Closing the day while a session runs would leave it open (WI-066). */}
              {running && (
                <p className="form-message" role="status">
                  A session is still running. Stop or complete it before you
                  close the day.
                </p>
              )}
              {closing && preview ? (
                <CloseDayForm
                  day={day}
                  zone={user.timezone}
                  now={now}
                  blocks={blocks}
                  rounds={rounds}
                  summary={summaryLine(summary)}
                  note={plan?.checkIn?.notes ?? ''}
                  rested={!!plan?.restAt}
                  running={!!running}
                  target={preview.target}
                  slots={preview.slots}
                  isToday={isToday}
                />
              ) : (
                <>
                  <p className="muted">{summaryLine(summary)}</p>
                  {reviewed && plan?.checkIn && (
                    <p className="muted">
                      Reviewed
                      {plan.checkIn.completedAt
                        ? ` · ${hhmm(plan.checkIn.completedAt, user.timezone)}`
                        : ''}
                    </p>
                  )}
                  <ReviewForm day={day} review={plan?.checkIn} />
                </>
              )}
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
              {/* The note field left the sidebar (WI-063); notes are written here or from ⌘K. */}
              <CaptureForm />
              <FeedbackOutlet channel="notes" className="mb-3" />
              {notes.length ? (
                <NoteList notes={notes} />
              ) : (
                <p className="muted">
                  Nothing waiting. ⌘K → Add a note works anywhere.
                </p>
              )}
            </SidePanel>
          )}
        </>
      )}
    </>
  );
}
