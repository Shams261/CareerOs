import 'server-only';
import { db } from '@/server/db';
import { dayKey, localInstant } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import { shiftDay } from '@/features/schedule/domain';
import type { ScheduleUser } from '@/features/schedule/service';
import { MAX_WEEKS, moments, monthFacts, seasonGrid } from './domain';

const ROUND_WORDS: Record<string, string> = {
  RECRUITER: 'recruiter screen',
  ASSESSMENT: 'assessment',
  CODING: 'coding round',
  SYSTEM_DESIGN: 'system design round',
  BEHAVIORAL: 'behavioural round',
  HIRING_MANAGER: 'hiring manager chat',
  FINAL: 'final round',
  OTHER: 'interview',
  AI_ASSISTED: 'AI-assisted coding round',
  CODE_REVIEW: 'code review round',
  DEBUGGING: 'debugging round',
  PRACTICAL: 'practical coding round',
};
const firstReal = <T>(
  rows: T[],
  names: (r: T) => (string | null | undefined)[],
) => rows.find((r) => !isTestNamed(...names(r))) ?? null;

/**
 * Look Back (WI-034): the season's sessions and rest days for the grid, the earliest real
 * firsts for the moments (test-named records never count), and this month's facts.
 */
export async function lookBack(user: ScheduleUser, now = new Date()) {
  const zone = user.timezone;
  const today = dayKey(now, zone);
  const first = await db().actualSession.findFirst({
    where: { userId: user.id },
    orderBy: { startedAt: 'asc' },
    select: { startedAt: true },
  });
  if (!first) return null;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const windowStart = shiftDay(
    shiftDay(today, -((weekday + 6) % 7)),
    -7 * (MAX_WEEKS - 1),
  );
  const from = localInstant(windowStart, '00:00', zone);
  const monthStart = localInstant(`${today.slice(0, 8)}01`, '00:00', zone);
  const recent = { gte: from };
  const [
    sessions,
    rests,
    own,
    done,
    rounds,
    finals,
    offers,
    week,
    attempts,
    doneMonth,
    revisedMonth,
    roundsMonth,
  ] = await Promise.all([
    db().actualSession.findMany({
      where: { userId: user.id, startedAt: recent },
      select: { startedAt: true, endedAt: true, category: true },
      orderBy: { startedAt: 'asc' },
    }),
    db().dailyPlan.findMany({
      where: {
        userId: user.id,
        restAt: { not: null },
        date: { gte: new Date(windowStart) },
      },
      select: { date: true },
    }),
    db().dsaAttempt.findMany({
      where: { userId: user.id, solvedIndependently: 'YES' },
      orderBy: { attemptedAt: 'asc' },
      take: 5,
      select: { attemptedAt: true, problem: { select: { title: true } } },
    }),
    db().roadmapItem.findMany({
      where: { userId: user.id, status: 'DONE', completedAt: { not: null } },
      orderBy: { completedAt: 'asc' },
      take: 5,
      select: {
        completedAt: true,
        title: true,
        roadmap: { select: { title: true } },
      },
    }),
    db().interviewRound.findMany({
      where: {
        userId: user.id,
        status: { in: ['SCHEDULED', 'COMPLETED'] },
        scheduledStart: { lte: now },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 5,
      select: {
        scheduledStart: true,
        title: true,
        type: true,
        application: { select: { company: true } },
      },
    }),
    db().interviewRound.findMany({
      where: {
        userId: user.id,
        type: 'FINAL',
        status: { in: ['SCHEDULED', 'COMPLETED'] },
        scheduledStart: { lte: now },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 5,
      select: {
        scheduledStart: true,
        title: true,
        type: true,
        application: { select: { company: true } },
      },
    }),
    db().jobActivity.findMany({
      where: { userId: user.id, toStage: 'OFFER' },
      orderBy: { occurredAt: 'asc' },
      take: 5,
      select: { occurredAt: true, application: { select: { company: true } } },
    }),
    db().weeklyReview.findFirst({
      where: { userId: user.id, completedAt: { not: null } },
      orderBy: { completedAt: 'asc' },
      select: { completedAt: true },
    }),
    db().dsaAttempt.findMany({
      where: { userId: user.id, attemptedAt: { gte: monthStart, lte: now } },
      select: {
        solvedIndependently: true,
        problem: { select: { title: true } },
      },
    }),
    db().roadmapItem.findMany({
      where: { userId: user.id, completedAt: { gte: monthStart, lte: now } },
      select: { title: true },
    }),
    db().roadmapItem.findMany({
      where: { userId: user.id, lastRevisedAt: { gte: monthStart, lte: now } },
      select: { title: true },
    }),
    db().interviewRound.findMany({
      where: {
        userId: user.id,
        status: { in: ['SCHEDULED', 'COMPLETED'] },
        scheduledStart: { gte: monthStart, lte: now },
      },
      select: { title: true, application: { select: { company: true } } },
    }),
  ]);
  const ownSolve = firstReal(own, (r) => [r.problem.title]);
  const roadmap = firstReal(done, (r) => [r.title, r.roadmap.title]);
  const interview = firstReal(rounds, (r) => [r.title, r.application.company]);
  const final = firstReal(finals, (r) => [r.title, r.application.company]);
  const offer = firstReal(offers, (r) => [r.application.company]);
  return {
    grid: seasonGrid({
      sessions,
      restDays: rests.map((r) => r.date.toISOString().slice(0, 10)),
      firstDay: dayKey(first.startedAt, zone),
      today,
      zone,
      now,
    }),
    moments: moments(
      {
        firstSession: first.startedAt,
        firstOwnSolve: ownSolve
          ? { at: ownSolve.attemptedAt, title: ownSolve.problem.title }
          : null,
        firstRoadmapDone: roadmap?.completedAt
          ? { at: roadmap.completedAt, title: roadmap.title }
          : null,
        firstInterview: interview
          ? {
              at: interview.scheduledStart,
              company: interview.application.company,
              round: ROUND_WORDS[interview.type] ?? 'interview',
            }
          : null,
        firstFinal: final
          ? {
              at: final.scheduledStart,
              company: final.application.company,
              round: ROUND_WORDS[final.type] ?? 'final round',
            }
          : null,
        firstOffer: offer
          ? { at: offer.occurredAt, company: offer.application.company }
          : null,
        firstWeekReviewed: week?.completedAt ? { at: week.completedAt } : null,
      },
      zone,
    ),
    month: monthFacts({
      sessions: sessions.filter((s) => +s.startedAt >= +monthStart),
      attempts: attempts
        .filter((a) => !isTestNamed(a.problem.title))
        .map((a) => ({ own: a.solvedIndependently === 'YES' })),
      roadmapDone: doneMonth.filter((i) => !isTestNamed(i.title)).length,
      roadmapRevised: revisedMonth.filter((i) => !isTestNamed(i.title)).length,
      rounds: roundsMonth.filter(
        (r) => !isTestNamed(r.title, r.application.company),
      ).length,
      zone,
      now,
    }),
  };
}
