/**
 * Pure view models for Today (WI-020): the day summary, the launcher state, agenda entries
 * with their linked-interview identity, and the "needs attention" queue. No I/O, no
 * component code; everything here is covered by tests/today-domain.test.ts.
 */
import { clock, dayKey, minutes, shortDate, weekdayDate } from '@/lib/time';
import type { Attention } from '@/features/jobs/domain';

export type SessionLike = { id: string; startedAt: Date; endedAt: Date | null };
export type BlockLike = {
  id: string;
  title: string;
  category: string;
  status: string;
  plannedStart: Date;
  plannedEnd: Date;
  interviewRoundId: string | null;
  sessions: SessionLike[];
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

/** "59 min", "2h", "2h 15m": minutes as the owner reads them. */
export function formatDuration(n: number) {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60),
    m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

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

export type Resolution =
  | 'upcoming'
  | 'current'
  | 'in-progress'
  | 'done'
  | 'skipped'
  | 'cancelled'
  | 'not-recorded'
  | 'needs-update';
/** A past block without a decision is "not recorded" or "recorded, needs update", never missed. */
export function blockResolution(block: BlockLike, now: Date): Resolution {
  if (block.status === 'COMPLETED') return 'done';
  if (block.status === 'SKIPPED') return 'skipped';
  if (block.status === 'CANCELLED') return 'cancelled';
  if (block.status === 'IN_PROGRESS') return 'in-progress';
  if (block.plannedEnd <= now)
    return block.sessions.length ? 'needs-update' : 'not-recorded';
  if (block.plannedStart <= now) return 'current';
  return 'upcoming';
}
export const resolutionText: Record<Resolution, string> = {
  upcoming: 'Upcoming',
  current: 'Now',
  'in-progress': 'In session',
  done: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  'not-recorded': 'Not recorded',
  'needs-update': 'Recorded · Needs update',
};

/* ---------- Needs attention ---------- */

export type AttentionSource =
  'interview-prep' | 'job' | 'practice' | 'roadmap' | 'notification' | 'weekly';
export type AttentionItem = {
  id: string;
  source: AttentionSource;
  /** The small category label. */
  label: string;
  title: string;
  /** Explicit due context: "Overdue by 2 days", "Today at 10:00 AM". */
  context: string;
  href: string | null;
  /** 1 interview prep today · 2 overdue · 3 due today · 4 upcoming. */
  tier: 1 | 2 | 3 | 4;
  /** Due instant for ordering inside a tier. */
  due: number;
  /** Reminders merged into this row, so Mark read stays available. */
  notificationIds: string[];
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
  practice: {
    id: string;
    title: string;
    confidence: string;
    nextRevisionAt: Date | null;
  }[];
  roadmap: {
    id: string;
    title: string;
    section: string;
    nextRevisionAt: Date | null;
    roadmap: { id: string; title: string };
  }[];
  notifications: {
    id: string;
    type: string;
    title: string;
    scheduledFor: Date;
    dedupeKey: string;
  }[];
  weeklyDue: boolean;
};

const dateLabel = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round(
    (+new Date(`${to}T12:00:00Z`) - +new Date(`${from}T12:00:00Z`)) / 86400000,
  );
/** "Overdue by 2 days" / "Due today" for a DATE label against the owner's day. */
function dueContext(date: string, today: string) {
  const days = daysBetween(date, today);
  return days > 0
    ? `Overdue by ${days} day${days === 1 ? '' : 's'}`
    : days === 0
      ? 'Due today'
      : `Due ${shortDate(date)}`;
}
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
  const items: AttentionItem[] = [];
  const byRound = new Map<string, AttentionItem>();
  const byApp = new Map<string, AttentionItem>();
  for (const r of input.interviews)
    if (r.openPrep > 0 && dayKey(r.scheduledStart, zone) === today) {
      const item: AttentionItem = {
        id: `prep:${r.id}`,
        source: 'interview-prep',
        label: 'Interview prep',
        title: `${r.company} — ${r.title}`,
        context: `Today at ${clock(r.scheduledStart, zone)} · ${r.openPrep} prep item${r.openPrep === 1 ? '' : 's'} open`,
        href: `/jobs/${r.applicationId}#round-${r.id}`,
        tier: 1,
        due: +r.scheduledStart,
        notificationIds: [],
      };
      items.push(item);
      byRound.set(r.id, item);
    }
  for (const { app, reasons } of input.jobs) {
    const reason = reasons[0];
    if (!reason) continue;
    let item: AttentionItem | null = null;
    if (reason.kind === 'FOLLOW_UP_OVERDUE' && app.nextActionDate)
      item = {
        id: `job:${app.id}`,
        source: 'job',
        label: 'Follow-up',
        title: `${app.nextAction ?? 'Follow up'} · ${app.company}`,
        context: dueContext(dateLabel(app.nextActionDate), today),
        href: `/jobs/${app.id}`,
        tier: 2,
        due: +app.nextActionDate,
        notificationIds: [],
      };
    else if (reason.kind === 'RESULT_NEEDED') {
      if (byRound.has(reason.round.id)) continue;
      item = {
        id: `result:${reason.round.id}`,
        source: 'job',
        label: 'Interview result',
        title: `Log the result · ${app.company} — ${reason.round.title}`,
        context: `Interview ended ${weekdayDate(dayKey(reason.round.scheduledStart, zone))}`,
        href: `/jobs/${app.id}#round-${reason.round.id}`,
        tier: 2,
        due: +reason.round.scheduledStart,
        notificationIds: [],
      };
      byRound.set(reason.round.id, item);
    } else if (reason.kind === 'FOLLOW_UP_TODAY' && app.nextActionDate)
      item = {
        id: `job:${app.id}`,
        source: 'job',
        label: 'Follow-up',
        title: `${app.nextAction ?? 'Follow up'} · ${app.company}`,
        context: 'Due today',
        href: `/jobs/${app.id}`,
        tier: 3,
        due: +app.nextActionDate,
        notificationIds: [],
      };
    else if (reason.kind === 'INTERVIEW_SOON') {
      if (byRound.has(reason.round.id)) continue;
      const isToday = dayKey(reason.round.scheduledStart, zone) === today;
      item = {
        id: `interview:${reason.round.id}`,
        source: 'job',
        label: 'Interview',
        title: `${app.company} — ${reason.round.title}`,
        context: `${isToday ? 'Today' : 'Tomorrow'} at ${clock(reason.round.scheduledStart, zone)}`,
        href: `/jobs/${app.id}#round-${reason.round.id}`,
        tier: isToday ? 3 : 4,
        due: +reason.round.scheduledStart,
        notificationIds: [],
      };
      byRound.set(reason.round.id, item);
    } else if (reason.kind === 'ACTION_REQUIRED')
      item = {
        id: `job:${app.id}`,
        source: 'job',
        label: 'Your move',
        title: `${app.nextAction ?? 'Decide the next step'} · ${app.company}`,
        context: 'No date set',
        href: `/jobs/${app.id}`,
        tier: 4,
        due: Number.MAX_SAFE_INTEGER,
        notificationIds: [],
      };
    if (!item) continue;
    items.push(item);
    if (!byApp.has(app.id)) byApp.set(app.id, item);
  }
  for (const p of input.practice)
    if (p.nextRevisionAt)
      items.push({
        id: `practice:${p.id}`,
        source: 'practice',
        label: 'Practice revision',
        title: p.title,
        context: `${dueContext(dateLabel(p.nextRevisionAt), today)} · ${p.confidence.charAt(0)}${p.confidence.slice(1).toLowerCase()}`,
        href: `/dsa/${p.id}`,
        tier: 3,
        due: +p.nextRevisionAt,
        notificationIds: [],
      });
  for (const i of input.roadmap)
    if (i.nextRevisionAt)
      items.push({
        id: `roadmap:${i.id}`,
        source: 'roadmap',
        label: 'Roadmap revision',
        title: i.title,
        context: `${dueContext(dateLabel(i.nextRevisionAt), today)} · ${i.roadmap.title}`,
        href: `/roadmap/${i.roadmap.id}?section=${encodeURIComponent(i.section)}&show=revision#item-${i.id}`,
        tier: 3,
        due: +i.nextRevisionAt,
        notificationIds: [],
      });
  for (const n of input.notifications) {
    const entity = notificationEntity(n.dedupeKey);
    const host =
      n.type === 'INTERVIEW'
        ? byRound.get(entity)
        : n.type === 'JOB_FOLLOW_UP'
          ? byApp.get(entity)
          : undefined;
    if (host) {
      host.notificationIds.push(n.id);
      continue;
    }
    items.push({
      id: `notification:${n.id}`,
      source: 'notification',
      label: 'Reminder',
      title: n.title,
      context: `${weekdayDate(dayKey(n.scheduledFor, zone))} · ${clock(n.scheduledFor, zone)}`,
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
  return items.sort(
    (a, b) => a.tier - b.tier || a.due - b.due || a.id.localeCompare(b.id),
  );
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
