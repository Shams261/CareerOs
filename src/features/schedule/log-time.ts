/** Lengths offered when logging time by hand (WI-068). */
export const LOG_LENGTHS = [15, 30, 45, 60] as const;

/**
 * Log time's first answer (WI-068): the block's slot once it is over, else the time up to now
 * (whole minutes), from the slot's start when it has begun, else half an hour back (or the
 * block's length, when shorter). Save refuses time that ends in the future, so the first answer never does.
 */
export function logDefaults(
  block: { plannedStart: Date; plannedEnd: Date },
  now: Date,
) {
  if (block.plannedEnd <= now)
    return { start: block.plannedStart, end: block.plannedEnd };
  const end = new Date(Math.floor(+now / 60_000) * 60_000);
  const length = Math.max(60_000, +block.plannedEnd - +block.plannedStart);
  const begun = +block.plannedStart <= +end - 60_000;
  const start = begun
    ? block.plannedStart
    : new Date(+end - Math.min(length, 30 * 60_000));
  return { start, end };
}
