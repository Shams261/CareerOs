import { z } from 'zod';
import { dayKey, localInstant } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
export const dimensions = [
  'understanding',
  'recall',
  'application',
  'interview',
] as const;
export type Mastery = Record<(typeof dimensions)[number], number>;
export const scoreNames = ['Not assessed', 'Weak', 'Partial', 'Strong'];
export const statuses = [
  'NOT_STARTED',
  'LEARNING',
  'NEEDS_REVISION',
  'INTERVIEW_READY',
  'COMPLETED',
  'PAUSED',
] as const;
export const statusLabel = (s: string) =>
  s === 'NEEDS_REVISION'
    ? 'Needs review'
    : s.toLowerCase().replaceAll('_', ' ');
const score = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.number().int().min(0).max(3).optional(),
);
export const activityInput = z
  .object({
    topicId: z.string().min(1),
    requestId: z.uuid(),
    activityType: z.enum([
      'LEARN',
      'REVIEW',
      'PRACTICE',
      'INTERVIEW_RECALL',
      'MOCK',
      'NOTE',
    ]),
    understanding: score,
    recall: score,
    application: score,
    interview: score,
    durationMinutes: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().int().min(1).max(1440).optional(),
    ),
    notes: z.string().trim().max(4000).default(''),
  })
  .refine(
    (v) =>
      v.activityType !== 'NOTE' ||
      (dimensions.every((d) => v[d] === undefined) && !!v.notes),
    { message: 'A note needs text and cannot change assessment scores.' },
  );
export function readiness(m: Mastery) {
  if (dimensions.every((d) => m[d] === 3)) return 'INTERVIEW_READY' as const;
  if (
    dimensions.some((d) => m[d] === 1) ||
    ['recall', 'application', 'interview'].some(
      (d) => m[d as keyof Mastery] === 2,
    )
  )
    return 'NEEDS_REVISION' as const;
  return 'LEARNING' as const;
}
export function assess(
  previous: Mastery & { status: string },
  supplied: Partial<Mastery>,
  day: string,
) {
  const mastery = { ...previous };
  for (const d of dimensions)
    if (supplied[d] !== undefined) mastery[d] = supplied[d]!;
  const status = readiness(mastery);
  // A maintenance interval requires a fresh strong recall/application/interview assessment.
  const confirmed =
    previous.status === 'INTERVIEW_READY' &&
    status === 'INTERVIEW_READY' &&
    ['recall', 'application', 'interview'].some(
      (d) => supplied[d as keyof Mastery] === 3,
    );
  const days =
    status === 'INTERVIEW_READY'
      ? confirmed
        ? 30
        : 14
      : status === 'NEEDS_REVISION'
        ? 3
        : 2;
  return {
    ...(Object.fromEntries(dimensions.map((d) => [d, mastery[d]])) as Mastery),
    status,
    nextReviewDate: new Date(shiftDay(day, days)),
    reviewManual: false,
  };
}
export const calendarDate = (d: Date) => d.toISOString().slice(0, 10);
export type ReviewTopic = {
  id: string;
  status: string;
  nextReviewDate: Date | null;
  subject: { status: string };
};
export const eligible = (t: ReviewTopic) =>
  t.subject.status === 'ACTIVE' &&
  !['PAUSED', 'COMPLETED', 'NOT_STARTED'].includes(t.status);
export function dueState(t: ReviewTopic, day: string) {
  if (!eligible(t) || !t.nextReviewDate) return 'unscheduled';
  const due = calendarDate(t.nextReviewDate);
  return due < day ? 'overdue' : due === day ? 'today' : 'upcoming';
}
export function reviewQueue<T extends ReviewTopic>(topics: T[], day: string) {
  const rank = (t: T) =>
    t.status === 'NEEDS_REVISION' ? 0 : t.status === 'LEARNING' ? 1 : 2;
  const group = (t: T) =>
    ({ overdue: 0, today: 1, upcoming: 2, unscheduled: 3 })[dueState(t, day)];
  return topics
    .filter((t) => dueState(t, day) !== 'unscheduled')
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        rank(a) - rank(b) ||
        +a.nextReviewDate! - +b.nextReviewDate! ||
        a.id.localeCompare(b.id),
    );
}
// Block categories are free text: "System Design" and "system-design" match SYSTEM_DESIGN.
export const isTechnical = (s: string) =>
  ['TECHNICAL', 'SYSTEM_DESIGN'].includes(
    s
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_'),
  );
export function learningSuggestions<
  T extends ReviewTopic & { subjectId: string; ordering: number },
>(topics: T[], currentSubjectId: string | null, day: string) {
  const queue = reviewQueue(topics, day).filter(
    (t) => dueState(t, day) !== 'upcoming',
  );
  const next = topics
    .filter(
      (t) =>
        t.subjectId === currentSubjectId &&
        t.subject.status === 'ACTIVE' &&
        t.status === 'NOT_STARTED',
    )
    .sort((a, b) => a.ordering - b.ordering || a.id.localeCompare(b.id))[0];
  return { queue, next };
}
export function weekStart(now: Date, zone: string) {
  const day = dayKey(now, zone),
    weekday = new Date(day).getUTCDay();
  return localInstant(shiftDay(day, -((weekday + 6) % 7)), '00:00', zone);
}
