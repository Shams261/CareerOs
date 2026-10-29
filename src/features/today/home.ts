/**
 * Today's words and counts (WI-065, ADR-027): the facts first, then one short line that cheers
 * them on. The owner chose short motivational lines beside the facts and a thin bar for the
 * week; never a streak, a score, a pace forecast or guilt. Every line is fixed text, checked
 * against BANNED_WORDS in the tests. Pure, no imports, so client parts can use it too.
 */

/** A line under Today's title, chosen by the day's facts; the day seeds the quiet ones. */
export const QUIET_LINES = [
  'A little progress is still progress.',
  'One clear step is enough to start.',
  'Show up first. The rest follows.',
] as const;

export function headerLine(input: {
  completed: number;
  planned: number;
  /** The day as YYYY-MM-DD; the same day always reads the same quiet line. */
  day: string;
}) {
  const { completed, planned, day } = input;
  if (planned > 0 && completed >= planned)
    return "Today's plan is done. Well kept.";
  if (completed === 1) return 'One block done today. It counts.';
  if (completed > 1) return `${completed} blocks done today. Keep the rhythm.`;
  const seed = [...day].reduce((n, c) => n + c.charCodeAt(0), 0);
  return QUIET_LINES[seed % QUIET_LINES.length];
}

export type Milestone = 'none' | 'first' | 'half' | 'done';

/** This week as blocks done of blocks planned (cancelled ones left out), with its line. */
export function weekProgress(input: { done: number; planned: number }) {
  const { done, planned } = input;
  const ratio = planned ? Math.min(1, done / planned) : 0;
  const milestone: Milestone = !planned
    ? 'none'
    : done >= planned
      ? 'done'
      : done * 2 >= planned
        ? 'half'
        : done > 0
          ? 'first'
          : 'none';
  const line = !planned
    ? 'Plan a few blocks and the week fills in here.'
    : {
        none: 'Each block you finish shows here.',
        first: 'One session in. That counts.',
        half: "Halfway through this week's plan.",
        done: "This week's plan is done. Well kept.",
      }[milestone];
  return { done, planned, ratio, milestone, line };
}

/** Milestones in order, so the client can tell when the week just crossed one. */
export const MILESTONE_ORDER: Milestone[] = ['none', 'first', 'half', 'done'];

/** The empty account's three steps (WI-065): each optional, each one panel or link away. */
export function firstSteps(input: {
  hasGoal: boolean;
  hasRoutine: boolean;
  hasFocus: boolean;
}) {
  const steps = [
    {
      key: 'goal' as const,
      title: 'Choose your goal',
      hint: 'What you are aiming for, and by when',
      done: input.hasGoal,
    },
    {
      key: 'times' as const,
      title: 'Set your study times',
      hint: 'The days and hours you really study',
      done: input.hasRoutine,
    },
    {
      key: 'focus' as const,
      title: 'Pick a learning focus',
      hint: 'Open a roadmap or a practice topic',
      done: input.hasFocus,
    },
  ];
  return { steps, done: steps.filter((s) => s.done).length };
}

/** Every fixed line on Today's home, for the copy check. */
export const HOME_COPY = [
  ...QUIET_LINES,
  "Today's plan is done. Well kept.",
  'One block done today. It counts.',
  'blocks done today. Keep the rhythm.',
  'Plan a few blocks and the week fills in here.',
  'Each block you finish shows here.',
  'One session in. That counts.',
  "Halfway through this week's plan.",
  "This week's plan is done. Well kept.",
  'Start small. Build your rhythm.',
  'Choose one thing that matters today. Silsila turns it into a clear next step, without filling your day for you.',
  'Nothing scheduled yet',
  'Add one focus block, or leave today open. Your next step shows here when you are ready.',
  'One next step, at your pace.',
];
