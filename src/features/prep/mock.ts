import 'server-only';
/**
 * The debrief and the mock interview (WI-108). The debrief writes the owner's three answers
 * on a completed round through the Jobs writer; the mock interview stores its turns as an
 * Ask Rumi conversation (deletable like any other) and asks the model only for feedback.
 * Covered by tests/prep-mock.test.ts.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/server/db';
import { aiConfig } from '@/lib/env';
import { shortDate } from '@/lib/time';
import { locked, type ScheduleUser } from '@/server/lock';
import { recordRoundResult } from '@/features/jobs/service';
import {
  AiRefusal,
  AiUnavailable,
  callModel,
  ready,
  settle,
  type CallWords,
  type Fetcher,
} from '@/features/ai/service';
import { MODEL, PINNED_PROVIDER, PRICE } from '@/features/ai/domain';
import { AGENT_RATE, PERSONA } from '@/features/agent/domain';
import { AGENT_NAME } from '@/features/agent/constants';
import type { PrepDoc } from './domain';
import {
  cleanFeedback,
  hasScore,
  MOCK_ANSWER_MAX,
  MOCK_SYSTEM,
  mockQuestions,
  type DebriefField,
} from './mock-domain';

const WORDS: CallWords = {
  unavailable: `${AGENT_NAME} couldn’t give feedback right now.`,
  budgetUsed: (day) =>
    `Your monthly AI limit is reached. ${AGENT_NAME} returns on ${shortDate(day)}, or raise the limit in Settings.`,
  log: '[prep] mock',
};

/**
 * The debrief: the owner's answers on a completed round, in their words. An empty answer
 * keeps what the round already holds; the outcome notes are never touched.
 */
export async function debriefRound(
  user: ScheduleUser,
  roundId: string,
  answers: Partial<Record<DebriefField, string>>,
  now = new Date(),
) {
  const round = await db().interviewRound.findFirst({
    where: { id: roundId, userId: user.id },
    select: {
      id: true,
      status: true,
      outcomeNotes: true,
      topicsAsked: true,
      wentWell: true,
      toImprove: true,
    },
  });
  if (!round) throw new Error('This interview no longer exists.');
  if (round.status !== 'COMPLETED')
    throw new Error('Mark the interview completed first, then debrief.');
  const keep = (field: DebriefField) =>
    answers[field]?.trim() || round[field] || '';
  return recordRoundResult(
    user,
    {
      requestId: randomUUID(),
      id: round.id,
      status: 'COMPLETED',
      outcomeNotes: round.outcomeNotes ?? '',
      topicsAsked: keep('topicsAsked'),
      wentWell: keep('wentWell'),
      toImprove: keep('toImprove'),
    },
    now,
  );
}

/** The mock's questions for one of the owner's docs. */
export async function mockFor(user: ScheduleUser, docId: string) {
  const row = await db().interviewPrepDoc.findFirst({
    where: { id: docId, userId: user.id },
    select: {
      id: true,
      company: true,
      role: true,
      applicationId: true,
      content: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    questions: mockQuestions(row.content as unknown as PrepDoc),
  };
}

/**
 * Feedback on one answer. The question is the doc's own (by index), so the model never sets
 * it; the turn is stored in the mock's conversation, created on the first answer. Counts as
 * an owner message for Ask Rumi's limits.
 */
export async function mockFeedback(
  user: ScheduleUser,
  input: {
    docId: string;
    index: number;
    answer: string;
    conversationId: string | null;
  },
  now = new Date(),
  fetcher: Fetcher = fetch,
) {
  const cfg = aiConfig();
  if (!cfg) throw new AiRefusal(WORDS.unavailable);
  const mock = await mockFor(user, input.docId);
  if (!mock) throw new AiRefusal('This prep doc no longer exists.');
  const question = mock.questions[input.index];
  if (!question) throw new AiRefusal('That question is not in this mock.');
  const answer = input.answer.trim().slice(0, MOCK_ANSWER_MAX);
  if (answer.length < 10) throw new AiRefusal('Answer the question first.');
  await ready(user, cfg, now, fetcher, { requireEnabled: false });
  const conversationId = await locked(user.id, async (tx) => {
    const sent = (since: Date) =>
      tx.agentMessage.count({
        where: { userId: user.id, role: 'USER', createdAt: { gte: since } },
      });
    const [hour, day] = await Promise.all([
      sent(new Date(+now - 3600_000)),
      sent(new Date(+now - 24 * 3600_000)),
    ]);
    if (hour >= AGENT_RATE.hour || day >= AGENT_RATE.day)
      throw new AiRefusal(
        `That is enough ${AGENT_NAME} for now. Try again in a while.`,
      );
    let id = input.conversationId;
    if (id) {
      const own = await tx.agentConversation.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });
      if (!own) throw new AiRefusal('This mock no longer exists. Start again.');
    } else
      id = (
        await tx.agentConversation.create({
          data: {
            userId: user.id,
            title: `Mock · ${mock.company}`.slice(0, 60),
          },
        })
      ).id;
    await tx.agentMessage.create({
      data: {
        conversationId: id,
        userId: user.id,
        role: 'USER',
        content: `Question ${input.index + 1}: ${question}\n\n${answer}`,
        createdAt: now,
        metadata: { mock: { docId: mock.id, index: input.index } },
      },
    });
    return id;
  });
  const doc = mock.content as unknown as PrepDoc;
  const messages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: `${PERSONA}\n${MOCK_SYSTEM}` },
    {
      role: 'user',
      content: JSON.stringify({
        company: mock.company,
        role: mock.role,
        question,
        answer,
        doc: {
          asks: (doc.asks ?? []).map((a) => a.text),
          rounds: doc.rounds.map((r) => ({ name: r.name, tests: r.tests })),
          topics: doc.topics.map((t) => t.name),
        },
      }),
    },
  ];
  let feedback = '';
  for (let attempt = 0; attempt < 2 && !feedback; attempt++) {
    const {
      usageId,
      answer: reply,
      cost,
      durationMs,
    } = await callModel({
      user,
      cfg,
      feature: 'AGENT_CHAT',
      body: {
        model: MODEL,
        messages,
        max_tokens: 400,
        provider: PINNED_PROVIDER,
        usage: { include: true },
      },
      reserve: Math.ceil(
        (JSON.stringify(messages).length / 3) * PRICE.input +
          400 * PRICE.output,
      ),
      now,
      fetcher,
      words: WORDS,
    });
    const text =
      typeof reply.choices?.[0]?.message?.content === 'string'
        ? reply.choices[0].message.content.trim()
        : '';
    // A scored answer is asked again once; then its scoring sentences are dropped.
    const clean = attempt === 0 && hasScore(text) ? '' : cleanFeedback(text);
    await settle(usageId, {
      outcome: clean ? 'OK' : 'FAILED',
      costMicros: cost.micros,
      inputTokens: cost.input,
      outputTokens: cost.output,
      durationMs,
    });
    feedback = clean;
    if (!feedback)
      messages.push({
        role: 'user',
        content:
          'Answer again as one paragraph of feedback, with no score, rating, grade or percentage.',
      });
  }
  if (!feedback) throw new AiUnavailable(WORDS.unavailable);
  await db().agentMessage.create({
    data: {
      conversationId,
      userId: user.id,
      role: 'ASSISTANT',
      content: feedback,
      createdAt: new Date(+now + 1),
      metadata: {
        mock: { docId: mock.id, index: input.index },
      } as Prisma.InputJsonValue,
    },
  });
  await db().agentConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date(+now + 1) },
  });
  return { conversationId, feedback };
}
