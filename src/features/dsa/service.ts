import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { resourceUrl } from '@/lib/validation';
import { dayKey } from '@/lib/time';
import { dateInput } from '@/features/schedule/domain';
import { attemptInput, isDsa, revision } from './domain';
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
export async function saveProblem(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({
      id: z.string().default(''),
      title: z.string().trim().min(1).max(200),
      platform: z.string().trim().min(1).max(80),
      problemUrl: resourceUrl,
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
    await tx.dsaProblem.update({
      where: { id: problem.id },
      data: {
        confidence: input.confidenceAfter,
        lastAttemptedAt: now,
        attemptsCount: { increment: 1 },
        ...revision(
          input.confidenceAfter,
          problem.revisionStage,
          dayKey(now, user.timezone),
        ),
      },
    });
    return attempt;
  });
}
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
    await tx.dsaProblem.update({
      where: { id },
      data: { nextRevisionAt: new Date(date), revisionManual: true },
    });
  });
}
export async function dsaSnapshot(user: ScheduleUser) {
  const [problems, topics, current] = await Promise.all([
    db().dsaProblem.findMany({
      where: { userId: user.id },
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
