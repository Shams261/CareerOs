import { z } from 'zod';
import { formatInTimeZone } from 'date-fns-tz';
import { dayKey, localInstant } from '../../lib/time';
import { resourceUrl, localTime, timezone } from '../../lib/validation';
import { dateInput, shiftDay, weekDays } from '../schedule/domain';

export const stages = [
  'SAVED',
  'APPLIED',
  'RECRUITER_SCREEN',
  'ASSESSMENT',
  'TECHNICAL',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'FINAL',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type Stage = (typeof stages)[number];
/** Closed applications stay stored and filterable but never need attention. */
export const closedStages: readonly Stage[] = ['REJECTED', 'WITHDRAWN'];
/** Stages shown as pipeline columns, in order. */
export const pipelineStages = stages.filter((s) => !closedStages.includes(s));
/** In-process stages: applied but not yet at offer or closed. */
export const inProcessStages: readonly Stage[] = [
  'APPLIED',
  'RECRUITER_SCREEN',
  'ASSESSMENT',
  'TECHNICAL',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'FINAL',
];
export const isOpen = (stage: string) => !closedStages.includes(stage as Stage);
export const interviewTypes = [
  'RECRUITER',
  'ASSESSMENT',
  'CODING',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'HIRING_MANAGER',
  'FINAL',
  'OTHER',
] as const;
export const interviewStatuses = [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export const arrangements = ['UNKNOWN', 'REMOTE', 'HYBRID', 'ONSITE'] as const;
export const owners = ['ME', 'COMPANY', 'NONE'] as const;
export const label = (value: string) => {
  const text = value.toLowerCase().replaceAll('_', ' ');
  return text[0].toUpperCase() + text.slice(1);
};
export const ownerLabel = (o: string) =>
  o === 'ME'
    ? 'Action required from me'
    : o === 'COMPANY'
      ? 'Waiting on company'
      : 'No owner set';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const optionalUrl = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  resourceUrl.optional(),
);
const optionalDate = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  dateInput.optional(),
);
export const requestId = z.uuid();

export const quickAddInput = z.object({
  requestId,
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  jobUrl: optionalUrl,
  source: optionalText(80),
  appliedAt: optionalDate,
  stage: z.enum(stages).default('APPLIED'),
  token: z.string().default(''),
});
export const detailsInput = z.object({
  id: z.string().min(1),
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  jobUrl: optionalUrl,
  location: optionalText(120),
  workArrangement: z.enum(arrangements),
  employmentType: optionalText(60),
  source: optionalText(80),
  appliedAt: optionalDate,
  priority: z.coerce.number().int().min(1).max(3),
  recruiterName: optionalText(120),
  recruiterContact: optionalText(200),
  hiringContact: optionalText(200),
  notes: optionalText(8000),
  compensationNotes: optionalText(2000),
  jobDescription: optionalText(20000),
});
export const stageInput = z.object({
  requestId,
  id: z.string().min(1),
  stage: z.enum(stages),
  note: optionalText(2000),
});
export const followUpInput = z.object({
  id: z.string().min(1),
  nextAction: optionalText(200),
  nextActionDate: optionalDate,
  actionOwner: z.enum(owners),
});
export const followUpDoneInput = followUpInput.extend({
  requestId,
  note: optionalText(2000),
});
export const roundInput = z.object({
  requestId,
  applicationId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  type: z.enum(interviewTypes),
  date: dateInput,
  start: localTime,
  end: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    localTime.optional(),
  ),
  timezone,
  interviewers: optionalText(300),
  meetingUrl: optionalUrl,
  location: optionalText(200),
  notes: optionalText(4000),
});
export const roundDetailsInput = roundInput
  .pick({
    title: true,
    type: true,
    interviewers: true,
    meetingUrl: true,
    location: true,
    notes: true,
  })
  .extend({ id: z.string().min(1) });
export const rescheduleInput = roundInput
  .pick({ requestId: true, date: true, start: true, end: true, timezone: true })
  .extend({ id: z.string().min(1), note: optionalText(1000) });
export const resultInput = z.object({
  requestId,
  id: z.string().min(1),
  status: z.enum(['COMPLETED', 'CANCELLED', 'NO_SHOW']),
  outcomeNotes: optionalText(4000),
  topicsAsked: optionalText(2000),
  wentWell: optionalText(2000),
  toImprove: optionalText(2000),
  stage: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.enum(stages).optional(),
  ),
});
export const prepInput = z
  .object({
    roundId: z.string().min(1),
    kind: z.enum(['PREP', 'GAP']).default('PREP'),
    title: z.string().trim().min(1).max(200),
    notes: optionalText(1000),
    link: z.string().default(''),
  })
  .transform(({ link, ...rest }) => {
    const [kind, id] = link.split(':');
    return {
      ...rest,
      learningTopicId: kind === 'learning' && id ? id : null,
      dsaProblemId: kind === 'problem' && id ? id : null,
      dsaTopicId: kind === 'dsa-topic' && id ? id : null,
    };
  });
export const noteInput = z.object({
  requestId,
  id: z.string().min(1),
  note: z.string().trim().min(1).max(4000),
});

/** Interview wall-clock input → real instants. Ends must follow starts on the same day. */
export function interviewInterval(input: {
  date: string;
  start: string;
  end?: string;
  timezone: string;
}) {
  const scheduledStart = localInstant(input.date, input.start, input.timezone);
  const scheduledEnd = input.end
    ? localInstant(input.date, input.end, input.timezone)
    : null;
  if (scheduledEnd && scheduledEnd <= scheduledStart)
    throw new Error('Interview end must be after its start.');
  return { scheduledStart, scheduledEnd };
}

/** Case/space-insensitive exact match on company + role + job URL (missing URL matches missing URL). */
export const duplicateKey = (a: {
  company: string;
  role: string;
  jobUrl?: string | null;
}) =>
  [a.company, a.role, a.jobUrl ?? '']
    .map((v) => v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\/$/, ''))
    .join('|');

export const calendarDate = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((+new Date(to) - +new Date(from)) / 86400000);

export type FollowUp =
  | { state: 'none' }
  | { state: 'overdue'; days: number; date: string }
  | { state: 'today'; date: string }
  | { state: 'upcoming'; days: number; date: string };
export function followUpState(
  app: { stage: string; nextActionDate: Date | null },
  today: string,
): FollowUp {
  if (!isOpen(app.stage) || !app.nextActionDate) return { state: 'none' };
  const date = calendarDate(app.nextActionDate);
  const days = daysBetween(today, date);
  return days < 0
    ? { state: 'overdue', days: -days, date }
    : days === 0
      ? { state: 'today', date }
      : { state: 'upcoming', days, date };
}

type RoundLike = {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  timezone: string;
};
const DEFAULT_ROUND_MINUTES = 60;
export const roundEnd = (r: RoundLike) =>
  r.scheduledEnd ?? new Date(+r.scheduledStart + DEFAULT_ROUND_MINUTES * 60000);
/** Next scheduled round that has not yet ended. */
export function nextRound<T extends RoundLike>(rounds: T[], now: Date) {
  return rounds
    .filter((r) => r.status === 'SCHEDULED' && roundEnd(r) > now)
    .sort((a, b) => +a.scheduledStart - +b.scheduledStart)[0];
}
/** Scheduled rounds whose time has passed without a recorded result. */
export const resultNeeded = <T extends RoundLike>(rounds: T[], now: Date) =>
  rounds.filter((r) => r.status === 'SCHEDULED' && roundEnd(r) <= now);

export type AppLike = {
  id: string;
  stage: string;
  actionOwner: string;
  nextAction: string | null;
  nextActionDate: Date | null;
  rounds: RoundLike[];
};
export type Attention =
  | { kind: 'FOLLOW_UP_OVERDUE'; days: number }
  | { kind: 'RESULT_NEEDED'; round: RoundLike }
  | { kind: 'INTERVIEW_SOON'; round: RoundLike }
  | { kind: 'FOLLOW_UP_TODAY' }
  | { kind: 'ACTION_REQUIRED' };
const attentionRank = {
  FOLLOW_UP_OVERDUE: 0,
  RESULT_NEEDED: 1,
  INTERVIEW_SOON: 2,
  FOLLOW_UP_TODAY: 3,
  ACTION_REQUIRED: 4,
} as const;
/**
 * Deterministic attention reasons for an open application. Waiting duration never implies rejection.
 * Interview soon = a scheduled round starting before the end of tomorrow (owner calendar).
 */
export function attention(app: AppLike, now: Date, zone: string) {
  if (!isOpen(app.stage)) return [];
  const today = dayKey(now, zone);
  const reasons: Attention[] = [];
  const follow = followUpState(app, today);
  if (follow.state === 'overdue')
    reasons.push({ kind: 'FOLLOW_UP_OVERDUE', days: follow.days });
  for (const round of resultNeeded(app.rounds, now))
    reasons.push({ kind: 'RESULT_NEEDED', round });
  const horizon = localInstant(shiftDay(today, 2), '00:00', zone);
  for (const round of app.rounds.filter(
    (r) =>
      r.status === 'SCHEDULED' &&
      roundEnd(r) > now &&
      r.scheduledStart < horizon,
  ))
    reasons.push({ kind: 'INTERVIEW_SOON', round });
  if (follow.state === 'today') reasons.push({ kind: 'FOLLOW_UP_TODAY' });
  if (app.actionOwner === 'ME' && follow.state === 'none' && !reasons.length)
    reasons.push({ kind: 'ACTION_REQUIRED' });
  return reasons.sort((a, b) => attentionRank[a.kind] - attentionRank[b.kind]);
}
export function attentionQueue<T extends AppLike>(
  apps: T[],
  now: Date,
  zone: string,
) {
  return apps
    .map((app) => ({ app, reasons: attention(app, now, zone) }))
    .filter((x) => x.reasons.length)
    .sort((a, b) => {
      const ra = a.reasons[0],
        rb = b.reasons[0];
      return (
        attentionRank[ra.kind] - attentionRank[rb.kind] ||
        (ra.kind === 'FOLLOW_UP_OVERDUE' && rb.kind === 'FOLLOW_UP_OVERDUE'
          ? rb.days - ra.days
          : 0) ||
        ('round' in ra && 'round' in rb
          ? +ra.round.scheduledStart - +rb.round.scheduledStart
          : 0) ||
        a.app.id.localeCompare(b.app.id)
      );
    });
}
export const isWaiting = (app: { stage: string; actionOwner: string }) =>
  isOpen(app.stage) && app.actionOwner === 'COMPANY';
export const needsAction = (app: { stage: string; actionOwner: string }) =>
  isOpen(app.stage) && app.actionOwner === 'ME';

export const views = [
  'active',
  'offer',
  'rejected',
  'withdrawn',
  'all',
] as const;
export type JobFilter = {
  view?: string;
  q?: string;
  stage?: string;
  focus?: string;
  source?: string;
};
/** Simple in-memory filters; the owner's dataset is small (see NFR notes). */
export function filterApplications<
  T extends AppLike & { company: string; role: string; source: string | null },
>(apps: T[], f: JobFilter, now: Date, zone: string) {
  const view = views.includes(f.view as (typeof views)[number])
    ? f.view
    : 'active';
  const q = f.q?.trim().toLowerCase();
  return apps.filter(
    (a) =>
      (view === 'all' ||
        (view === 'active' && isOpen(a.stage) && a.stage !== 'OFFER') ||
        a.stage === view!.toUpperCase()) &&
      (!q || `${a.company} ${a.role}`.toLowerCase().includes(q)) &&
      (!f.stage || a.stage === f.stage) &&
      (!f.source ||
        (a.source ?? '').toLowerCase() === f.source.trim().toLowerCase()) &&
      (!f.focus ||
        (f.focus === 'attention' && attention(a, now, zone).length > 0) ||
        (f.focus === 'waiting' && isWaiting(a)) ||
        (f.focus === 'action' && needsAction(a)) ||
        (f.focus === 'interview' && !!nextRound(a.rounds, now))),
  );
}

/** Owner-zone display plus the interview's original zone when it differs. */
export function interviewTime(
  r: { scheduledStart: Date; scheduledEnd: Date | null; timezone: string },
  ownerZone: string,
) {
  const local = `${formatInTimeZone(r.scheduledStart, ownerZone, 'EEE, MMM d · h:mm a')}${
    r.scheduledEnd
      ? `–${formatInTimeZone(r.scheduledEnd, ownerZone, 'h:mm a')}`
      : ''
  }`;
  return r.timezone === ownerZone
    ? local
    : `${local} (${formatInTimeZone(r.scheduledStart, r.timezone, 'h:mm a')} ${r.timezone})`;
}
export const lastActivityDays = (last: Date, now: Date, zone: string) =>
  daysBetween(dayKey(last, zone), dayKey(now, zone));

/** Reminder windows: 'tomorrow' ≈ within 24h (only when not yet inside the short window), 'soon' = within offset. */
export function interviewWindow(
  r: { status: string; scheduledStart: Date },
  now: Date,
  offsetMinutes: number,
): 'soon' | 'day' | null {
  if (r.status !== 'SCHEDULED' || r.scheduledStart <= now) return null;
  const until = +r.scheduledStart - +now;
  if (until <= offsetMinutes * 60000) return 'soon';
  if (until <= 24 * 3600000) return 'day';
  return null;
}
/** One follow-up reminder per planned date, at or after the preferred local time. */
export function followUpReminderDue(
  app: { stage: string; nextActionDate: Date | null },
  now: Date,
  zone: string,
  preferredTime: string,
) {
  const today = dayKey(now, zone);
  const follow = followUpState(app, today);
  if (follow.state === 'overdue') return follow.date;
  if (
    follow.state === 'today' &&
    now >= localInstant(today, preferredTime, zone)
  )
    return follow.date;
  return null;
}

export type WeeklyInput = {
  apps: {
    stage: string;
    appliedAt: Date | null;
    createdAt: Date;
    nextActionDate: Date | null;
  }[];
  rounds: {
    type: string;
    status: string;
    scheduledStart: Date;
    completedAt: Date | null;
  }[];
  activities: { type: string; toStage: string | null; occurredAt: Date }[];
  sessions: { category: string; startedAt: Date; endedAt: Date | null }[];
};
/** Factual week-to-date counts (owner Monday start). No scores. */
export function weeklyJobSummary(input: WeeklyInput, now: Date, zone: string) {
  const today = dayKey(now, zone),
    monday = weekDays(today)[0],
    start = localInstant(monday, '00:00', zone);
  const inWeek = (d: Date | null) => !!d && d >= start && d <= now;
  const dateInWeek = (d: Date | null) =>
    !!d && calendarDate(d) >= monday && calendarDate(d) <= today;
  const liveRounds = input.rounds.filter(
    (r) => r.status !== 'CANCELLED' && inWeek(r.scheduledStart),
  );
  const jobSessions = input.sessions.filter(
    (s) =>
      s.category
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_') === 'JOB_SEARCH',
  );
  return {
    submitted: input.apps.filter((a) => dateInWeek(a.appliedAt)).length,
    recruiterScreens: liveRounds.filter((r) => r.type === 'RECRUITER').length,
    technical: liveRounds.filter((r) =>
      ['CODING', 'SYSTEM_DESIGN'].includes(r.type),
    ).length,
    interviewsCompleted: input.rounds.filter(
      (r) => r.status === 'COMPLETED' && inWeek(r.completedAt),
    ).length,
    followUpsDue: input.apps.filter((a) =>
      ['overdue', 'today'].includes(followUpState(a, today).state),
    ).length,
    followUpsDone: input.activities.filter(
      (a) => a.type === 'FOLLOW_UP_DONE' && inWeek(a.occurredAt),
    ).length,
    stageMoves: input.activities.filter(
      (a) => a.type === 'STAGE_CHANGED' && inWeek(a.occurredAt),
    ).length,
    rejections: input.activities.filter(
      (a) =>
        a.type === 'STAGE_CHANGED' &&
        a.toStage === 'REJECTED' &&
        inWeek(a.occurredAt),
    ).length,
    active: input.apps.filter((a) => inProcessStages.includes(a.stage as Stage))
      .length,
    offers: input.apps.filter((a) => a.stage === 'OFFER').length,
    /** Applications logged (created) while a JOB_SEARCH session was running. */
    loggedInSessions: input.apps.filter(
      (a) =>
        inWeek(a.createdAt) &&
        jobSessions.some(
          (s) =>
            a.createdAt >= s.startedAt && a.createdAt <= (s.endedAt ?? now),
        ),
    ).length,
  };
}
