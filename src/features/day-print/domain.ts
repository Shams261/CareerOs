/**
 * The Day Print (WI-033, a Version 2 Phase 4 hypothesis): a picture of a closed day made
 * from its records. One ring per recorded session in the order it happened, sized by its
 * length and coloured by its kind; the rings touch like links of a chain. Nothing is
 * generated, counted as a score or compared. Pure; covered by tests/day-print.test.ts.
 */
import { formatInTimeZone } from 'date-fns-tz';
import { categoryGroup } from '@/features/review/domain';
import { formatDuration } from '@/features/schedule/row';
import { minutes } from '@/lib/time';

/**
 * Fixed print colours (the light tokens), so a saved print looks the same anywhere. No second
 * accent: teal leads, the semantic tones follow, stone for everything else.
 */
export const PRINT = {
  paper: '#F4F1EA',
  ink: '#1B1A16',
  meta: '#716C63',
  empty: '#BEB7AA',
} as const;
const GROUP_COLOURS: Record<string, string> = {
  DSA: '#1E6B5B',
  Technical: '#4F7080',
  'Job search': '#A86F19',
  Work: '#347A5C',
};
export const colourOf = (group: string) => GROUP_COLOURS[group] ?? '#8C857A';

export const WIDTH = 640;
export const HEIGHT = 300;
const MIN_R = 22;
const MAX_R = 54;
/** How far each ring reaches into the one before it, as a share of the smaller radius. */
const OVERLAP = 0.42;

export type PrintSession = {
  startedAt: Date;
  endedAt: Date | null;
  category: string;
};
export type Ring = {
  cx: number;
  cy: number;
  r: number;
  colour: string;
  group: string;
  minutes: number;
};

/** A ring's radius: area follows the minutes, inside a band that keeps short sessions visible. */
export const ringRadius = (mins: number) =>
  Math.max(MIN_R, Math.min(MAX_R, MIN_R + Math.sqrt(Math.max(0, mins)) * 3.6));

/** The rings laid out left to right, scaled down together when a long day would not fit. */
export function layoutRings(
  items: { minutes: number; group: string }[],
  width = WIDTH,
  cy = 128,
): Ring[] {
  if (!items.length) return [];
  const radii = items.map((i) => ringRadius(i.minutes));
  const centres: number[] = [];
  let x = radii[0];
  centres.push(x);
  for (let i = 1; i < radii.length; i++) {
    x += radii[i - 1] + radii[i] - Math.min(radii[i - 1], radii[i]) * OVERLAP;
    centres.push(x);
  }
  const span = x + radii[radii.length - 1];
  const room = width - 2 * 48;
  const scale = Math.min(1, room / span);
  const offset = (width - span * scale) / 2;
  return items.map((it, i) => ({
    cx: offset + centres[i] * scale,
    cy,
    r: radii[i] * scale,
    colour: colourOf(it.group),
    group: it.group,
    minutes: it.minutes,
  }));
}

/**
 * Everything the print and its caption show, from the day's own records: the sessions that
 * overlap the day (clipped to it), the blocks let go at close, the rest mark and the date.
 */
export function dayPrint({
  day,
  bounds,
  sessions,
  letGo,
  rested,
  now = new Date(),
}: {
  day: string;
  bounds: { start: Date; end: Date };
  sessions: PrintSession[];
  letGo: number;
  rested: boolean;
  now?: Date;
}) {
  const parts = sessions
    .map((s) => {
      const start = new Date(Math.max(+s.startedAt, +bounds.start));
      const end = new Date(Math.min(+(s.endedAt ?? now), +bounds.end));
      return {
        at: +start,
        minutes: minutes(start, end),
        group: categoryGroup(s.category),
      };
    })
    .filter((p) => p.minutes > 0)
    .sort((a, b) => a.at - b.at);
  const total = parts.reduce((n, p) => n + p.minutes, 0);
  const groups = [...new Set(parts.map((p) => p.group))];
  const noon = new Date(`${day}T12:00:00Z`);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const detail = [
    parts.length
      ? `${plural(parts.length, 'session')}, one ring each, in the order you did them.`
      : rested
        ? 'A rest day.'
        : 'No session recorded.',
    letGo ? `${plural(letGo, 'block')} let go.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    weekday: formatInTimeZone(noon, 'UTC', 'EEEE'),
    dateLabel: formatInTimeZone(noon, 'UTC', 'EEE d MMM yyyy'),
    rings: layoutRings(parts),
    total,
    headline: total
      ? `${formatDuration(total)} of recorded work.`
      : rested
        ? 'Rested.'
        : 'A quiet day.',
    detail,
    legend: groups.map((g) => ({ group: g, colour: colourOf(g) })),
  };
}
export type DayPrintModel = ReturnType<typeof dayPrint>;
