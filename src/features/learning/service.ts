import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import {
  locked,
  validateGoal,
  type ScheduleUser,
} from '@/features/schedule/service';
import { resourceUrl, localTime } from '@/lib/validation';
import { dateInput } from '@/features/schedule/domain';
import { dayKey } from '@/lib/time';
import type { Prisma } from '@/generated/prisma/client';
import {
  activityInput,
  assess,
  dimensions,
  readiness,
  statuses,
  isTechnical,
  weekStart,
} from './domain';
export async function ownedSubject(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  const s = await tx.learningSubject.findFirst({ where: { id, userId } });
  if (!s) throw new Error('Subject not found in your workspace.');
  return s;
}
export async function ownedTopic(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  const t = await tx.learningTopic.findFirst({
    where: { id, userId },
    include: { subject: true },
  });
  if (!t || t.subject.userId !== userId)
    throw new Error('Topic not found in your workspace.');
  return t;
}
export async function saveSubject(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({
      id: z.string().default(''),
      name: z.string().trim().min(1).max(100),
      description: z.string().trim().max(2000).default(''),
      status: z.enum([
        'NOT_STARTED',
        'ACTIVE',
        'PAUSED',
        'COMPLETED',
        'ARCHIVED',
      ]),
      ordering: z.coerce.number().int().min(0).max(10000),
      goalId: z.string().default(''),
      current: z.boolean(),
    })
    .parse(raw);
  if (input.current && input.status !== 'ACTIVE')
    throw new Error('Current focus must be an active subject.');
  return locked(user.id, async (tx) => {
    const { id, current, goalId, ...fields } = input;
    await validateGoal(tx, user.id, goalId);
    if (id) await ownedSubject(tx, user.id, id);
    const data = { ...fields, goalId: goalId || null };
    const subject = id
      ? await tx.learningSubject.update({ where: { id }, data })
      : await tx.learningSubject.create({ data: { ...data, userId: user.id } });
    if (current)
      await tx.user.update({
        where: { id: user.id },
        data: { currentSubjectId: subject.id },
      });
    else
      await tx.user.updateMany({
        where: { id: user.id, currentSubjectId: subject.id },
        data: { currentSubjectId: null },
      });
    return subject;
  });
}
export async function saveLearningTopic(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({
      id: z.string().default(''),
      subjectId: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).default(''),
      notes: z.string().trim().max(8000).default(''),
      ordering: z.coerce.number().int().min(0).max(10000),
      parentId: z.string().default(''),
      status: z.enum(statuses),
    })
    .parse(raw);
  return locked(user.id, async (tx) => {
    const { id, parentId, ...fields } = input;
    await ownedSubject(tx, user.id, fields.subjectId);
    const old = id ? await ownedTopic(tx, user.id, id) : null;
    if (old && old.subjectId !== fields.subjectId)
      throw new Error('Keep topics in their original subject.');
    if (parentId) {
      const parent = await ownedTopic(tx, user.id, parentId);
      if (
        parent.subjectId !== fields.subjectId ||
        parent.id === id ||
        parent.parentId
      )
        throw new Error('Choose a top-level parent in this subject.');
      if (id && (await tx.learningTopic.count({ where: { parentId: id } })))
        throw new Error('A topic with children must remain top-level.');
    }
    if (
      fields.status === 'INTERVIEW_READY' &&
      (!old || readiness(old) !== 'INTERVIEW_READY')
    )
      throw new Error(
        'Assess all four dimensions as Strong before marking Interview ready.',
      );
    if (
      fields.status === 'NOT_STARTED' &&
      old &&
      (await tx.learningActivity.count({
        where: { topicId: id, activityType: { not: 'NOTE' } },
      }))
    )
      throw new Error('Studied topics cannot be reset to Not started.');
    // Lifecycle controls can pause/complete; active readiness cannot conceal weak assessments.
    if (
      old &&
      ['LEARNING', 'NEEDS_REVISION', 'INTERVIEW_READY'].includes(
        fields.status,
      ) &&
      dimensions.some((d) => old[d] > 0)
    )
      fields.status = readiness(old);
    const data = { ...fields, parentId: parentId || null };
    return id
      ? tx.learningTopic.update({ where: { id }, data })
      : tx.learningTopic.create({ data: { ...data, userId: user.id } });
  });
}
export async function recordActivity(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = activityInput.parse(raw);
  return locked(user.id, async (tx) => {
    const topic = await ownedTopic(tx, user.id, input.topicId);
    const prior = await tx.learningActivity.findUnique({
      where: {
        userId_requestId: { userId: user.id, requestId: input.requestId },
      },
    });
    if (prior) {
      for (const key of [
        'topicId',
        'activityType',
        'notes',
        'durationMinutes',
        ...dimensions,
      ] as const)
        if (prior[key] !== (input[key] ?? null))
          throw new Error(
            'This submission was already saved. Reload before another activity.',
          );
      return prior;
    }
    if (
      topic.subject.status !== 'ACTIVE' ||
      ['PAUSED', 'COMPLETED'].includes(topic.status)
    )
      throw new Error(
        'Activate the subject and resume the topic before recording activity.',
      );
    const hasAssessment = dimensions.some((d) => input[d] !== undefined);
    const summary = hasAssessment
      ? assess(topic, input, dayKey(now, user.timezone))
      : input.activityType !== 'NOTE' && topic.status === 'NOT_STARTED'
        ? {
            status: 'LEARNING' as const,
            nextReviewDate: assess(topic, {}, dayKey(now, user.timezone))
              .nextReviewDate,
            reviewManual: false,
          }
        : {};
    const session = await tx.actualSession.findFirst({
      where: { userId: user.id, endedAt: null, startedAt: { lte: now } },
    });
    const appropriate =
      session &&
      (isTechnical(session.category) ||
        (!!topic.subject.goalId && session.goalId === topic.subject.goalId));
    const activity = await tx.learningActivity.create({
      data: {
        ...input,
        userId: user.id,
        performedAt: now,
        statusBefore: topic.status,
        statusAfter: summary.status ?? topic.status,
        actualSessionId: appropriate ? session.id : null,
      },
    });
    await tx.learningTopic.update({
      where: { id: topic.id },
      data: {
        ...summary,
        ...(input.activityType === 'NOTE' ? {} : { lastReviewedAt: now }),
      },
    });
    return activity;
  });
}
export async function scheduleReview(
  user: ScheduleUser,
  id: string,
  date: string,
) {
  dateInput.parse(date);
  return locked(user.id, async (tx) => {
    const t = await ownedTopic(tx, user.id, id);
    if (
      t.subject.status !== 'ACTIVE' ||
      ['PAUSED', 'COMPLETED', 'NOT_STARTED'].includes(t.status)
    )
      throw new Error(
        'Start or resume this topic in an active subject before scheduling review.',
      );
    return tx.learningTopic.update({
      where: { id },
      data: { nextReviewDate: new Date(date), reviewManual: true },
    });
  });
}
export async function addLearningResource(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({
      topicId: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      url: resourceUrl,
      type: z.enum([
        'DOCUMENTATION',
        'ARTICLE',
        'VIDEO',
        'COURSE',
        'REPOSITORY',
        'OTHER',
      ]),
      notes: z.string().trim().max(2000).default(''),
    })
    .parse(raw);
  return locked(user.id, async (tx) => {
    await ownedTopic(tx, user.id, input.topicId);
    const { topicId, ...data } = input;
    return tx.resource.create({
      data: { ...data, userId: user.id, learningTopicId: topicId },
    });
  });
}
export async function saveLearningReminder(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({ enabled: z.boolean(), preferredTime: localTime })
    .parse(raw);
  return locked(user.id, (tx) =>
    tx.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: 'TECHNICAL_REVIEW' } },
      create: {
        ...input,
        userId: user.id,
        type: 'TECHNICAL_REVIEW',
        timezone: user.timezone,
      },
      update: { ...input, timezone: user.timezone },
    }),
  );
}
export async function learningSnapshot(user: ScheduleUser, now = new Date()) {
  const start = weekStart(now, user.timezone);
  const [subjects, topics, current, recent, weekly, sessions, goals, pref] =
    await Promise.all([
      db().learningSubject.findMany({
        where: { userId: user.id },
        orderBy: [{ ordering: 'asc' }, { name: 'asc' }],
      }),
      db().learningTopic.findMany({
        where: { userId: user.id },
        include: { subject: true },
        orderBy: [{ ordering: 'asc' }, { title: 'asc' }],
      }),
      db().user.findUniqueOrThrow({
        where: { id: user.id },
        select: { currentSubjectId: true },
      }),
      db().learningActivity.findMany({
        where: { userId: user.id },
        include: { topic: { include: { subject: true } } },
        orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
        take: 12,
      }),
      db().learningActivity.findMany({
        where: { userId: user.id, performedAt: { gte: start, lte: now } },
      }),
      db().actualSession.findMany({
        where: {
          userId: user.id,
          startedAt: { lt: now },
          OR: [{ endedAt: null }, { endedAt: { gt: start } }],
        },
      }),
      db().goal.findMany({
        where: { userId: user.id },
        select: { id: true, title: true },
      }),
      db().notificationPreference.findUnique({
        where: { userId_type: { userId: user.id, type: 'TECHNICAL_REVIEW' } },
      }),
    ]);
  const technicalGoals = new Set(subjects.map((s) => s.goalId).filter(Boolean));
  const recordedMinutes =
    sessions
      .filter(
        (s) =>
          isTechnical(s.category) || (s.goalId && technicalGoals.has(s.goalId)),
      )
      .reduce(
        (n, s) =>
          n +
          Math.max(
            0,
            Math.min(+(s.endedAt ?? now), +now) -
              Math.max(+s.startedAt, +start),
          ),
        0,
      ) / 60000;
  return {
    subjects,
    topics,
    currentSubjectId: current.currentSubjectId,
    recent,
    goals,
    pref,
    weekly: {
      studied: new Set(
        weekly.filter((a) => a.activityType !== 'NOTE').map((a) => a.topicId),
      ).size,
      reviewed: new Set(
        weekly
          .filter((a) =>
            ['REVIEW', 'INTERVIEW_RECALL', 'MOCK'].includes(a.activityType),
          )
          .map((a) => a.topicId),
      ).size,
      ready: new Set(
        weekly
          .filter(
            (a) =>
              a.statusAfter === 'INTERVIEW_READY' &&
              a.statusBefore !== 'INTERVIEW_READY',
          )
          .map((a) => a.topicId),
      ).size,
      minutes: Math.floor(recordedMinutes),
    },
  };
}
