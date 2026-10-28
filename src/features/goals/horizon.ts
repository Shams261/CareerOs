/**
 * Goals for any horizon (WI-064): a goal is the owner's own line with a date, unrelated to the
 * curriculum. Pure date labels, no imports, so the goal form's quick picks can run on the client.
 * Dates are calendar labels (YYYY-MM-DD), shifted at noon UTC so no time zone moves them.
 */
const at = (day: string) => new Date(`${day}T12:00:00Z`);
const label = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, n: number) => {
  const d = at(day);
  d.setUTCDate(d.getUTCDate() + n);
  return label(d);
};

/** The quick picks: two days out, this Sunday (the week ends on Sunday), the month's last day. */
export function quickTargets(today: string) {
  const weekday = at(today).getUTCDay(); // 0 = Sunday
  const month = at(today);
  month.setUTCMonth(month.getUTCMonth() + 1, 0);
  return {
    twoDays: shift(today, 2),
    week: shift(today, (7 - weekday) % 7),
    month: label(month),
  };
}

export const QUICK_PICKS = [
  { key: 'twoDays', text: 'In 2 days' },
  { key: 'week', text: 'This week' },
  { key: 'month', text: 'This month' },
] as const;

/** "This week", "This month"… for Today's goal line; null when the date is further out or gone. */
export function horizonLabel(target: string | null, today: string) {
  if (!target || target < today) return null;
  if (target === today) return 'Today';
  const q = quickTargets(today);
  if (target <= q.twoDays) return 'Next 2 days';
  if (target <= q.week) return 'This week';
  if (target <= q.month) return 'This month';
  return null;
}
