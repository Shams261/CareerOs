import { z } from 'zod';
import { dayKey } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import { CONFIDENCE_WORD } from './words';
export { CONFIDENCE_WORD, confidenceWord, type ConfidenceValue } from './words';
export const confidence = z.enum(['RED', 'YELLOW', 'GREEN']);
export const attemptInput = z
  .object({
    problemId: z.string().min(1),
    requestId: z.uuid(),
    confidenceAfter: confidence,
    solvedIndependently: z.enum(['YES', 'PARTIAL', 'NO']),
    durationMinutes: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().int().min(1).max(1440).optional(),
    ),
    notes: z.string().trim().max(2000).default(''),
    mistake: z.string().trim().max(1000).default(''),
  })
  .refine(
    (v) =>
      v.solvedIndependently === 'YES'
        ? v.confidenceAfter !== 'RED'
        : v.confidenceAfter !== 'GREEN',
    {
      message:
        'Solved on your own needs Okay or Solid; with hints or the solution, Shaky or Okay.',
      path: ['confidenceAfter'],
    },
  );
/** How an attempt was solved, in the owner's words. */
export const solvedText = {
  YES: 'on my own',
  PARTIAL: 'with hints',
  NO: 'needed the solution',
} as const;
/**
 * The revision ladder (WI-094): three revisions of a solved problem, 3, 7 and 14 days after
 * the day it was solved, each revised or missed. The confidence is a label only.
 */
export const LADDER_DAYS = [3, 7, 14] as const;
export const LADDER_STEPS = LADDER_DAYS.length;
export type Outcome = 'revised' | 'missed';
export type LadderProblem = {
  attemptsCount: number;
  nextRevisionAt: Date | null;
  revisionStartedOn: Date | null;
  revisionOutcomes: string[];
};
/** The day step `n` (1–3) of a ladder started on `startedOn` is due. */
export const stepDue = (startedOn: string, n: number) =>
  shiftDay(startedOn, LADDER_DAYS[n - 1]);
/** A ladder begun on `day`: step 1 in three days, nothing settled. */
export function startLadder(day: string) {
  return {
    revisionStartedOn: new Date(day),
    revisionOutcomes: [] as string[],
    revisionStage: 0,
    nextRevisionAt: new Date(stepDue(day, 1)),
    revisionManual: false,
  };
}
const after = (startedOn: string, outcomes: string[]) =>
  outcomes.length < LADDER_STEPS
    ? new Date(stepDue(startedOn, outcomes.length + 1))
    : null;
/** The live step revised: the next step keeps its own day from the start. */
export function markRevised(p: LadderProblem) {
  if (!p.revisionStartedOn || !p.nextRevisionAt)
    throw new Error('No revision is open on this problem.');
  const outcomes = [...p.revisionOutcomes, 'revised'];
  return {
    revisionOutcomes: outcomes,
    revisionStage: outcomes.length,
    nextRevisionAt: after(revisionDay(p.revisionStartedOn), outcomes),
    revisionManual: false,
  };
}
/**
 * A step whose day has passed unrevised is missed (never carried as overdue), and the ladder
 * moves on to the next step with its own day; several steps can settle at once after days
 * away. Null when nothing is due to settle.
 */
export function settleLadder(p: LadderProblem, today: string) {
  if (!p.revisionStartedOn || !p.nextRevisionAt) return null;
  if (revisionDay(p.nextRevisionAt) >= today) return null;
  const start = revisionDay(p.revisionStartedOn);
  const outcomes = [...p.revisionOutcomes];
  let next: Date | null = p.nextRevisionAt;
  while (next && revisionDay(next) < today) {
    outcomes.push('missed');
    next = after(start, outcomes);
  }
  return {
    revisionOutcomes: outcomes,
    revisionStage: outcomes.length,
    nextRevisionAt: next,
    revisionManual: false,
  };
}
export type LadderState = {
  /** 'unattempted' | 'none' (attempted, no ladder) | 'due' | 'upcoming' | 'finished'. */
  state: 'unattempted' | 'none' | 'due' | 'upcoming' | 'finished';
  /** The live step, 1–3, or null. */
  step: number | null;
  /** The live step's day, or null. */
  due: string | null;
  outcomes: Outcome[];
  revised: number[];
  missed: number[];
  /** Every step with its day and what became of it, for the strip on the problem page. */
  steps: { n: number; due: string; outcome: Outcome | 'due' | 'upcoming' }[];
};
export function ladderState(p: LadderProblem, today: string): LadderState {
  const outcomes = p.revisionOutcomes.filter(
    (o): o is Outcome => o === 'revised' || o === 'missed',
  );
  const revised = outcomes.flatMap((o, i) => (o === 'revised' ? [i + 1] : []));
  const missed = outcomes.flatMap((o, i) => (o === 'missed' ? [i + 1] : []));
  if (!p.attemptsCount || !p.revisionStartedOn)
    return {
      state: p.attemptsCount ? 'none' : 'unattempted',
      step: null,
      due: null,
      outcomes,
      revised,
      missed,
      steps: [],
    };
  const start = revisionDay(p.revisionStartedOn);
  const live = outcomes.length < LADDER_STEPS ? outcomes.length + 1 : null;
  const due = live
    ? p.nextRevisionAt
      ? revisionDay(p.nextRevisionAt)
      : stepDue(start, live)
    : null;
  const steps = LADDER_DAYS.map((_, i) => {
    const n = i + 1;
    const day = n === live && due ? due : stepDue(start, n);
    const outcome: Outcome | 'due' | 'upcoming' =
      outcomes[i] ?? (n === live && day <= today ? 'due' : 'upcoming');
    return { n, due: day, outcome };
  });
  return {
    state: !live ? 'finished' : due && due <= today ? 'due' : 'upcoming',
    step: live,
    due,
    outcomes,
    revised,
    missed,
    steps,
  };
}
/** "Revision 1 of 3 · Due today", "2 of 3 · Nov 7", "Revised 3 of 3", "Missed 2 of 3". */
export function ladderLine(l: LadderState, dateLabel: (day: string) => string) {
  const missedNote = l.missed.length ? ` · missed ${l.missed.join(', ')}` : '';
  if (l.state === 'due')
    return `Revision ${l.step} of 3 · Due today${missedNote}`;
  if (l.state === 'upcoming')
    return `${l.step} of 3 · ${dateLabel(l.due!)}${missedNote}`;
  if (l.state === 'finished')
    return l.missed.length === 0
      ? 'Revised 3 of 3'
      : l.revised.length === 0
        ? 'Missed 3 of 3'
        : `Revised ${l.revised.length} of 3 · missed ${l.missed.join(', ')}`;
  return null;
}
export type QueueProblem = {
  id: string;
  confidence: 'RED' | 'YELLOW' | 'GREEN';
  attemptsCount: number;
  nextRevisionAt: Date | null;
};
// @db.Date values are calendar labels represented by UTC midnight, not instants to zone-format.
export const revisionDay = (value: Date) => value.toISOString().slice(0, 10);
export function learningState(p: QueueProblem, day: string) {
  if (!p.attemptsCount) return 'unattempted';
  if (!p.nextRevisionAt) return 'unscheduled';
  const due = revisionDay(p.nextRevisionAt);
  return due < day ? 'overdue' : due === day ? 'due' : 'upcoming';
}
export function revisionQueue<T extends QueueProblem>(
  problems: T[],
  day: string,
) {
  const rank = { RED: 0, YELLOW: 1, GREEN: 2 };
  return problems
    .filter((p) => ['due', 'overdue'].includes(learningState(p, day)))
    .sort(
      (a, b) =>
        Number(learningState(a, day) !== 'overdue') -
          Number(learningState(b, day) !== 'overdue') ||
        rank[a.confidence] - rank[b.confidence] ||
        +a.nextRevisionAt! - +b.nextRevisionAt! ||
        a.id.localeCompare(b.id),
    );
}
export const isDsa = (category: string) =>
  category.trim().toUpperCase() === 'DSA';
export function todayDsaSummary<T extends QueueProblem>(
  problems: T[],
  now: Date,
  zone: string,
) {
  const queue = revisionQueue(problems, dayKey(now, zone));
  return {
    queue,
    red: queue.filter((p) => p.confidence === 'RED').length,
    yellow: queue.filter((p) => p.confidence === 'YELLOW').length,
  };
}

/** The library's one filter: confidence or revision state. */
export const STATUS_FILTERS = {
  '': 'Any status',
  unattempted: 'Unattempted',
  RED: CONFIDENCE_WORD.RED,
  YELLOW: CONFIDENCE_WORD.YELLOW,
  GREEN: CONFIDENCE_WORD.GREEN,
  due: 'Due today',
  missed: 'Missed a revision',
} as const;
export type StatusFilter = keyof typeof STATUS_FILTERS;

const LEVEL_RANK: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };
/**
 * Problems in curriculum order, as the Practice list shows them (WI-060): topic order, then
 * Easy → Medium → Hard, core problems before "More practice", then title.
 */
export function curriculumOrder<
  T extends {
    title: string;
    topicId: string;
    difficulty: string;
    notes?: string | null;
  },
>(problems: T[], topics: { id: string }[]) {
  const topicRank = new Map(topics.map((t, i) => [t.id, i]));
  const more = (p: T) => Number(/More practice/.test(p.notes ?? ''));
  return [...problems].sort(
    (a, b) =>
      (topicRank.get(a.topicId) ?? Infinity) -
        (topicRank.get(b.topicId) ?? Infinity) ||
      (LEVEL_RANK[a.difficulty] ?? 3) - (LEVEL_RANK[b.difficulty] ?? 3) ||
      more(a) - more(b) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * An imported problem's notes, read for the screen (WI-093). The bundle writes
 * "LeetCode 217 · Companies (Prashad): Google, Amazon · Core list (Arrays & Hashing)": the
 * source's name and the list's name are the import's business, so the line keeps the number
 * and the companies, and the list becomes one word for the eyebrow (Core or More practice).
 */
export function problemNoteLine(notes: string | null | undefined): {
  line: string | null;
  list: 'core' | 'more' | null;
} {
  if (!notes?.trim()) return { line: null, list: null };
  let list: 'core' | 'more' | null = null;
  const kept = notes
    .split(/\s·\s/)
    .map((seg) => seg.trim())
    .filter((seg) => {
      if (/^Core list(\s|\(|$)/.test(seg)) {
        list = 'core';
        return false;
      }
      if (/^More practice(\s|\(|$)/.test(seg)) {
        list = 'more';
        return false;
      }
      return seg.length > 0;
    })
    .map((seg) => seg.replace(/^Companies \([^)]*\):\s*/, 'Companies: '))
    .filter((seg) => !/^Companies:\s*$/.test(seg));
  return { line: kept.length ? kept.join(' · ') : null, list };
}

/**
 * The next problem (WI-094): the working topic's first core problem not tried yet, in the
 * list's order; once every topic's core problems are tried, its "More practice" problems (the
 * curriculum's second pass). The working topic is the current one while it has untried core
 * problems, else the topic of the latest attempt, moving on to the next topic in order once a
 * topic's core is done; with nothing attempted, the first topic.
 */
export function nextProblemFor<
  T extends {
    id: string;
    topicId: string;
    attemptsCount: number;
    lastAttemptedAt: Date | null;
    notes?: string | null;
  },
>(ordered: T[], topics: { id: string }[], currentTopicId: string | null) {
  const more = (p: T) => /More practice/.test(p.notes ?? '');
  const untried = (topicId: string, pass: 'core' | 'more') =>
    ordered.find(
      (p) =>
        p.topicId === topicId &&
        !p.attemptsCount &&
        (pass === 'core' ? !more(p) : more(p)),
    ) ?? null;
  const latest = ordered
    .filter((p) => p.lastAttemptedAt)
    .sort((a, b) => +b.lastAttemptedAt! - +a.lastAttemptedAt!)[0];
  const from = latest ? topics.findIndex((t) => t.id === latest.topicId) : 0;
  const order = [...topics.slice(Math.max(0, from)), ...topics.slice(0, from)];
  for (const pass of ['core', 'more'] as const) {
    if (currentTopicId && untried(currentTopicId, pass))
      return untried(currentTopicId, pass);
    for (const t of order) {
      const p = untried(t.id, pass);
      if (p) return p;
    }
  }
  return null;
}
