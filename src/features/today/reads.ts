import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';

/**
 * Unread reminders that are due, for Needs attention; study nudges and Rumi's lines have their
 * own card (WI-028; the afternoon line since WI-145). The newest 50: an inbox nobody opened for
 * months stays one bounded read (WI-145).
 */
export const attentionReminders = (user: ScheduleUser, now: Date) =>
  db().notificationLog.findMany({
    where: {
      userId: user.id,
      readAt: null,
      scheduledFor: { lte: now },
      type: {
        notIn: [
          'STUDY_MORNING',
          'STUDY_MIDDAY',
          'STUDY_EVENING',
          'STUDY_BLOCK',
        ],
      },
    },
    orderBy: { scheduledFor: 'desc' },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      scheduledFor: true,
      dedupeKey: true,
    },
  });

/** A learning focus for the first-run steps: any roadmap item or practice problem begun. */
export const hasLearningFocus = (user: ScheduleUser) =>
  Promise.all([
    db().roadmapItem.count({
      where: { userId: user.id, status: { not: 'NOT_STARTED' } },
      take: 1,
    }),
    db().dsaAttempt.count({ where: { userId: user.id }, take: 1 }),
  ]).then(([items, attempts]) => items + attempts > 0);
