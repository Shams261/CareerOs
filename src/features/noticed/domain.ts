/**
 * Rumi noticed (WI-043): at most two facts a day on Today, found by code from the owner's own
 * records and phrased from fixed templates, each with one way on and Dismiss. No AI. Pure:
 * the four rules, their order, the daily cap and the snooze after an answer. Covered by
 * tests/noticed-domain.test.ts.
 */
import { dayKey, hhmm, shortDate, weekdayDate } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import { categoryGroup } from '@/features/review/domain';
import { BANNED_WORDS } from '@/features/nudges/domain';

export const NOTICED_PER_DAY = 2;
/** Days without a kind before it is noticed, and how far back the rules look. */
export const IDLE_DAYS = 5;
export const LOOK_BACK = 28;
export const INTERVIEW_DAYS = 3;
/** Weeks a routine slot must be left in a row. */
export const ROUTINE_WEEKS = 3;
/** Days a card stays away after Dismiss, and after its action. */
export const SNOOZE = { dismissed: 7, acted: 3 } as const;

export type NoticedKind = 'interview' | 'idle' | 'routine' | 'heavy';
export type NoticedCard = {
  key: string;
  kind: NoticedKind;
  title: string;
  context: string;
  action:
    | { label: string; href: string; panel?: string }
    | { label: string; ask: string };
};

export type NoticedInput = {
  now: Date;
  zone: string;
  /** The owner's study kinds (Study nudges setting, plus DSA and Technical). */
  studyKinds: string[];
  /** Study sessions in the last 28 days. */
  sessions: { category: string; startedAt: Date; endedAt: Date | null }[];
  /** Study blocks from 28 days back to tomorrow, with whether each was recorded. */
  blocks: {
    category: string;
    routineKey: string | null;
    status: string;
    plannedStart: Date;
    plannedEnd: Date;
    day: string;
    recorded: boolean;
  }[];
  routines: { id: string; title: string; startLocal: string }[];
  rounds: {
    id: string;
    title: string;
    applicationId: string;
    company: string;
    scheduledStart: Date;
    openPrep: number;
  }[];
  /** Keys hidden until a day (after Dismiss or an action). */
  hidden: { key: string; until: string }[];
};

const mins = (a: Date, b: Date) => Math.max(0, Math.round((+b - +a) / 60_000));
const hours = (m: number) => {
  const h = m / 60;
  return h >= 1 ? `${Math.round(h * 2) / 2}h` : `${m} min`;
};
const daysBetween = (from: string, to: string) =>
  Math.round(
    (+new Date(`${to}T12:00:00Z`) - +new Date(`${from}T12:00:00Z`)) / 86400000,
  );

/** A kind the owner planned or recorded in four weeks, now silent for five days or more. */
function idleCards(i: NoticedInput, today: string): NoticedCard[] {
  const kinds = [...new Set(i.studyKinds.map(categoryGroup))];
  const last = new Map<string, string>();
  for (const s of i.sessions) {
    const k = categoryGroup(s.category);
    const d = dayKey(s.startedAt, i.zone);
    if (!last.has(k) || last.get(k)! < d) last.set(k, d);
  }
  const planned = new Set(
    i.blocks
      .filter((b) => b.day <= today)
      .map((b) => categoryGroup(b.category)),
  );
  return kinds.flatMap((k) => {
    const seen = last.get(k);
    if (!seen && !planned.has(k)) return [];
    const gap = seen ? daysBetween(seen, today) : LOOK_BACK;
    if (gap < IDLE_DAYS) return [];
    return [
      {
        key: `idle:${k.toLowerCase()}`,
        kind: 'idle' as const,
        title: seen
          ? `No ${k} recorded in ${gap} days`
          : `No ${k} recorded in the last ${LOOK_BACK} days`,
        context: seen ? `Last on ${shortDate(seen)}` : 'Planned, not recorded',
        action: {
          label: 'Plan it with Rumi',
          ask: `Plan a ${k} block in my free time between today and Sunday.`,
        },
      },
    ];
  });
}

/** An interview in the next three days (not today) with prep items still open. */
function interviewCards(i: NoticedInput, today: string): NoticedCard[] {
  return i.rounds.flatMap((r) => {
    const day = dayKey(r.scheduledStart, i.zone);
    const inDays = daysBetween(today, day);
    if (r.openPrep < 1 || inDays < 1 || inDays > INTERVIEW_DAYS) return [];
    return [
      {
        key: `interview:${r.id}`,
        kind: 'interview' as const,
        title: `${r.company} ${r.title} ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}, ${r.openPrep} prep ${r.openPrep === 1 ? 'item' : 'items'} open`,
        context: `${weekdayDate(day)} at ${hhmm(r.scheduledStart, i.zone)}`,
        action: {
          label: 'Open prep',
          href: `/jobs/${r.applicationId}#round-${r.id}`,
        },
      },
    ];
  });
}

/**
 * A routine whose every occurrence in the last three weeks was left (no session, not done),
 * with at least one occurrence in each of those weeks.
 */
function routineCards(i: NoticedInput, now: Date): NoticedCard[] {
  // Three weeks plus a day, so a weekly slot's third-last occurrence is still in reach.
  const span = (ROUTINE_WEEKS * 7 + 1) * 86400000;
  return i.routines.flatMap((r) => {
    const past = i.blocks
      .filter(
        (b) =>
          b.routineKey === r.id &&
          b.plannedEnd <= now &&
          +now - +b.plannedStart <= span &&
          b.status !== 'CANCELLED',
      )
      .sort((a, b) => +b.plannedStart - +a.plannedStart);
    const weeks = new Set(
      past.map((b) => Math.floor((+now - +b.plannedStart) / (7 * 86400000))),
    );
    if (
      weeks.size < ROUTINE_WEEKS ||
      past.some((b) => b.recorded || b.status === 'COMPLETED')
    )
      return [];
    return [
      {
        key: `routine:${r.id}:${past[0].day}`,
        kind: 'routine' as const,
        title: `${r.title} at ${r.startLocal} was left ${ROUTINE_WEEKS} weeks running`,
        context: 'A different time may fit better',
        action: {
          label: 'Open routines',
          href: '/calendar',
          panel: 'routines',
        },
      },
    ];
  });
}

/** Today or tomorrow planned well beyond the study the owner usually records in a day. */
function heavyCards(i: NoticedInput, today: string): NoticedCard[] {
  const perDay = new Map<string, number>();
  for (const s of i.sessions) {
    const d = dayKey(s.startedAt, i.zone);
    if (d >= today) continue;
    perDay.set(
      d,
      (perDay.get(d) ?? 0) + mins(s.startedAt, s.endedAt ?? s.startedAt),
    );
  }
  if (perDay.size < 5) return [];
  const usual = Math.round(
    [...perDay.values()].reduce((a, b) => a + b, 0) / perDay.size,
  );
  return [today, shiftDay(today, 1)].flatMap((day) => {
    const planned = i.blocks
      .filter((b) => b.day === day && b.status !== 'CANCELLED')
      .reduce((n, b) => n + mins(b.plannedStart, b.plannedEnd), 0);
    if (planned < usual * 2 || planned - usual < 90) return [];
    const word = day === today ? 'Today' : 'Tomorrow';
    return [
      {
        key: `heavy:${day}`,
        kind: 'heavy' as const,
        title: `${word} plans ${hours(planned)} of study; you usually record about ${hours(usual)}`,
        context: 'A lighter plan is easier to finish',
        action: { label: 'Open Plan', href: `/calendar?date=${day}` },
      },
    ];
  });
}

/**
 * Today's noticed cards: interviews first, then a silent kind, a left routine and a heavy
 * day; hidden keys skipped; at most two.
 */
export function noticed(i: NoticedInput): NoticedCard[] {
  const today = dayKey(i.now, i.zone);
  const hidden = new Set(
    i.hidden.filter((h) => h.until >= today).map((h) => h.key),
  );
  return [
    ...interviewCards(i, today),
    ...idleCards(i, today),
    ...routineCards(i, i.now),
    ...heavyCards(i, today),
  ]
    .filter((c) => !hidden.has(c.key))
    .slice(0, NOTICED_PER_DAY);
}

/** The day a card comes back after an answer. */
export const hiddenUntil = (today: string, acted: boolean) =>
  shiftDay(today, acted ? SNOOZE.acted : SNOOZE.dismissed);

/** Every template stays factual: no banned word in any card. */
export const cleanCopy = (c: NoticedCard) =>
  !BANNED_WORDS.some((w) =>
    `${c.title} ${c.context} ${c.action.label}`.toLowerCase().includes(w),
  );
