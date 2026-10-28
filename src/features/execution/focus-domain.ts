/**
 * Pure rules for the Focus session (WI-027): the ring's target, what is left, and how the
 * intention and the learned line are kept in the session's existing notes.
 */
export const INTENTION_MAX = 140;
export const LEARNED_MAX = 200;
const NOTES_MAX = 1000;

/** The ambient sounds Focus offers (WI-035), by the value kept in the cookie and the form. */
export const SOUNDS = ['rain', 'brown'] as const;
export type Sound = (typeof SOUNDS)[number];
export const SOUND_NAMES: Record<Sound, string> = {
  rain: 'Rain',
  brown: 'Brown noise',
};

/**
 * The sounds that played during a session, as its notes line ("Rain, Brown noise"), from the
 * form's space-separated values. Unknown values are dropped; nothing played gives ''.
 */
export function soundsLine(value: string | null | undefined) {
  const picked = new Set((value ?? '').split(/\s+/));
  return SOUNDS.filter((s) => picked.has(s))
    .map((s) => SOUND_NAMES[s])
    .join(', ');
}

/**
 * When the ring closes. The block's planned end while there is still a minute of it left
 * when the session starts; a late start, and an early one (WI-058: a 60-minute block begun
 * three hours ahead is 60 minutes, not 182), instead gets the block's planned length from its
 * own start. A block without a length (or an unlinked session) has no target: the ring is
 * untimed.
 */
export function focusTarget({
  startedAt,
  plannedStart,
  plannedEnd,
}: {
  startedAt: Date;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
}): Date | null {
  if (!plannedStart || !plannedEnd) return null;
  if (startedAt >= plannedStart && +plannedEnd - +startedAt >= 60_000)
    return plannedEnd;
  const length = +plannedEnd - +plannedStart;
  return length > 0 ? new Date(+startedAt + length) : null;
}

/** How much of the ring is filled, 0 at the start and 1 at the target (clamped). */
export function ringFraction(startedAt: Date, target: Date, now: Date) {
  const total = +target - +startedAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (+now - +startedAt) / total));
}

/** Whole minutes left before the target, rounded up; 0 once it has passed. */
export function minutesLeft(target: Date, now: Date) {
  return Math.max(0, Math.ceil((+target - +now) / 60_000));
}

/** Minutes in the target window, for "22 minutes left of 60". */
export function targetMinutes(startedAt: Date, target: Date) {
  return Math.max(1, Math.round((+target - +startedAt) / 60_000));
}

/** The ring as words, for assistive technology and the pop-out window title. */
export function focusLabel(left: number, total: number) {
  if (left <= 0) return `Time is up · ${total} min`;
  return `${left} minute${left === 1 ? '' : 's'} left of ${total}`;
}

/**
 * Appends one labelled line ("Intention: …", "Learned: …", "Sound: …") to the session's notes. Existing
 * text is never replaced; an empty line adds nothing; the whole stays within the notes limit.
 */
export function appendNote(
  existing: string | null | undefined,
  label: 'Intention' | 'Learned' | 'Sound',
  text: string | null | undefined,
): string | null {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  const before = existing?.trim() ? existing.trimEnd() : '';
  if (!value) return before || null;
  const line = `${label}: ${value}`;
  const joined = before ? `${before}\n${line}` : line;
  return joined.length > NOTES_MAX ? joined.slice(0, NOTES_MAX) : joined;
}

/** The intention written when the session started, read back from its notes. */
export function intentionOf(notes: string | null | undefined) {
  const line = (notes ?? '')
    .split('\n')
    .find((l) => l.startsWith('Intention: '));
  return line ? line.slice('Intention: '.length) : null;
}
