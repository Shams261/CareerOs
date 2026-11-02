/**
 * What Add a block answers (WI-071): one quiet line with the time, chosen by the block's id.
 * It lives with the schedule since WI-139, so the schedule's action never reaches into Today;
 * Today's copy check still reads it through `HOME_COPY`.
 */
export const PLAN_LINES = [
  'Planned for {time}. See you there.',
  'On the plan at {time}. One clear step.',
  'Set for {time}. That is enough for now.',
] as const;
export function planLine(time: string, seed: string) {
  let n = 0;
  for (const c of seed) n = (n * 31 + c.charCodeAt(0)) % 1_000_003;
  return PLAN_LINES[n % PLAN_LINES.length].replace('{time}', time);
}
