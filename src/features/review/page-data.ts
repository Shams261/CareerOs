import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';
import { dayKey } from '@/lib/time';
import { shiftDay } from '@/lib/day';
import { getPatterns } from '@/features/agent/tools';
import { patternLine } from '@/features/agent/plan-domain';
import { summaryOn } from '@/features/agent/summary';
import { remindersPreview } from '@/features/notifications/preview';
import {
  currentWeek,
  defaultReviewWeek,
  isMonday,
  lastReviewQuote,
  reviewWeekParam,
  weekSummary,
} from './domain';
import {
  carryForward,
  nextWeekContext,
  recentTrend,
  reviewHistory,
  weekReview,
} from './service';
import { readStep, reviewHref, type Step } from './labels';

/**
 * Everything the Weekly review page shows, read in one place (WI-125). Each step loads only
 * what it shows and Details loads everything; the page itself only composes the steps.
 */
export async function reviewPage(
  user: ScheduleUser,
  query: { week?: string; step?: string },
  now: Date,
) {
  const zone = user.timezone;
  const thisWeek = currentWeek(now, zone),
    today = dayKey(now, zone);
  // On a Monday with last week's review still open, the page opens on last week.
  const lastWeekCompleted =
    !query.week && isMonday(today)
      ? !!(
          await db().weeklyReview.findUnique({
            where: {
              userId_weekStart: {
                userId: user.id,
                weekStart: new Date(shiftDay(thisWeek, -7)),
              },
            },
            select: { completedAt: true },
          })
        )?.completedAt
      : true;
  // Any real day snaps to its Monday; a date that does not exist falls back (WI-097).
  const monday = reviewWeekParam(
    query.week,
    defaultReviewWeek(today, lastWeekCompleted),
  );
  const openLastWeek = !query.week && monday !== thisWeek;
  const step = readStep(query.step);
  const nextMonday = shiftDay(monday, 7);
  const planning = monday >= thisWeek;
  const details = step === 'details',
    plan = step === 'plan' || details;
  const [
    w,
    carry,
    next,
    trend,
    history,
    goals,
    reminders,
    habits,
    summaryShown,
  ] = await Promise.all([
    weekReview(user, monday, now),
    details ? carryForward(user, now) : { dsa: [], learning: [], jobs: [] },
    plan && planning ? nextWeekContext(user, nextMonday, now) : null,
    details ? recentTrend(user, monday, now) : [],
    details ? reviewHistory(user.id) : [],
    plan
      ? db().goal.findMany({
          where: { userId: user.id },
          select: { id: true, title: true },
        })
      : [],
    plan ? remindersPreview(user, nextMonday) : [],
    // WI-041: the owner's patterns over the last four weeks, on the first two steps.
    step === 'week' || step === 'reflect' ? getPatterns(user, now) : null,
    // WI-110: the summary button shows on step one while Rumi writes the lines.
    step === 'week' ? summaryOn(user) : false,
  ]);
  const s = w.schedule;
  const status = w.review?.completedAt
    ? 'Completed'
    : w.review
      ? 'Draft'
      : 'Not started';
  return {
    now,
    zone,
    today,
    thisWeek,
    monday,
    nextMonday,
    step,
    planning,
    w,
    s,
    carry,
    next,
    trend,
    history,
    goals,
    remindersOn: reminders.filter((r) => r.on),
    habitLine: habits ? patternLine(habits) : null,
    summaryShown,
    summary: weekSummary(s.days),
    weekEmpty: s.totals.planned === 0 && s.focus.actual === 0,
    max: Math.max(
      s.focus.planned,
      s.focus.actual,
      ...s.rows.map((r) => Math.max(r.planned, r.actual)),
      1,
    ),
    // The review looks back: › stops at this week (WI-097).
    hasNext: monday < thisWeek,
    priorities: w.review?.priorities ?? [],
    lastQuote: w.lastReview ? lastReviewQuote(w.lastReview) : null,
    status,
    weekWord: w.isCurrent
      ? 'This week'
      : monday > thisWeek
        ? 'Upcoming week'
        : openLastWeek
          ? 'Last week, not yet reviewed'
          : 'Past week',
    href: (to: Step, week = monday) => reviewHref(to, week),
  };
}
export type ReviewView = Awaited<ReturnType<typeof reviewPage>>;
