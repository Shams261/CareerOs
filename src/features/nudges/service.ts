import 'server-only';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { dayBounds, dayKey } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import { reminderKey } from '@/features/notifications/domain';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { shiftDay } from '@/features/schedule/domain';
import {
  DEFAULT_NUDGES,
  eveningDue,
  eveningLine,
  inAppOnly,
  isStudyCategory,
  morningDue,
  morningLine,
  nudgeInput,
  type NudgeSetting,
} from './domain';

type Row = {
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  days: number;
  onlyStudyDays: boolean;
  quietStart: string;
  quietEnd: string;
  pausedUntil: Date | null;
  studyCategories: string[];
};
/** The stored row as pure settings (the pause date is a DATE label). */
export const nudgeSetting = (row: Row | null | undefined): NudgeSetting =>
  row
    ? {
        ...row,
        pausedUntil: row.pausedUntil
          ? row.pausedUntil.toISOString().slice(0, 10)
          : null,
        studyCategories: row.studyCategories.length
          ? row.studyCategories
          : DEFAULT_NUDGES.studyCategories,
      }
    : DEFAULT_NUDGES;

export const nudgeKey = (
  userId: string,
  type: 'STUDY_MORNING' | 'STUDY_EVENING',
  day: string,
) => reminderKey(userId, type, 'study', day);

/**
 * Queues today's Study Nudges for one owner, inside the reminder job's owner lock. Every rule
 * reads the latest plan, so a moved, skipped or rested block changes the outcome at once.
 */
export async function processStudyNudges(
  tx: Prisma.TransactionClient,
  user: { id: string; timezone: string; lastActiveAt: Date | null },
  row: Row | null,
  now: Date,
) {
  const s = nudgeSetting(row);
  if (!s.morningEnabled && !s.eveningEnabled) return 0;
  const zone = user.timezone,
    day = dayKey(now, zone),
    bounds = dayBounds(day, zone);
  const [plan, sessions, running, logged] = await Promise.all([
    tx.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      include: {
        blocks: { include: { sessions: { select: { id: true } } } },
      },
    }),
    tx.actualSession.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: bounds.start, lt: bounds.end },
      },
      select: { category: true },
    }),
    tx.actualSession.findFirst({
      where: { userId: user.id, endedAt: null },
      select: { id: true },
    }),
    tx.notificationLog.findMany({
      where: {
        dedupeKey: {
          in: [
            nudgeKey(user.id, 'STUDY_MORNING', day),
            nudgeKey(user.id, 'STUDY_EVENING', day),
          ],
        },
      },
      select: { type: true, createdAt: true },
    }),
  ]);
  const facts = {
    studyBlocks: (plan?.blocks ?? [])
      .filter(
        (b) =>
          b.status !== 'CANCELLED' &&
          isStudyCategory(b.category, s.studyCategories) &&
          !isTestNamed(b.title),
      )
      .map((b) => ({
        id: b.id,
        title: b.title,
        status: b.status,
        plannedStart: b.plannedStart,
        plannedEnd: b.plannedEnd,
        recorded: b.sessions.length > 0,
      })),
    studySessionToday: sessions.some((x) =>
      isStudyCategory(x.category, s.studyCategories),
    ),
    rested: !!plan?.restAt,
    closed: !!plan?.reviewedAt,
    running: !!running,
    morningAt:
      logged.find((l) => l.type === 'STUDY_MORNING')?.createdAt ?? null,
    eveningAt:
      logged.find((l) => l.type === 'STUDY_EVENING')?.createdAt ?? null,
  };
  const quiet = inAppOnly(user.lastActiveAt, now);
  let queued = 0;
  const queue = async (
    type: 'STUDY_MORNING' | 'STUDY_EVENING',
    title: string,
    body: string,
    blockId: string | null,
  ) => {
    await tx.notificationLog.upsert({
      where: { dedupeKey: nudgeKey(user.id, type, day) },
      update: {},
      create: {
        userId: user.id,
        type,
        title,
        body,
        scheduledFor: now,
        dedupeKey: nudgeKey(user.id, type, day),
        inAppOnly: quiet,
        metadata: blockId ? { blockId } : undefined,
      },
    });
    queued++;
  };
  if (morningDue(s, facts, now, zone))
    await queue(
      'STUDY_MORNING',
      'Good morning',
      morningLine(day),
      facts.studyBlocks
        .filter((b) => b.plannedEnd > now && b.status === 'PLANNED')
        .sort((a, b) => +a.plannedStart - +b.plannedStart)[0]?.id ?? null,
    );
  const block = eveningDue(s, facts, now, zone);
  if (block)
    await queue('STUDY_EVENING', 'Study check-in', eveningLine(day), block.id);
  return queued;
}

/** Today's open nudge for the card on Today (one statement), with the block it is about. */
export async function todaysNudge(user: ScheduleUser, day: string) {
  const n = await db().notificationLog.findFirst({
    where: {
      userId: user.id,
      type: { in: ['STUDY_MORNING', 'STUDY_EVENING'] },
      readAt: null,
      dedupeKey: {
        in: [
          nudgeKey(user.id, 'STUDY_MORNING', day),
          nudgeKey(user.id, 'STUDY_EVENING', day),
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, body: true, metadata: true },
  });
  if (!n) return null;
  const blockId =
    n.metadata && typeof n.metadata === 'object' && 'blockId' in n.metadata
      ? String((n.metadata as { blockId: unknown }).blockId)
      : null;
  return {
    id: n.id,
    kind:
      n.type === 'STUDY_MORNING' ? ('morning' as const) : ('evening' as const),
    body: n.body,
    blockId,
  };
}

/** "Useful?" on a nudge. Answering also closes the card (the reminder is read). */
export async function nudgeFeedback(
  user: ScheduleUser,
  id: string,
  value: 'HELPFUL' | 'NOT_TODAY' | 'TOO_MANY',
  now = new Date(),
) {
  const { count } = await db().notificationLog.updateMany({
    where: {
      id,
      userId: user.id,
      type: { in: ['STUDY_MORNING', 'STUDY_EVENING'] },
    },
    data: { feedback: value, readAt: now },
  });
  if (!count) throw new Error('This check-in is no longer open.');
}

/** Marks or clears a rest day. Resting reads today's open study nudges (they are answered). */
export async function setRestDay(
  user: ScheduleUser,
  day: string,
  rest: boolean,
  now = new Date(),
) {
  await locked(user.id, async (tx) => {
    await tx.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      create: {
        userId: user.id,
        date: new Date(day),
        restAt: rest ? now : null,
      },
      update: { restAt: rest ? now : null },
    });
    if (rest) await closeNudges(tx, user.id, day, now);
  });
}

/**
 * Marks the day's open study nudges read: resting or moving the block answers the check-in,
 * so its card leaves Today. Feedback, when given, stays as it was.
 */
export async function closeNudges(
  client: Pick<Prisma.TransactionClient, 'notificationLog'>,
  userId: string,
  day: string,
  now = new Date(),
) {
  await client.notificationLog.updateMany({
    where: {
      userId,
      readAt: null,
      dedupeKey: {
        in: [
          nudgeKey(userId, 'STUDY_MORNING', day),
          nudgeKey(userId, 'STUDY_EVENING', day),
        ],
      },
    },
    data: { readAt: now },
  });
}

/** Saves the Settings form. The pause is kept; only `pauseNudges` changes it. */
export async function saveNudgeSetting(user: ScheduleUser, raw: unknown) {
  const input = nudgeInput.parse(raw);
  await db().studyNudgeSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...input },
    update: input,
  });
}

/** Pause through a day label (this week's Sunday, or open-ended), or resume with null. */
export async function pauseNudges(user: ScheduleUser, until: string | null) {
  await db().studyNudgeSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, pausedUntil: until ? new Date(until) : null },
    update: { pausedUntil: until ? new Date(until) : null },
  });
}

/** Sunday of the owner's current week, for "Pause this week". */
export const thisSunday = (day: string) => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, dow === 0 ? 0 : 7 - dow);
};

/** The presence beat: at most one write every two minutes. */
export async function markPresent(userId: string, now = new Date()) {
  await db().user.updateMany({
    where: {
      id: userId,
      OR: [
        { lastActiveAt: null },
        { lastActiveAt: { lt: new Date(+now - 120_000) } },
      ],
    },
    data: { lastActiveAt: now },
  });
}
