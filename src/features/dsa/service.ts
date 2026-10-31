import 'server-only';
import { memo } from '@/server/memo';
import { z } from 'zod';
import { db } from '@/server/db';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { resourceUrl } from '@/lib/validation';
import { dayKey } from '@/lib/time';
import { dateInput } from '@/features/schedule/domain';
import {
  attemptInput,
  isDsa,
  ladderState,
  markRevised as revisedData,
  settleLadder,
  startLadder,
} from './domain';
import { followPractice } from '@/features/roadmap/follow';
import type { Prisma } from '@/generated/prisma/client';
export async function ownedProblem(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  const p = await tx.dsaProblem.findFirst({ where: { id, userId } });
  if (!p) throw new Error('Problem not found in your workspace.');
  return p;
}
const topicInput = z.object({
  id: z.string().default(''),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).default(''),
  status: z.enum([
    'NOT_STARTED',
    'LEARNING',
    'NEEDS_REVISION',
    'INTERVIEW_READY',
    'COMPLETED',
    'PAUSED',
  ]),
  ordering: z.coerce.number().int().min(0).max(10000),
  current: z.boolean(),
});
export async function saveTopic(user: ScheduleUser, raw: unknown) {
  const data = topicInput.parse(raw);
  if (
    data.current &&
    ['PAUSED', 'COMPLETED', 'NOT_STARTED'].includes(data.status)
  )
    throw new Error(
      'Set a current topic to Learning, Revising or Interview ready.',
    );
  return locked(user.id, async (tx) => {
    const { id, current, ...fields } = data;
    if (id && !(await tx.dsaTopic.findUnique({ where: { id } })))
      throw new Error('Topic not found.');
    const topic = id
      ? await tx.dsaTopic.update({ where: { id }, data: fields })
      : await tx.dsaTopic.create({ data: fields });
    if (current)
      await tx.user.update({
        where: { id: user.id },
        data: { currentDsaTopicId: topic.id },
      });
    else
      await tx.user.updateMany({
        where: { id: user.id, currentDsaTopicId: topic.id },
        data: { currentDsaTopicId: null },
      });
    return topic;
  });
}
/** One click from the Topics list; the same rule as the form's "Current topic" box. */
export async function setCurrentTopic(user: ScheduleUser, topicId: string) {
  return locked(user.id, async (tx) => {
    const found = await tx.dsaTopic.findUnique({ where: { id: topicId } });
    if (!found) throw new Error('Topic not found.');
    if (['PAUSED', 'COMPLETED'].includes(found.status))
      throw new Error(
        'Set a current topic to Learning, Revising or Interview ready.',
      );
    // Making a topic current starts it (WI-091): the import leaves every topic Not started.
    const topic =
      found.status === 'NOT_STARTED'
        ? await tx.dsaTopic.update({
            where: { id: found.id },
            data: { status: 'LEARNING' },
          })
        : found;
    await tx.user.update({
      where: { id: user.id },
      data: { currentDsaTopicId: topic.id },
    });
    return topic;
  });
}
export async function saveProblem(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({
      id: z.string().default(''),
      title: z.string().trim().min(1).max(200),
      // A problem from a book or a whiteboard has no platform or link (WI-091).
      platform: z
        .string()
        .trim()
        .max(80)
        .transform((v) => v || 'Other'),
      problemUrl: z.union([z.literal(''), resourceUrl]),
      difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
      topicId: z.string().min(1),
      notes: z.string().trim().max(2000).default(''),
    })
    .parse(raw);
  return locked(user.id, async (tx) => {
    const { id, ...data } = input;
    if (!(await tx.dsaTopic.findUnique({ where: { id: data.topicId } })))
      throw new Error('Choose an existing topic.');
    if (id) {
      await ownedProblem(tx, user.id, id);
      return tx.dsaProblem.update({ where: { id }, data });
    }
    return tx.dsaProblem.create({ data: { ...data, userId: user.id } });
  });
}
export async function recordAttempt(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = attemptInput.parse(raw);
  return locked(user.id, async (tx) => {
    const problem = await ownedProblem(tx, user.id, input.problemId);
    const prior = await tx.dsaAttempt.findUnique({
      where: {
        userId_requestId: { userId: user.id, requestId: input.requestId },
      },
    });
    if (prior) {
      if (
        prior.problemId !== input.problemId ||
        prior.confidenceAfter !== input.confidenceAfter ||
        prior.solvedIndependently !== input.solvedIndependently ||
        prior.durationMinutes !== (input.durationMinutes ?? null) ||
        prior.notes !== input.notes ||
        prior.mistake !== input.mistake
      )
        throw new Error(
          'This submission was already saved. Reload before recording another attempt.',
        );
      return prior;
    }
    const session = await tx.actualSession.findFirst({
      where: { userId: user.id, endedAt: null, startedAt: { lte: now } },
    });
    const attempt = await tx.dsaAttempt.create({
      data: {
        ...input,
        userId: user.id,
        attemptedAt: now,
        confidenceBefore: problem.attemptsCount ? problem.confidence : null,
        actualSessionId: session && isDsa(session.category) ? session.id : null,
      },
    });
    // The ladder (WI-094): an attempt while a step is open counts as that revision; with no
    // ladder, or a finished one, it starts one from today. The confidence sets no date.
    const today = dayKey(now, user.timezone);
    const ladder = ladderState(
      { ...problem, attemptsCount: problem.attemptsCount + 1 },
      today,
    );
    await tx.dsaProblem.update({
      where: { id: problem.id },
      data: {
        confidence: input.confidenceAfter,
        lastAttemptedAt: now,
        attemptsCount: { increment: 1 },
        ...(ladder.state === 'due' || ladder.state === 'upcoming'
          ? revisedData(problem)
          : startLadder(today)),
      },
    });
    await followPractice(tx, user.id, { problemId: problem.id }, now);
    return attempt;
  });
}
/** Moves the open step to another day by hand (the later steps keep their own days). */
export async function scheduleRevision(
  user: ScheduleUser,
  id: string,
  date: string,
) {
  dateInput.parse(date);
  return locked(user.id, async (tx) => {
    const p = await ownedProblem(tx, user.id, id);
    if (!p.attemptsCount)
      throw new Error('Record a first attempt before scheduling a revision.');
    if (!p.revisionStartedOn || !p.nextRevisionAt)
      throw new Error('No revision is open. Start the ladder first.');
    await tx.dsaProblem.update({
      where: { id },
      data: { nextRevisionAt: new Date(date), revisionManual: true },
    });
  });
}
/** Starts the 3 · 7 · 14 ladder today on a problem that has been attempted (WI-094). */
export async function startRevision(
  user: ScheduleUser,
  id: string,
  now = new Date(),
) {
  return locked(user.id, async (tx) => {
    const p = await ownedProblem(tx, user.id, id);
    if (!p.attemptsCount)
      throw new Error('Record a first attempt before starting the ladder.');
    await tx.dsaProblem.update({
      where: { id },
      data: startLadder(dayKey(now, user.timezone)),
    });
  });
}
/** Mark revised: the open step is done and the next one waits on its own day (WI-094). */
export async function markRevised(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const p = await ownedProblem(tx, user.id, id);
    await tx.dsaProblem.update({ where: { id }, data: revisedData(p) });
    return ladderState(
      await tx.dsaProblem.findUniqueOrThrow({ where: { id } }),
      dayKey(new Date(), user.timezone),
    );
  });
}
/**
 * Settles the steps whose day has passed as missed (WI-094), so nothing reads as overdue.
 * Run before Practice is read and before the revision reminder counts; writes only when a
 * step has lapsed, so a quiet day costs one read.
 */
export async function settleRevisionsIn(
  tx: Prisma.TransactionClient,
  userId: string,
  today: string,
) {
  const lapsed = await tx.dsaProblem.findMany({
    where: {
      userId,
      revisionStartedOn: { not: null },
      nextRevisionAt: { lt: new Date(today) },
    },
  });
  for (const p of lapsed) {
    const data = settleLadder(p, today);
    if (data) await tx.dsaProblem.update({ where: { id: p.id }, data });
  }
  return lapsed.length;
}
export const settleRevisions = (user: ScheduleUser, now = new Date()) =>
  settleRevisionsIn(db(), user.id, dayKey(now, user.timezone));
async function loadDsaSnapshot(user: ScheduleUser, now: Date) {
  await settleRevisions(user, now);
  const [problems, topics, current] = await Promise.all([
    db().dsaProblem.findMany({
      // A hidden problem (WI-060) leaves Practice, For today, drills and revisions.
      where: { userId: user.id, hiddenAt: null },
      include: { topic: true },
      orderBy: { title: 'asc' },
    }),
    db().dsaTopic.findMany({ orderBy: [{ ordering: 'asc' }, { name: 'asc' }] }),
    db().user.findUniqueOrThrow({
      where: { id: user.id },
      include: { currentDsaTopic: true },
    }),
  ]);
  return { problems, topics, currentTopic: current.currentDsaTopic };
}
/** Cached for a few seconds per owner; every write drops it (see src/server/memo.ts). */
export const dsaSnapshot = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, 'dsa', () => loadDsaSnapshot(user, now));
