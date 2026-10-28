/**
 * Attention rows shared by Today's rail, the Jobs pages and the Roadmap (WI-022): one row
 * recipe, one vocabulary. Pure; covered by tests/attention-domain.test.ts and, through
 * `attentionItems`, tests/today-domain.test.ts.
 */
import { dayKey, hhmm, shortDate, weekdayDate } from '@/lib/time';
import type { Attention } from '@/features/jobs/domain';

export type AttentionSource =
  'interview-prep' | 'job' | 'practice' | 'roadmap' | 'notification' | 'weekly';
export type AttentionItem = {
  id: string;
  source: AttentionSource;
  /** The small source label: Jobs, Practice, Roadmap, Reminder, Weekly review. */
  label: string;
  /** Names the move: "Send follow-up", "Prepare Coding", "Revise HTTP semantics". */
  title: string;
  /** The entity and its due context: "Example Labs · Tomorrow at 14:00". */
  context: string;
  href: string | null;
  /** 1 prep for an interview today, 2 overdue, 3 due today, 4 upcoming. */
  tier: 1 | 2 | 3 | 4;
  /** Due instant (ms) for ordering inside a tier. */
  due: number;
  /** Reminder rows merged into this one; Mark read clears them, the task stays. */
  notificationIds: string[];
};

export const dateLabel = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round(
    (+new Date(`${to}T12:00:00Z`) - +new Date(`${from}T12:00:00Z`)) / 86400000,
  );
/** "Overdue by 2 days" / "Due today" / "Due Oct 28" for a DATE label against the owner's day. */
export function dueContext(date: string, today: string) {
  const days = daysBetween(date, today);
  return days > 0
    ? `Overdue by ${days} day${days === 1 ? '' : 's'}`
    : days === 0
      ? 'Due today'
      : `Due ${shortDate(date)}`;
}
/** "Revision due today", "Revision overdue by 2 days": the revision rows read as one phrase. */
export function revisionContext(date: string, today: string) {
  const due = dueContext(date, today);
  return `Revision ${due.charAt(0).toLowerCase()}${due.slice(1)}`;
}

export type PrepRound = {
  id: string;
  title: string;
  applicationId: string;
  company: string;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  openPrep: number;
};
/** One row per interview today that still has open prep; afterwards the result row takes over. */
export function interviewPrepRows(
  interviews: PrepRound[],
  now: Date,
  zone: string,
): AttentionItem[] {
  const today = dayKey(now, zone);
  return interviews.flatMap((r) => {
    const end = r.scheduledEnd ?? new Date(+r.scheduledStart + 60 * 60000);
    if (!(
      r.openPrep > 0 &&
      end > now &&
      dayKey(r.scheduledStart, zone) === today
    ))
      return [];
    return [
      {
        id: `prep:${r.id}`,
        source: 'interview-prep' as const,
        label: 'Jobs',
        title: `Prepare ${r.title}`,
        context: `${r.company} · Today at ${hhmm(r.scheduledStart, zone)} · ${r.openPrep} prep item${r.openPrep === 1 ? '' : 's'} open`,
        href: `/jobs/${r.applicationId}#round-${r.id}`,
        tier: 1 as const,
        due: +r.scheduledStart,
        notificationIds: [],
      },
    ];
  });
}

export type JobAttention = {
  app: {
    id: string;
    company: string;
    nextAction: string | null;
    nextActionDate: Date | null;
  };
  reasons: Attention[];
};
/**
 * Every reason of every application as a row, in Today's words. Rows keyed on a round
 * (`result:`, `interview:`) skip rounds already covered by `taken` (prep rows); one
 * follow-up row per application (`job:`).
 */
export function jobAttentionRows(
  jobs: JobAttention[],
  now: Date,
  zone: string,
  taken: Set<string> = new Set(),
): AttentionItem[] {
  const today = dayKey(now, zone);
  const items: AttentionItem[] = [];
  const followUp = new Set<string>();
  const rounds = new Set(taken);
  for (const { app, reasons } of jobs) {
    for (const reason of reasons) {
      let item: AttentionItem | null = null;
      if (reason.kind === 'FOLLOW_UP_OVERDUE' && app.nextActionDate)
        item = {
          id: `job:${app.id}`,
          source: 'job',
          label: 'Jobs',
          title: app.nextAction ?? 'Follow up',
          context: `${app.company} · ${dueContext(dateLabel(app.nextActionDate), today)}`,
          href: `/jobs/${app.id}`,
          tier: 2,
          due: +app.nextActionDate,
          notificationIds: [],
        };
      else if (reason.kind === 'RESULT_NEEDED') {
        if (rounds.has(reason.round.id)) continue;
        item = {
          id: `result:${reason.round.id}`,
          source: 'job',
          label: 'Jobs',
          title: `Log the ${reason.round.title} result`,
          context: `${app.company} · Interview ended ${weekdayDate(dayKey(reason.round.scheduledStart, zone))}`,
          href: `/jobs/${app.id}#round-${reason.round.id}`,
          tier: 2,
          due: +reason.round.scheduledStart,
          notificationIds: [],
        };
        rounds.add(reason.round.id);
      } else if (reason.kind === 'FOLLOW_UP_TODAY' && app.nextActionDate)
        item = {
          id: `job:${app.id}`,
          source: 'job',
          label: 'Jobs',
          title: app.nextAction ?? 'Follow up',
          context: `${app.company} · Due today`,
          href: `/jobs/${app.id}`,
          tier: 3,
          due: +app.nextActionDate,
          notificationIds: [],
        };
      else if (reason.kind === 'INTERVIEW_SOON') {
        if (rounds.has(reason.round.id)) continue;
        const isToday = dayKey(reason.round.scheduledStart, zone) === today;
        item = {
          id: `interview:${reason.round.id}`,
          source: 'job',
          label: 'Jobs',
          title: `Prepare ${reason.round.title}`,
          context: `${app.company} · ${isToday ? 'Today' : 'Tomorrow'} at ${hhmm(reason.round.scheduledStart, zone)}`,
          href: `/jobs/${app.id}#round-${reason.round.id}`,
          tier: isToday ? 3 : 4,
          due: +reason.round.scheduledStart,
          notificationIds: [],
        };
        rounds.add(reason.round.id);
      } else if (reason.kind === 'ACTION_REQUIRED')
        item = {
          id: `job:${app.id}`,
          source: 'job',
          label: 'Jobs',
          title: app.nextAction ?? 'Decide the next step',
          context: `${app.company} · No date set`,
          href: `/jobs/${app.id}`,
          tier: 4,
          due: Number.MAX_SAFE_INTEGER,
          notificationIds: [],
        };
      if (!item) continue;
      if (item.id === `job:${app.id}`) {
        if (followUp.has(app.id)) continue;
        followUp.add(app.id);
      }
      items.push(item);
    }
  }
  return items;
}

/** Practice problems due for revision: "Review Two Sum · Revision due today · Yellow". */
export function practiceRevisionRows(
  problems: {
    id: string;
    title: string;
    confidence: string;
    nextRevisionAt: Date | null;
  }[],
  now: Date,
  zone: string,
): AttentionItem[] {
  const today = dayKey(now, zone);
  return problems.flatMap((p) =>
    p.nextRevisionAt
      ? [
          {
            id: `practice:${p.id}`,
            source: 'practice' as const,
            label: 'Practice',
            title: `Review ${p.title}`,
            context: `${revisionContext(dateLabel(p.nextRevisionAt), today)} · ${p.confidence.charAt(0)}${p.confidence.slice(1).toLowerCase()}`,
            href: `/dsa/${p.id}`,
            tier: 3 as const,
            due: +p.nextRevisionAt,
            notificationIds: [],
          },
        ]
      : [],
  );
}
/** Roadmap items due for revision: "Revise HTTP semantics · Revision overdue by 2 days · Backend". */
export function roadmapRevisionRows(
  items: {
    id: string;
    title: string;
    section: string;
    nextRevisionAt: Date | null;
    roadmap: { id: string; title: string };
  }[],
  now: Date,
  zone: string,
): AttentionItem[] {
  const today = dayKey(now, zone);
  return items.flatMap((i) =>
    i.nextRevisionAt
      ? [
          {
            id: `roadmap:${i.id}`,
            source: 'roadmap' as const,
            label: 'Roadmap',
            title: `Revise ${i.title}`,
            context: `${revisionContext(dateLabel(i.nextRevisionAt), today)} · ${i.roadmap.title}`,
            href: `/roadmap/${i.roadmap.id}?section=${encodeURIComponent(i.section)}&show=revision#item-${i.id}`,
            tier: 3 as const,
            due: +i.nextRevisionAt,
            notificationIds: [],
          },
        ]
      : [],
  );
}
/**
 * One row for the revision deck (WI-032) when items due today hold kept cards:
 * "Revision deck · 6 cards from 2 items". Null when no due item has a card.
 */
export function revisionDeckRow(
  items: { nextRevisionAt: Date | null; cards?: number }[],
): AttentionItem | null {
  const withCards = items.filter((i) => (i.cards ?? 0) > 0);
  const cards = withCards.reduce((n, i) => n + (i.cards ?? 0), 0);
  if (!cards) return null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return {
    id: 'deck:today',
    source: 'roadmap',
    label: 'Roadmap',
    title: 'Revision deck',
    context: `${plural(cards, 'card')} from ${plural(withCards.length, 'item')} due`,
    href: '/roadmap/deck',
    tier: 3,
    due: Math.min(...withCards.map((i) => +(i.nextRevisionAt ?? 0))) - 1,
    notificationIds: [],
  };
}
/** More rows of one revision source than this fold into one row on Today (WI-058). */
export const FOLD_REVISIONS = 2;
/**
 * Today keeps revision rows short: more than `FOLD_REVISIONS` from one source become one row,
 * "6 roadmap items due for revision · Oldest overdue by 3 days", linked to the place that
 * lists them. Fewer stay as they are.
 */
export function foldRevisionRows(
  rows: AttentionItem[],
  what: { many: string; label: string; href: string },
  today: string,
): AttentionItem[] {
  if (rows.length <= FOLD_REVISIONS) return rows;
  const oldest = rows.reduce((a, b) => (b.due < a.due ? b : a));
  return [
    {
      id: `fold:${oldest.source}`,
      source: oldest.source,
      label: what.label,
      title: `${rows.length} ${what.many} due for revision`,
      context: `Oldest: ${revisionContext(dateLabel(new Date(oldest.due)), today).replace(/^Revision /, '')}`,
      href: what.href,
      tier: 3,
      due: oldest.due,
      notificationIds: [],
    },
  ];
}
/** Urgency tier, then due instant, then a stable id. */
export const sortAttention = (items: AttentionItem[]) =>
  items.sort(
    (a, b) => a.tier - b.tier || a.due - b.due || a.id.localeCompare(b.id),
  );

/**
 * On Jobs, the rail would only repeat the list (WI-049): a few applications are shown and every
 * attention row points at one of them, so the list's own moves already say it all.
 */
export function railRepeatsList(
  rows: { href: string | null }[],
  visibleIds: string[],
  limit: number,
) {
  if (!rows.length || visibleIds.length > limit) return false;
  const app = (href: string | null) => href?.match(/^\/jobs\/([^/?#]+)/)?.[1];
  return rows.every((r) => visibleIds.includes(app(r.href) ?? ''));
}
