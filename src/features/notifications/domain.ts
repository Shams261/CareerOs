import { dayKey, localInstant } from '../../lib/time';
export function reviewReminderDue(input: {
  now: Date;
  timezone: string;
  preferredTime: string;
  enabled: boolean;
  reviewedAt: Date | null;
}) {
  return (
    input.enabled &&
    !input.reviewedAt &&
    input.now >=
      localInstant(
        dayKey(input.now, input.timezone),
        input.preferredTime,
        input.timezone,
      )
  );
}
export const reminderKey = (
  userId: string,
  type: string,
  entity: string,
  occurrence: string,
) => `${userId}:${type}:${entity}:${occurrence}`;
export function blockReminderDue(
  block: {
    status: string;
    plannedStart: Date;
    plannedEnd: Date;
    sessions?: unknown[];
  },
  now: Date,
  offsetMinutes: number,
  type: 'upcoming' | 'overdue',
) {
  if (block.status !== 'PLANNED' || block.sessions?.length) return false;
  return type === 'upcoming'
    ? now >= new Date(+block.plannedStart - offsetMinutes * 60000) &&
        now < block.plannedStart
    : now >= block.plannedEnd;
}

/**
 * Reminder words in the brand's calm, factual voice (WI-049): what is true now, never what the
 * owner failed to do. Checked against `BANNED_WORDS` in tests.
 */
export const DAILY_REVIEW_TEXT = 'Today is ready to review.';
export const overdueText = (title: string, from: string, to: string) =>
  `${title} (${from}–${to}) has nothing recorded yet.`;
