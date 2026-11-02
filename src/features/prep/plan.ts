import 'server-only';
/**
 * "Plan until the date" (WI-105): a prep doc's study order as Rumi's plan cards. Apart from
 * the prep service because it reads Rumi's tools, which read the prep docs.
 */
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/server/db';
import { dayKey, hhmm } from '@/lib/time';
import type { ScheduleUser } from '@/server/lock';
import { shiftDay } from '@/lib/day';
import { getPatterns, studyKinds } from '@/features/agent/tools';
import { proposeBlocks, takenOn } from '@/features/agent/plans';
import { planWindow, type Proposal } from '@/features/agent/plan-domain';
import type { PrepDoc } from './domain';
import { studySlots } from './invite';

/**
 * "Plan until the date" (WI-105): the doc's study order over the days before the next
 * interview (this week only, as every plan), two free hours a day, as Rumi's plan cards in a
 * new conversation. Nothing is added until the owner presses Add to plan.
 */
export async function planFromDoc(
  user: ScheduleUser,
  docId: string,
  now = new Date(),
) {
  const row = await db().interviewPrepDoc.findFirst({
    where: { id: docId, userId: user.id },
    select: { applicationId: true, company: true, content: true },
  });
  if (!row) throw new Error('This doc no longer exists.');
  const doc = row.content as unknown as PrepDoc;
  const steps = (doc.order?.length ? doc.order : doc.topics).map((t) => t.name);
  if (!steps.length) throw new Error('This doc has no study order to plan.');
  const today = dayKey(now, user.timezone);
  const next = await db().interviewRound.findFirst({
    where: {
      userId: user.id,
      applicationId: row.applicationId,
      status: 'SCHEDULED',
      scheduledStart: { gt: now },
    },
    orderBy: { scheduledStart: 'asc' },
    select: { scheduledStart: true },
  });
  const window = planWindow(today);
  const until = next
    ? [
        shiftDay(dayKey(next.scheduledStart, user.timezone), -1),
        window.last,
      ].sort()[0]
    : window.last;
  const days: string[] = [];
  for (let d = today; d <= until; d = shiftDay(d, 1)) days.push(d);
  if (!days.length)
    throw new Error(
      'The interview is too close to plan study blocks before it.',
    );
  const [study, pattern] = await Promise.all([
    studyKinds(user.id),
    getPatterns(user, now),
  ]);
  const taken = await Promise.all(
    days.map(async (day) => ({
      day,
      taken: (await takenOn(db(), user.id, day, user.timezone, study)).map(
        (t) => ({
          start: hhmm(t.start, user.timezone),
          end: hhmm(t.end, user.timezone),
        }),
      ),
    })),
  );
  // Today starts after the next half hour, never in the past.
  const nowMin = hhmm(new Date(+now + 30 * 60_000), user.timezone);
  taken[0]?.taken.push({
    start: '00:00',
    end: nowMin < '23:59' ? nowMin : '23:59',
  });
  const slots = studySlots(
    steps,
    taken,
    pattern.bestHours?.slice(0, 5) ?? '18:00',
  );
  if (!slots.length)
    throw new Error(
      'No free hour before the interview this week. Plan from Weekly review.',
    );
  const proposals: Proposal[] = [];
  for (const s of slots) {
    const made = await proposeBlocks(
      user,
      {
        day: s.day,
        blocks: s.blocks.map((b, i) => ({
          title: `${row.company}: ${b.title}`.slice(0, 80),
          kind: 'Technical',
          start: b.start,
          end: b.end,
          reason:
            `From the ${row.company} prep doc, step ${steps.indexOf(b.title) + 1 || i + 1}`.slice(
              0,
              160,
            ),
        })),
      },
      now,
    );
    if (made.proposal) proposals.push(made.proposal);
  }
  const conversation = await db().agentConversation.create({
    data: { userId: user.id, title: `Plan for ${row.company}`.slice(0, 60) },
  });
  await db().agentMessage.create({
    data: {
      conversationId: conversation.id,
      userId: user.id,
      role: 'ASSISTANT',
      content: `Here is a plan from your ${row.company} prep doc, ${proposals.length === 1 ? 'one day' : `${proposals.length} days`} before the interview. Add the days you want; Undo takes them back.`,
      metadata: {
        tools: [],
        costMicros: 0,
        proposals,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return conversation.id;
}
