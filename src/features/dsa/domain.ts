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
export function revision(
  conf: z.infer<typeof confidence>,
  stage: number,
  day: string,
) {
  const nextStage = conf === 'GREEN' ? Math.min(3, stage + 1) : 0;
  const days =
    conf === 'RED' ? 1 : conf === 'YELLOW' ? 3 : [7, 14, 30][nextStage - 1];
  return {
    revisionStage: nextStage,
    nextRevisionAt: new Date(shiftDay(day, days)),
    revisionManual: false,
  };
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
  overdue: 'Overdue',
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
