/**
 * Reminders that learn (WI-109, Rumi 3 · E5): pure rules, no AI. Once a week, for each part of
 * the day, the last four weeks of lines decide one small change: the time moves 15 minutes
 * toward when study actually started after the line, inside the part's own window; or, after
 * three "Too many" in a row, the part is turned off and Settings says so with Resume.
 * Covered by tests/nudges-learn.test.ts.
 */
import { hhmm, localInstant } from '@/lib/time';
import { inQuietHours } from './domain';

export type Part = 'morning' | 'midday' | 'evening';
export const PART_TYPE: Record<Part, string> = {
  morning: 'STUDY_MORNING',
  midday: 'STUDY_MIDDAY',
  evening: 'STUDY_EVENING',
};
const PART_WORD: Record<Part, string> = {
  morning: 'Morning',
  midday: 'Afternoon',
  evening: 'Evening',
};
/** The learning runs at most once in this many days. */
export const LEARN_EVERY_DAYS = 7;
export const LEARN_LOOK_BACK = 28;
/** At least this many lines with a start after them before a time moves. */
const LEARN_MIN_LINES = 4;
const LEARN_STEP = 15;
/** A start counts for a line when it comes within this many minutes either side of it. */
const START_WITHIN = 180;
/** "Too many" this many times in a row turns the part off. */
const TOO_MANY_IN_ROW = 3;
/** The windows each part's time stays inside. */
const PART_WINDOW: Record<Part, [string, string]> = {
  morning: ['06:00', '11:00'],
  midday: ['11:00', '16:00'],
  evening: ['17:00', '22:00'],
};

const minutes = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export type LineFact = {
  /** When the line went out. */
  at: Date;
  feedback: 'HELPFUL' | 'NOT_TODAY' | 'TOO_MANY' | null;
  /** The first study session started that day after the line, if any. */
  startedAt: Date | null;
};
export type Learned =
  | { kind: 'move'; part: Part; from: string; to: string }
  | { kind: 'pause'; part: Part };

/** The middle of a sorted list of minutes. */
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * One part's change, or null: three "Too many" in a row turn it off; otherwise, with enough
 * lines followed by a start within three hours, the time moves one step toward the usual
 * start when that start is at least 30 minutes away, inside the part's window and never into
 * quiet hours.
 */
export function learnPart(
  part: Part,
  time: string,
  lines: LineFact[],
  zone: string,
  quiet: { start: string; end: string },
): Learned | null {
  const answered = lines
    .filter((l) => l.feedback)
    .sort((a, b) => +a.at - +b.at)
    .slice(-TOO_MANY_IN_ROW);
  if (
    answered.length === TOO_MANY_IN_ROW &&
    answered.every((l) => l.feedback === 'TOO_MANY')
  )
    return { kind: 'pause', part };
  const followed = lines.filter(
    (l) =>
      l.startedAt && Math.abs(+l.startedAt - +l.at) <= START_WITHIN * 60_000,
  );
  if (followed.length < LEARN_MIN_LINES) return null;
  const usual = median(followed.map((l) => minutes(hhmm(l.startedAt!, zone))));
  const now = minutes(time);
  if (Math.abs(usual - now) < 30) return null;
  const [lo, hi] = PART_WINDOW[part].map(minutes);
  const next = Math.min(
    hi,
    Math.max(lo, now + (usual > now ? LEARN_STEP : -LEARN_STEP)),
  );
  if (next === now || inQuietHours(clock(next), quiet.start, quiet.end))
    return null;
  return { kind: 'move', part, from: time, to: clock(next) };
}

/** The line Settings shows for a change ("Morning 08:00 → 08:15, from when you start"). */
export const learnedLine = (l: Learned) =>
  l.kind === 'move'
    ? `${PART_WORD[l.part]} ${l.from} → ${l.to}, from when you start`
    : `${PART_WORD[l.part]} paused by your feedback`;

/** Whether the weekly learning is due. */
export const learnDue = (learnedAt: Date | null, now: Date) =>
  !learnedAt || +now - +learnedAt >= LEARN_EVERY_DAYS * 86_400_000;

/**
 * The study start that answers a line: the first start that day within three hours either
 * side of it, so a start before the line can pull its time earlier.
 */
export function firstStartAfter(
  at: Date,
  starts: Date[],
  zone: string,
  day: string,
) {
  const from = Math.max(
    +localInstant(day, '00:00', zone),
    +at - START_WITHIN * 60_000,
  );
  const end = Math.min(
    +localInstant(day, '23:59', zone),
    +at + START_WITHIN * 60_000,
  );
  return (
    starts.filter((s) => +s >= from && +s <= end).sort((a, b) => +a - +b)[0] ??
    null
  );
}
