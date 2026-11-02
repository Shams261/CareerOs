import 'server-only';
import { db, type owner } from '@/server/db';
import { ownerWords } from '@/lib/action-error';
import { dayBounds, dayKey, hhmm, weekdayDate } from '@/lib/time';
import { shiftDay } from '@/lib/day';
import { generateThroughSunday } from '@/features/schedule/service';
import { dateInput } from '@/features/schedule/domain';
import { todaysInterviews, jobTodaySummary } from '@/features/jobs/service';
import { openNotes } from '@/features/notes/service';
import { revisionDue } from '@/features/roadmap/service';
import { dsaSnapshot } from '@/features/dsa/service';
import { noticedFor } from '@/features/noticed/service';
import { setupState } from '@/features/setup/service';
import { isDeleted } from '@/features/deletes/domain';
import { todaysNudge } from '@/features/nudges/service';
import { dayPrint } from '@/features/day-print/domain';
import { closeDayOpen } from '@/features/close-day/domain';
import { previewSlots, stopTime } from '@/features/close-day/service';
import { weekProgress } from './home';
import {
  agendaEntries,
  daySummary,
  launcherState,
  recentFacts,
  type RoundLike,
} from './domain';

export type TodayOwner = Awaited<ReturnType<typeof owner>>;

/**
 * Everything Today shows outside its streamed parts, read in one place (WI-128). Everything
 * independent starts together; only the day's plan waits for the week's generation, and the
 * snapshots the streamed parts read start first so they load alongside (WI-061).
 */
export async function todayPage(
  user: TodayOwner,
  query: { date?: string },
  now: Date,
) {
  const today = dayKey(now, user.timezone);
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
  // Start the snapshots the streamed parts read, so they load alongside the page instead of
  // after it (WI-061). They are memoized: the parts take the same promises.
  if (isToday)
    for (const preload of [
      jobTodaySummary(user, now),
      revisionDue(user, now),
      dsaSnapshot(user),
      noticedFor(user, now),
      setupState(user),
    ])
      preload.catch(() => undefined);
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
          generationError = ownerWords(error) ?? 'Unable to plan this week.';
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
  // The goal on Today (WI-060): the nearest active goal by date, edited in a panel here.
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
  // The nudge's block, with its window today and the same window tomorrow.
  const nudgeBlock = nudge?.blockId
    ? blocks.find((x) => x.id === nudge.blockId)
    : null;
  const window = (b: (typeof blocks)[number]) =>
    `${hhmm(b.plannedStart, user.timezone)}–${hhmm(b.plannedEnd, user.timezone)}`;
  // The Day Print (WI-033): the closed day's picture; while it is open, today's live rings.
  const print = (letGo: boolean) =>
    dayPrint({
      day,
      bounds,
      sessions,
      letGo: letGo
        ? blocks.filter(
            (b) => b.status === 'SKIPPED' && b.skipReason === 'Let go',
          ).length
        : 0,
      rested: letGo ? !!plan?.restAt : false,
      now,
    });
  return {
    user,
    now,
    today,
    day,
    bounds,
    isToday,
    generationError,
    yesterday,
    monday,
    plan,
    sessions,
    running,
    goals,
    routines,
    notes,
    nudge,
    nudgeBlock: nudgeBlock
      ? {
          id: nudgeBlock.id,
          title: nudgeBlock.title,
          status: nudgeBlock.status,
          window: window(nudgeBlock),
          tomorrow: `${weekdayDate(shiftDay(day, 1))} · ${window(nudgeBlock)}`,
        }
      : null,
    blocks,
    nearestGoal,
    facts,
    rounds,
    entries: agendaEntries(blocks, rounds),
    summary,
    state,
    launcherBlockId:
      state?.kind === 'running'
        ? (state.block?.id ?? null)
        : state?.kind === 'current' || state?.kind === 'next'
          ? state.block.id
          : null,
    // Until the first routine exists Today is a single card with one job.
    firstRun: isToday && !routines && !blocks.length && !running,
    reviewed,
    closing,
    preview,
    closedPrint: reviewed && user.dayPrint !== false ? print(true) : null,
    livePrint: isToday && !reviewed ? print(false) : null,
    week: weekProgress({
      done: weekBlocks.filter((b) => b.status === 'COMPLETED').length,
      planned: weekBlocks.filter(
        (b) => b.status !== 'CANCELLED' && !isDeleted(b),
      ).length,
    }),
  };
}
export type TodayView = Awaited<ReturnType<typeof todayPage>>;
