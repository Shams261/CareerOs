/**
 * Pure view models for Today (WI-020): the day summary, the launcher state, agenda entries
 * with their linked-interview identity, and the "needs attention" queue. No I/O, no
 * component code; everything here is covered by tests/today-domain.test.ts.
 */
import { dayKey, hhmm, minutes, weekdayDate } from '@/lib/time';
import type { Attention } from '@/features/jobs/domain';
import {
  dueContext,
  interviewPrepRows,
  jobAttentionRows,
  practiceRevisionRows,
  revisionContext,
  roadmapRevisionRows,
  foldRevisionRows,
  sortAttention,
  type AttentionItem,
  type AttentionSource,
  revisionDeckRow,
} from '@/features/attention/domain';
import {
  blockResolution,
  blockTitle,
  formatDuration,
  resolutionText,
  type BlockLike,
  type Resolution,
  type SessionLike,
} from '@/features/schedule/row';

// The block row's pieces live in schedule/row.ts since WI-021 (Plan shares them).
export {
  hhmm,
  blockResolution,
  blockTitle,
  formatDuration,
  resolutionText,
  type BlockLike,
  type Resolution,
  type SessionLike,
};
export type RoundLike = {
  id: string;
  title: string;
  type: string;
  applicationId: string;
  company: string;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  openPrep: number;
  meetingUrl: string | null;
};
export type RunningLike = {
  id: string;
  startedAt: Date;
  category: string;
  taskId: string | null;
  title: string | null;
};

const ELIGIBLE = ['PLANNED', 'IN_PROGRESS'];
/** Minutes of [start, end) that fall inside [from, to). */
const clip = (start: Date, end: Date, from: Date, to: Date) =>
  minutes(new Date(Math.max(+start, +from)), new Date(Math.min(+end, +to)));

/**
 * The selected day's facts. Planned covers every non-cancelled block, recorded every unique
 * session (a running one up to `now`), both clipped to the day. All categories count; the
 * focus-only numbers of the weekly review are a different measure and stay in `dayProgress`.
 */
export function daySummary(
  blocks: BlockLike[],
  sessions: SessionLike[],
  bounds: { start: Date; end: Date },
  now: Date,
) {
  const active = blocks.filter((b) => b.status !== 'CANCELLED');
  const unique = new Map<string, SessionLike>();
  for (const s of [...sessions, ...blocks.flatMap((b) => b.sessions)])
    unique.set(s.id, s);
  const recordedMinutes = [...unique.values()].reduce(
    (n, s) => n + clip(s.startedAt, s.endedAt ?? now, bounds.start, bounds.end),
    0,
  );
  return {
    completed: active.filter((b) => b.status === 'COMPLETED').length,
    planned: active.length,
    plannedMinutes: active.reduce(
      (n, b) =>
        n + clip(b.plannedStart, b.plannedEnd, bounds.start, bounds.end),
      0,
    ),
    recordedMinutes,
  };
}
/** "1 block completed · 59 min recorded · 2h 15m planned". A fact line, never a score. */
export function summaryLine(s: ReturnType<typeof daySummary>) {
  return [
    `${s.completed} block${s.completed === 1 ? '' : 's'} completed`,
    `${formatDuration(s.recordedMinutes)} recorded`,
    `${formatDuration(s.plannedMinutes)} planned`,
  ].join(' · ');
}

export type LauncherState =
  | { kind: 'running'; session: RunningLike; block: BlockLike | null }
  | { kind: 'current'; block: BlockLike; next: BlockLike | null }
  | { kind: 'next'; block: BlockLike }
  | { kind: 'reconcile'; blocks: BlockLike[] }
  | { kind: 'done' };

const byStart = (a: BlockLike, b: BlockLike) =>
  +a.plannedStart - +b.plannedStart || a.id.localeCompare(b.id);
/** Past blocks still waiting for a decision: not completed, skipped or cancelled. */
export const unresolved = (blocks: BlockLike[], now: Date) =>
  blocks
    .filter((b) => ELIGIBLE.includes(b.status) && b.plannedEnd <= now)
    .sort(byStart);

/**
 * What the launcher shows, in priority order: a running session (from the session record),
 * the eligible block covering now (earliest start, then id), the next eligible block,
 * earlier blocks that need an update, else nothing left.
 */
export function launcherState(
  blocks: BlockLike[],
  running: RunningLike | null,
  now: Date,
): LauncherState {
  if (running)
    return {
      kind: 'running',
      session: running,
      block: blocks.find((b) => b.id === running.taskId) ?? null,
    };
  const eligible = blocks.filter((b) => ELIGIBLE.includes(b.status));
  const current = eligible
    .filter((b) => b.plannedStart <= now && b.plannedEnd > now)
    .sort(byStart)[0];
  const upcoming = eligible.filter((b) => b.plannedStart > now).sort(byStart);
  if (current)
    return { kind: 'current', block: current, next: upcoming[0] ?? null };
  if (upcoming[0]) return { kind: 'next', block: upcoming[0] };
  const pending = unresolved(blocks, now);
  if (pending.length) return { kind: 'reconcile', blocks: pending };
  return { kind: 'done' };
}

export type AgendaEntry =
  | {
      kind: 'block';
      key: string;
      at: Date;
      end: Date;
      block: BlockLike;
      round: RoundLike | null;
    }
  | {
      kind: 'round';
      key: string;
      at: Date;
      /** The real end when known; a standalone interview without one shows its start only. */
      end: Date | null;
      round: RoundLike;
    };
const ROUND_FALLBACK_MINUTES = 60;
/** Where an entry ends for grouping; an interview without an end time counts as an hour. */
export const entryEnd = (e: AgendaEntry) =>
  e.kind === 'block'
    ? e.end
    : (e.end ?? new Date(+e.at + ROUND_FALLBACK_MINUTES * 60000));

/**
 * One agenda item per block, carrying its interview when `interviewRoundId` links one; the
 * rounds without a linked block stand on their own. Never deduplicated by title or time.
 */
export function agendaEntries(
  blocks: BlockLike[],
  rounds: RoundLike[],
): AgendaEntry[] {
  const byId = new Map(rounds.map((r) => [r.id, r]));
  const linked = new Set<string>();
  const entries: AgendaEntry[] = blocks.map((block) => {
    const round = block.interviewRoundId
      ? (byId.get(block.interviewRoundId) ?? null)
      : null;
    if (round) linked.add(round.id);
    return {
      kind: 'block',
      key: `block-${block.id}`,
      at: block.plannedStart,
      end: block.plannedEnd,
      block,
      round,
    };
  });
  for (const round of rounds)
    if (!linked.has(round.id))
      entries.push({
        kind: 'round',
        key: `round-${round.id}`,
        at: round.scheduledStart,
        end: round.scheduledEnd,
        round,
      });
  return entries.sort((a, b) => +a.at - +b.at || a.key.localeCompare(b.key));
}

/** Earlier / Now / Later by time only; cancelled blocks sit apart. Other days get one list. */
export function groupAgenda(
  entries: AgendaEntry[],
  now: Date,
  isToday: boolean,
) {
  const cancelled = entries.filter(
    (e) => e.kind === 'block' && e.block.status === 'CANCELLED',
  );
  const live = entries.filter((e) => !cancelled.includes(e));
  if (!isToday) return { earlier: [], now: [], later: live, cancelled };
  return {
    earlier: live.filter((e) => entryEnd(e) <= now),
    now: live.filter((e) => e.at <= now && entryEnd(e) > now),
    later: live.filter((e) => e.at > now),
    cancelled,
  };
}

/* ---------- Needs attention ---------- */

// The row types and builders are shared with Jobs and the Roadmap since WI-022.
export {
  dueContext,
  revisionContext,
  type AttentionItem,
  type AttentionSource,
};

export type AttentionInput = {
  now: Date;
  zone: string;
  interviews: RoundLike[];
  jobs: {
    app: {
      id: string;
      company: string;
      nextAction: string | null;
      nextActionDate: Date | null;
    };
    reasons: Attention[];
  }[];
  roadmap: {
    id: string;
    title: string;
    section: string;
    nextRevisionAt: Date | null;
    roadmap: { id: string; title: string };
    /** Kept Grill Me cards on the item (WI-032). */
    cards?: number;
  }[];
  practice: {
    id: string;
    title: string;
    confidence: string;
    nextRevisionAt: Date | null;
  }[];
  notifications: {
    id: string;
    type: string;
    title: string;
    scheduledFor: Date;
    dedupeKey: string;
  }[];
  weeklyDue: boolean;
  /** Today's blocks, so a reminder keyed on one reads as that block, not as a sentence. */
  blocks?: {
    id: string;
    title: string;
    plannedStart: Date;
    plannedEnd: Date;
    interviewRoundId?: string | null;
  }[];
};

/** The entity id a reminder was keyed on (`user:type:entity:occurrence`). */
export const notificationEntity = (dedupeKey: string) =>
  dedupeKey.split(':')[2] ?? '';

/**
 * The deduplicated attention queue in urgency order. Notes and goals are not attention.
 * A reminder merges into the row of the entity it was keyed on; unmatched reminders stay.
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const { now, zone } = input;
  const today = dayKey(now, zone);
  const prep = interviewPrepRows(input.interviews, now, zone);
  const items: AttentionItem[] = [
    ...prep,
    ...jobAttentionRows(
      input.jobs,
      now,
      zone,
      new Set(prep.map((i) => i.id.slice('prep:'.length))),
    ),
    ...foldRevisionRows(
      practiceRevisionRows(input.practice, now, zone),
      {
        many: 'problems',
        label: 'Practice',
        href: '/dsa#revision-queue',
      },
      today,
    ),
    ...foldRevisionRows(
      roadmapRevisionRows(input.roadmap, now, zone),
      {
        many: 'roadmap items',
        label: 'Roadmap',
        href: '/roadmap#revision-heading',
      },
      today,
    ),
    ...[revisionDeckRow(input.roadmap)].filter((r): r is AttentionItem => !!r),
  ];
  // Interview rows by round id (prep, result, upcoming) and follow-up rows by application
  // id: a reminder merges only into the row that is about the same action.
  const byRound = new Map<string, AttentionItem>();
  const followUpByApp = new Map<string, AttentionItem>();
  for (const item of items) {
    const [kind, id] = item.id.split(':');
    if (kind === 'prep' || kind === 'result' || kind === 'interview')
      byRound.set(id, item);
    if (kind === 'job') followUpByApp.set(id, item);
  }
  for (const n of input.notifications) {
    const entity = notificationEntity(n.dedupeKey);
    const host =
      n.type === 'INTERVIEW'
        ? byRound.get(entity)
        : n.type === 'JOB_FOLLOW_UP'
          ? followUpByApp.get(entity)
          : undefined;
    if (host) {
      host.notificationIds.push(n.id);
      continue;
    }
    const block =
      n.type === 'UPCOMING_BLOCK' || n.type === 'OVERDUE_TASK'
        ? input.blocks?.find((b) => b.id === entity)
        : undefined;
    if (block) {
      const round = block.interviewRoundId
        ? input.interviews.find((r) => r.id === block.interviewRoundId)
        : null;
      items.push({
        id: `notification:${n.id}`,
        source: 'notification',
        label: 'Reminder',
        title: blockTitle(block, round),
        context:
          n.type === 'OVERDUE_TASK'
            ? `Not recorded · ${hhmm(block.plannedStart, zone)}–${hhmm(block.plannedEnd, zone)}`
            : `Starts at ${hhmm(block.plannedStart, zone)}`,
        href: `#block-${block.id}`,
        tier: 3,
        due: +n.scheduledFor,
        notificationIds: [n.id],
      });
      continue;
    }
    items.push({
      id: `notification:${n.id}`,
      source: 'notification',
      label: 'Reminder',
      title: n.title,
      context:
        dayKey(n.scheduledFor, zone) === today
          ? 'Today'
          : weekdayDate(dayKey(n.scheduledFor, zone)),
      href: null,
      tier: 3,
      due: +n.scheduledFor,
      notificationIds: [n.id],
    });
  }
  if (input.weeklyDue)
    items.push({
      id: 'weekly',
      source: 'weekly',
      label: 'Weekly review',
      title: 'Review this week',
      context: 'Open today',
      href: '/review',
      tier: 3,
      due: +now,
      notificationIds: [],
    });
  return sortAttention(items);
}
export const ATTENTION_PAGE = 20;
export function attentionPage<T>(
  items: T[],
  page: number,
  size = ATTENTION_PAGE,
) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return {
    page: current,
    pages,
    items: items.slice((current - 1) * size, current * size),
  };
}

/**
 * The week so far as facts (WI-059): yesterday's blocks recorded against planned, and the
 * week's recorded time against planned time, Monday through today. A block counts as recorded
 * once it is completed or has a session. Counts only: never a streak, a score or a pace.
 */
export function recentFacts(input: {
  /** Live blocks from this Monday (or yesterday, if earlier) up to yesterday, with their day. */
  past: {
    day: string;
    status: string;
    plannedStart: Date;
    plannedEnd: Date;
    sessions: number;
  }[];
  /** Today's blocks. */
  todayBlocks: { status: string; plannedStart: Date; plannedEnd: Date }[];
  /** Sessions that started this week, up to now. */
  sessions: { startedAt: Date; endedAt: Date | null }[];
  monday: string;
  yesterday: string;
  now: Date;
}) {
  const live = <T extends { status: string }>(b: T[]) =>
    b.filter((x) => x.status !== 'CANCELLED');
  const y = live(input.past).filter((b) => b.day === input.yesterday);
  const week = [
    ...live(input.past).filter((b) => b.day >= input.monday),
    ...live(input.todayBlocks),
  ];
  return {
    yesterday: y.length
      ? {
          planned: y.length,
          recorded: y.filter((b) => b.status === 'COMPLETED' || b.sessions > 0)
            .length,
        }
      : null,
    week: {
      plannedMinutes: week.reduce(
        (n, b) => n + minutes(b.plannedStart, b.plannedEnd),
        0,
      ),
      recordedMinutes: input.sessions.reduce(
        (n, s) =>
          n +
          minutes(
            s.startedAt,
            s.endedAt && s.endedAt < input.now ? s.endedAt : input.now,
          ),
        0,
      ),
    },
  };
}
export type RecentFacts = ReturnType<typeof recentFacts>;
/** Yesterday had planned blocks and none of them recorded: Today opens on "Start from here". */
export const quietYesterday = (f: RecentFacts) =>
  !!f.yesterday && f.yesterday.recorded === 0;
/** "Yesterday: 0 of 3 blocks recorded · This week: 2h 15m recorded of 11h 45m planned". */
export function factsLine(f: RecentFacts) {
  return [
    f.yesterday
      ? `Yesterday: ${f.yesterday.recorded} of ${f.yesterday.planned} block${f.yesterday.planned === 1 ? '' : 's'} recorded`
      : null,
    f.week.plannedMinutes || f.week.recordedMinutes
      ? `This week: ${formatDuration(f.week.recordedMinutes)} recorded of ${formatDuration(f.week.plannedMinutes)} planned`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
