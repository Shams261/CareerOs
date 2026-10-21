import 'server-only';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/features/schedule/service';
import { dayBounds } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';

const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const dayName = (day: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', 'EEE');

/**
 * What the scheduler will send in the week starting `monday`, read from the same preferences
 * and dates it uses. Facts only: nothing here is written or scheduled.
 */
export async function remindersPreview(user: ScheduleUser, monday: string) {
  const sunday = shiftDay(monday, 6),
    start = dayBounds(monday, user.timezone).start,
    end = dayBounds(sunday, user.timezone).end;
  const [prefs, dsaDue, reviewsDue, followUps, interviews] = await Promise.all([
    db().notificationPreference.findMany({ where: { userId: user.id } }),
    db().dsaProblem.count({
      where: {
        userId: user.id,
        nextRevisionAt: { gte: new Date(monday), lte: new Date(sunday) },
      },
    }),
    db().learningTopic.count({
      where: {
        userId: user.id,
        nextReviewDate: { gte: new Date(monday), lte: new Date(sunday) },
        status: { notIn: ['COMPLETED', 'PAUSED'] },
      },
    }),
    db().jobApplication.findMany({
      where: {
        userId: user.id,
        stage: { notIn: ['REJECTED', 'WITHDRAWN'] },
        nextActionDate: { gte: new Date(monday), lte: new Date(sunday) },
      },
      select: { company: true, nextActionDate: true },
      orderBy: { nextActionDate: 'asc' },
    }),
    db().interviewRound.findMany({
      where: {
        userId: user.id,
        status: 'SCHEDULED',
        scheduledStart: { gte: start, lt: end },
      },
      select: {
        scheduledStart: true,
        application: { select: { company: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    }),
  ]);
  const pref = (type: string) => prefs.find((p) => p.type === type);
  const on = (type: string, fallback: boolean) =>
    pref(type)?.enabled ?? fallback;
  const time = (type: string, fallback: string) =>
    clock12(pref(type)?.preferredTime ?? fallback);
  const lines: { title: string; detail: string; on: boolean }[] = [
    {
      title: 'Daily reminder',
      on: on('DAILY_PROGRESS', true),
      detail: `Evenings at ${time('DAILY_PROGRESS', '21:30')}, only when the day is not reviewed.`,
    },
    {
      title: 'DSA revisions',
      on: on('DSA_REVISION', false),
      detail: dsaDue
        ? `${time('DSA_REVISION', '18:00')} on days with something due · ${dsaDue} due this week.`
        : `${time('DSA_REVISION', '18:00')} on days with something due · nothing due this week.`,
    },
    {
      title: 'Technical reviews',
      on: on('TECHNICAL_REVIEW', false),
      detail: reviewsDue
        ? `${time('TECHNICAL_REVIEW', '18:00')} on days with something due · ${reviewsDue} due this week.`
        : `${time('TECHNICAL_REVIEW', '18:00')} on days with something due · nothing due this week.`,
    },
    {
      title: 'Job follow-ups',
      on: on('JOB_FOLLOW_UP', false),
      detail: followUps.length
        ? `${time('JOB_FOLLOW_UP', '09:00')} on ${followUps
            .map(
              (a) =>
                `${dayName(a.nextActionDate!.toISOString().slice(0, 10))} (${a.company})`,
            )
            .join(', ')}.`
        : 'No follow-ups dated this week.',
    },
    {
      title: 'Interviews',
      on: on('INTERVIEW', false),
      detail: interviews.length
        ? `About a day before and ${pref('INTERVIEW')?.offsetMinutes ?? 60} minutes before: ${interviews
            .map(
              (r) =>
                `${formatInTimeZone(r.scheduledStart, user.timezone, 'EEE h:mm a')} ${r.application.company}`,
            )
            .join(', ')}.`
        : 'No interviews scheduled this week.',
    },
    {
      title: 'Weekly review',
      on: on('WEEKLY_REVIEW', false),
      detail: `Sunday at ${time('WEEKLY_REVIEW', '18:00')}, only when the review is not completed.`,
    },
  ];
  return lines;
}
