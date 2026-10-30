import { formatInTimeZone } from 'date-fns-tz';

/**
 * The week as one list (WI-083): a day with blocks, or today, is its own group; empty
 * neighbours merge into one line ("Mon 26 – Tue 27 · nothing planned"), so the list is as
 * long as the week's plan and not seven sections.
 */
export type WeekDay<B> = {
  day: string;
  blocks: B[];
  /** The day's line under its name: "3 blocks · 1h 20m planned" or why it is empty. */
  line: string;
};
export type WeekGroup<B> = {
  /** The first day, and the last when several merged. */
  days: string[];
  blocks: B[];
  isToday: boolean;
  line: string;
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const label = (day: string, pattern: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', pattern);

/** "Thu 29". */
export function dayName(day: string) {
  return `${WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${label(day, 'd')}`;
}

export function weekGroups<B>(
  days: WeekDay<B>[],
  today: string,
): WeekGroup<B>[] {
  const groups: WeekGroup<B>[] = [];
  for (const d of days) {
    const own = d.day === today || d.blocks.length > 0;
    const last = groups[groups.length - 1];
    // Only two empty days with the same line merge, so "Not planned yet" stays apart.
    if (
      !own &&
      last &&
      !last.isToday &&
      !last.blocks.length &&
      last.line === d.line
    ) {
      last.days = [last.days[0], d.day];
      continue;
    }
    groups.push({
      days: [d.day],
      blocks: d.blocks,
      isToday: d.day === today,
      line: d.line,
    });
  }
  return groups;
}

/** "Mon 26 – Tue 27" for a merged group, "Wed 28" otherwise. */
export function groupName<B>(group: WeekGroup<B>) {
  return group.days.length > 1
    ? `${dayName(group.days[0])} – ${dayName(group.days[1])}`
    : dayName(group.days[0]);
}

/** "26 Oct – 1 Nov", or "19 – 25 Oct" inside one month. */
export function weekRange(days: string[]) {
  return label(days[0], 'MMM') === label(days[6], 'MMM')
    ? `${label(days[0], 'd')} – ${label(days[6], 'd MMM')}`
    : `${label(days[0], 'd MMM')} – ${label(days[6], 'd MMM')}`;
}
