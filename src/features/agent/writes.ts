import 'server-only';
/**
 * Rumi's small writes (WI-102, ADR-030 class A). Each runs at once inside the answer, under
 * the owner lock, through the same writers the pages use, and comes back as an action with a
 * persistent Undo. The day's count is read under the same lock. Nothing here trusts the
 * model beyond its validated arguments. Covered by tests/agent-writes-database.test.ts.
 */
import { ownerWords } from '@/lib/action-error';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { dayBounds, dayKey, weekdayDate } from '@/lib/time';
import { noteInput } from '@/features/notes/service';
import { generateInTransaction } from '@/features/schedule/service';
import { locked, type ScheduleUser } from '@/server/lock';
import { saveBlockIn } from '@/features/schedule/editing';
import { setRestDayIn } from '@/features/nudges/service';
import { AGENT_NAME } from '@/features/agent/constants';
import { checkBlocks, kindFor, planWindow } from './plan-domain';
import { knownKinds, takenOn } from './plans';
import { studyKinds } from './tools';
import {
  BLOCK_MAX_MINUTES,
  readActions,
  spanMinutes,
  writeRefusal,
  type BlockArgs,
  type WriteAction,
} from './write-domain';
import type { WriteTool } from '@/features/agent/text';

type Tx = Prisma.TransactionClient;
type Outcome = { result: unknown; action?: WriteAction };

/** The changes Rumi made today across the owner's answers, read under the lock. */
async function writesToday(tx: Tx, user: ScheduleUser, now: Date) {
  const start = dayBounds(dayKey(now, user.timezone), user.timezone).start;
  const rows = await tx.agentMessage.findMany({
    where: { userId: user.id, role: 'ASSISTANT', createdAt: { gte: start } },
    select: { metadata: true },
  });
  return rows.reduce((n, r) => n + readActions(r.metadata).length, 0);
}

const action = (
  tool: WriteTool,
  label: string,
  detail: string,
  undo: WriteAction['undo'],
): WriteAction => ({
  id: randomUUID(),
  tool,
  label,
  detail,
  undo,
  status: 'done',
});
const refused = (error: string): Outcome => ({
  result: { done: false, error },
});

/**
 * Runs one write for the owner. `inAnswer` is how many this answer already made; `round` and
 * `maxRounds` keep the last rounds free of changes. A refusal changes nothing.
 */
export async function runWrite(
  user: ScheduleUser,
  tool: WriteTool,
  args: Record<string, unknown>,
  now: Date,
  {
    round,
    maxRounds,
    inAnswer,
  }: { round: number; maxRounds: number; inAnswer: number },
): Promise<Outcome> {
  const today = dayKey(now, user.timezone);
  // Read before the lock: the study kinds decide which neighbours a clash may name.
  const study = tool === 'add_block' ? await studyKinds(user.id) : [];
  const known = tool === 'add_block' ? await knownKinds(user.id, study) : [];
  try {
    return await locked(user.id, async (tx) => {
      const refusal = writeRefusal({
        round,
        maxRounds,
        inAnswer,
        today: await writesToday(tx, user, now),
      });
      if (refusal) return refused(refusal);
      if (tool === 'add_note') {
        const { body } = noteInput.parse(args);
        const note = await tx.quickNote.create({
          data: { userId: user.id, body },
        });
        return {
          result: { done: true, added: 'note', body },
          action: action('add_note', 'Note added', body, {
            kind: 'remove-note',
            payload: { id: note.id },
          }),
        };
      }
      if (tool === 'rest_today') {
        const plan = await tx.dailyPlan.findUnique({
          where: { userId_date: { userId: user.id, date: new Date(today) } },
          select: { restAt: true },
        });
        if (plan?.restAt) return refused('Today is already a rest day.');
        await setRestDayIn(tx, user, today, true, now);
        return {
          result: { done: true, restDay: today },
          action: action(
            'rest_today',
            'Rest day',
            `${weekdayDate(today)} · evening check-ins stop for today`,
            { kind: 'clear-rest-day', payload: { day: today } },
          ),
        };
      }
      return addBlock(tx, user, args as BlockArgs, now, today, study, known);
    });
  } catch (error) {
    // A writer's own refusal (an overlap found by saveBlock, a bad note) is the model's answer.
    const words = ownerWords(error);
    if (words) return refused(words.slice(0, 200));
    throw error;
  }
}

async function addBlock(
  tx: Tx,
  user: ScheduleUser,
  b: BlockArgs,
  now: Date,
  today: string,
  study: string[],
  known: string[],
): Promise<Outcome> {
  const window = planWindow(today);
  if (b.day < window.first || b.day > window.last)
    return refused(
      `${AGENT_NAME} adds blocks only from ${window.first} to ${window.last}.`,
    );
  const length = spanMinutes(b.start, b.end);
  if (length > BLOCK_MAX_MINUTES)
    return refused(
      `A block ${AGENT_NAME} adds is ${BLOCK_MAX_MINUTES / 60} hours at most. Offer a plan with propose_blocks instead.`,
    );
  // Routine blocks of that day count as taken, as on Today.
  await generateInTransaction(tx, user, b.day);
  const taken = await takenOn(tx, user.id, b.day, user.timezone, study);
  const [checked] = checkBlocks(
    b.day,
    [{ ...b, reason: 'Asked for' }],
    taken,
    now,
    user.timezone,
    known,
  );
  if (checked.conflict)
    return refused(
      `${checked.conflict}. Nothing was added; offer other times with propose_blocks.`,
    );
  const kind = kindFor(b.kind, known);
  const saved = await saveBlockIn(
    tx,
    user,
    {
      title: b.title,
      category: kind,
      description: '',
      priority: 2,
      day: b.day,
      endDay: b.day,
      startLocal: b.start,
      endLocal: b.end,
    },
    false,
  );
  return {
    result: {
      done: true,
      added: 'block',
      day: b.day,
      time: `${b.start}–${b.end}`,
      title: b.title,
    },
    action: action(
      'add_block',
      'Block added',
      `${b.day === today ? 'Today' : weekdayDate(b.day)} · ${b.start}–${b.end} · ${b.title} · ${kind}`,
      { kind: 'cancel-block', payload: { id: saved.id } },
    ),
  };
}

/**
 * Undo on one of Rumi's changes (WI-102): the action is read from the owner's own answer, its
 * stored undo runs only when it is the one its tool leaves, and the action reads "undone".
 */
export async function undoWrite(
  user: ScheduleUser,
  messageId: string,
  actionId: string,
  run: (kind: string, payload: unknown) => Promise<string>,
) {
  const message = await db().agentMessage.findFirst({
    where: { id: messageId, userId: user.id, role: 'ASSISTANT' },
    select: { id: true, metadata: true },
  });
  if (!message) throw new Error('This answer no longer exists.');
  const base =
    message.metadata && typeof message.metadata === 'object'
      ? (message.metadata as Record<string, unknown>)
      : {};
  const actions = readActions(base);
  const a = actions.find((x) => x.id === actionId);
  if (!a) throw new Error('This change is not on the answer.');
  if (a.status === 'undone') throw new Error('This change is already undone.');
  const words = await run(a.undo.kind, a.undo.payload);
  a.status = 'undone';
  await db().agentMessage.update({
    where: { id: message.id },
    data: { metadata: { ...base, actions } as Prisma.InputJsonValue },
  });
  return words;
}
