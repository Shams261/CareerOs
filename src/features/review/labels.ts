/** Weekly review labels and links (WI-125, moved from the page). Pure; dates are labels. */
import { formatInTimeZone } from 'date-fns-tz';
import { shiftDay } from '@/lib/day';

const label = (day: string, pattern: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', pattern);
/** "Week of 19 – 25 October", or "Week of 26 October – 1 November" across a month. */
export const weekLabel = (monday: string) => {
  const sunday = shiftDay(monday, 6);
  return label(monday, 'MMMM') === label(sunday, 'MMMM')
    ? `Week of ${label(monday, 'd')} – ${label(sunday, 'd MMMM')}`
    : `Week of ${label(monday, 'd MMMM')} – ${label(sunday, 'd MMMM')}`;
};
/** "19 – 25 Oct", or "26 Oct – 1 Nov": the title's label, as on Plan (WI-097). */
export const shortWeekLabel = (monday: string) => {
  const sunday = shiftDay(monday, 6);
  return label(monday, 'MMM') === label(sunday, 'MMM')
    ? `${label(monday, 'd')} – ${label(sunday, 'd MMM')}`
    : `${label(monday, 'd MMM')} – ${label(sunday, 'd MMM')}`;
};
export const weekday = (day: string) => label(day, 'EEE');
export const symbol = {
  done: ['✓', 'done'],
  skipped: ['–', 'skipped'],
  cancelled: ['×', 'cancelled'],
  unrecorded: ['!', 'not recorded'],
  'needs-update': ['!', 'recorded, needs update'],
  planned: ['○', 'planned'],
} as const;
// "The week", not "This week": a past week's step must not share the header's button's name.
export const STEPS = [
  ['week', 'The week'],
  ['reflect', 'Reflect'],
  ['plan', 'Next week'],
] as const;
export type Step = (typeof STEPS)[number][0] | 'details';
/** The step asked for, else the first. */
export const readStep = (value: string | undefined): Step =>
  (['week', 'reflect', 'plan', 'details'] as const).includes(value as Step)
    ? (value as Step)
    : 'week';
/** A review link: the week, and the step unless it is the first. */
export const reviewHref = (to: Step, week: string) =>
  `/review?week=${week}${to === 'week' ? '' : `&step=${to}`}`;
