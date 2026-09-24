import { z } from 'zod';
import { dayKey } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
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
        'YES allows Yellow or Green; PARTIAL and NO allow Red or Yellow.',
      path: ['confidenceAfter'],
    },
  );
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
