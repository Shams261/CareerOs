import 'server-only';
import { jobsFunnel } from './funnel';
import { memo } from '@/server/memo';
import { db } from '@/server/db';
import { type ScheduleUser } from '@/server/lock';
import { dayBounds, dayKey } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import { weekOf } from '@/lib/day';
import {
  attentionQueue,
  followUpState,
  needsAction,
  nextRound,
  weeklyJobSummary,
} from './domain';

/** The jobs read models: the snapshot, an application, today's interviews and summary, the funnel (WI-132). */
const roundOrder = [{ scheduledStart: 'asc' as const }, { id: 'asc' as const }];

async function loadJobSnapshot(user: ScheduleUser, now = new Date()) {
  const [apps, activities, sessions, block, prefs] = await Promise.all([
    db().jobApplication.findMany({
      where: { userId: user.id },
      include: {
        rounds: {
          where: { userId: user.id },
          orderBy: roundOrder,
          include: { prepItems: { select: { completed: true } } },
        },
        activities: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    }),
    db().jobActivity.findMany({
      where: {
        userId: user.id,
        occurredAt: { gte: new Date(+now - 8 * 86400000) },
      },
      select: { type: true, toStage: true, occurredAt: true },
    }),
    db().actualSession.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: new Date(+now - 8 * 86400000) },
      },
      select: { category: true, startedAt: true, endedAt: true },
    }),
    db().timeBlock.findFirst({
      where: {
        dailyPlan: { userId: user.id },
        category: { equals: 'JOB_SEARCH', mode: 'insensitive' },
        plannedEnd: { gt: now },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { plannedStart: 'asc' },
    }),
    db().notificationPreference.findMany({
      where: { userId: user.id, type: { in: ['JOB_FOLLOW_UP', 'INTERVIEW'] } },
    }),
  ]);
  const weekly = weeklyJobSummary(
    {
      apps,
      rounds: apps.flatMap((a) => a.rounds),
      activities,
      sessions,
    },
    now,
    user.timezone,
  );
  return {
    apps: apps.map((a) => ({
      ...a,
      lastActivityAt: a.activities[0]?.occurredAt ?? a.createdAt,
    })),
    weekly,
    block,
    followUpPref: prefs.find((p) => p.type === 'JOB_FOLLOW_UP') ?? null,
    interviewPref: prefs.find((p) => p.type === 'INTERVIEW') ?? null,
  };
}

/** One application with its rounds and history, memoized like the lists (WI-061). */
export const applicationDetail = (user: ScheduleUser, id: string) =>
  memo(user.id, `application:${id}`, () => loadApplicationDetail(user, id));

async function loadApplicationDetail(user: ScheduleUser, id: string) {
  return db().jobApplication.findFirst({
    where: { id, userId: user.id },
    include: {
      rounds: {
        where: { userId: user.id },
        orderBy: roundOrder,
        include: {
          scheduleBlock: {
            select: { id: true, plannedStart: true, status: true },
          },
          prepItems: {
            where: { userId: user.id },
            orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
            include: {
              learningTopic: { include: { subject: true } },
              dsaProblem: true,
              dsaTopic: true,
            },
          },
        },
      },
      activities: {
        where: { userId: user.id },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        include: { interviewRound: { select: { title: true } } },
      },
      resources: { where: { userId: user.id } },
    },
  });
}

/** Scheduled interviews starting within the owner's calendar day. */
async function loadTodaysInterviews(user: ScheduleUser, day: string) {
  const bounds = dayBounds(day, user.timezone);
  return db().interviewRound.findMany({
    where: {
      userId: user.id,
      status: 'SCHEDULED',
      scheduledStart: { gte: bounds.start, lt: bounds.end },
      application: {
        userId: user.id,
        stage: { notIn: ['REJECTED', 'WITHDRAWN'] },
      },
    },
    include: {
      application: true,
      prepItems: {
        select: { id: true, title: true, completed: true, kind: true },
        orderBy: { ordering: 'asc' },
      },
    },
    orderBy: { scheduledStart: 'asc' },
  });
}

/** Compact Today facts. Null when the owner has no open application. */
async function loadJobTodaySummary(user: ScheduleUser, now = new Date()) {
  const [apps, block] = await Promise.all([
    db().jobApplication.findMany({
      where: { userId: user.id, stage: { notIn: ['REJECTED', 'WITHDRAWN'] } },
      include: {
        rounds: { where: { userId: user.id }, orderBy: roundOrder },
      },
    }),
    db().timeBlock.findFirst({
      where: {
        dailyPlan: { userId: user.id },
        category: { equals: 'JOB_SEARCH', mode: 'insensitive' },
        plannedEnd: { gt: now },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { plannedStart: 'asc' },
    }),
  ]);
  if (!apps.length) return null;
  const today = dayKey(now, user.timezone);
  const upcoming = apps
    .flatMap((a) => {
      const round = nextRound(a.rounds, now);
      return round ? [{ app: a, round }] : [];
    })
    .sort((a, b) => +a.round.scheduledStart - +b.round.scheduledStart)[0];
  return {
    actionRequired: apps.filter(needsAction).length,
    followUpsDue: apps.filter((a) =>
      ['overdue', 'today'].includes(followUpState(a, today).state),
    ).length,
    attention: attentionQueue(apps, now, user.timezone),
    upcoming: upcoming ?? null,
    block,
  };
}

/** Cached for a few seconds per owner; every write drops it (see src/server/memo.ts). */
export const jobSnapshot = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, `jobs:${dayKey(now, user.timezone)}`, () =>
    loadJobSnapshot(user, now),
  );

/** Cached for a few seconds per owner; every write drops it (see src/server/memo.ts). */
export const jobTodaySummary = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, `jobs-today:${dayKey(now, user.timezone)}`, () =>
    loadJobTodaySummary(user, now),
  );

/** Cached for a few seconds per owner; every write drops it (see src/server/memo.ts). */
export const todaysInterviews = (user: ScheduleUser, day: string) =>
  memo(user.id, `interviews:${day}`, () => loadTodaysInterviews(user, day));

/**
 * The applications as the funnel reads them (WI-056): stage, dates, stage history and rounds,
 * test records left out. Memoized like the Jobs snapshot; any write drops it.
 */
async function loadFunnel(user: ScheduleUser, now: Date) {
  const apps = await db().jobApplication.findMany({
    where: { userId: user.id },
    select: {
      company: true,
      role: true,
      stage: true,
      appliedAt: true,
      createdAt: true,
      activities: {
        where: { type: 'STAGE_CHANGED', toStage: { not: null } },
        select: { toStage: true },
      },
      rounds: { select: { type: true, status: true } },
    },
  });
  return jobsFunnel(
    apps
      .filter((a) => !isTestNamed(a.company, a.role))
      .map((a) => ({
        stage: a.stage,
        appliedOn: a.appliedAt ? a.appliedAt.toISOString().slice(0, 10) : null,
        addedOn: dayKey(a.createdAt, user.timezone),
        history: a.activities.map((x) => x.toStage!),
        rounds: a.rounds,
      })),
    dayKey(now, user.timezone),
    weekOf,
  );
}

export const funnelSnapshot = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, `jobs-funnel:${dayKey(now, user.timezone)}`, () =>
    loadFunnel(user, now),
  );
