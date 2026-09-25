import { z } from 'zod';
import { dayKey, localInstant, minutes } from '../../lib/time';
import {
  dateInput,
  dayProgress,
  isFocusCategory,
  routineOccurrence,
  shiftDay,
  weekDays,
} from '../schedule/domain';
import { isTechnical } from '../learning/domain';
import { isDsa } from '../dsa/domain';
import {
  followUpState,
  inProcessStages,
  isOpen,
  needsAction,
  isWaiting,
  type Stage,
} from '../jobs/domain';

/** Owner-local Monday → Sunday weeks (never UTC boundaries). */
export const weekOf = (day: string) => weekDays(day)[0];
export const currentWeek = (now: Date, zone: string) =>
  weekOf(dayKey(now, zone));
export const isMonday = (day: string) =>
  dateInput.safeParse(day).success &&
  new Date(`${day}T12:00:00Z`).getUTCDay() === 1;
/** Instants of the owner's week: 168h normally, 167h/169h across DST changes. */
export function weekBounds(monday: string, zone: string) {
  if (!isMonday(monday)) throw new Error('A week starts on Monday.');
  return {
    monday,
    sunday: shiftDay(monday, 6),
    days: weekDays(monday),
    start: localInstant(monday, '00:00', zone),
    end: localInstant(shiftDay(monday, 7), '00:00', zone),
  };
}
export type WeekBounds = ReturnType<typeof weekBounds>;
/** Sunday is the review day: the Today prompt and the reminder use it. */
export const isReviewDay = (now: Date, zone: string) =>
  new Date(`${dayKey(now, zone)}T12:00:00Z`).getUTCDay() === 0;

export const formatMinutes = (n: number) => {
  const h = Math.floor(n / 60),
    m = n % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
const categoryKey = (c: string) =>
  c
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
const ACRONYMS = new Set(['DSA', 'API', 'AWS', 'SQL', 'OA']);
const title = (key: string) => {
  // Known acronyms stay upper-case (DSA); other keys read as words (JOB_SEARCH → Job search).
  if (ACRONYMS.has(key)) return key;
  const t = key.toLowerCase().replaceAll('_', ' ');
  return t[0].toUpperCase() + t.slice(1);
};
/** Groups used for planned-vs-actual. Other categories keep their own label. */
export function categoryGroup(category: string) {
  const key = categoryKey(category);
  if (isDsa(key)) return 'DSA';
  if (isTechnical(key)) return 'Technical';
  if (['JOB_SEARCH', 'INTERVIEW'].includes(key)) return 'Job search';
  return title(key);
}

type BlockIn = {
  id: string;
  title: string;
  category: string;
  status: string;
  plannedStart: Date;
  plannedEnd: Date;
  /** Owner-calendar date of the block's DailyPlan. */
  day: string;
  goalId?: string | null;
};
type SessionIn = {
  category: string;
  startedAt: Date;
  endedAt: Date | null;
  goalId?: string | null;
};
const clipped = (s: Date, e: Date, b: WeekBounds) =>
  minutes(new Date(Math.max(+b.start, +s)), new Date(Math.min(+b.end, +e)));
const unrecorded = (b: BlockIn, now: Date) =>
  ['PLANNED', 'IN_PROGRESS'].includes(b.status) && b.plannedEnd <= now;

export type Row = { label: string; planned: number; actual: number };
/**
 * Schedule facts for one week. Totals reuse dayProgress (and its focus rule) over the week's
 * instants; per-group rows use the same clipping. Variance is shown, never judged.
 */
export function scheduleWeek(
  blocks: BlockIn[],
  sessions: SessionIn[],
  b: WeekBounds,
  now: Date,
) {
  const totals = dayProgress(blocks, sessions, b.start, b.end, now);
  const live = blocks.filter((x) => x.status !== 'CANCELLED');
  const rows = new Map<string, Row>();
  const row = (label: string) => {
    if (!rows.has(label)) rows.set(label, { label, planned: 0, actual: 0 });
    return rows.get(label)!;
  };
  for (const x of live)
    row(categoryGroup(x.category)).planned += clipped(
      x.plannedStart,
      x.plannedEnd,
      b,
    );
  for (const s of sessions)
    row(categoryGroup(s.category)).actual += clipped(
      s.startedAt,
      s.endedAt ?? now,
      b,
    );
  const byCategory = new Map<
    string,
    {
      label: string;
      planned: number;
      completed: number;
      skipped: number;
      unrecorded: number;
    }
  >();
  for (const x of live) {
    const label = title(categoryKey(x.category));
    const c = byCategory.get(label) ?? {
      label,
      planned: 0,
      completed: 0,
      skipped: 0,
      unrecorded: 0,
    };
    c.planned++;
    if (x.status === 'COMPLETED') c.completed++;
    if (x.status === 'SKIPPED') c.skipped++;
    if (unrecorded(x, now)) c.unrecorded++;
    byCategory.set(label, c);
  }
  return {
    totals: {
      ...totals,
      cancelled: blocks.length - live.length,
      unrecorded: live.filter((x) => unrecorded(x, now)).length,
    },
    focus: { planned: totals.plannedFocus, actual: totals.actualFocus },
    rows: [...rows.values()]
      .filter((r) => r.planned || r.actual)
      .sort(
        (a, c) =>
          c.planned - a.planned ||
          c.actual - a.actual ||
          a.label.localeCompare(c.label),
      ),
    /** Execution counts per category, most-planned first (Gym is one of these). */
    routines: [...byCategory.values()].sort(
      (a, c) => c.planned - a.planned || a.label.localeCompare(c.label),
    ),
    days: b.days.map((day) => ({
      day,
      items: blocks
        .filter((x) => x.day === day)
        .sort((a, c) => +a.plannedStart - +c.plannedStart)
        .map((x) => ({
          id: x.id,
          title: x.title,
          state:
            x.status === 'COMPLETED'
              ? ('done' as const)
              : x.status === 'SKIPPED'
                ? ('skipped' as const)
                : x.status === 'CANCELLED'
                  ? ('cancelled' as const)
                  : unrecorded(x, now)
                    ? ('unrecorded' as const)
                    : ('planned' as const),
        })),
    })),
    unrecordedBlocks: live.filter((x) => unrecorded(x, now)),
    focusCategories: [...new Set(live.map((x) => x.category))].filter(
      isFocusCategory,
    ),
  };
}

/** DSA facts: attempts, new vs revision, confidence transitions, current levels. No score. */
export function dsaWeek(
  attempts: {
    problemId: string;
    confidenceBefore: string | null;
    confidenceAfter: string;
  }[],
  problems: {
    confidence: string;
    attemptsCount: number;
    nextRevisionAt: Date | null;
  }[],
  today: string,
) {
  const tried = problems.filter((p) => p.attemptsCount > 0);
  const transition = (from: string, to: string) =>
    attempts.filter(
      (a) => a.confidenceBefore === from && a.confidenceAfter === to,
    ).length;
  return {
    attempts: attempts.length,
    uniqueProblems: new Set(attempts.map((a) => a.problemId)).size,
    newProblems: attempts.filter((a) => a.confidenceBefore === null).length,
    revisionAttempts: attempts.filter((a) => a.confidenceBefore !== null)
      .length,
    redToYellow: transition('RED', 'YELLOW'),
    yellowToGreen: transition('YELLOW', 'GREEN'),
    toRed: attempts.filter(
      (a) =>
        a.confidenceBefore &&
        a.confidenceBefore !== 'RED' &&
        a.confidenceAfter === 'RED',
    ).length,
    current: {
      RED: tried.filter((p) => p.confidence === 'RED').length,
      YELLOW: tried.filter((p) => p.confidence === 'YELLOW').length,
      GREEN: tried.filter((p) => p.confidence === 'GREEN').length,
    },
    overdue: tried.filter(
      (p) =>
        p.nextRevisionAt && p.nextRevisionAt.toISOString().slice(0, 10) < today,
    ).length,
  };
}

/** Technical-learning facts from append-only activities. */
export function learningWeek(
  activities: {
    topicId: string;
    activityType: string;
    statusBefore: string;
    statusAfter: string;
  }[],
) {
  const distinct = (xs: { topicId: string }[]) =>
    new Set(xs.map((x) => x.topicId)).size;
  const study = activities.filter((a) => a.activityType !== 'NOTE');
  return {
    activities: study.length,
    studied: distinct(study),
    reviewed: distinct(
      study.filter((a) =>
        ['REVIEW', 'INTERVIEW_RECALL', 'MOCK'].includes(a.activityType),
      ),
    ),
    becameReady: distinct(
      study.filter(
        (a) =>
          a.statusAfter === 'INTERVIEW_READY' &&
          a.statusBefore !== 'INTERVIEW_READY',
      ),
    ),
    regressed: distinct(
      study.filter(
        (a) =>
          a.statusBefore === 'INTERVIEW_READY' &&
          a.statusAfter === 'NEEDS_REVISION',
      ),
    ),
  };
}

/** Job-search facts: events inside the week plus the pipeline as it stands now. */
export function jobWeek(
  input: {
    apps: {
      stage: string;
      appliedAt: Date | null;
      actionOwner: string;
      nextActionDate: Date | null;
    }[];
    rounds: {
      type: string;
      status: string;
      scheduledStart: Date;
      completedAt: Date | null;
    }[];
    activities: { type: string; toStage: string | null; occurredAt: Date }[];
  },
  b: WeekBounds,
  today: string,
) {
  const inWeek = (d: Date | null) => !!d && d >= b.start && d < b.end;
  const live = input.rounds.filter(
    (r) => r.status !== 'CANCELLED' && inWeek(r.scheduledStart),
  );
  const rounds = (...types: string[]) =>
    live.filter((r) => types.includes(r.type)).length;
  const moved = (stage: string) =>
    input.activities.filter(
      (a) =>
        a.type === 'STAGE_CHANGED' &&
        a.toStage === stage &&
        inWeek(a.occurredAt),
    ).length;
  return {
    submitted: input.apps.filter((a) => {
      const d = a.appliedAt?.toISOString().slice(0, 10);
      return !!d && d >= b.monday && d <= b.sunday;
    }).length,
    recruiter: rounds('RECRUITER'),
    assessment: rounds('ASSESSMENT'),
    technical: rounds('CODING'),
    systemDesign: rounds('SYSTEM_DESIGN'),
    behavioral: rounds('BEHAVIORAL'),
    final: rounds('FINAL', 'HIRING_MANAGER'),
    completed: input.rounds.filter(
      (r) => r.status === 'COMPLETED' && inWeek(r.completedAt),
    ).length,
    followUpsDone: input.activities.filter(
      (a) => a.type === 'FOLLOW_UP_DONE' && inWeek(a.occurredAt),
    ).length,
    offers: moved('OFFER'),
    rejections: moved('REJECTED'),
    active: input.apps.filter((a) => inProcessStages.includes(a.stage as Stage))
      .length,
    waiting: input.apps.filter(isWaiting).length,
    actionRequired: input.apps.filter(needsAction).length,
    followUpsOverdue: input.apps.filter(
      (a) => isOpen(a.stage) && followUpState(a, today).state === 'overdue',
    ).length,
  };
}

/** What enabled routines would place on each day of a week. Pure: nothing is generated. */
export function routinePreview(
  routines: {
    id: string;
    title: string;
    category: string;
    weekdays: number[];
    startLocal: string;
    endLocal: string;
    enabled: boolean;
  }[],
  monday: string,
  zone: string,
) {
  return weekDays(monday).map((day) => ({
    day,
    items: routines
      .filter((r) => r.enabled)
      .flatMap((r) => {
        try {
          const o = routineOccurrence(r, day, zone);
          return o
            ? [
                {
                  routineId: r.id,
                  title: r.title,
                  category: r.category,
                  start: o.plannedStart,
                  end: o.plannedEnd,
                },
              ]
            : [];
        } catch {
          // A routine landing in a DST gap is reported on Today when generated.
          return [];
        }
      })
      .sort((a, c) => +a.start - +c.start),
  }));
}

/** Sunday Today prompt: shown only on the review day while this week's review is open. */
export const weeklyPromptDue = (
  now: Date,
  zone: string,
  review: { completedAt: Date | null } | null,
) => isReviewDay(now, zone) && !review?.completedAt;
/** One reminder per week: Sunday at/after the preferred local time, unless already completed. */
export function weeklyReminderDue(
  now: Date,
  zone: string,
  preferredTime: string,
  completed: boolean,
) {
  if (completed || !isReviewDay(now, zone)) return null;
  const today = dayKey(now, zone);
  return now >= localInstant(today, preferredTime, zone) ? weekOf(today) : null;
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
export const reviewInput = z.object({
  weekStart: z.string().refine(isMonday, 'A week starts on Monday.'),
  biggestWin: text(1000),
  biggestBlocker: text(1000),
  lessons: text(1000),
  nextWeekChange: text(1000),
  carryForward: text(1000),
  intent: z.enum(['draft', 'complete']).default('draft'),
});
export const MAX_PRIORITIES = 5;
export const priorityInput = z.object({
  weekStart: z.string().refine(isMonday, 'A week starts on Monday.'),
  title: z.string().trim().min(1).max(160),
  category: text(60),
  goalId: text(60),
  target: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(1000).optional(),
  ),
  targetUnit: text(40),
});
