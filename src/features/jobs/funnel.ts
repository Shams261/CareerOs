import { shiftDay } from '../schedule/domain';

/**
 * The job search's own funnel (WI-056): for the applications sent each week, how far each got.
 * An application has reached a step once its stage history, its current stage or one of its
 * rounds says so, whatever happened after (a rejection does not undo an onsite). Counts only.
 */
export const FUNNEL_STEPS = [
  'Applied',
  'Screen',
  'Interviews',
  'Final',
  'Offer',
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/** How far a stage or a round type gets an application, as an index into FUNNEL_STEPS. */
const STAGE_REACH: Record<string, number> = {
  APPLIED: 0,
  RECRUITER_SCREEN: 1,
  ASSESSMENT: 2,
  TECHNICAL: 2,
  SYSTEM_DESIGN: 2,
  BEHAVIORAL: 2,
  FINAL: 3,
  OFFER: 4,
};
const ROUND_REACH: Record<string, number> = {
  RECRUITER: 1,
  HIRING_MANAGER: 1,
  ASSESSMENT: 2,
  CODING: 2,
  SYSTEM_DESIGN: 2,
  BEHAVIORAL: 2,
  AI_ASSISTED: 2,
  CODE_REVIEW: 2,
  DEBUGGING: 2,
  PRACTICAL: 2,
  OTHER: 1,
  FINAL: 3,
};

export type FunnelApp = {
  stage: string;
  /** The owner's applied date (a DATE label), else the day it was added once applied. */
  appliedOn: string | null;
  addedOn: string;
  history: string[];
  rounds: { type: string; status: string }[];
};

/** How far one application got: -1 while only saved, else an index into FUNNEL_STEPS. */
export function reach(app: FunnelApp) {
  const stages = [app.stage, ...app.history].map((s) => STAGE_REACH[s] ?? -1);
  const rounds = app.rounds
    .filter((r) => r.status !== 'CANCELLED')
    .map((r) => ROUND_REACH[r.type] ?? -1);
  const furthest = Math.max(-1, ...stages, ...rounds);
  // Anything past Saved was applied for, even without the Applied step recorded.
  return furthest < 0 && app.appliedOn ? 0 : furthest;
}

export type FunnelRow = { monday: string; counts: number[] };

/**
 * Per week (Monday labels, newest first) for the last `weeks` weeks, and for all time: how
 * many applications reached each step. A week counts the applications sent that week.
 */
export function jobsFunnel(
  apps: FunnelApp[],
  today: string,
  monday: (day: string) => string,
  weeks = 6,
) {
  const sent = apps
    .map((a) => ({ app: a, reached: reach(a) }))
    .filter((x) => x.reached >= 0)
    .map((x) => ({
      ...x,
      week: monday(x.app.appliedOn ?? x.app.addedOn),
    }));
  const count = (list: typeof sent) =>
    FUNNEL_STEPS.map((_, i) => list.filter((x) => x.reached >= i).length);
  const thisWeek = monday(today);
  const rows: FunnelRow[] = Array.from({ length: weeks }, (_, i) => {
    const m = shiftDay(thisWeek, -7 * i);
    return { monday: m, counts: count(sent.filter((x) => x.week === m)) };
  });
  return { all: count(sent), weeks: rows, sent: sent.length };
}
