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

export type NoticedKind =
  | 'interview'
  | 'idle'
  | 'routine'
  | 'heavy'
  // WI-106, the pattern coach.
  | 'stuck'
  | 'cold';
export const NOTICED_KINDS: NoticedKind[] = [
  'interview',
  'idle',
  'routine',
  'heavy',
  'stuck',
  'cold',
];
type Action =
  | { label: string; href: string; panel?: string }
  | { label: string; ask: string };
export type NoticedCard = {
  key: string;
  kind: NoticedKind;
  title: string;
  context: string;
  action: Action;
  /** A second way on (WI-106: Mixed set, Ask Rumi why). */
  alt?: Action;
  /** "Keep going" in place of Dismiss: the card rests for the acted snooze. */
  keepGoing?: boolean;
};
/** WI-106: days on one topic, or since a topic was practised, before the coach speaks. */
export const STUCK_DAYS = 4;
/** The window the stuck rule reads (days, today included). */
export const STUCK_WINDOW = 7;
const RANK = { RED: 0, YELLOW: 1, GREEN: 2 } as const;
export type Confidence = keyof typeof RANK;

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
  /** WI-106: attempts in the last 28 days, with their topic and confidence after. */
  attempts?: {
    problemId: string;
    topicId: string;
    topic: string;
    day: string;
    confidence: Confidence;
  }[];
  /** WI-106: open revision steps due today or tomorrow. */
  revisions?: {
    problemId: string;
    title: string;
    topicId: string;
    topic: string;
    dueOn: string;
  }[];
  /** WI-106: roadmap items in progress, with the day they last changed. */
  items?: { id: string; title: string; href: string; since: string }[];
  /** WI-106: for a topic, the next problem outside it (`nextProblemFor`), if any. */
  nextOutside?: Record<string, { id: string; title: string } | null>;
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

/**
 * A kind the owner planned or recorded in four weeks, now silent for five days or more; or,
 * below that, a kind planned yesterday with nothing of it recorded yesterday (WI-059).
 */
function idleCards(i: NoticedInput, today: string): NoticedCard[] {
  const kinds = [...new Set(i.studyKinds.map(categoryGroup))];
  const last = new Map<string, string>();
  for (const s of i.sessions) {
    const k = categoryGroup(s.category);
    const d = dayKey(s.startedAt, i.zone);
    if (!last.has(k) || last.get(k)! < d) last.set(k, d);
  }
  // The first day each kind was planned: a kind never recorded is silent only since then,
  // so a fresh start is not "silent for 28 days" on its first morning (WI-058).
  const firstPlanned = new Map<string, string>();
  for (const b of i.blocks) {
    if (b.day > today) continue;
    const k = categoryGroup(b.category);
    if (!firstPlanned.has(k) || firstPlanned.get(k)! > b.day)
      firstPlanned.set(k, b.day);
  }
  return kinds.flatMap((k) => {
    const seen = last.get(k);
    const first = firstPlanned.get(k);
    if (!seen && !first) return [];
    const gap = seen
      ? daysBetween(seen, today)
      : Math.min(LOOK_BACK, daysBetween(first!, today));
    if (gap < IDLE_DAYS) {
      // Every day (WI-059): a kind planned yesterday with nothing of it recorded yesterday.
      const yesterday = shiftDay(today, -1);
      const planned = i.blocks.filter(
        (b) =>
          b.day === yesterday &&
          b.status !== 'CANCELLED' &&
          categoryGroup(b.category) === k,
      );
      if (!planned.length || (seen && seen >= yesterday)) return [];
      const total = planned.reduce(
        (n, b) => n + mins(b.plannedStart, b.plannedEnd),
        0,
      );
      return [
        {
          key: `yesterday:${k.toLowerCase()}:${yesterday}`,
          kind: 'idle' as const,
          title: `No ${k} recorded yesterday`,
          context: `Planned ${hours(total)}, nothing recorded`,
          action: {
            label: 'Plan it with Rumi',
            ask: `Plan a ${k} block in my free time today.`,
          },
        },
      ];
    }
    return [
      {
        key: `idle:${k.toLowerCase()}`,
        kind: 'idle' as const,
        title: seen
          ? `No ${k} recorded in ${gap} days`
          : gap < LOOK_BACK
            ? `No ${k} recorded since ${shortDate(first!)}`
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
 * The pattern coach (WI-106): a topic practised on four or more of the last seven days whose
 * confidence has not risen, and a roadmap item in progress for four days or more.
 */
function stuckCards(i: NoticedInput, today: string): NoticedCard[] {
  const from = shiftDay(today, -(STUCK_WINDOW - 1));
  const recent = (i.attempts ?? []).filter(
    (a) => a.day >= from && a.day <= today,
  );
  const topics = [...new Set(recent.map((a) => a.topicId))];
  const lastTopics = [
    ...new Set(
      [...(i.attempts ?? [])]
        .sort((a, b) => b.day.localeCompare(a.day))
        .map((a) => a.topicId),
    ),
  ].slice(0, 4);
  const cards: NoticedCard[] = topics.flatMap((topicId) => {
    const list = recent
      .filter((a) => a.topicId === topicId)
      .sort((a, b) => a.day.localeCompare(b.day));
    const days = new Set(list.map((a) => a.day)).size;
    if (days < STUCK_DAYS) return [];
    const first = RANK[list[0].confidence],
      last = RANK[list.at(-1)!.confidence];
    if (last > first || list.at(-1)!.confidence === 'GREEN') return [];
    // A problem's latest confidence decides whether it is still shaky.
    const latest = new Map<string, Confidence>();
    for (const a of list) latest.set(a.problemId, a.confidence);
    const shaky = [...latest.values()].filter((c) => c === 'RED').length;
    const topic = list[0].topic;
    const next = i.nextOutside?.[topicId] ?? null;
    return [
      {
        key: `stuck:${topicId}:${from}`,
        kind: 'stuck' as const,
        title: shaky
          ? `${days} days on ${topic}; ${shaky} ${shaky === 1 ? 'problem' : 'problems'} still shaky`
          : `${days} days on ${topic}; confidence has not moved`,
        context: 'A different topic for a day often helps a pattern settle',
        action: next
          ? { label: 'Next topic', href: `/dsa/${next.id}` }
          : { label: 'Open Practice', href: '/dsa' },
        alt:
          lastTopics.length > 1
            ? {
                label: 'Mixed set',
                href: `/dsa/drill?topics=${lastTopics.join(',')}`,
              }
            : {
                label: 'Ask Rumi why',
                ask: `I have spent ${days} days on ${topic} and it still feels shaky. Why is this pattern hard, and one hint to try next? No full solution.`,
              },
        keepGoing: true,
      },
    ];
  });
  for (const item of i.items ?? []) {
    const gap = daysBetween(item.since, today);
    if (gap < STUCK_DAYS) continue;
    cards.push({
      key: `stuck:item:${item.id}`,
      kind: 'stuck',
      title: `${item.title} has been in progress for ${gap} days`,
      context: 'Mark it done, or split it into a smaller step',
      action: { label: 'Open item', href: item.href },
      keepGoing: true,
    });
  }
  return cards;
}

/** A revision step due today or tomorrow on a topic not practised for four days or more. */
function coldCards(i: NoticedInput, today: string): NoticedCard[] {
  const lastByTopic = new Map<string, string>();
  for (const a of i.attempts ?? [])
    if (!lastByTopic.has(a.topicId) || lastByTopic.get(a.topicId)! < a.day)
      lastByTopic.set(a.topicId, a.day);
  const tomorrow = shiftDay(today, 1);
  const seen = new Set<string>();
  return (i.revisions ?? []).flatMap((r) => {
    if (r.dueOn < today || r.dueOn > tomorrow || seen.has(r.topicId)) return [];
    const last = lastByTopic.get(r.topicId);
    const gap = last ? daysBetween(last, today) : LOOK_BACK;
    if (gap < STUCK_DAYS) return [];
    seen.add(r.topicId);
    return [
      {
        key: `cold:${r.problemId}:${r.dueOn}`,
        kind: 'cold' as const,
        title: `${r.title} is due for revision ${r.dueOn === today ? 'today' : 'tomorrow'}`,
        context: last
          ? `No ${r.topic} practice for ${gap} days`
          : `No ${r.topic} practice in the last ${LOOK_BACK} days`,
        action: { label: 'Revise', href: `/dsa/${r.problemId}` },
      },
    ];
  });
}

/**
 * Today's noticed cards: interviews first, then the pattern coach (WI-106), a silent kind, a
 * left routine and a heavy day; hidden keys skipped; at most two.
 */
export function noticed(i: NoticedInput): NoticedCard[] {
  const today = dayKey(i.now, i.zone);
  const hidden = new Set(
    i.hidden.filter((h) => h.until >= today).map((h) => h.key),
  );
  return [
    ...interviewCards(i, today),
    ...stuckCards(i, today),
    ...coldCards(i, today),
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
    `${c.title} ${c.context} ${c.action.label} ${c.alt?.label ?? ''}`
      .toLowerCase()
      .includes(w),
  );
