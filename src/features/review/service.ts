import 'server-only';
import { db } from '@/server/db';
import { dayKey } from '@/lib/time';
import { localTime } from '@/lib/validation';
import { shiftDay } from '@/features/schedule/domain';
import {
  generatePlan,
  locked,
  type ScheduleUser,
} from '@/features/schedule/service';
import {
  eligible as learningEligible,
  learningSuggestions,
} from '@/features/learning/domain';
import { isFocusCategory } from '@/features/schedule/domain';
import { z } from 'zod';
import {
  dsaWeek,
  jobWeek,
  learningWeek,
  MAX_PRIORITIES,
  priorityInput,
  reviewInput,
  routinePreview,
  scheduleWeek,
  weekBounds,
  type WeekBounds,
} from './domain';

const date = (d: string) => new Date(d);
const daysOf = (d: Date) => d.toISOString().slice(0, 10);

async function scheduleData(userId: string, b: WeekBounds) {
  const [plans, sessions] = await Promise.all([
    db().dailyPlan.findMany({
      where: { userId, date: { gte: date(b.monday), lte: date(b.sunday) } },
      include: { blocks: true },
    }),
    db().actualSession.findMany({
      where: {
        userId,
        startedAt: { lt: b.end },
        OR: [{ endedAt: null }, { endedAt: { gt: b.start } }],
      },
    }),
  ]);
  const blocks = plans.flatMap((p) =>
    p.blocks.map((x) => ({ ...x, day: daysOf(p.date) })),
  );
  return { blocks, sessions };
}

/**
 * Everything the review page shows for one owner week. Metrics are LIVE: recomputed from source
 * history on every read, so a session logged later changes past weeks. Only the owner's writing
 * (review text and priorities) is stored.
 */
export async function weekReview(
  user: ScheduleUser,
  monday: string,
  now = new Date(),
) {
  const b = weekBounds(monday, user.timezone);
  const today = dayKey(now, user.timezone);
  const { blocks, sessions } = await scheduleData(user.id, b);
  const [
    attempts,
    problems,
    activities,
    apps,
    rounds,
    jobActivities,
    owner,
    review,
    previous,
    reflections,
    goals,
  ] = await Promise.all([
    db().dsaAttempt.findMany({
      where: { userId: user.id, attemptedAt: { gte: b.start, lt: b.end } },
    }),
    db().dsaProblem.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        confidence: true,
        attemptsCount: true,
        nextRevisionAt: true,
      },
    }),
    db().learningActivity.findMany({
      where: { userId: user.id, performedAt: { gte: b.start, lt: b.end } },
    }),
    db().jobApplication.findMany({ where: { userId: user.id } }),
    db().interviewRound.findMany({ where: { userId: user.id } }),
    db().jobActivity.findMany({
      where: { userId: user.id, occurredAt: { gte: b.start, lt: b.end } },
    }),
    db().user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        currentDsaTopic: { select: { name: true } },
        currentSubject: { select: { name: true } },
      },
    }),
    db().weeklyReview.findUnique({
      where: { userId_weekStart: { userId: user.id, weekStart: date(monday) } },
      include: { priorities: { orderBy: { ordering: 'asc' } } },
    }),
    // Priorities chosen last week are this week's commitments.
    db().weeklyReview.findUnique({
      where: {
        userId_weekStart: {
          userId: user.id,
          weekStart: date(shiftDay(monday, -7)),
        },
      },
      include: { priorities: { orderBy: { ordering: 'asc' } } },
    }),
    db().interviewRound.findMany({
      where: {
        userId: user.id,
        status: 'COMPLETED',
        completedAt: { gte: b.start, lt: b.end },
        OR: [
          { toImprove: { not: null } },
          { wentWell: { not: null } },
          { topicsAsked: { not: null } },
        ],
      },
      include: { application: { select: { id: true, company: true } } },
      orderBy: { completedAt: 'asc' },
    }),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
  ]);
  const schedule = scheduleWeek(blocks, sessions, b, now);
  const goalRows = goals
    .map((g) => ({
      goal: g.title,
      planned: blocks
        .filter((x) => x.goalId === g.id && x.status !== 'CANCELLED')
        .reduce(
          (n, x) =>
            n +
            Math.max(
              0,
              Math.min(+b.end, +x.plannedEnd) -
                Math.max(+b.start, +x.plannedStart),
            ) /
              60000,
          0,
        ),
      actual: sessions
        .filter((s) => s.goalId === g.id)
        .reduce(
          (n, s) =>
            n +
            Math.max(
              0,
              Math.min(+b.end, +(s.endedAt ?? now)) -
                Math.max(+b.start, +s.startedAt),
            ) /
              60000,
          0,
        ),
    }))
    .filter((g) => g.planned || g.actual)
    .map((g) => ({
      ...g,
      planned: Math.round(g.planned),
      actual: Math.round(g.actual),
    }));
  return {
    bounds: b,
    today,
    isCurrent: today >= b.monday && today <= b.sunday,
    schedule,
    dsa: {
      ...dsaWeek(attempts, problems, today),
      topic: owner.currentDsaTopic?.name ?? null,
    },
    learning: {
      ...learningWeek(activities),
      subject: owner.currentSubject?.name ?? null,
    },
    jobs: jobWeek({ apps, rounds, activities: jobActivities }, b, today),
    reflections: reflections.map((r) => ({
      id: r.id,
      applicationId: r.applicationId,
      company: r.application.company,
      title: r.title,
      topicsAsked: r.topicsAsked,
      wentWell: r.wentWell,
      toImprove: r.toImprove,
    })),
    goals: goalRows,
    review,
    commitments: previous?.priorities ?? [],
  };
}

/** Carry-forward items as they stand now, each linking to its own module (no copies). */
export async function carryForward(user: ScheduleUser, now = new Date()) {
  const today = dayKey(now, user.timezone);
  const [problems, topics, apps] = await Promise.all([
    db().dsaProblem.findMany({
      where: {
        userId: user.id,
        attemptsCount: { gt: 0 },
        nextRevisionAt: { lt: date(today) },
      },
      orderBy: { nextRevisionAt: 'asc' },
      select: { id: true, title: true, nextRevisionAt: true },
    }),
    db().learningTopic.findMany({
      where: { userId: user.id, nextReviewDate: { lt: date(today) } },
      include: { subject: true },
      orderBy: { nextReviewDate: 'asc' },
    }),
    db().jobApplication.findMany({
      where: {
        userId: user.id,
        stage: { notIn: ['REJECTED', 'WITHDRAWN'] },
        nextActionDate: { lt: date(today) },
      },
      orderBy: { nextActionDate: 'asc' },
      select: {
        id: true,
        company: true,
        nextAction: true,
        nextActionDate: true,
      },
    }),
  ]);
  return {
    dsa: problems,
    learning: topics.filter((t) => learningEligible(t)),
    jobs: apps,
  };
}

/** Context for planning the following week. Read-only: nothing is scheduled or changed here. */
export async function nextWeekContext(
  user: ScheduleUser,
  monday: string,
  now = new Date(),
) {
  const b = weekBounds(monday, user.timezone);
  const today = dayKey(now, user.timezone);
  const [routines, plans, problems, topics, owner, rounds, followUps, apps] =
    await Promise.all([
      db().routineBlock.findMany({ where: { userId: user.id } }),
      db().dailyPlan.findMany({
        where: {
          userId: user.id,
          date: { gte: date(b.monday), lte: date(b.sunday) },
        },
        include: {
          blocks: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { plannedStart: 'asc' },
          },
        },
      }),
      db().dsaProblem.findMany({
        where: { userId: user.id, attemptsCount: { gt: 0 } },
        select: {
          id: true,
          title: true,
          confidence: true,
          nextRevisionAt: true,
        },
      }),
      db().learningTopic.findMany({
        where: { userId: user.id },
        include: { subject: true },
        orderBy: [{ ordering: 'asc' }, { title: 'asc' }],
      }),
      db().user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          currentSubjectId: true,
          currentDsaTopic: { select: { name: true } },
          currentSubject: { select: { name: true } },
        },
      }),
      db().interviewRound.findMany({
        where: {
          userId: user.id,
          status: 'SCHEDULED',
          scheduledStart: { gte: b.start, lt: b.end },
        },
        include: {
          application: { select: { id: true, company: true } },
          prepItems: {
            include: { learningTopic: { select: { id: true, title: true } } },
          },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
      db().jobApplication.findMany({
        where: {
          userId: user.id,
          stage: { notIn: ['REJECTED', 'WITHDRAWN'] },
          nextActionDate: { gte: date(b.monday), lte: date(b.sunday) },
        },
        orderBy: { nextActionDate: 'asc' },
        select: {
          id: true,
          company: true,
          nextAction: true,
          nextActionDate: true,
        },
      }),
      db().jobApplication.count({
        where: {
          userId: user.id,
          actionOwner: 'ME',
          stage: { notIn: ['REJECTED', 'WITHDRAWN'] },
        },
      }),
    ]);
  const preview = routinePreview(routines, monday, user.timezone);
  // A generated day shows its real blocks (including one-off overrides) instead of the template.
  const days = preview.map((p) => {
    const plan = plans.find((x) => daysOf(x.date) === p.day && x.generatedAt);
    return plan
      ? {
          day: p.day,
          generated: true,
          items: plan.blocks.map((x) => ({
            title: x.title,
            category: x.category,
            start: x.plannedStart,
            end: x.plannedEnd,
          })),
        }
      : { day: p.day, generated: false, items: p.items };
  });
  const inWeek = (d: Date | null) => {
    const s = d && daysOf(d);
    return !!s && s >= b.monday && s <= b.sunday;
  };
  const suggestions = learningSuggestions(
    topics,
    owner.currentSubjectId,
    today,
  );
  return {
    bounds: b,
    days,
    generatedDays: days.filter((d) => d.generated).length,
    dsa: {
      topic: owner.currentDsaTopic?.name ?? null,
      revisionsDue: problems.filter((p) => inWeek(p.nextRevisionAt)).length,
      weak: problems.filter((p) => p.confidence !== 'GREEN').slice(0, 5),
    },
    learning: {
      subject: owner.currentSubject?.name ?? null,
      reviewsDue: topics.filter(
        (t) => learningEligible(t) && inWeek(t.nextReviewDate),
      ).length,
      needsReview: topics
        .filter((t) => learningEligible(t) && t.status === 'NEEDS_REVISION')
        .slice(0, 5),
      nextTopic: suggestions.next ?? null,
    },
    jobs: {
      interviews: rounds.map((r) => ({
        id: r.id,
        applicationId: r.applicationId,
        company: r.application.company,
        title: r.title,
        start: r.scheduledStart,
        prepDone: r.prepItems.filter((p) => p.kind === 'PREP' && p.completed)
          .length,
        prepTotal: r.prepItems.filter((p) => p.kind === 'PREP').length,
        topics: r.prepItems.flatMap((p) =>
          p.learningTopic ? [p.learningTopic] : [],
        ),
      })),
      followUps,
      actionRequired: apps,
      searchBlocks: days.flatMap((d) =>
        d.items
          .filter((i) =>
            ['JOB_SEARCH', 'INTERVIEW'].includes(
              i.category.trim().toUpperCase(),
            ),
          )
          .map((i) => ({ day: d.day, ...i })),
      ),
    },
  };
}

/** Focused preparation and applications for the two previous weeks plus this one. */
export async function recentTrend(
  user: ScheduleUser,
  monday: string,
  now = new Date(),
) {
  const weeks = [-14, -7, 0].map((o) =>
    weekBounds(shiftDay(monday, o), user.timezone),
  );
  const [sessions, apps] = await Promise.all([
    db().actualSession.findMany({
      where: {
        userId: user.id,
        startedAt: { lt: weeks[2].end },
        OR: [{ endedAt: null }, { endedAt: { gt: weeks[0].start } }],
      },
    }),
    db().jobApplication.findMany({
      where: {
        userId: user.id,
        appliedAt: { gte: date(weeks[0].monday), lte: date(weeks[2].sunday) },
      },
      select: { appliedAt: true },
    }),
  ]);
  return weeks.map((w) => ({
    monday: w.monday,
    focus: Math.round(
      sessions
        .filter((s) => isFocusCategory(s.category))
        .reduce(
          (n, s) =>
            n +
            Math.max(
              0,
              Math.min(+w.end, +(s.endedAt ?? now)) -
                Math.max(+w.start, +s.startedAt),
            ) /
              60000,
          0,
        ),
    ),
    applications: apps.filter((a) => {
      const d = daysOf(a.appliedAt!);
      return d >= w.monday && d <= w.sunday;
    }).length,
  }));
}

export async function reviewHistory(userId: string) {
  return db().weeklyReview.findMany({
    where: { userId },
    orderBy: { weekStart: 'desc' },
    take: 12,
    select: {
      weekStart: true,
      completedAt: true,
      _count: { select: { priorities: true } },
    },
  });
}

// ---------------------------------------------------------------- mutations

async function ensureReview(
  tx: Parameters<Parameters<typeof locked>[1]>[0],
  userId: string,
  weekStart: string,
) {
  return tx.weeklyReview.upsert({
    where: { userId_weekStart: { userId, weekStart: date(weekStart) } },
    create: { userId, weekStart: date(weekStart) },
    update: {},
  });
}
/** Saves the written review (one row per owner-week). Completing keeps the text editable. */
export async function saveReview(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const { weekStart, intent, ...text } = reviewInput.parse(raw);
  return locked(user.id, async (tx) => {
    const review = await ensureReview(tx, user.id, weekStart);
    return tx.weeklyReview.update({
      where: { id: review.id },
      data: {
        ...text,
        ...(intent === 'complete' && !review.completedAt
          ? { completedAt: now }
          : {}),
      },
    });
  });
}
async function ownedPriority(
  tx: Parameters<Parameters<typeof locked>[1]>[0],
  userId: string,
  id: string,
) {
  const p = await tx.weeklyPriority.findFirst({
    where: { id, userId, review: { userId } },
  });
  if (!p) throw new Error('Priority not found in your workspace.');
  return p;
}
async function renumber(
  tx: Parameters<Parameters<typeof locked>[1]>[0],
  reviewId: string,
) {
  const items = await tx.weeklyPriority.findMany({
    where: { reviewId },
    orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
  });
  for (const [i, p] of items.entries())
    if (p.ordering !== i)
      await tx.weeklyPriority.update({
        where: { id: p.id },
        data: { ordering: i },
      });
}
export async function addPriority(user: ScheduleUser, raw: unknown) {
  const { weekStart, goalId, ...data } = priorityInput.parse(raw);
  return locked(user.id, async (tx) => {
    if (
      goalId &&
      !(await tx.goal.findFirst({ where: { id: goalId, userId: user.id } }))
    )
      throw new Error('Choose a goal from your workspace.');
    const review = await ensureReview(tx, user.id, weekStart);
    const count = await tx.weeklyPriority.count({
      where: { reviewId: review.id },
    });
    if (count >= MAX_PRIORITIES)
      throw new Error(
        `Keep it to ${MAX_PRIORITIES} priorities; remove one first.`,
      );
    return tx.weeklyPriority.create({
      data: {
        ...data,
        goalId,
        userId: user.id,
        reviewId: review.id,
        ordering: count,
      },
    });
  });
}
/** Swaps with the neighbour and renumbers, so ordering stays a dense 0..n-1 sequence. */
export async function movePriority(
  user: ScheduleUser,
  id: string,
  direction: 'up' | 'down',
) {
  return locked(user.id, async (tx) => {
    const p = await ownedPriority(tx, user.id, id);
    await renumber(tx, p.reviewId);
    const items = await tx.weeklyPriority.findMany({
      where: { reviewId: p.reviewId },
      orderBy: { ordering: 'asc' },
    });
    const i = items.findIndex((x) => x.id === id);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= items.length) return;
    await tx.weeklyPriority.update({
      where: { id: items[i].id },
      data: { ordering: j },
    });
    await tx.weeklyPriority.update({
      where: { id: items[j].id },
      data: { ordering: i },
    });
  });
}
export async function setPriorityDone(
  user: ScheduleUser,
  id: string,
  done: boolean,
  now = new Date(),
) {
  return locked(user.id, async (tx) => {
    const p = await ownedPriority(tx, user.id, id);
    if (!!p.completedAt === done) return p;
    return tx.weeklyPriority.update({
      where: { id },
      data: { completedAt: done ? now : null },
    });
  });
}
export async function removePriority(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const p = await ownedPriority(tx, user.id, id);
    await tx.weeklyPriority.delete({ where: { id } });
    await renumber(tx, p.reviewId);
  });
}

/**
 * Generates next week's DailyPlans from routines using the existing generator (idempotent:
 * already-generated days are untouched). Persists Silsila data only; Google Calendar publishing
 * happens separately afterwards.
 */
export async function prepareNextWeek(user: ScheduleUser, monday: string) {
  const b = weekBounds(monday, user.timezone);
  let generated = 0;
  for (const day of b.days) {
    const before = await db().dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: date(day) } },
      select: { generatedAt: true },
    });
    if (before?.generatedAt) continue;
    await generatePlan(user, day);
    generated++;
  }
  const blocks = await db().timeBlock.count({
    where: {
      dailyPlan: {
        userId: user.id,
        date: { gte: date(b.monday), lte: date(b.sunday) },
      },
    },
  });
  return { generated, blocks };
}

export async function saveWeeklyReminder(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({ enabled: z.boolean(), preferredTime: localTime })
    .parse(raw);
  return locked(user.id, (tx) =>
    tx.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: 'WEEKLY_REVIEW' } },
      create: {
        ...input,
        userId: user.id,
        type: 'WEEKLY_REVIEW',
        timezone: user.timezone,
      },
      update: { ...input, timezone: user.timezone },
    }),
  );
}
