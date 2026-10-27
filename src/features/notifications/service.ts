import 'server-only';
import { db } from '@/server/db';
import { dayKey, hhmm, localInstant } from '@/lib/time';
import {
  DAILY_REVIEW_TEXT,
  overdueText,
  reminderKey,
  reviewReminderDue,
} from './domain';
import { locked } from '@/features/schedule/service';
import { blockReminderDue } from './domain';
import { followUpReminderDue, interviewWindow } from '@/features/jobs/domain';
import { weekOf, weeklyReminderDue } from '@/features/review/domain';
import { weekdayDate } from '@/lib/time';
import { processStudyNudges, nudgeKey } from '@/features/nudges/service';
import { isStudyCategory } from '@/features/nudges/domain';
import { nudgeSetting } from '@/features/nudges/service';
export async function processNotifications(now = new Date()) {
  const users = await db().user.findMany({
    include: { preferences: { where: { enabled: true } }, studyNudges: true },
  });
  let candidates = 0;
  for (const user of users) {
    await locked(user.id, async (tx) => {
      // Study Nudges first (WI-028): the daily reminder below stays in the inbox on an evening
      // that already had a study check-in, so the owner is never pushed twice for one thing.
      candidates += await processStudyNudges(tx, user, user.studyNudges, now);
      const nudges = nudgeSetting(user.studyNudges);
      for (const pref of user.preferences) {
        const day = dayKey(now, pref.timezone);
        const plan = await tx.dailyPlan.findUnique({
          where: { userId_date: { userId: user.id, date: new Date(day) } },
          include: { checkIn: true },
        });
        const queue = async (
          entity: string,
          occurrence: string,
          title: string,
          scheduledFor: Date,
          inAppOnly = false,
        ) => {
          await tx.notificationLog.upsert({
            where: {
              dedupeKey: reminderKey(user.id, pref.type, entity, occurrence),
            },
            update: {},
            create: {
              userId: user.id,
              type: pref.type,
              title,
              body: title,
              scheduledFor,
              dedupeKey: reminderKey(user.id, pref.type, entity, occurrence),
              inAppOnly,
            },
          });
          candidates++;
        };
        if (
          pref.type === 'DAILY_PROGRESS' &&
          reviewReminderDue({
            now,
            timezone: pref.timezone,
            preferredTime: pref.preferredTime,
            enabled: pref.enabled,
            reviewedAt: plan?.reviewedAt ?? null,
          })
        )
          await queue(
            'day',
            day,
            DAILY_REVIEW_TEXT,
            localInstant(day, pref.preferredTime, pref.timezone),
            !!(await tx.notificationLog.findUnique({
              where: { dedupeKey: nudgeKey(user.id, 'STUDY_EVENING', day) },
              select: { id: true },
            })),
          );
        if (
          pref.type === 'MISSED_CHECK_IN' &&
          !plan?.checkIn &&
          now >= localInstant(day, pref.preferredTime, pref.timezone)
        )
          await queue(
            'check-in',
            day,
            'Take a moment to complete your daily check-in.',
            now,
          );
        if (pref.type === 'UPCOMING_BLOCK' || pref.type === 'OVERDUE_TASK') {
          const blocks = await tx.timeBlock.findMany({
            where: {
              dailyPlan: { userId: user.id },
              plannedStart: {
                lt: new Date(+now + (pref.offsetMinutes + 1) * 60000),
              },
              plannedEnd: { gte: new Date(+now - 86400000) },
              status: 'PLANNED',
              sessions: { none: {} },
            },
          });
          for (const b of blocks) {
            const study = isStudyCategory(b.category, nudges.studyCategories);
            // The evening study check-in speaks for study blocks while it is on (WI-028).
            if (pref.type === 'OVERDUE_TASK' && nudges.eveningEnabled && study)
              continue;
            // The block-start nudge speaks for study blocks while it is on (WI-039), so the
            // owner is never told twice about one block.
            if (nudges.blockStartEnabled && study) continue;
            const due = new Date(+b.plannedStart - pref.offsetMinutes * 60000);
            if (
              pref.type === 'UPCOMING_BLOCK' &&
              blockReminderDue(b, now, pref.offsetMinutes, 'upcoming')
            )
              await queue(
                b.id,
                b.plannedStart.toISOString(),
                `${b.title} starts in ${Math.max(1, Math.ceil((+b.plannedStart - +now) / 60000))} minutes.`,
                due,
              );
            if (
              pref.type === 'OVERDUE_TASK' &&
              blockReminderDue(b, now, pref.offsetMinutes, 'overdue')
            )
              await queue(
                b.id,
                b.plannedEnd.toISOString(),
                overdueText(
                  b.title,
                  hhmm(b.plannedStart, user.timezone),
                  hhmm(b.plannedEnd, user.timezone),
                ),
                b.plannedEnd,
              );
          }
        }
        if (pref.type === 'JOB_FOLLOW_UP') {
          const jobs = await tx.jobApplication.findMany({
            where: {
              userId: user.id,
              stage: { notIn: ['REJECTED', 'WITHDRAWN'] },
              nextActionDate: { not: null },
            },
          });
          for (const job of jobs) {
            // One reminder per planned follow-up date; overdue dates are not repeated daily.
            const planned = followUpReminderDue(
              job,
              now,
              user.timezone,
              pref.preferredTime,
            );
            if (planned)
              await queue(
                job.id,
                planned,
                planned < dayKey(now, user.timezone)
                  ? `Follow-up overdue since ${weekdayDate(planned)}: ${job.company} — ${job.nextAction ?? 'follow up'}.`
                  : `You planned to follow up with ${job.company} today, ${weekdayDate(planned)}: ${job.nextAction ?? 'follow up'}.`,
                now,
              );
          }
        }
        if (pref.type === 'INTERVIEW') {
          const rounds = await tx.interviewRound.findMany({
            where: {
              userId: user.id,
              status: 'SCHEDULED',
              scheduledStart: { gt: now, lte: new Date(+now + 86400000) },
              application: { stage: { notIn: ['REJECTED', 'WITHDRAWN'] } },
            },
            include: {
              application: true,
              prepItems: { where: { completed: false }, select: { id: true } },
            },
          });
          for (const r of rounds) {
            const window = interviewWindow(r, now, pref.offsetMinutes);
            if (!window) continue;
            // Relative words age badly in an inbox: the absolute date always travels with them (B9).
            const startDay = dayKey(r.scheduledStart, user.timezone);
            const when = `${startDay === dayKey(now, user.timezone) ? 'today' : 'tomorrow'}, ${weekdayDate(startDay)} at ${hhmm(r.scheduledStart, user.timezone)}`;
            const prep = r.prepItems.length
              ? ` ${r.prepItems.length} prep item${r.prepItems.length === 1 ? '' : 's'} open.`
              : '';
            // Keyed by start instant: a reschedule re-arms reminders, a retry never duplicates them.
            await queue(
              r.id,
              `${r.scheduledStart.toISOString()}:${window}`,
              window === 'soon'
                ? `Interview in ${Math.max(1, Math.ceil((+r.scheduledStart - +now) / 60000))} minutes: ${r.application.company} — ${r.title}.`
                : `Your ${r.application.company} ${r.title} interview is ${when}.${prep}`,
              now,
            );
          }
        }
        if (pref.type === 'WEEKLY_REVIEW') {
          const week = weekOf(dayKey(now, user.timezone));
          const review = await tx.weeklyReview.findUnique({
            where: {
              userId_weekStart: { userId: user.id, weekStart: new Date(week) },
            },
            select: { completedAt: true },
          });
          // Sunday at/after the preferred time, once per owner-week, never after completion.
          const due = weeklyReminderDue(
            now,
            user.timezone,
            pref.preferredTime,
            !!review?.completedAt,
          );
          if (due)
            await queue(
              'week',
              due,
              'Your weekly Silsila review is ready.',
              now,
            );
        }
        if (pref.type === 'TECHNICAL_REVIEW') {
          const reviewDay = dayKey(now, user.timezone);
          // Roadmap items (WI-012) and Learn topics share one revision reminder.
          const [items, topics] = await Promise.all([
            tx.roadmapItem.count({
              where: {
                userId: user.id,
                status: 'DONE',
                nextRevisionAt: { lte: new Date(reviewDay) },
                roadmap: { archivedAt: null },
              },
            }),
            tx.learningTopic.count({
              where: {
                userId: user.id,
                subject: { userId: user.id, status: 'ACTIVE' },
                status: {
                  in: ['LEARNING', 'NEEDS_REVISION', 'INTERVIEW_READY'],
                },
                nextReviewDate: { lte: new Date(reviewDay) },
              },
            }),
          ]);
          const due = items + topics;
          if (
            due &&
            now >= localInstant(reviewDay, pref.preferredTime, user.timezone)
          )
            await queue(
              'day',
              reviewDay,
              `${due} item${due === 1 ? '' : 's'} due for revision today.`,
              now,
            );
        }
        if (pref.type === 'DSA_REVISION') {
          // Revision dates and daily deduplication use the owner's calendar zone.
          const revisionDay = dayKey(now, user.timezone);
          const due = await tx.dsaProblem.count({
            where: {
              userId: user.id,
              attemptsCount: { gt: 0 },
              nextRevisionAt: { lte: new Date(revisionDay) },
            },
          });
          if (
            due &&
            now >= localInstant(revisionDay, pref.preferredTime, user.timezone)
          )
            await queue(
              'day',
              revisionDay,
              `${due} DSA problem${due === 1 ? '' : 's'} due for revision today.`,
              now,
            );
        }
      }
    });
  }
  return { candidates };
}

/**
 * R3: the owner opened Silsila from this notification. Set once (a later click keeps the first
 * time) and only for the owner's own row. Returns whether a row was stamped.
 */
export async function markNotificationOpened(
  userId: string,
  id: string,
  now = new Date(),
) {
  const { count } = await db().notificationLog.updateMany({
    where: { id, userId, openedAt: null },
    data: { openedAt: now },
  });
  return count === 1;
}
