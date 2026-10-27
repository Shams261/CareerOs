import {
  formatPractice,
  formatSet,
  typeLabel,
  type Format,
  type FormatItem,
} from '../jobs/formats';
import { targetLabel } from './domain';

/**
 * The weekly mix (WI-048): a small, fixed week of practice that covers the formats of
 * 2025–2026 interviews, instead of 716 items. Each row counts what this week already holds and
 * points at the next item in the owner's own material. Counts toward a plan, never a score.
 */
export const WEEKLY_MIX: readonly { format: Format; target: number }[] = [
  { format: 'CODING', target: 3 },
  { format: 'CODE_REVIEW', target: 1 },
  { format: 'DEBUGGING', target: 1 },
  { format: 'PRACTICAL', target: 1 },
  { format: 'SYSTEM_DESIGN', target: 1 },
  { format: 'BEHAVIORAL', target: 2 },
];
/** Rows say what is practised, not the round's name. */
const MIX_WORDS: Partial<Record<Format, string>> = {
  CODING: 'DSA problems',
  DEBUGGING: 'Bug squash',
  PRACTICAL: 'Practical task',
  BEHAVIORAL: 'Behavioural stories',
};
export const mixLabel = (f: Format) => MIX_WORDS[f] ?? typeLabel[f];
/** Interviews this close shape the week: their formats lead the mix. */
export const INTERVIEW_HORIZON_DAYS = 14;

export type WeekInterview = { company: string; format: Format; on: string };
export type MixRow = {
  format: Format;
  label: string;
  target: number;
  done: number;
  next: FormatItem | null;
  /** The nearest interview within the horizon that uses this format. */
  interview: { company: string; on: string } | null;
};

/**
 * The week's rows. Formats of interviews in the next two weeks come first, by date (and join
 * the mix with one item when the mix lacks them, such as AI-assisted coding); the rest keep
 * the mix order. Coding counts the distinct problems attempted this week; every other row
 * counts its items done this week (`completedAt` inside the owner's week).
 */
export function weekMix(input: {
  items: FormatItem[];
  /** Distinct problems with an attempt this week. */
  problemsAttempted: number;
  week: { start: Date; end: Date };
  interviews: WeekInterview[];
}): MixRow[] {
  const nearest = new Map<Format, WeekInterview>();
  for (const i of [...input.interviews].sort((a, b) =>
    a.on.localeCompare(b.on),
  ))
    if (!nearest.has(i.format)) nearest.set(i.format, i);
  const rows = [
    ...WEEKLY_MIX,
    ...[...nearest.keys()]
      .filter((f) => !WEEKLY_MIX.some((m) => m.format === f))
      .map((format) => ({ format, target: 1 })),
  ].map(({ format, target }) => {
    const interview = nearest.get(format) ?? null;
    // A behavioural interview brings its company's own section first.
    const company = interview?.company ?? '';
    const inWeek = (d: Date | null | undefined) =>
      !!d && d >= input.week.start && d < input.week.end;
    return {
      format,
      label: mixLabel(format),
      target,
      done:
        format === 'CODING'
          ? input.problemsAttempted
          : formatSet(format, input.items, company).filter((i) =>
              inWeek(i.completedAt),
            ).length,
      next: formatPractice(format, input.items, company).next,
      interview: interview
        ? { company: interview.company, on: interview.on }
        : null,
    };
  });
  const order = (r: MixRow) => r.interview?.on ?? '9999-12-31';
  return rows.sort((a, b) => order(a).localeCompare(order(b)));
}

/** "Offer from a product company · 7 weeks left · 406 P0 items left"; counts, no pace. */
export function readyLine(
  goal: { title: string; targetDate: Date | null } | null,
  p0Left: number,
  today: string,
) {
  const parts: string[] = [];
  if (goal)
    parts.push(
      goal.title,
      targetLabel(goal.targetDate?.toISOString().slice(0, 10) ?? null, today),
    );
  parts.push(`${p0Left} P0 item${p0Left === 1 ? '' : 's'} left`);
  return parts.join(' · ');
}

/** What "Plan with Rumi" asks: the rows still short this week, in the owner's words. */
export function planQuestion(rows: MixRow[]) {
  const short = rows
    .filter((r) => r.done < r.target)
    // "Code review" reads "code review"; "AI-assisted coding" and "DSA problems" keep their capitals.
    .map(
      (r) =>
        `${r.target - r.done} ${r.label.replace(/^[A-Z][a-z]/, (m) => m.toLowerCase())}`,
    );
  return short.length
    ? `Plan the rest of this week's practice: ${short.join(', ')}. Use my free time and best hours.`
    : 'This week’s practice mix is covered. What should I revise next?';
}
