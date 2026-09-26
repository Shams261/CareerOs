import 'server-only';
import { db } from '@/server/db';
import { dayKey, localInstant } from '@/lib/time';
import { reminderKey, reviewReminderDue } from './domain';
import { locked } from '@/features/schedule/service';
import { blockReminderDue } from './domain';
import { followUpReminderDue, interviewWindow } from '@/features/jobs/domain';
import { weekOf, weeklyReminderDue } from '@/features/review/domain';
import { clock } from '@/lib/time';
export async function processNotifications(now = new Date()) {
  const users = await db().user.findMany({
    include: { preferences: { where: { enabled: true } } },
  });
  let candidates = 0;
  for (const user of users) {
    await locked(user.id, async (tx) => {
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
            "You haven't checked today's progress yet.",
            localInstant(day, pref.preferredTime, pref.timezone),
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
                `You planned ${b.title} from ${clock(b.plannedStart, user.timezone)}–${clock(b.plannedEnd, user.timezone)} and haven’t recorded progress.`,
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
                  ? `Follow-up overdue since ${planned}: ${job.company} — ${job.nextAction ?? 'follow up'}.`
                  : `You planned to follow up with ${job.company} today: ${job.nextAction ?? 'follow up'}.`,
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
            const when =
              dayKey(r.scheduledStart, user.timezone) ===
              dayKey(now, user.timezone)
                ? `today at ${clock(r.scheduledStart, user.timezone)}`
                : `tomorrow at ${clock(r.scheduledStart, user.timezone)}`;
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
          const due = await tx.learningTopic.count({
            where: {
              userId: user.id,
              subject: { userId: user.id, status: 'ACTIVE' },
              status: { in: ['LEARNING', 'NEEDS_REVISION', 'INTERVIEW_READY'] },
              nextReviewDate: { lte: new Date(reviewDay) },
            },
          });
          if (
            due &&
            now >= localInstant(reviewDay, pref.preferredTime, user.timezone)
          )
            await queue(
              'day',
              reviewDay,
              `${due} technical topic${due === 1 ? '' : 's'} due for review today.`,
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
