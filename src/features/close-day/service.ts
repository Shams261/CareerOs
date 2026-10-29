import 'server-only';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { dayBounds, dayKey, hhmm } from '@/lib/time';
import {
  locked,
  recordReview,
  type ScheduleUser,
} from '@/features/schedule/service';
import { saveBlockIn } from '@/features/schedule/editing';
import { executeIn } from '@/features/execution/service';
import { closeNudges } from '@/features/nudges/service';
import {
  closeTarget,
  leftKind,
  readCloseForm,
  STOP_DEFAULT,
  tomorrowSlot,
  type Choice,
  type Interval,
} from './domain';
import type { BlockLike } from '@/features/schedule/row';

/** The owner's stop time: the daily reminder's time when one is saved. */
export async function stopTime(userId: string) {
  const pref = await db().notificationPreference.findFirst({
    where: { userId, type: 'DAILY_PROGRESS' },
    select: { preferredTime: true },
  });
  return pref?.preferredTime ?? STOP_DEFAULT;
}

async function takenOn(
  client: Pick<Prisma.TransactionClient, 'timeBlock'>,
  userId: string,
  day: string,
  zone: string,
  except: string[],
): Promise<Interval[]> {
  const bounds = dayBounds(day, zone);
  const rows = await client.timeBlock.findMany({
    where: {
      dailyPlan: { userId },
      status: { not: 'CANCELLED' },
      id: except.length ? { notIn: except } : undefined,
      plannedStart: { lt: bounds.end },
      plannedEnd: { gt: bounds.start },
    },
    select: { plannedStart: true, plannedEnd: true },
  });
  return rows.map((r) => ({ start: r.plannedStart, end: r.plannedEnd }));
}

/**
 * Where "Tomorrow" would put each block still left without a recorded session, in planned
 * order, each one keeping clear of tomorrow's blocks and of the slots before it.
 */
export async function previewSlots(
  user: ScheduleUser,
  blocks: BlockLike[],
  today: string,
  now: Date,
) {
  const target = closeTarget(today);
  const moving = blocks
    .filter((b) => leftKind(b, now) === 'unrecorded' && !b.interviewRoundId)
    .sort((a, b) => +a.plannedStart - +b.plannedStart);
  if (!moving.length) return { target, slots: new Map() };
  const taken = await takenOn(
    db(),
    user.id,
    target,
    user.timezone,
    moving.map((b) => b.id),
  );
  const slots = new Map<string, ReturnType<typeof tomorrowSlot>>();
  for (const b of moving) {
    const slot = tomorrowSlot(b, target, user.timezone, taken);
    slots.set(b.id, slot);
    if (slot) taken.push(slot);
  }
  return { target, slots };
}

/**
 * Closes a day in one transaction: each block still left goes to tomorrow at the previewed
 * time, is let go (skipped, reason "Let go") or is marked done, then the check-in line is
 * saved and the day reviewed. Anything that no longer matches the preview stops the close
 * and nothing is written.
 */
export async function closeDay(
  user: ScheduleUser,
  entries: Iterable<[string, unknown]>,
  now = new Date(),
) {
  const input = readCloseForm(entries);
  const today = dayKey(now, user.timezone);
  if (input.day > today) throw new Error('A day can be closed once it starts.');
  const target = closeTarget(today);
  const counts: Record<Choice, number> = { tomorrow: 0, letgo: 0, done: 0 };
  await locked(user.id, async (tx) => {
    const running = await tx.actualSession.findFirst({
      where: { userId: user.id, endedAt: null },
      select: { id: true },
    });
    if (running)
      throw new Error('Pause the running session before closing the day.');
    const plan = await tx.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(input.day) } },
      include: {
        blocks: {
          orderBy: { plannedStart: 'asc' },
          include: { sessions: true },
        },
      },
    });
    const left = (plan?.blocks ?? []).filter((b) => leftKind(b, now));
    const ids = left.map((b) => b.id);
    const taken = await takenOn(tx, user.id, target, user.timezone, ids);
    for (const b of left) {
      const choice = input.choices[b.id];
      if (!choice) throw new Error(`Choose what happens to ${b.title}.`);
      if (input.versions[b.id] !== b.updatedAt.toISOString())
        throw new Error(
          `${b.title} changed since this opened. Reload and close again.`,
        );
      const kind = leftKind(b, now)!;
      if (choice === 'letgo') {
        await executeIn(tx, user, b.id, 'skip', 'Let go', now);
      } else if (choice === 'done' && kind === 'recorded') {
        await executeIn(tx, user, b.id, 'complete', '', now);
      } else if (
        choice === 'tomorrow' &&
        kind === 'unrecorded' &&
        !b.interviewRoundId
      ) {
        const start = new Date(input.slots[b.id] ?? '');
        const end = new Date(+start + (+b.plannedEnd - +b.plannedStart));
        if (
          Number.isNaN(+start) ||
          dayKey(start, user.timezone) !== target ||
          taken.some((t) => +start < +t.end && +end > +t.start)
        )
          throw new Error(
            `Tomorrow ${Number.isNaN(+start) ? '' : `${hhmm(start, user.timezone)} `}is no longer free for ${b.title}. Nothing was changed.`,
          );
        await saveBlockIn(
          tx,
          user,
          {
            id: b.id,
            title: b.title,
            description: b.description ?? '',
            category: b.category,
            goalId: b.goalId ?? '',
            priority: b.priority,
            day: target,
            startLocal: hhmm(start, user.timezone),
            endDay: dayKey(end, user.timezone),
            endLocal: hhmm(end, user.timezone),
          },
          false,
          b.updatedAt.toISOString(),
        );
        taken.push({ start, end });
      } else {
        throw new Error(`Choose what happens to ${b.title}.`);
      }
      counts[choice]++;
    }
    await recordReview(tx, user.id, input.day, { notes: input.note }, now);
    await closeNudges(tx, user.id, input.day, now);
  });
  return counts;
}
