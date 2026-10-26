/**
 * Look Back and Moments (WI-034, a Version 2 Phase 4 hypothesis): the season so far as a
 * grid of small day prints, the real firsts of the search as moments, and the month in
 * facts. Records only: no score, streak, counter, comparison or generated text. Pure;
 * covered by tests/look-back.test.ts.
 */
import { formatInTimeZone } from 'date-fns-tz';
import { shiftDay } from '@/features/schedule/domain';
import { formatDuration } from '@/features/schedule/row';
import { categoryGroup } from '@/features/review/domain';
import { layoutRings, colourOf } from '@/features/day-print/domain';
import { dayKey, minutes } from '@/lib/time';

/** At most half a year of weeks on one screen; earlier weeks are named, not drawn. */
export const MAX_WEEKS = 26;
const CELL = 100;

export type SeasonSession = {
  startedAt: Date;
  endedAt: Date | null;
  category: string;
};
export type MiniRing = {
  cx: number;
  cy: number;
  r: number;
  w: number;
  colour: string;
};
export type Cell = {
  day: string;
  rings: MiniRing[];
  rested: boolean;
  minutes: number;
  sessions: number;
  isToday: boolean;
  future: boolean;
  label: string;
};

/** A day's rings fitted into a square cell, the same order and colours as its Day Print. */
export function miniRings(
  items: { minutes: number; group: string }[],
): MiniRing[] {
  if (!items.length) return [];
  const base = layoutRings(items, 640, 0);
  const minX = Math.min(...base.map((r) => r.cx - r.r));
  const maxX = Math.max(...base.map((r) => r.cx + r.r));
  const maxR = Math.max(...base.map((r) => r.r));
  const room = CELL * 0.84;
  const scale = Math.min(room / (maxX - minX), room / (2 * maxR));
  const mid = (minX + maxX) / 2;
  return base.map((r) => ({
    cx: CELL / 2 + (r.cx - mid) * scale,
    cy: CELL / 2,
    r: r.r * scale,
    w: Math.max(2.4, r.r * scale * 0.18),
    colour: r.colour,
  }));
}

const mondayOf = (day: string) => {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
};

/**
 * The season grid, Monday to Sunday, from the week of the first recorded session (or the
 * last 26 weeks) to the current week. Sessions are split by the owner's local day.
 */
export function seasonGrid({
  sessions,
  restDays,
  firstDay,
  today,
  zone,
  now = new Date(),
}: {
  sessions: SeasonSession[];
  restDays: string[];
  firstDay: string;
  today: string;
  zone: string;
  now?: Date;
}) {
  const lastMonday = mondayOf(today);
  let start = mondayOf(firstDay);
  const earliest = shiftDay(lastMonday, -7 * (MAX_WEEKS - 1));
  const clipped = start < earliest;
  if (clipped) start = earliest;
  const byDay = new Map<
    string,
    { at: number; minutes: number; group: string }[]
  >();
  for (const s of sessions) {
    const end = s.endedAt ?? now;
    const day = dayKey(s.startedAt, zone);
    const m = minutes(s.startedAt, end);
    if (m <= 0) continue;
    const list = byDay.get(day) ?? [];
    list.push({
      at: +s.startedAt,
      minutes: m,
      group: categoryGroup(s.category),
    });
    byDay.set(day, list);
  }
  const rest = new Set(restDays);
  const weeks: Cell[][] = [];
  for (let monday = start; monday <= lastMonday; monday = shiftDay(monday, 7)) {
    const week: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = shiftDay(monday, i);
      const parts = (byDay.get(day) ?? []).sort((a, b) => a.at - b.at);
      const total = parts.reduce((n, p) => n + p.minutes, 0);
      const date = formatInTimeZone(
        new Date(`${day}T12:00:00Z`),
        'UTC',
        'EEE d MMM',
      );
      week.push({
        day,
        rings: miniRings(parts),
        rested: rest.has(day),
        minutes: total,
        sessions: parts.length,
        isToday: day === today,
        future: day > today,
        label: parts.length
          ? `${date}: ${parts.length} session${parts.length === 1 ? '' : 's'}, ${formatDuration(total)}`
          : rest.has(day)
            ? `${date}: rest day`
            : `${date}: no session recorded`,
      });
    }
    weeks.push(week);
  }
  const range = `${formatInTimeZone(new Date(`${start}T12:00:00Z`), 'UTC', 'MMM d')} – ${formatInTimeZone(new Date(`${today}T12:00:00Z`), 'UTC', 'MMM d')}`;
  return { weeks, range, clipped };
}

export type MomentInput = {
  firstSession: Date | null;
  firstOwnSolve: { at: Date; title: string } | null;
  firstRoadmapDone: { at: Date; title: string } | null;
  firstInterview: { at: Date; company: string; round: string } | null;
  firstFinal: { at: Date; company: string; round: string } | null;
  firstOffer: { at: Date; company: string } | null;
  firstWeekReviewed: { at: Date } | null;
};
export type Moment = { key: string; day: string; title: string; line: string };

const sinceFirst = (from: Date | null, at: Date) => {
  if (!from) return '';
  const weeks = Math.floor((+at - +from) / (7 * 864e5));
  if (weeks < 1) return '';
  const words = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
  ];
  const n = weeks <= 10 ? words[weeks] : String(weeks);
  return ` ${n} week${weeks === 1 ? '' : 's'} after your first practice session.`;
};

/** The real firsts of the search, newest first. One quiet line each; nothing is invented. */
export function moments(input: MomentInput, zone: string): Moment[] {
  const out: Moment[] = [];
  const add = (key: string, at: Date, title: string, line: string) =>
    out.push({ key, day: dayKey(at, zone), title, line });
  const first = input.firstSession;
  if (first)
    add(
      'first-session',
      first,
      'First practice session',
      'The first recorded session of the season.',
    );
  if (input.firstOwnSolve)
    add(
      'first-own-solve',
      input.firstOwnSolve.at,
      'First problem on your own',
      `${input.firstOwnSolve.title}, solved without help.${sinceFirst(first, input.firstOwnSolve.at)}`,
    );
  if (input.firstRoadmapDone)
    add(
      'first-roadmap-done',
      input.firstRoadmapDone.at,
      'First roadmap item done',
      `${input.firstRoadmapDone.title}.${sinceFirst(first, input.firstRoadmapDone.at)}`,
    );
  if (input.firstInterview)
    add(
      'first-interview',
      input.firstInterview.at,
      'First interview',
      `${input.firstInterview.company}, ${input.firstInterview.round}.${sinceFirst(first, input.firstInterview.at)}`,
    );
  if (input.firstFinal)
    add(
      'first-final',
      input.firstFinal.at,
      'First final round',
      `${input.firstFinal.company}, ${input.firstFinal.round}.${sinceFirst(first, input.firstFinal.at)}`,
    );
  if (input.firstOffer)
    add(
      'first-offer',
      input.firstOffer.at,
      'First offer',
      `${input.firstOffer.company}.${sinceFirst(first, input.firstOffer.at)}`,
    );
  if (input.firstWeekReviewed)
    add(
      'first-week-reviewed',
      input.firstWeekReviewed.at,
      'First week reviewed',
      'The first weekly review closed.',
    );
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/**
 * The month so far, as facts: recorded time, practice, roadmap, interviews, and where the
 * time went (the biggest kind, and the part of the day it mostly fell in).
 */
export function monthFacts({
  sessions,
  attempts,
  roadmapDone,
  roadmapRevised,
  rounds,
  zone,
  now = new Date(),
}: {
  sessions: SeasonSession[];
  attempts: { own: boolean }[];
  roadmapDone: number;
  roadmapRevised: number;
  rounds: number;
  zone: string;
  now?: Date;
}) {
  const byGroup = new Map<string, number>();
  const byPart = { morning: 0, afternoon: 0, evening: 0 };
  let total = 0;
  for (const s of sessions) {
    const m = minutes(s.startedAt, s.endedAt ?? now);
    if (m <= 0) continue;
    total += m;
    const g = categoryGroup(s.category);
    byGroup.set(g, (byGroup.get(g) ?? 0) + m);
    const hour = Number(formatInTimeZone(s.startedAt, zone, 'H'));
    byPart[hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'] += m;
  }
  const top = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0];
  const part = (Object.entries(byPart) as [keyof typeof byPart, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const partWords = {
    morning: 'mostly before noon',
    afternoon: 'mostly in the afternoon',
    evening: 'mostly in the evening',
  };
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const own = attempts.filter((a) => a.own).length;
  const lines = [
    attempts.length
      ? `${plural(attempts.length, 'practice attempt')}${own ? `, ${own} on your own` : ''}`
      : null,
    roadmapDone || roadmapRevised
      ? `${plural(roadmapDone, 'roadmap item')} done${roadmapRevised ? `, ${roadmapRevised} revised` : ''}`
      : null,
    rounds ? plural(rounds, 'interview round') : null,
    top && part ? `Most time: ${top[0]}, ${partWords[part[0]]}` : null,
  ].filter((l): l is string => !!l);
  return {
    month: formatInTimeZone(now, zone, 'MMMM'),
    headline: total
      ? `${formatDuration(total)} of recorded work`
      : 'Nothing recorded yet this month',
    lines,
    colour: top ? colourOf(top[0]) : null,
  };
}
