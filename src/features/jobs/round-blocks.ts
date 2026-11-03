import 'server-only';
import { ownedRound, type Tx } from './owned';
import { roundEnd, scheduleBlockTitle } from './domain';
import { locked, type ScheduleUser } from '@/server/lock';
import { dayKey } from '@/lib/time';
import { RUNNING_ON_INTERVIEW } from '@/features/deletes/domain';

/** An interview's block on the schedule follows its round: renamed, settled, moved or added back (WI-132). */
/**
 * A block the round form named "Company — Round" follows a rename of the round or the
 * company; a title the owner wrote on the block is never touched.
 */
export async function renameScheduleBlock(
  tx: Tx,
  user: ScheduleUser,
  roundId: string,
  from: string,
  to: string,
) {
  if (from === to) return;
  await tx.timeBlock.updateMany({
    where: {
      interviewRoundId: roundId,
      dailyPlan: { userId: user.id },
      title: from,
    },
    data: { title: to },
  });
}

/**
 * The linked block follows the round's result: a cancelled or missed interview cancels
 * its block (Today and Plan stop asking about it), a completed one completes it.
 */
export async function settleScheduleBlock(
  tx: Tx,
  user: ScheduleUser,
  roundId: string,
  status: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
  now: Date,
) {
  const block = await tx.timeBlock.findFirst({
    where: { interviewRoundId: roundId, dailyPlan: { userId: user.id } },
    include: { sessions: { where: { endedAt: null }, select: { id: true } } },
  });
  if (!block || !['PLANNED', 'IN_PROGRESS'].includes(block.status)) return;
  // WI-145: a running session stays on a live block; the owner stops it first, as on a delete.
  if (block.sessions.length) throw new Error(RUNNING_ON_INTERVIEW);
  await tx.timeBlock.update({
    where: { id: block.id },
    data:
      status === 'COMPLETED'
        ? { status: 'COMPLETED', completedAt: now, isOverride: true }
        : { status: 'CANCELLED', isOverride: true },
  });
}

/** Keeps a round's schedule block on the same appointment (one calendar concept, WI-006). */
export async function moveScheduleBlock(
  tx: Tx,
  user: ScheduleUser,
  roundId: string,
  interval: { scheduledStart: Date; scheduledEnd: Date | null },
) {
  const block = await tx.timeBlock.findFirst({
    where: { interviewRoundId: roundId, dailyPlan: { userId: user.id } },
  });
  if (!block) return;
  const day = dayKey(interval.scheduledStart, user.timezone);
  const plan = await tx.dailyPlan.upsert({
    where: { userId_date: { userId: user.id, date: new Date(day) } },
    create: { userId: user.id, date: new Date(day) },
    update: {},
  });
  await tx.timeBlock.update({
    where: { id: block.id },
    data: {
      dailyPlanId: plan.id,
      plannedStart: interval.scheduledStart,
      plannedEnd:
        interval.scheduledEnd ?? new Date(+interval.scheduledStart + 3600000),
      isOverride: true,
      // A rescheduled interview is on again: a cancelled or skipped block comes back.
      ...(block.status === 'CANCELLED' || block.status === 'SKIPPED'
        ? { status: 'PLANNED' as const, skipReason: null, completedAt: null }
        : {}),
    },
  });
}

/**
 * Puts an interview on the dated schedule as one TimeBlock linked to the round; that block is
 * what syncs to Google Calendar. Idempotent: an existing linked block is returned.
 */
export async function addInterviewToSchedule(
  user: ScheduleUser,
  roundId: string,
) {
  return locked(user.id, async (tx) => {
    const round = await ownedRound(tx, user.id, roundId);
    const existing = await tx.timeBlock.findFirst({
      where: { interviewRoundId: round.id, dailyPlan: { userId: user.id } },
    });
    if (round.status !== 'SCHEDULED')
      throw new Error(
        'Only scheduled interviews can be added to the schedule.',
      );
    if (existing) {
      if (!['CANCELLED', 'SKIPPED'].includes(existing.status)) return existing;
      // Added back after a cancellation: the same block, on the round's current time.
      const day = dayKey(round.scheduledStart, user.timezone);
      const plan = await tx.dailyPlan.upsert({
        where: { userId_date: { userId: user.id, date: new Date(day) } },
        create: { userId: user.id, date: new Date(day) },
        update: {},
      });
      return tx.timeBlock.update({
        where: { id: existing.id },
        data: {
          dailyPlanId: plan.id,
          status: 'PLANNED',
          skipReason: null,
          completedAt: null,
          plannedStart: round.scheduledStart,
          plannedEnd: roundEnd(round),
          isOverride: true,
        },
      });
    }
    const day = dayKey(round.scheduledStart, user.timezone);
    const plan = await tx.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      create: { userId: user.id, date: new Date(day) },
      update: {},
    });
    return tx.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title: scheduleBlockTitle(round.application.company, round.title),
        category: 'INTERVIEW',
        plannedStart: round.scheduledStart,
        plannedEnd: roundEnd(round),
        priority: 1,
        isOverride: true,
        interviewRoundId: round.id,
      },
    });
  });
}
