/**
 * Close the Day (WI-029): when the close is offered, which blocks are still left, and where
 * "Tomorrow" puts each of them. Pure; covered by tests/close-day-domain.test.ts.
 */
import { z } from 'zod';
import { dayBounds, hhmm, localInstant, weekdayDate } from '@/lib/time';
import { dateInput, shiftDay } from '@/features/schedule/domain';
import { blockResolution, type BlockLike } from '@/features/schedule/row';

/** The daily reminder's default time in Settings; the day can be closed from then on. */
export const STOP_DEFAULT = '21:30';
export const NOTE_MAX = 1000;
/** Free-slot search steps through tomorrow in quarter hours. */
const STEP_MS = 15 * 60_000;

/**
 * Close the day replaces Review day on a past day, and on today from the owner's stop time
 * (the daily reminder time). A reviewed day keeps "Edit review".
 */
export function closeDayOpen({
  day,
  today,
  now,
  zone,
  stopTime,
  reviewed,
}: {
  day: string;
  today: string;
  now: Date;
  zone: string;
  stopTime: string;
  reviewed: boolean;
}) {
  if (reviewed || day > today) return false;
  return day < today || +now >= +localInstant(today, stopTime, zone);
}

/**
 * What is left of a day and what the owner may do with it. A block without a recorded
 * session can go to tomorrow or be let go; a block with recorded time can be marked done or
 * let go (moving it would take its recorded time to another day). Settled blocks are not left.
 */
export type LeftKind = 'unrecorded' | 'recorded';
export function leftKind(block: BlockLike, now: Date): LeftKind | null {
  const r = blockResolution(block, now);
  if (r === 'not-recorded' || r === 'upcoming' || r === 'current')
    return 'unrecorded';
  if (r === 'needs-update' || r === 'in-progress' || r === 'paused')
    return 'recorded';
  return null;
}
export type Choice = 'tomorrow' | 'letgo' | 'done';
/**
 * An interview's block is an appointment with other people: moving it would move the
 * round, so Close the Day never offers Tomorrow for it (the result is logged in Jobs).
 */
export const choicesFor = (kind: LeftKind, appointment = false): Choice[] =>
  kind === 'recorded'
    ? ['done', 'letgo']
    : appointment
      ? ['letgo']
      : ['tomorrow', 'letgo'];

export type Interval = { start: Date; end: Date };
const overlaps = (a: Interval, b: Interval) =>
  +a.start < +b.end && +a.end > +b.start;

/**
 * Where "Tomorrow" puts a block: the same local start time on `target`, keeping its length;
 * when that is taken, the next free quarter hour later that day. Null when the day has no
 * room, so the owner picks a time from the block's row. `taken` are the target day's blocks.
 */
export function tomorrowSlot(
  block: { plannedStart: Date; plannedEnd: Date },
  target: string,
  zone: string,
  taken: Interval[],
): (Interval & { same: boolean }) | null {
  const length = +block.plannedEnd - +block.plannedStart;
  const first = localInstant(target, hhmm(block.plannedStart, zone), zone);
  const dayEnd = dayBounds(target, zone).end;
  const free = (slot: Interval) => !taken.some((t) => overlaps(slot, t));
  const same = { start: first, end: new Date(+first + length) };
  if (free(same)) return { ...same, same: true };
  for (let at = +first + STEP_MS; at + length <= +dayEnd; at += STEP_MS) {
    const slot = { start: new Date(at), end: new Date(at + length) };
    if (free(slot)) return { ...slot, same: false };
  }
  return null;
}

/** "Moves to Mon, Oct 26 · 18:00" (and why, when the planned time is taken). */
export function moveLabel(
  slot: (Interval & { same: boolean }) | null,
  original: Date,
  target: string,
  zone: string,
) {
  if (!slot)
    return `${weekdayDate(target)} has no free time this long. Pick a time from its row.`;
  const at = `${weekdayDate(target)} · ${hhmm(slot.start, zone)}`;
  return slot.same
    ? `Moves to ${at}`
    : `Moves to ${at} (${hhmm(original, zone)} is taken)`;
}

/** Tomorrow is the owner's tomorrow, also when closing an earlier day. */
export const closeTarget = (today: string) => shiftDay(today, 1);

/** The submitted close: the day, one line, and a choice per block still left. */
export const closeDayInput = z.object({
  day: dateInput,
  note: z.string().trim().max(NOTE_MAX),
  choices: z.record(z.string(), z.enum(['tomorrow', 'letgo', 'done'])),
  versions: z.record(z.string(), z.string()),
  slots: z.record(z.string(), z.string()),
});
export type CloseDayInput = z.infer<typeof closeDayInput>;

/** Reads `choice-<id>`, `version-<id>` and `slot-<id>` fields from the form. */
export function readCloseForm(entries: Iterable<[string, unknown]>) {
  const out = {
    day: '',
    note: '',
    choices: {} as Record<string, string>,
    versions: {} as Record<string, string>,
    slots: {} as Record<string, string>,
  };
  for (const [key, value] of entries) {
    const v = String(value);
    if (key === 'day') out.day = v;
    else if (key === 'note') out.note = v;
    else if (key.startsWith('choice-')) out.choices[key.slice(7)] = v;
    else if (key.startsWith('version-')) out.versions[key.slice(8)] = v;
    else if (key.startsWith('slot-')) out.slots[key.slice(5)] = v;
  }
  return closeDayInput.parse(out);
}

/** "Day closed · 2 moved to tomorrow · 1 let go · 1 marked done." */
export function closedMessage(counts: Record<Choice, number>) {
  const parts = ['Day closed'];
  if (counts.tomorrow) parts.push(`${counts.tomorrow} moved to tomorrow`);
  if (counts.letgo) parts.push(`${counts.letgo} let go`);
  if (counts.done) parts.push(`${counts.done} marked done`);
  return `${parts.join(' · ')}.`;
}
