import 'server-only';
import { memo } from '@/server/memo';
import { db } from '@/server/db';
import { Prisma } from '@/generated/prisma/client';
import { dayBounds, dayKey } from '@/lib/time';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { shiftDay, weekDays } from '@/features/schedule/domain';
import {
  bulkItemsInput,
  goalInput,
  itemInput,
  itemOps,
  nextStatus,
  nextItem,
  parseBulkLines,
  practiceItemOps,
  revisionQueue,
  roadmapInput,
  roadmapProgress,
  scheduleRevision,
  sectionSummary,
  type ItemOp,
} from './domain';
import { z } from 'zod';
import { followPractice } from './follow';
import { isTestNamed } from '@/lib/test-data';
import { closedStages } from '@/features/jobs/domain';
import { loopFormats } from '@/features/jobs/formats';
import { formatItems } from '@/features/jobs/service';
import {
  INTERVIEW_HORIZON_DAYS,
  WEEKLY_MIX,
  readyLine,
  weekMix,
  type WeekInterview,
} from './week';

const itemInclude = {
  learningTopic: {
    select: { id: true, title: true, subject: { select: { name: true } } },
  },
  dsaProblem: {
    select: {
      id: true,
      title: true,
      confidence: true,
      attemptsCount: true,
      nextRevisionAt: true,
    },
  },
  dsaTopic: { select: { id: true, name: true } },
} satisfies Prisma.RoadmapItemInclude;

export async function saveGoal(user: ScheduleUser, raw: unknown) {
  const input = goalInput.parse(raw);
  return locked(user.id, async (tx) => {
    const data = {
      title: input.title,
      category: input.category,
      description: input.description,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      status: input.status,
      priority: input.priority,
    };
    if (input.id) {
      const existing = await tx.goal.findFirst({
        where: { id: input.id, userId: user.id },
      });
      if (!existing) throw new Error('Goal no longer exists. Reload the page.');
      return tx.goal.update({ where: { id: existing.id }, data });
    }
    return tx.goal.create({ data: { ...data, userId: user.id } });
  });
}

export async function saveRoadmap(user: ScheduleUser, raw: unknown) {
  const input = roadmapInput.parse(raw);
  return locked(user.id, async (tx) => {
    if (
      input.goalId &&
      !(await tx.goal.findFirst({
        where: { id: input.goalId, userId: user.id },
      }))
    )
      throw new Error('Choose a goal from your workspace.');
    const data = {
      title: input.title,
      description: input.description,
      goalId: input.goalId,
      archivedAt: input.archived ? new Date() : null,
      promptTemplate: input.promptTemplate,
      scenarios: input.scenarios ?? Prisma.DbNull,
      ...(input.studyAi === undefined ? {} : { studyAi: input.studyAi }),
    };
    if (input.id) {
      const existing = await tx.roadmap.findFirst({
        where: { id: input.id, userId: user.id },
      });
      if (!existing)
        throw new Error('Roadmap no longer exists. Reload the page.');
      return tx.roadmap.update({ where: { id: existing.id }, data });
    }
    const count = await tx.roadmap.count({ where: { userId: user.id } });
    return tx.roadmap.create({
      data: { ...data, userId: user.id, ordering: count },
    });
  });
}

/** Appends one item per line to a section, after the section's current items. */
export async function addItems(user: ScheduleUser, raw: unknown) {
  const input = bulkItemsInput.parse(raw);
  const parsed = parseBulkLines(input.lines);
  if (!parsed.length) throw new Error('Add at least one line.');
  return locked(user.id, async (tx) => {
    const roadmap = await tx.roadmap.findFirst({
      where: { id: input.roadmapId, userId: user.id },
    });
    if (!roadmap) throw new Error('Roadmap no longer exists. Reload the page.');
    const last = await tx.roadmapItem.aggregate({
      where: { roadmapId: roadmap.id, section: input.section },
      _max: { ordering: true },
    });
    let ordering = (last._max.ordering ?? -1) + 1;
    for (const item of parsed)
      await tx.roadmapItem.create({
        data: {
          userId: user.id,
          roadmapId: roadmap.id,
          section: input.section,
          title: item.title,
          kind: item.kind,
          ordering: ordering++,
        },
      });
    return parsed.length;
  });
}

async function ownedItem(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  const item = await tx.roadmapItem.findFirst({ where: { id, userId } });
  if (!item) throw new Error('This item no longer exists. Reload the page.');
  return item;
}

export async function saveItem(user: ScheduleUser, raw: unknown) {
  const input = itemInput.parse(raw);
  const [kind, id] = input.link ? input.link.split(':') : ['', ''];
  return locked(user.id, async (tx) => {
    const item = await ownedItem(tx, user.id, input.id);
    const links = {
      learningTopicId: kind === 'learning' ? id : null,
      dsaTopicId: kind === 'dsa-topic' ? id : null,
      dsaProblemId: kind === 'problem' ? id : null,
    };
    if (
      (links.learningTopicId &&
        !(await tx.learningTopic.findFirst({
          where: { id: links.learningTopicId, userId: user.id },
        }))) ||
      (links.dsaProblemId &&
        !(await tx.dsaProblem.findFirst({
          where: { id: links.dsaProblemId, userId: user.id },
        }))) ||
      (links.dsaTopicId &&
        !(await tx.dsaTopic.findFirst({ where: { id: links.dsaTopicId } })))
    )
      throw new Error('Choose a topic or problem from your workspace.');
    const saved = await tx.roadmapItem.update({
      where: { id: item.id },
      data: {
        title: input.title,
        section: input.section,
        kind: input.kind,
        scope: input.scope,
        checkpoint: input.checkpoint,
        priority: input.priority,
        estimateMinutes: input.estimateMinutes ?? null,
        references: input.references ?? Prisma.DbNull,
        notes: input.notes,
        url: input.url,
        askedNote: input.askedNote,
        // A typed date overrides the schedule; clearing it stops revision for this item. A
        // problem item's revision lives in Practice (ADR-025).
        nextRevisionAt:
          input.nextRevisionAt && !links.dsaProblemId
            ? new Date(input.nextRevisionAt)
            : null,
        ...links,
      },
    });
    // Linking a problem hands the item's status to Practice; unlinking keeps the last one.
    if (links.dsaProblemId)
      await followPractice(tx, user.id, { itemId: saved.id });
    return saved;
  });
}

/** "Asked at": the short where-it-came-up note beside the Asked mark. */
export async function saveItemAskedNote(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({ id: z.string().min(1), askedNote: z.string().max(200) })
    .parse(raw);
  return locked(user.id, async (tx) => {
    const item = await ownedItem(tx, user.id, input.id);
    return tx.roadmapItem.update({
      where: { id: item.id },
      data: { askedNote: input.askedNote.trim() || null },
    });
  });
}

/** The one-field note from the Study panel; everything else on the item stays as it is. */
export async function saveItemNotes(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({ id: z.string().min(1), notes: z.string().max(20000) })
    .parse(raw);
  return locked(user.id, async (tx) => {
    const item = await ownedItem(tx, user.id, input.id);
    return tx.roadmapItem.update({
      where: { id: item.id },
      data: { notes: input.notes.trim() || null },
    });
  });
}

/** Status, revision and interview marks. Never touches Learn mastery or Practice attempts. */
export async function applyItemOp(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const { id, op } = z
    .object({ id: z.string().min(1), op: z.enum(itemOps) })
    .parse(raw);
  const today = dayKey(now, user.timezone);
  return locked(user.id, async (tx) => {
    const item = await ownedItem(tx, user.id, id);
    if (item.dsaProblemId && !practiceItemOps.includes(op))
      throw new Error(
        'This item follows Practice. Record an attempt on the problem instead.',
      );
    if (op === 'revised') {
      if (item.status !== 'DONE')
        throw new Error('Mark the item done before recording a revision.');
      await tx.roadmapItem.update({
        where: { id: item.id },
        data: {
          ...scheduleRevision(item.revisionStage, today),
          lastRevisedAt: now,
        },
      });
      return { op, item };
    }
    if (op === 'remove') {
      await tx.roadmapItem.delete({ where: { id: item.id } });
      return { op, item };
    }
    if (op === 'asked' || op === 'unasked') {
      await tx.roadmapItem.update({
        where: { id: item.id },
        data: { askedInInterview: op === 'asked' },
      });
      return { op, item };
    }
    const status = nextStatus(op as ItemOp, item.status);
    // Done starts spaced revision (7 days); reopening stops it until the item is done again.
    const revision =
      status === 'DONE'
        ? item.nextRevisionAt
          ? {}
          : scheduleRevision(0, today)
        : { nextRevisionAt: null, revisionStage: 0 };
    await tx.roadmapItem.update({
      where: { id: item.id },
      data: {
        status,
        completedAt: status === 'DONE' ? (item.completedAt ?? now) : null,
        ...revision,
      },
    });
    return { op, item };
  });
}

/** Planned and recorded minutes toward each goal in the owner's current week. */
async function goalWeek(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone),
    days = weekDays(today),
    start = dayBounds(days[0], user.timezone).start,
    end = dayBounds(days[6], user.timezone).end;
  const [blocks, sessions] = await Promise.all([
    db().timeBlock.findMany({
      where: {
        dailyPlan: { userId: user.id },
        goalId: { not: null },
        status: { not: 'CANCELLED' },
        plannedStart: { lt: end },
        plannedEnd: { gt: start },
      },
      select: { goalId: true, plannedStart: true, plannedEnd: true },
    }),
    db().actualSession.findMany({
      where: {
        userId: user.id,
        goalId: { not: null },
        startedAt: { lt: end },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
      select: { goalId: true, startedAt: true, endedAt: true },
    }),
  ]);
  const clamp = (a: Date, b: Date) =>
    Math.max(0, Math.min(+end, +b) - Math.max(+start, +a)) / 60000;
  const minutes = new Map<string, { planned: number; actual: number }>();
  const bucket = (id: string) => {
    if (!minutes.has(id)) minutes.set(id, { planned: 0, actual: 0 });
    return minutes.get(id)!;
  };
  for (const b of blocks)
    bucket(b.goalId!).planned += clamp(b.plannedStart, b.plannedEnd);
  for (const s of sessions)
    bucket(s.goalId!).actual += clamp(s.startedAt, s.endedAt ?? now);
  return minutes;
}

async function loadGoalsOverview(user: ScheduleUser, now = new Date()) {
  const today = dayKey(now, user.timezone),
    days = weekDays(today),
    weekFrom = dayBounds(days[0], user.timezone).start,
    weekTo = dayBounds(days[6], user.timezone).end;
  const [goals, roadmaps, subjects, week, doneRows] = await Promise.all([
    db().goal.findMany({
      where: { userId: user.id },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    }),
    db().roadmap.findMany({
      where: { userId: user.id },
      include: { items: { select: itemSummary } },
      orderBy: { ordering: 'asc' },
    }),
    db().learningSubject.findMany({
      where: { userId: user.id, goalId: { not: null } },
      include: { topics: { select: { status: true } } },
    }),
    goalWeek(user, now),
    db().roadmapItem.findMany({
      where: {
        userId: user.id,
        status: 'DONE',
        completedAt: { gte: weekFrom, lte: weekTo },
      },
      select: { roadmapId: true },
    }),
  ]);
  return goals.map((g) => {
    const own = roadmaps.filter((r) => r.goalId === g.id && !r.archivedAt);
    const ownIds = new Set(own.map((r) => r.id));
    const doneThisWeek = doneRows.filter((d) => ownIds.has(d.roadmapId)).length;
    const topics = subjects
      .filter((s) => s.goalId === g.id)
      .flatMap((s) => s.topics);
    const next = own
      .map((r) => ({ roadmap: r, item: nextItem(r.items) }))
      .find((n) => n.item);
    return {
      ...g,
      week: week.get(g.id) ?? { planned: 0, actual: 0 },
      roadmap: roadmapProgress(own.flatMap((r) => r.items)),
      doneThisWeek,
      upNext: own
        .map((r) => ({
          roadmapId: r.id,
          roadmapTitle: r.title,
          item: nextItem(r.items),
        }))
        .filter((n) => n.item)
        .slice(0, 3)
        .map((n) => ({
          roadmapId: n.roadmapId,
          roadmapTitle: n.roadmapTitle,
          ...n.item!,
        })),
      next: next
        ? {
            roadmapId: next.roadmap.id,
            roadmapTitle: next.roadmap.title,
            ...next.item!,
          }
        : null,
      topics: {
        total: topics.length,
        ready: topics.filter((t) => t.status === 'INTERVIEW_READY').length,
      },
    };
  });
}

/** Enough of an item to count it, find the next one and name it. */
const itemSummary = {
  id: true,
  title: true,
  section: true,
  status: true,
  askedInInterview: true,
  priority: true,
  ordering: true,
  createdAt: true,
  nextRevisionAt: true,
} satisfies Prisma.RoadmapItemSelect;

export async function roadmapList(user: ScheduleUser, now = new Date()) {
  const today = dayKey(now, user.timezone);
  const roadmaps = await db().roadmap.findMany({
    where: { userId: user.id },
    include: {
      goal: { select: { id: true, title: true } },
      items: { select: itemSummary },
    },
    orderBy: { ordering: 'asc' },
  });
  return roadmaps.map((r) => {
    const dueItems = revisionQueue(r.items, today);
    return {
      ...r,
      progress: roadmapProgress(r.items),
      sections: sectionSummary(r.items),
      next: nextItem(r.items),
      due: dueItems.length,
      /** The section of the earliest item due, where the revision view should open. */
      dueSection: dueItems[0]?.section ?? null,
    };
  });
}

/** Items due or overdue for revision across the owner's live roadmaps, for Today. */
async function loadRevisionDue(user: ScheduleUser, now = new Date()) {
  const today = dayKey(now, user.timezone);
  const items = await db().roadmapItem.findMany({
    where: {
      userId: user.id,
      status: 'DONE',
      nextRevisionAt: { lte: new Date(today) },
      roadmap: { archivedAt: null },
    },
    select: {
      id: true,
      title: true,
      section: true,
      status: true,
      nextRevisionAt: true,
      roadmap: { select: { id: true, title: true } },
      // Kept Grill Me cards make the revision deck (WI-032).
      _count: { select: { revisionCards: true } },
    },
    orderBy: { nextRevisionAt: 'asc' },
  });
  return revisionQueue(items, today);
}
export const revisionDue = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, 'roadmap-revision', () => loadRevisionDue(user, now));

export async function roadmapDetail(user: ScheduleUser, id: string) {
  const roadmap = await db().roadmap.findFirst({
    where: { id, userId: user.id },
    include: {
      goal: { select: { id: true, title: true } },
      items: {
        include: itemInclude,
        orderBy: [{ section: 'asc' }, { ordering: 'asc' }],
      },
    },
  });
  if (!roadmap) return null;
  const sections = new Map<string, typeof roadmap.items>();
  // Sections keep the order their first item was added in.
  for (const item of [...roadmap.items].sort(
    (a, b) => +a.createdAt - +b.createdAt,
  ))
    if (!sections.has(item.section)) sections.set(item.section, []);
  for (const item of roadmap.items) sections.get(item.section)!.push(item);
  return {
    ...roadmap,
    sections,
    progress: roadmapProgress(roadmap.items),
    next: nextItem(roadmap.items),
  };
}

/** Links an item form can offer: the owner's topics, DSA topics and problems. */
export async function linkOptions(userId: string) {
  const [topics, dsaTopics, problems] = await Promise.all([
    db().learningTopic.findMany({
      where: { userId, subject: { status: { not: 'ARCHIVED' } } },
      include: { subject: { select: { name: true } } },
      orderBy: [{ subject: { ordering: 'asc' } }, { ordering: 'asc' }],
    }),
    db().dsaTopic.findMany({ orderBy: { ordering: 'asc' } }),
    db().dsaProblem.findMany({
      where: { userId },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    }),
  ]);
  return [
    ...topics.map((t) => ({
      value: `learning:${t.id}`,
      label: `Learn · ${t.subject.name} — ${t.title}`,
    })),
    ...dsaTopics.map((t) => ({
      value: `dsa-topic:${t.id}`,
      label: `Practice topic · ${t.name}`,
    })),
    ...problems.map((p) => ({
      value: `problem:${p.id}`,
      label: `Problem · ${p.title}`,
    })),
  ];
}

/**
 * The chain: the last `length` owner-local days, each marked when work was recorded or the
 * day was reviewed. A record, not a score: nothing is counted or compared.
 */
async function loadChainDays(
  user: ScheduleUser,
  now = new Date(),
  length = 14,
) {
  const today = dayKey(now, user.timezone),
    first = shiftDay(today, -(length - 1)),
    start = dayBounds(first, user.timezone).start;
  const [sessions, plans] = await Promise.all([
    db().actualSession.findMany({
      where: { userId: user.id, startedAt: { gte: start, lte: now } },
      select: { startedAt: true },
    }),
    db().dailyPlan.findMany({
      where: {
        userId: user.id,
        reviewedAt: { not: null },
        date: { gte: new Date(first), lte: new Date(today) },
      },
      select: { date: true },
    }),
  ]);
  const worked = new Set(
    sessions.map((s) => dayKey(s.startedAt, user.timezone)),
  );
  const reviewed = new Set(plans.map((p) => p.date.toISOString().slice(0, 10)));
  return Array.from({ length }, (_, i) => {
    const day = shiftDay(first, i);
    return {
      day,
      worked: worked.has(day),
      reviewed: reviewed.has(day),
      today: day === today,
    };
  });
}
/** Cached for a few seconds per owner; every write drops it (see src/server/memo.ts). */
export const goalsOverview = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, 'goals', () => loadGoalsOverview(user, now));
export const chainDays = (user: ScheduleUser, now = new Date(), length = 14) =>
  memo(user.id, `chain:${length}`, () => loadChainDays(user, now, length));

/**
 * This week on the Roadmap overview (WI-048): the weekly mix with its counts and next items,
 * the formats of interviews in the next two weeks first, and the ready line (the nearest
 * goal's date and the P0 items left). Reads only; memoized like the other snapshots.
 */
async function loadWeekPlan(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone),
    days = weekDays(today),
    start = dayBounds(days[0], user.timezone).start,
    end = dayBounds(days[6], user.timezone).end,
    horizon = new Date(+now + INTERVIEW_HORIZON_DAYS * 86400000);
  const soon = {
    status: 'SCHEDULED' as const,
    scheduledStart: { gte: now, lt: horizon },
  };
  const [apps, attempted, p0Left, goal] = await Promise.all([
    db().jobApplication.findMany({
      where: {
        userId: user.id,
        stage: { notIn: [...closedStages] },
        rounds: { some: soon },
      },
      select: {
        company: true,
        role: true,
        formats: true,
        rounds: {
          where: soon,
          orderBy: { scheduledStart: 'asc' },
          select: {
            type: true,
            aiPolicy: true,
            status: true,
            scheduledStart: true,
          },
        },
      },
    }),
    db().dsaAttempt.findMany({
      where: { userId: user.id, attemptedAt: { gte: start, lt: end } },
      distinct: ['problemId'],
      select: { problemId: true },
    }),
    db().roadmapItem.count({
      where: {
        userId: user.id,
        priority: 1,
        status: { not: 'DONE' },
        roadmap: { archivedAt: null },
      },
    }),
    db().goal.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        targetDate: { gte: new Date(today) },
      },
      orderBy: { targetDate: 'asc' },
      select: { title: true, targetDate: true },
    }),
  ]);
  const interviews: WeekInterview[] = apps
    .filter((a) => !isTestNamed(a.company, a.role))
    .flatMap((a) =>
      loopFormats(a.formats, a.rounds, now).map((l) => ({
        company: a.company,
        format: l.format,
        // A ticked format without its own round takes the loop's first round.
        on: dayKey(l.nextRound ?? a.rounds[0].scheduledStart, user.timezone),
      })),
    );
  const items = await formatItems(user, [
    ...WEEKLY_MIX.map((m) => m.format),
    ...interviews.map((i) => i.format),
  ]);
  return {
    rows: weekMix({
      items,
      problemsAttempted: attempted.length,
      week: { start, end },
      interviews,
    }),
    ready: readyLine(goal, p0Left, today),
    p0Left,
  };
}
export const weekPlan = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, 'week-plan', () => loadWeekPlan(user, now));
