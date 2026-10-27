import { z } from 'zod';
import { categoryGroup } from '@/features/review/domain';
import { dayKey, hhmm, localInstant } from '@/lib/time';

/**
 * Study Nudges (WI-028, Version 2 plan §7) and the coach of WI-039 (Rumi plan): pure rules.
 * Every mode is off by default. The copy is fixed, reviewed Silsila text filled with the
 * owner's facts: it never says the owner did not study and never names a task on a lock
 * screen.
 */
export type NudgeSetting = {
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  /** Weekday bits, Monday = 1 … Sunday = 64. */
  days: number;
  onlyStudyDays: boolean;
  quietStart: string;
  quietEnd: string;
  /** Paused through this owner-calendar day ("yyyy-MM-dd"), or null. */
  pausedUntil: string | null;
  studyCategories: string[];
  /** WI-039: nudge once a study block's start has passed by `blockStartMinutes`. */
  blockStartEnabled: boolean;
  blockStartMinutes: number;
};
export const DEFAULT_NUDGES: NudgeSetting = {
  morningEnabled: false,
  morningTime: '08:00',
  eveningEnabled: false,
  eveningTime: '19:30',
  days: 31,
  onlyStudyDays: true,
  quietStart: '22:00',
  quietEnd: '07:30',
  pausedUntil: null,
  studyCategories: ['DSA', 'Technical'],
  blockStartEnabled: false,
  blockStartMinutes: 15,
};
/** At most this many block-start nudges in one day, so the coach never nags (WI-039). */
export const BLOCK_NUDGES_PER_DAY = 1;
/** The offsets the Settings form offers after a block's start. */
export const BLOCK_START_OFFSETS = [5, 10, 15, 20, 30] as const;
/** The morning nudge is skipped (never sent late) once this window after its time has passed. */
export const MORNING_WINDOW_MIN = 180;
/** At least this long between the morning and the evening nudge. */
export const NUDGE_SPACING_MIN = 240;
/** A page seen this recently means Silsila is open: the nudge goes in-app, not to the lock screen. */
export const ACTIVE_WINDOW_MS = 5 * 60_000;

export const WEEKDAYS = [
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 4],
  ['Thu', 8],
  ['Fri', 16],
  ['Sat', 32],
  ['Sun', 64],
] as const;
/** The weekday bit of a calendar label (a DATE label, never an instant). */
export function weekdayBit(day: string) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 64 : 1 << (dow - 1);
}
const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
/** Quiet hours may wrap midnight ("22:00"–"07:30"); equal ends mean no quiet hours. */
export function inQuietHours(local: string, start: string, end: string) {
  const m = minutesOf(local),
    s = minutesOf(start),
    e = minutesOf(end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}
const key = (c: string) =>
  c
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
/** A block or session counts as study when its category (or its group) is chosen. */
export function isStudyCategory(category: string, chosen: string[]) {
  const wanted = new Set(chosen.map(key));
  return wanted.has(key(category)) || wanted.has(key(categoryGroup(category)));
}

export type NudgeDay = {
  /** Today's study blocks (cancelled and test-named ones already left out). */
  studyBlocks: {
    id: string;
    title: string;
    status: string;
    plannedStart: Date;
    plannedEnd: Date;
    /** A session is linked to this block. */
    recorded: boolean;
  }[];
  /** Any study-category session started today. */
  studySessionToday: boolean;
  rested: boolean;
  closed: boolean;
  running: boolean;
  morningAt: Date | null;
  eveningAt: Date | null;
  /** Blocks already nudged at their start today (WI-039). */
  blockNudged?: string[];
};

const active = (s: NudgeSetting, day: string) =>
  (s.days & weekdayBit(day)) !== 0 && !(s.pausedUntil && s.pausedUntil >= day);

/** Whether the morning encouragement is due now (§7 trigger rules). */
export function morningDue(
  s: NudgeSetting,
  d: NudgeDay,
  now: Date,
  zone: string,
) {
  const day = dayKey(now, zone);
  if (!s.morningEnabled || !active(s, day) || d.morningAt) return false;
  const start = localInstant(day, s.morningTime, zone);
  if (now < start || +now >= +start + MORNING_WINDOW_MIN * 60_000) return false;
  if (inQuietHours(hhmm(now, zone), s.quietStart, s.quietEnd)) return false;
  if (s.onlyStudyDays && !d.studyBlocks.length) return false;
  return !d.rested && !d.running;
}

/**
 * The block an evening check-in is about, or null when none is due: a study block that has
 * ended, is still planned (not moved, skipped or done) and has no session, on a day with no
 * study session at all, not rested, not closed, outside quiet hours, after the evening time,
 * four hours after a morning nudge and never during a running session.
 */
export function eveningDue(
  s: NudgeSetting,
  d: NudgeDay,
  now: Date,
  zone: string,
) {
  const day = dayKey(now, zone);
  if (!s.eveningEnabled || !active(s, day) || d.eveningAt) return null;
  if (now < localInstant(day, s.eveningTime, zone)) return null;
  if (inQuietHours(hhmm(now, zone), s.quietStart, s.quietEnd)) return null;
  if (d.morningAt && +now < +d.morningAt + NUDGE_SPACING_MIN * 60_000)
    return null;
  if (d.rested || d.closed || d.running || d.studySessionToday) return null;
  return (
    d.studyBlocks
      .filter(
        (b) => b.plannedEnd <= now && b.status === 'PLANNED' && !b.recorded,
      )
      .sort((a, b) => +a.plannedStart - +b.plannedStart)[0] ?? null
  );
}

/**
 * The block a block-start nudge is about (WI-039), or null: a study block whose start passed
 * by the chosen minutes, that is still planned, has no session and has not ended, on an
 * active day that is not rested or closed, outside quiet hours, with no session running,
 * once per block and at most `BLOCK_NUDGES_PER_DAY` a day.
 */
export function blockStartDue(
  s: NudgeSetting,
  d: NudgeDay,
  now: Date,
  zone: string,
) {
  const day = dayKey(now, zone);
  if (!s.blockStartEnabled || !active(s, day)) return null;
  const nudged = d.blockNudged ?? [];
  if (nudged.length >= BLOCK_NUDGES_PER_DAY) return null;
  if (inQuietHours(hhmm(now, zone), s.quietStart, s.quietEnd)) return null;
  if (d.rested || d.closed || d.running) return null;
  const after = s.blockStartMinutes * 60_000;
  return (
    d.studyBlocks
      .filter(
        (b) =>
          b.status === 'PLANNED' &&
          !b.recorded &&
          !nudged.includes(b.id) &&
          +b.plannedStart + after <= +now &&
          now < b.plannedEnd,
      )
      .sort((a, b) => +a.plannedStart - +b.plannedStart)[0] ?? null
  );
}

type Slot = { title: string; plannedStart: Date; plannedEnd: Date };
const span = (b: Slot, zone: string) =>
  `${hhmm(b.plannedStart, zone)}–${hhmm(b.plannedEnd, zone)}`;
const sentence = (b: Slot, zone: string) => `${span(b, zone)} ${b.title}`;

/**
 * The morning card's facts (WI-039): today's study blocks, then any study block from
 * yesterday that has no session recorded, then the day's reviewed line.
 */
export function morningBody(
  today: Slot[],
  yesterdayLeft: Slot[],
  day: string,
  zone: string,
) {
  const plan = today.length
    ? `Today: ${today.map((b) => sentence(b, zone)).join(' · ')}.`
    : 'No study blocks are planned today.';
  const left = !yesterdayLeft.length
    ? ''
    : yesterdayLeft.length === 1
      ? ` Yesterday ${sentence(yesterdayLeft[0], zone)} had no session recorded.`
      : ` Yesterday ${yesterdayLeft.length} study blocks had no session recorded.`;
  return `${plan}${left} ${morningLine(day)}`;
}

/** The evening check-in's facts (WI-039): the block left, and how tomorrow starts. */
export function eveningBody(
  block: Slot,
  tomorrowFirst: Slot | null,
  day: string,
  zone: string,
) {
  const next = tomorrowFirst
    ? ` Tomorrow starts with ${sentence(tomorrowFirst, zone)}.`
    : '';
  return `${eveningLine(day)} Left today: ${sentence(block, zone)}.${next}`;
}

/** The block-start nudge (WI-039): what started, and how much of it is left. */
export function blockBody(block: Slot, now: Date, zone: string) {
  const ago = Math.max(1, Math.round((+now - +block.plannedStart) / 60_000));
  const left = Math.max(1, Math.round((+block.plannedEnd - +now) / 60_000));
  return `${sentence(block, zone)} started ${ago} minutes ago and no session has begun yet. ${left} minutes of it are left.`;
}

/** "Until I turn it on": a pause date far beyond any real day. */
export const PAUSED_FOREVER = '2999-12-31';

/** In-app only while a Silsila page was seen in the last few minutes. */
export const inAppOnly = (lastActiveAt: Date | null, now: Date) =>
  !!lastActiveAt && +now - +lastActiveAt < ACTIVE_WINDOW_MS;

/** Reviewed copy (§7). Rotated by day so mornings do not read the same every day. */
export const MORNING_LINES = [
  'You don’t need a perfect day—just a first step. Your plan is here when you’re ready.',
  'One block is enough to begin. Your plan is ready when you are.',
  'Start small today. Your plan is here.',
];
export const EVENING_LINES = [
  'I don’t see a study session recorded for today yet. Would a short session still help, or would you rather move it?',
  'No study session is recorded yet today. A short one, a move, or rest are all fine.',
];
const dayNumber = (day: string) =>
  Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);
export const morningLine = (day: string) =>
  MORNING_LINES[dayNumber(day) % MORNING_LINES.length];
export const eveningLine = (day: string) =>
  EVENING_LINES[dayNumber(day) % EVENING_LINES.length];
/** Words that never appear in nudge copy (tested). */
export const BANNED_WORDS = [
  'missed',
  'failed',
  "didn't",
  'didn’t',
  'streak',
  "don't break",
  'don’t break',
];

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 08:00.');
/** The Settings form for Study Nudges. */
export const nudgeInput = z
  .object({
    morningEnabled: z.boolean(),
    morningTime: time,
    eveningEnabled: z.boolean(),
    eveningTime: time,
    days: z.number().int().min(1, 'Choose at least one day.').max(127),
    onlyStudyDays: z.boolean(),
    quietStart: time,
    quietEnd: time,
    studyCategories: z
      .array(z.string().trim().min(1).max(40))
      .min(1, 'Choose at least one study category.')
      .max(20),
    // Optional with defaults, so a form without the WI-039 fields keeps them off.
    blockStartEnabled: z.boolean().default(false),
    blockStartMinutes: z.coerce
      .number()
      .int()
      .refine(
        (m) => (BLOCK_START_OFFSETS as readonly number[]).includes(m),
        'Choose 5, 10, 15, 20 or 30 minutes.',
      )
      .default(15),
  })
  .refine(
    (v) =>
      !v.morningEnabled ||
      !inQuietHours(v.morningTime, v.quietStart, v.quietEnd) ||
      // A morning inside quiet hours still goes out when they end, within its window.
      (minutesOf(v.quietEnd) - minutesOf(v.morningTime) + 1440) % 1440 <
        MORNING_WINDOW_MIN,
    {
      message: 'The morning time falls too deep in quiet hours.',
      path: ['morningTime'],
    },
  );
export type NudgeInput = z.infer<typeof nudgeInput>;

/** "Mornings 08:00 · Block start +15 min · Check-in from 19:30 · Weekdays" for the Settings row. */
export function nudgeContext(s: NudgeSetting | null) {
  if (!s || (!s.morningEnabled && !s.eveningEnabled && !s.blockStartEnabled))
    return 'Off';
  const parts = [] as string[];
  if (s.morningEnabled) parts.push(`Mornings ${s.morningTime}`);
  if (s.blockStartEnabled)
    parts.push(`Block start +${s.blockStartMinutes} min`);
  if (s.eveningEnabled) parts.push(`Check-in from ${s.eveningTime}`);
  const days =
    s.days === 127
      ? 'Every day'
      : s.days === 31
        ? 'Weekdays'
        : WEEKDAYS.filter(([, bit]) => s.days & bit)
            .map(([name]) => name)
            .join(' ');
  return `${parts.join(' · ')} · ${days}`;
}
