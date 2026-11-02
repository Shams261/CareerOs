import 'server-only';
/**
 * Reminders that learn (WI-109): once a week, from the notification job, each owner's line
 * times follow when study starts, or a part turned off after three "Too many" in a row.
 * Code only. Covered by tests/nudges-learn.test.ts.
 */
import { db } from '@/server/db';
import { dayKey } from '@/lib/time';
import type { ScheduleUser } from '@/server/lock';
import { isStudyCategory } from '@/lib/categories';
import { nudgeSetting } from './service';
import {
  firstStartAfter,
  LEARN_EVERY_DAYS,
  LEARN_LOOK_BACK,
  learnDue,
  learnedLine,
  learnPart,
  PART_TYPE,
  type LineFact,
  type Part,
} from './learn';

const TIME_FIELD: Record<Part, 'morningTime' | 'middayTime' | 'eveningTime'> = {
  morning: 'morningTime',
  midday: 'middayTime',
  evening: 'eveningTime',
};
const ON_FIELD: Record<
  Part,
  'morningEnabled' | 'middayEnabled' | 'eveningEnabled'
> = {
  morning: 'morningEnabled',
  midday: 'middayEnabled',
  evening: 'eveningEnabled',
};

/** Runs the weekly learning for every owner whose turn it is. Returns the changes made. */
export async function learnNudgeTimes(now = new Date()) {
  // Only owners whose week is up: this runs with every reminder pass, so it reads little.
  const rows = await db().studyNudgeSetting.findMany({
    where: {
      learnTimes: true,
      OR: [
        { learnedAt: null },
        { learnedAt: { lte: new Date(+now - LEARN_EVERY_DAYS * 86_400_000) } },
      ],
    },
    include: { user: { select: { id: true, timezone: true } } },
  });
  let changes = 0;
  for (const row of rows) {
    if (!learnDue(row.learnedAt, now)) continue;
    changes += await learnFor(row.user, row, now);
  }
  if (changes) console.info(`[nudges] learned ${changes}`);
  return changes;
}

async function learnFor(
  user: ScheduleUser,
  row: Parameters<typeof nudgeSetting>[0] & {
    learnedAt: Date | null;
    pausedByFeedback: string[];
  },
  now: Date,
) {
  const s = nudgeSetting(row);
  const parts = (
    [
      ['morning', s.morningEnabled],
      ['midday', s.rumiLines && s.middayEnabled],
      ['evening', s.eveningEnabled],
    ] as [Part, boolean][]
  )
    .filter(([, on]) => on)
    .map(([p]) => p);
  const since = new Date(+now - LEARN_LOOK_BACK * 86_400_000);
  const [lines, sessions] = await Promise.all([
    db().notificationLog.findMany({
      where: {
        userId: user.id,
        type: { in: parts.map((p) => PART_TYPE[p]) as never },
        scheduledFor: { gte: since, lte: now },
      },
      select: { type: true, scheduledFor: true, feedback: true },
    }),
    db().actualSession.findMany({
      where: { userId: user.id, startedAt: { gte: since, lte: now } },
      select: { category: true, startedAt: true },
    }),
  ]);
  const starts = sessions
    .filter((x) => isStudyCategory(x.category, s.studyCategories))
    .map((x) => x.startedAt);
  // "Too many" in a row counts only this week's answers, so a Resume starts afresh.
  const week = new Date(+now - LEARN_EVERY_DAYS * 86_400_000);
  const notes: string[] = [];
  const data: Record<string, unknown> = {};
  const paused = new Set(row.pausedByFeedback);
  for (const part of parts) {
    const facts: LineFact[] = lines
      .filter((l) => l.type === PART_TYPE[part])
      .map((l) => ({
        at: l.scheduledFor,
        feedback: +l.scheduledFor >= +week ? l.feedback : null,
        startedAt: firstStartAfter(
          l.scheduledFor,
          starts,
          user.timezone,
          dayKey(l.scheduledFor, user.timezone),
        ),
      }));
    const time = s[TIME_FIELD[part]];
    const change = learnPart(part, time, facts, user.timezone, {
      start: s.quietStart,
      end: s.quietEnd,
    });
    if (!change) continue;
    if (change.kind === 'move') data[TIME_FIELD[part]] = change.to;
    else {
      data[ON_FIELD[part]] = false;
      paused.add(part);
    }
    notes.push(learnedLine(change));
  }
  await db().studyNudgeSetting.update({
    where: { userId: user.id },
    data: {
      ...data,
      learnedAt: now,
      ...(notes.length
        ? { learnedNote: notes.join(' · '), pausedByFeedback: [...paused] }
        : {}),
    },
  });
  return notes.length;
}

/** Resume a part turned off by feedback: it is on again and the week starts afresh. */
export async function resumePart(
  user: ScheduleUser,
  part: Part,
  now = new Date(),
) {
  const row = await db().studyNudgeSetting.findUnique({
    where: { userId: user.id },
    select: { pausedByFeedback: true },
  });
  if (!row?.pausedByFeedback.includes(part))
    throw new Error('That part is not paused.');
  await db().studyNudgeSetting.update({
    where: { userId: user.id },
    data: {
      [ON_FIELD[part]]: true,
      pausedByFeedback: row.pausedByFeedback.filter((p) => p !== part),
      learnedAt: now,
    },
  });
}
