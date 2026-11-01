import 'server-only';
import { db } from '@/server/db';
import { aiConfig } from '@/lib/env';
import type { Prisma } from '@/generated/prisma/client';
import { dayBounds, dayKey } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import { reminderKey } from '@/features/notifications/domain';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { shiftDay } from '@/features/schedule/domain';
import { rumiStateOf } from '@/features/agent/line-domain';
import {
  blockBody,
  blockStartDue,
  DEFAULT_NUDGES,
  eveningBody,
  eveningDue,
  inAppOnly,
  isStudyCategory,
  MIDDAY_PAUSE_DAYS,
  middayBody,
  middayDue,
  morningBody,
  morningDue,
  nudgeInput,
  readLineLanguage,
  recapBody,
  recapDue,
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
  blockStartEnabled: boolean;
  blockStartMinutes: number;
  rumiLines: boolean;
  middayEnabled: boolean;
  middayTime: string;
  middayPausedUntil: Date | null;
};
/** The stored row as pure settings (the pause date is a DATE label). */
export const nudgeSetting = (row: Row | null | undefined): NudgeSetting =>
  row
    ? {
        ...row,
        pausedUntil: row.pausedUntil
          ? row.pausedUntil.toISOString().slice(0, 10)
          : null,
        middayPausedUntil: row.middayPausedUntil
          ? row.middayPausedUntil.toISOString().slice(0, 10)
          : null,
        studyCategories: row.studyCategories.length
          ? row.studyCategories
          : DEFAULT_NUDGES.studyCategories,
      }
    : DEFAULT_NUDGES;

/** The three lines of a day (WI-101 adds the afternoon one). */
export type LineType = 'STUDY_MORNING' | 'STUDY_MIDDAY' | 'STUDY_EVENING';
export const LINE_TYPES: LineType[] = [
  'STUDY_MORNING',
  'STUDY_MIDDAY',
  'STUDY_EVENING',
];
export const nudgeKey = (userId: string, type: LineType, day: string) =>
  reminderKey(userId, type, 'study', day);
const lineKeys = (userId: string, day: string) =>
  LINE_TYPES.map((t) => nudgeKey(userId, t, day));
/** One block-start nudge per block and day (WI-039). */
export const blockNudgeKey = (userId: string, blockId: string, day: string) =>
  reminderKey(userId, 'STUDY_BLOCK', blockId, day);
/** Every block-start nudge of one owner-day, for counting and closing. */
const blockNudgesOf = (userId: string, day: string) => ({
  startsWith: `${userId}:STUDY_BLOCK:`,
  endsWith: `:${day}`,
});

const studyOf = (
  blocks: {
    id: string;
    title: string;
    status: string;
    category: string;
    plannedStart: Date;
    plannedEnd: Date;
    sessions: { id: string }[];
  }[],
  chosen: string[],
) =>
  blocks
    .filter(
      (b) =>
        b.status !== 'CANCELLED' &&
        isStudyCategory(b.category, chosen) &&
        !isTestNamed(b.title),
    )
    .sort((a, b) => +a.plannedStart - +b.plannedStart);

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
  if (!s.morningEnabled && !s.eveningEnabled && !s.blockStartEnabled) return 0;
  const zone = user.timezone,
    day = dayKey(now, zone),
    bounds = dayBounds(day, zone);
  const [plan, sessions, running, logged, blockLogs] = await Promise.all([
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
      where: { dedupeKey: { in: lineKeys(user.id, day) } },
      // The time each was due (the run's `now`), not the row's database clock.
      select: { type: true, scheduledFor: true },
    }),
    s.blockStartEnabled
      ? tx.notificationLog.findMany({
          where: {
            userId: user.id,
            type: 'STUDY_BLOCK',
            dedupeKey: blockNudgesOf(user.id, day),
          },
          select: { metadata: true },
        })
      : [],
  ]);
  const study = studyOf(plan?.blocks ?? [], s.studyCategories);
  const facts = {
    studyBlocks: study.map((b) => ({
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
      logged.find((l) => l.type === 'STUDY_MORNING')?.scheduledFor ?? null,
    eveningAt:
      logged.find((l) => l.type === 'STUDY_EVENING')?.scheduledFor ?? null,
    middayAt:
      logged.find((l) => l.type === 'STUDY_MIDDAY')?.scheduledFor ?? null,
    blockNudged: blockLogs.map((l) => blockIdOf(l.metadata) ?? ''),
  };
  /** Another day's study blocks, read only when a nudge that names them is due. */
  const studyOn = async (other: string) =>
    studyOf(
      (
        await tx.dailyPlan.findUnique({
          where: { userId_date: { userId: user.id, date: new Date(other) } },
          include: {
            blocks: { include: { sessions: { select: { id: true } } } },
          },
        })
      )?.blocks ?? [],
      s.studyCategories,
    );
  const quiet = inAppOnly(user.lastActiveAt, now);
  // Rumi writes the three lines after the lock (WI-101): the row is queued with its template
  // and marked pending; without AI configured the template is the line.
  const rumi = s.rumiLines && !!aiConfig();
  let queued = 0;
  const queue = async (
    type: LineType | 'STUDY_BLOCK',
    dedupeKey: string,
    title: string,
    body: string,
    blockId: string | null,
  ) => {
    const metadata = {
      ...(blockId ? { blockId } : {}),
      ...(rumi && type !== 'STUDY_BLOCK' ? { rumi: 'pending' } : {}),
    };
    await tx.notificationLog.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        userId: user.id,
        type,
        title,
        body,
        scheduledFor: now,
        dedupeKey,
        inAppOnly: quiet,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      },
    });
    queued++;
  };
  if (morningDue(s, facts, now, zone)) {
    const yesterdayLeft = (await studyOn(shiftDay(day, -1))).filter(
      (b) =>
        b.status === 'PLANNED' && !b.sessions.length && b.plannedEnd <= now,
    );
    await queue(
      'STUDY_MORNING',
      nudgeKey(user.id, 'STUDY_MORNING', day),
      'Good morning',
      morningBody(
        study.filter((b) => b.status !== 'SKIPPED'),
        yesterdayLeft,
        day,
        zone,
      ),
      facts.studyBlocks.find(
        (b) => b.plannedEnd > now && b.status === 'PLANNED',
      )?.id ?? null,
    );
  }
  const started = blockStartDue(s, facts, now, zone);
  if (started)
    await queue(
      'STUDY_BLOCK',
      blockNudgeKey(user.id, started.id, day),
      'Block started',
      blockBody(started, now, zone),
      started.id,
    );
  const ahead = middayDue(s, facts, now, zone);
  if (ahead)
    await queue(
      'STUDY_MIDDAY',
      nudgeKey(user.id, 'STUDY_MIDDAY', day),
      'This afternoon',
      middayBody(ahead, now, day, zone),
      ahead.id,
    );
  if (s.rumiLines) {
    // The evening recap (WI-101) comes on every active evening, with the block left if any.
    const recap = recapDue(s, facts, now, zone);
    if (recap) {
      const tomorrow = (await studyOn(shiftDay(day, 1))).find(
        (b) => b.status === 'PLANNED',
      );
      const recorded = await tx.actualSession.findMany({
        where: {
          userId: user.id,
          startedAt: { gte: bounds.start, lt: bounds.end },
          endedAt: { not: null },
        },
        select: { category: true, startedAt: true, endedAt: true },
      });
      const minutes = recorded
        .filter((x) => isStudyCategory(x.category, s.studyCategories))
        .reduce(
          (sum, x) => sum + Math.round((+x.endedAt! - +x.startedAt) / 60_000),
          0,
        );
      await queue(
        'STUDY_EVENING',
        nudgeKey(user.id, 'STUDY_EVENING', day),
        'This evening',
        recapBody(minutes, recap.left, tomorrow ?? null, day, zone),
        recap.left?.id ?? null,
      );
    }
  } else {
    const block = eveningDue(s, facts, now, zone);
    if (block) {
      const tomorrow = (await studyOn(shiftDay(day, 1))).find(
        (b) => b.status === 'PLANNED',
      );
      await queue(
        'STUDY_EVENING',
        nudgeKey(user.id, 'STUDY_EVENING', day),
        'Study check-in',
        eveningBody(block, tomorrow ?? null, day, zone),
        block.id,
      );
    }
  }
  return queued;
}

const blockIdOf = (metadata: unknown) =>
  metadata && typeof metadata === 'object' && 'blockId' in metadata
    ? String((metadata as { blockId: unknown }).blockId)
    : null;

/** Today's open nudge for the card on Today (one statement), with the block it is about. */
export async function todaysNudge(user: ScheduleUser, day: string) {
  const n = await db().notificationLog.findFirst({
    where: {
      userId: user.id,
      readAt: null,
      OR: [
        {
          type: { in: LINE_TYPES },
          dedupeKey: { in: lineKeys(user.id, day) },
        },
        { type: 'STUDY_BLOCK', dedupeKey: blockNudgesOf(user.id, day) },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, body: true, metadata: true },
  });
  if (!n) return null;
  return {
    id: n.id,
    kind:
      n.type === 'STUDY_MORNING'
        ? ('morning' as const)
        : n.type === 'STUDY_MIDDAY'
          ? ('midday' as const)
          : n.type === 'STUDY_BLOCK'
            ? ('block' as const)
            : ('evening' as const),
    body: n.body,
    blockId: blockIdOf(n.metadata),
    // Rumi wrote this line (WI-101); a pending or fallback row reads as the template.
    rumi: rumiStateOf(n.metadata) === 'written',
  };
}

/**
 * "Useful?" on a nudge. Answering also closes the card (the reminder is read). "Too many" on
 * one of Rumi's lines rests the afternoon line for a week (WI-101).
 */
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
      type: { in: [...LINE_TYPES, 'STUDY_BLOCK'] },
    },
    data: { feedback: value, readAt: now },
  });
  if (!count) throw new Error('This check-in is no longer open.');
  if (value === 'TOO_MANY') {
    const until = shiftDay(dayKey(now, user.timezone), MIDDAY_PAUSE_DAYS);
    await db().studyNudgeSetting.updateMany({
      where: { userId: user.id, rumiLines: true },
      data: { middayPausedUntil: new Date(until) },
    });
  }
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
      OR: [
        { dedupeKey: { in: lineKeys(userId, day) } },
        { dedupeKey: blockNudgesOf(userId, day) },
      ],
    },
    data: { readAt: now },
  });
}

/** Saves the Settings form. The pauses are kept; only `pauseNudges` and "Too many" change them. */
export async function saveNudgeSetting(user: ScheduleUser, raw: unknown) {
  const input = nudgeInput.parse(raw);
  await db().studyNudgeSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...input },
    update: input,
  });
}
/** The language of Rumi's lines (WI-101), on the agent setting row. */
export async function setLineLanguage(user: ScheduleUser, language: string) {
  const lineLanguage = readLineLanguage(language);
  await db().agentSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, lineLanguage },
    update: { lineLanguage },
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
