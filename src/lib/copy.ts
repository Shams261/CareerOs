/** Copy rules shared by every feature that writes words for the owner (WI-123). */

/** Words that never appear in nudge, Rumi or coach copy (tested). */
export const BANNED_WORDS = [
  'missed',
  'failed',
  "didn't",
  'didn’t',
  'streak',
  "don't break",
  'don’t break',
  // Reminder copy says what is true now, not what was not done (WI-049).
  "haven't",
  'haven’t',
];

/** "1 block", "3 blocks"; `many` for irregular words. */
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
