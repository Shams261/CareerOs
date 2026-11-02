import 'server-only';
import { ownedRound, type Tx } from './owned';
import { prepInput } from './domain';
import { locked, type ScheduleUser } from '@/server/lock';

/** Prep items and weak areas on a round, with their links (WI-132). */
async function validateLinks(
  tx: Tx,
  userId: string,
  links: {
    learningTopicId: string | null;
    dsaProblemId: string | null;
    dsaTopicId: string | null;
  },
) {
  if (
    links.learningTopicId &&
    !(await tx.learningTopic.findFirst({
      where: { id: links.learningTopicId, userId },
    }))
  )
    throw new Error('Linked learning topic not found in your workspace.');
  if (
    links.dsaProblemId &&
    !(await tx.dsaProblem.findFirst({
      where: { id: links.dsaProblemId, userId },
    }))
  )
    throw new Error('Linked DSA problem not found in your workspace.');
  if (
    links.dsaTopicId &&
    !(await tx.dsaTopic.findUnique({ where: { id: links.dsaTopicId } }))
  )
    throw new Error('Linked DSA topic not found.');
}

/** Prep items reference learning/DSA entities; nothing is copied and no assessment/attempt is created. */
export async function addPrepItem(user: ScheduleUser, raw: unknown) {
  const input = prepInput.parse(raw);
  return locked(user.id, async (tx) => {
    await ownedRound(tx, user.id, input.roundId);
    await validateLinks(tx, user.id, input);
    const ordering = await tx.interviewPrepItem.count({
      where: { roundId: input.roundId },
    });
    return tx.interviewPrepItem.create({
      data: { ...input, userId: user.id, ordering },
    });
  });
}

/** Explicit target state keeps repeated submissions idempotent. */
export async function setPrepItemDone(
  user: ScheduleUser,
  id: string,
  completed: boolean,
  now = new Date(),
) {
  return locked(user.id, async (tx) => {
    const item = await tx.interviewPrepItem.findFirst({
      where: { id, userId: user.id, round: { userId: user.id } },
    });
    if (!item) throw new Error('Prep item not found in your workspace.');
    if (item.completed === completed) return item;
    return tx.interviewPrepItem.update({
      where: { id },
      data: { completed, completedAt: completed ? now : null },
    });
  });
}
