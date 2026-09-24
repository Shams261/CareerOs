import 'server-only';
import { db } from '@/server/db';
import { dayKey, localInstant } from '@/lib/time';
import { reminderKey, reviewReminderDue } from './domain';
import { locked } from '@/features/schedule/service';
import { blockReminderDue } from './domain';
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
        if (pref.type === 'JOB_FOLLOW_UP' || pref.type === 'INTERVIEW') {
          const jobs = await tx.jobApplication.findMany({
            where: {
              userId: user.id,
              stage: { notIn: ['REJECTED', 'WITHDRAWN', 'OFFER'] },
            },
          });
          for (const job of jobs) {
            const when =
              pref.type === 'INTERVIEW' ? job.interviewAt : job.nextActionAt;
            if (
              when &&
              now >= new Date(+when - pref.offsetMinutes * 60000) &&
              +now - +when < 86400000
            )
              await queue(
                job.id,
                when.toISOString(),
                `${job.company}: ${pref.type === 'INTERVIEW' ? 'Interview coming up' : (job.nextAction ?? 'Follow up')}`,
                when,
              );
          }
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
