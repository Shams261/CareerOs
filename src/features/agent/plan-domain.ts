/**
 * Rumi plans (WI-041, ADR-024): the pure rules behind a proposal. Which days Rumi may plan,
 * how a proposed block is read and checked against the day, what is stored with the answer
 * for the owner to apply or dismiss, and the owner's patterns (best hours, recorded share of
 * planned time). Covered by tests/agent-plans.test.ts.
 */
import { z } from 'zod';
import { hhmm, localInstant } from '@/lib/time';
import { weekDays } from '@/features/schedule/domain';
import { categoryGroup } from '@/features/review/domain';

/** At most this many blocks in one proposal, and proposals in one answer. */
export const PROPOSAL_BLOCKS = 6;
export const PROPOSALS_PER_ANSWER = 2;
export const SUGGESTIONS_PER_ANSWER = 1;
/** Patterns read this many days back and need this much recorded time to say anything. */
export const PATTERN_DAYS = 28;
const PATTERN_MIN_MINUTES = 120;
const RATIO_MIN_PLANNED = 60;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const proposeArgs = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    blocks: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(80),
            kind: z.string().trim().min(1).max(40),
            start: HHMM,
            end: HHMM,
            reason: z.string().trim().min(1).max(160),
          })
          .strict(),
      )
      .min(1)
      .max(PROPOSAL_BLOCKS),
  })
  .strict();
export type ProposeArgs = z.infer<typeof proposeArgs>;
export const suggestArgs = z
  .object({
    text: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(160),
  })
  .strict();

/** Rumi plans only today to this week's Sunday; next week starts with Prepare next week. */
export function planWindow(today: string) {
  return { first: today, last: weekDays(today)[6] };
}

/** The owner's own spelling of a kind ("system design" → "System design" when they use it). */
export function kindFor(kind: string, known: string[]) {
  const key = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ');
  const found =
    known.find((k) => key(k) === key(kind)) ??
    known.find((k) => key(categoryGroup(k)) === key(kind));
  if (found) return found;
  const t = kind.trim().replace(/[_]+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type Interval = { start: Date; end: Date };
export type ProposalBlock = {
  title: string;
  kind: string;
  start: string;
  end: string;
  reason: string;
  /** Why this block cannot be added; such a block is shown but never written. */
  conflict?: string;
};
export type Proposal = {
  id: string;
  day: string;
  blocks: ProposalBlock[];
  status: 'shown' | 'applied' | 'dismissed';
  blockIds?: string[];
};
export type Suggestion = {
  id: string;
  text: string;
  reason: string;
  status: 'shown' | 'kept' | 'dismissed';
};

/**
 * Checks proposed blocks against the day: each must end after it starts on the same day,
 * start in the future, and keep clear of the day's blocks and of the blocks before it.
 * A block that fails keeps its reason as `conflict`; the others can be added.
 */
export function checkBlocks(
  day: string,
  blocks: ProposeArgs['blocks'],
  taken: (Interval & { label: string })[],
  now: Date,
  zone: string,
  known: string[],
): ProposalBlock[] {
  const placed: (Interval & { label: string })[] = [];
  return blocks.map((b) => {
    const out: ProposalBlock = {
      title: b.title,
      kind: kindFor(b.kind, known),
      start: b.start,
      end: b.end,
      reason: b.reason,
    };
    let start: Date, end: Date;
    try {
      start = localInstant(day, b.start, zone);
      end = localInstant(day, b.end, zone);
    } catch {
      return { ...out, conflict: 'That time does not exist on this day' };
    }
    if (end <= start) return { ...out, conflict: 'It ends before it starts' };
    if (start <= now) return { ...out, conflict: 'That time has passed' };
    const clash = [...taken, ...placed].find(
      (t) => t.start < end && t.end > start,
    );
    if (clash) return { ...out, conflict: `Overlaps ${clash.label}` };
    placed.push({ start, end, label: `${b.start}–${b.end} ${b.title}` });
    return out;
  });
}
/** An existing block as a conflict names it: its time, and its title only when it may be sent. */
export const takenLabel = (
  b: { plannedStart: Date; plannedEnd: Date; title: string },
  visible: boolean,
  zone: string,
) =>
  `${hhmm(b.plannedStart, zone)}–${hhmm(b.plannedEnd, zone)} ${visible ? b.title : 'busy'}`;

const proposalSchema = z.object({
  id: z.string(),
  day: z.string(),
  blocks: z.array(
    z.object({
      title: z.string(),
      kind: z.string(),
      start: z.string(),
      end: z.string(),
      reason: z.string(),
      conflict: z.string().optional(),
    }),
  ),
  status: z.enum(['shown', 'applied', 'dismissed']),
  blockIds: z.array(z.string()).optional(),
});
const suggestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  reason: z.string(),
  status: z.enum(['shown', 'kept', 'dismissed']),
});
/** What an answer carries besides its text; anything unreadable reads as nothing. */
export function readMetadata(raw: unknown): {
  proposals: Proposal[];
  suggestions: Suggestion[];
} {
  const o =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = <T>(v: unknown, s: z.ZodType<T>) =>
    (Array.isArray(v) ? v : []).flatMap((x) => {
      const r = s.safeParse(x);
      return r.success ? [r.data] : [];
    });
  return {
    proposals: list(o.proposals, proposalSchema),
    suggestions: list(o.suggestions, suggestionSchema),
  };
}

/** The tool names an answer used, from its stored metadata, for its "Read:" line (WI-055). */
export function readTools(raw: unknown): string[] {
  const tools =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).tools
      : undefined;
  return (Array.isArray(tools) ? tools : []).filter(
    (t): t is string => typeof t === 'string' && t.length <= 40,
  );
}

/** Blocks a proposal would add: those without a conflict. */
/** The blocks Add to plan writes: none that conflict, and none the owner removed (WI-058). */
export const addable = (p: Proposal, skip: readonly number[] = []) =>
  p.blocks.filter((b, i) => !b.conflict && !skip.includes(i));

export type PatternInput = {
  sessions: { category: string; startedAt: Date; endedAt: Date | null }[];
  /** Past study blocks: planned minutes per kind. */
  planned: { category: string; plannedStart: Date; plannedEnd: Date }[];
};
export type Patterns = {
  /** The three-hour window with the most recorded study, such as "06:00–09:00". */
  bestHours: string | null;
  /** Recorded minutes as a share of planned, per kind, rounded to 5%. */
  recordedShare: Record<string, number>;
};
const mins = (a: Date, b: Date) => Math.max(0, Math.round((+b - +a) / 60_000));
/**
 * The owner's patterns over the last 28 days, deterministic: where in the day recorded study
 * falls, and how much of the planned time per kind gets recorded. Too little data says
 * nothing rather than guessing.
 */
export function patterns(
  { sessions, planned }: PatternInput,
  now: Date,
  zone: string,
): Patterns {
  const byHour = Array<number>(24).fill(0);
  let total = 0;
  for (const s of sessions) {
    const end = +(s.endedAt ?? now);
    // Quarter-hour steps keep the zone conversions few over 28 days of sessions.
    for (let t = +s.startedAt; t < end; t += 15 * 60_000) {
      const m = Math.min(15, (end - t) / 60_000);
      byHour[Number(hhmm(new Date(t), zone).slice(0, 2))] += m;
      total += m;
    }
  }
  let bestHours: string | null = null;
  if (total >= PATTERN_MIN_MINUTES) {
    let best = -1,
      at = 0;
    for (let h = 0; h <= 21; h++) {
      const sum = byHour[h] + byHour[h + 1] + byHour[h + 2];
      // On a tie, the window that starts with recorded time ("06:00–09:00", not "05:00–08:00").
      if (sum > best || (sum === best && !byHour[at] && byHour[h] > 0))
        [best, at] = [sum, h];
    }
    const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
    bestHours = `${pad(at)}–${pad(at + 3)}`;
  }
  const plan: Record<string, number> = {},
    done: Record<string, number> = {};
  for (const b of planned) {
    const k = categoryGroup(b.category);
    plan[k] = (plan[k] ?? 0) + mins(b.plannedStart, b.plannedEnd);
  }
  for (const s of sessions) {
    const k = categoryGroup(s.category);
    done[k] = (done[k] ?? 0) + mins(s.startedAt, s.endedAt ?? now);
  }
  const recordedShare: Record<string, number> = {};
  for (const [k, p] of Object.entries(plan))
    if (p >= RATIO_MIN_PLANNED)
      recordedShare[k] = Math.min(
        100,
        Math.round(((done[k] ?? 0) / p) * 20) * 5,
      );
  return { bestHours, recordedShare };
}
/** One line for Weekly review: "Most recorded study 06:00–09:00 · DSA about 70% of planned". */
export function patternLine(p: Patterns) {
  const shares = Object.entries(p.recordedShare)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} about ${v}% of planned`);
  const parts = [
    p.bestHours ? `Most recorded study ${p.bestHours}` : null,
    ...shares,
  ].filter(Boolean);
  return parts.length ? `Last 4 weeks: ${parts.join(' · ')}` : null;
}
