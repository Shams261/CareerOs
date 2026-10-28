import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import {
  clearBlockReminders,
  locked,
  type ScheduleUser,
} from '@/features/schedule/service';
import { DELETED } from './domain';

/**
 * Deletes on every record (WI-060). Each runs under the owner lock and touches only the
 * owner's rows. Single attempts, stage changes and activities stay append-only: they go only
 * with the record they belong to. A block is never removed outright, because its Google
 * event must go too: it is cancelled with the reason "Deleted", which removes the event on
 * the next sync and keeps it out of Today and Plan, and Undo restores it.
 */

/** Unread reminders about a record (and its rounds) leave the inbox with it. */
async function clearReminders(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
) {
  for (const id of ids)
    await tx.notificationLog.deleteMany({
      where: { userId, readAt: null, dedupeKey: { contains: id } },
    });
}

/** Cancels interview blocks as "Deleted", so Google drops their events too. */
async function dropBlocks(
  tx: Prisma.TransactionClient,
  userId: string,
  where: Prisma.TimeBlockWhereInput,
) {
  const blocks = await tx.timeBlock.findMany({
    where: { ...where, dailyPlan: { userId }, status: { not: 'CANCELLED' } },
    select: { id: true },
  });
  for (const b of blocks) {
    await tx.timeBlock.update({
      where: { id: b.id },
      data: { status: 'CANCELLED', skipReason: DELETED, completedAt: null },
    });
    await clearBlockReminders(tx, userId, b.id);
  }
}

/** A block added for one day; a routine's block is cancelled instead (the routine plans it). */
export async function deleteBlock(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const block = await tx.timeBlock.findFirst({
      where: { id, dailyPlan: { userId: user.id } },
      include: { _count: { select: { sessions: true } } },
    });
    if (!block) throw new Error('This block is no longer on your plan.');
    if (block.routineKey)
      throw new Error('A routine block is cancelled for the day, not deleted.');
    // Recorded time is the owner's record: its sessions go first, one by one.
    if (block._count.sessions)
      throw new Error(
        'This block has recorded time. Delete its sessions first, then the block.',
      );
    await tx.timeBlock.update({
      where: { id },
      data: { status: 'CANCELLED', skipReason: DELETED, completedAt: null },
    });
    await clearBlockReminders(tx, user.id, id);
    return block.title;
  });
}

/** An application with its rounds, prep items, history and prep docs. */
export async function deleteApplication(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const app = await tx.jobApplication.findFirst({
      where: { id, userId: user.id },
      select: { id: true, company: true, rounds: { select: { id: true } } },
    });
    if (!app) throw new Error('This application no longer exists.');
    const roundIds = app.rounds.map((r) => r.id);
    await dropBlocks(tx, user.id, { interviewRoundId: { in: roundIds } });
    await clearReminders(tx, user.id, [app.id, ...roundIds]);
    await tx.jobApplication.delete({ where: { id: app.id } });
    return app.company;
  });
}

/** One interview round with its prep items; its schedule block goes too. */
export async function deleteRound(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const round = await tx.interviewRound.findFirst({
      where: { id, userId: user.id },
      select: { id: true, title: true, applicationId: true },
    });
    if (!round) throw new Error('This interview no longer exists.');
    await dropBlocks(tx, user.id, { interviewRoundId: round.id });
    await clearReminders(tx, user.id, [round.id]);
    await tx.interviewRound.delete({ where: { id: round.id } });
    return round;
  });
}

/** A prep item or weak area; the returned fields let Undo put it back. */
export async function deletePrepItem(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const item = await tx.interviewPrepItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!item) throw new Error('This prep item no longer exists.');
    await tx.interviewPrepItem.delete({ where: { id: item.id } });
    return item;
  });
}

/**
 * A practice problem: one the owner added is deleted with its attempts; one from the imported
 * curriculum (linked to an imported roadmap item) is hidden, since an import would bring it back.
 */
export async function removeProblem(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const problem = await tx.dsaProblem.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        title: true,
        roadmapItems: { where: { slug: { not: null } }, select: { id: true } },
      },
    });
    if (!problem) throw new Error('This problem no longer exists.');
    if (problem.roadmapItems.length) {
      await tx.dsaProblem.update({
        where: { id: problem.id },
        data: { hiddenAt: new Date() },
      });
      return { title: problem.title, hidden: true };
    }
    await tx.dsaProblem.delete({ where: { id: problem.id } });
    return { title: problem.title, hidden: false };
  });
}

export async function unhideProblem(user: ScheduleUser, id: string) {
  const { count } = await locked(user.id, (tx) =>
    tx.dsaProblem.updateMany({
      where: { id, userId: user.id },
      data: { hiddenAt: null },
    }),
  );
  if (!count) throw new Error('This problem no longer exists.');
}

/** A goal; its roadmaps, blocks and routines keep their data, no longer linked to it. */
export async function deleteGoal(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const goal = await tx.goal.findFirst({
      where: { id, userId: user.id },
      select: { id: true, title: true },
    });
    if (!goal) throw new Error('This goal no longer exists.');
    await tx.goal.delete({ where: { id: goal.id } });
    return goal.title;
  });
}

/** A roadmap with all its items and kept cards. */
export async function deleteRoadmap(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const roadmap = await tx.roadmap.findFirst({
      where: { id, userId: user.id },
      select: { id: true, title: true, _count: { select: { items: true } } },
    });
    if (!roadmap) throw new Error('This roadmap no longer exists.');
    await tx.roadmap.delete({ where: { id: roadmap.id } });
    return roadmap.title;
  });
}

/** A finished session recorded by mistake; the returned fields let Undo put it back. */
export async function deleteSession(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const session = await tx.actualSession.findFirst({
      where: { id, userId: user.id },
    });
    if (!session) throw new Error('This session no longer exists.');
    if (!session.endedAt)
      throw new Error('Stop the running session before deleting it.');
    // Attempts and activities recorded from it lose the link (SetNull); Undo puts it back.
    const [attempts, activities] = await Promise.all([
      tx.dsaAttempt.findMany({
        where: { actualSessionId: session.id, userId: user.id },
        select: { id: true },
      }),
      tx.learningActivity.findMany({
        where: { actualSessionId: session.id, userId: user.id },
        select: { id: true },
      }),
    ]);
    await tx.actualSession.delete({ where: { id: session.id } });
    return {
      ...session,
      attemptIds: attempts.map((a) => a.id),
      activityIds: activities.map((a) => a.id),
    };
  });
}
