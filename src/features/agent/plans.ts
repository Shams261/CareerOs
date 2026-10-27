import 'server-only';
/**
 * Rumi plans (WI-041, ADR-024). A proposal is only a card: it is checked against the day when
 * Rumi makes it and stored with the answer. Add to plan re-checks every block under the owner
 * lock and writes them all or none, as manual blocks ("Added for this day"); Undo cancels
 * them. "Rumi knows" suggestions work the same way. Covered by tests/agent-plans.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { dayBounds, dayKey } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import {
  generateInTransaction,
  generateThroughSunday,
  locked,
  type ScheduleUser,
} from '@/features/schedule/service';
import { saveBlockIn } from '@/features/schedule/editing';
import { AGENT_NAME, MEMORY, titleVisible } from './domain';
import {
  addable,
  checkBlocks,
  planWindow,
  readMetadata,
  takenLabel,
  type ProposeArgs,
  type Proposal,
  type Suggestion,
} from './plan-domain';
import { studyKinds } from './tools';

type Tx = Prisma.TransactionClient;

/** The day's blocks as conflicts, named only as far as Rumi may see them. */
async function takenOn(
  client: Pick<Tx, 'timeBlock'>,
  userId: string,
  day: string,
  zone: string,
  study: string[],
) {
  const bounds = dayBounds(day, zone);
  const rows = await client.timeBlock.findMany({
    where: {
      dailyPlan: { userId },
      status: { not: 'CANCELLED' },
      plannedStart: { lt: bounds.end },
      plannedEnd: { gt: bounds.start },
    },
    select: {
      title: true,
      category: true,
      plannedStart: true,
      plannedEnd: true,
    },
  });
  return rows.map((r) => ({
    start: r.plannedStart,
    end: r.plannedEnd,
    label: takenLabel(
      r,
      titleVisible(r.category, study) && !isTestNamed(r.title),
      zone,
    ),
  }));
}

/** The kinds the owner already uses, so a proposal keeps their spelling. */
async function knownKinds(userId: string, study: string[]) {
  const rows = await db().routineBlock.findMany({
    where: { userId },
    select: { category: true },
    distinct: ['category'],
  });
  return [...new Set([...rows.map((r) => r.category), ...study])];
}

/**
 * `propose_blocks`: checks a day's proposed blocks and returns what the model is told and
 * the proposal to store. Days outside today to Sunday are refused; the week is generated
 * first so routine blocks count as taken.
 */
export async function proposeBlocks(
  user: ScheduleUser,
  args: ProposeArgs,
  now: Date,
): Promise<{ result: unknown; proposal?: Proposal }> {
  const today = dayKey(now, user.timezone);
  const window = planWindow(today);
  if (args.day < window.first || args.day > window.last)
    return {
      result: {
        error: `${AGENT_NAME} plans only ${window.first} to ${window.last}. Next week starts with Prepare next week in Weekly review.`,
      },
    };
  await generateThroughSunday(user, today);
  const study = await studyKinds(user.id);
  const [taken, known] = await Promise.all([
    takenOn(db(), user.id, args.day, user.timezone, study),
    knownKinds(user.id, study),
  ]);
  const blocks = checkBlocks(
    args.day,
    args.blocks,
    taken,
    now,
    user.timezone,
    known,
  );
  const proposal: Proposal = {
    id: randomUUID(),
    day: args.day,
    blocks,
    status: 'shown',
  };
  return {
    proposal,
    result: {
      shown: true,
      day: args.day,
      blocks: blocks.map((b) => ({
        title: b.title,
        time: `${b.start}–${b.end}`,
        ...(b.conflict ? { wontBeAdded: b.conflict } : { ok: true }),
      })),
      note: 'Shown to the owner as a card. Nothing is added until they press Add to plan.',
    },
  };
}

export const newSuggestion = (text: string, reason: string): Suggestion => ({
  id: randomUUID(),
  text,
  reason,
  status: 'shown',
});

/** Loads one of the owner's answers and its cards, for a change under the lock. */
async function answerOf(tx: Tx, user: ScheduleUser, messageId: string) {
  const message = await tx.agentMessage.findFirst({
    where: { id: messageId, userId: user.id, role: 'ASSISTANT' },
    select: { id: true, metadata: true },
  });
  if (!message) throw new Error('This answer no longer exists.');
  const base =
    message.metadata && typeof message.metadata === 'object'
      ? (message.metadata as Record<string, unknown>)
      : {};
  const meta = readMetadata(base);
  const save = () =>
    tx.agentMessage.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...base,
          proposals: meta.proposals,
          suggestions: meta.suggestions,
        } as Prisma.InputJsonValue,
      },
    });
  return { meta, save };
}

/**
 * Add to plan: every block of the proposal is checked again against the day as it is now,
 * and written only if all of them still fit. Anything that changed stops the whole plan.
 */
export async function applyProposal(
  user: ScheduleUser,
  messageId: string,
  proposalId: string,
  now = new Date(),
) {
  const study = await studyKinds(user.id);
  return locked(user.id, async (tx) => {
    const { meta, save } = await answerOf(tx, user, messageId);
    const p = meta.proposals.find((x) => x.id === proposalId);
    if (!p) throw new Error('This plan no longer exists.');
    if (p.status === 'applied') throw new Error('This plan is already added.');
    if (p.status === 'dismissed') throw new Error('This plan was dismissed.');
    const blocks = addable(p);
    if (!blocks.length) throw new Error('Nothing in this plan can be added.');
    if (p.day < dayKey(now, user.timezone))
      throw new Error('This plan is for a day that has passed.');
    await generateInTransaction(tx, user, p.day);
    const taken = await takenOn(tx, user.id, p.day, user.timezone, study);
    const again = checkBlocks(p.day, blocks, taken, now, user.timezone, []);
    const changed = again.find((b) => b.conflict);
    if (changed)
      throw new Error(
        `Your day changed since ${AGENT_NAME} proposed this (${changed.start}–${changed.end}: ${changed.conflict}). Nothing was added. Ask ${AGENT_NAME} again.`,
      );
    const ids: string[] = [];
    for (const b of blocks) {
      const saved = await saveBlockIn(
        tx,
        user,
        {
          title: b.title,
          category: b.kind,
          description: '',
          priority: 2,
          day: p.day,
          endDay: p.day,
          startLocal: b.start,
          endLocal: b.end,
        },
        false,
      );
      ids.push(saved.id);
    }
    p.status = 'applied';
    p.blockIds = ids;
    await save();
    return { day: p.day, ids };
  });
}

export async function dismissProposal(
  user: ScheduleUser,
  messageId: string,
  proposalId: string,
) {
  return locked(user.id, async (tx) => {
    const { meta, save } = await answerOf(tx, user, messageId);
    const p = meta.proposals.find((x) => x.id === proposalId);
    if (!p || p.status !== 'shown') throw new Error('This plan is not open.');
    p.status = 'dismissed';
    await save();
  });
}

/** After Undo cancelled the added blocks, the card offers Add to plan again. */
export async function reopenProposal(
  user: ScheduleUser,
  messageId: string,
  proposalId: string,
) {
  await locked(user.id, async (tx) => {
    const { meta, save } = await answerOf(tx, user, messageId);
    const p = meta.proposals.find((x) => x.id === proposalId);
    if (!p || p.status !== 'applied') return;
    p.status = 'shown';
    delete p.blockIds;
    await save();
  });
}

/** Keep or dismiss a "Rumi knows" suggestion; keeping writes the owner's line. */
export async function answerSuggestion(
  user: ScheduleUser,
  messageId: string,
  suggestionId: string,
  keep: boolean,
) {
  return locked(user.id, async (tx) => {
    const { meta, save } = await answerOf(tx, user, messageId);
    const s = meta.suggestions.find((x) => x.id === suggestionId);
    if (!s || s.status !== 'shown')
      throw new Error('This suggestion is not open.');
    const lines = keep
      ? await tx.agentMemory.findMany({
          where: { userId: user.id },
          select: { text: true },
        })
      : [];
    const already = lines.some(
      (l) => l.text.trim().toLowerCase() === s.text.trim().toLowerCase(),
    );
    if (keep && !already) {
      const count = lines.length;
      if (count >= MEMORY.items)
        throw new Error(
          `${AGENT_NAME} keeps up to ${MEMORY.items} lines. Remove one in Settings first.`,
        );
      await tx.agentMemory.create({ data: { userId: user.id, text: s.text } });
    }
    s.status = keep ? 'kept' : 'dismissed';
    await save();
  });
}
