import { z } from 'zod';
import { localInstant, minutes } from '../../lib/time';
import { localTime } from '../../lib/validation';
export const dateInput = z.iso.date();
export const shiftDay = (day: string, count: number) => {
  dateInput.parse(day);
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
};
export function weekDays(day: string) {
  const weekday = new Date(`${dateInput.parse(day)}T12:00:00Z`).getUTCDay();
  const monday = shiftDay(day, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}
export const blockInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  goalId: z.string().optional(),
  description: z.string().max(1000).default(''),
  priority: z.coerce.number().int().min(1).max(3),
  day: dateInput,
  endDay: dateInput,
  startLocal: localTime,
  endLocal: localTime,
});
export const routineInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  goalId: z.string().optional(),
  description: z.string().max(1000).default(''),
  priority: z.coerce.number().int().min(1).max(3),
  weekdays: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .transform((v) => [...new Set(v)].sort()),
  startLocal: localTime,
  endLocal: localTime,
  enabled: z.boolean(),
});
export type RoutineInput = z.infer<typeof routineInput>;
export function interval(
  day: string,
  start: string,
  endDay: string,
  end: string,
  zone: string,
) {
  const plannedStart = localInstant(day, start, zone),
    plannedEnd = localInstant(endDay, end, zone);
  if (plannedEnd <= plannedStart)
    throw new Error(
      'End must be after start. Choose the next end date for an overnight block.',
    );
  return { plannedStart, plannedEnd };
}
export function routineOccurrence(
  routine: {
    weekdays?: number[];
    weekday?: number;
    startLocal: string;
    endLocal: string;
    enabled: boolean;
  },
  day: string,
  zone: string,
) {
  dateInput.parse(day);
  if (
    !routine.enabled ||
    !(routine.weekdays ?? [routine.weekday]).includes(
      new Date(`${day}T12:00:00Z`).getUTCDay(),
    )
  )
    return null;
  return interval(
    day,
    routine.startLocal,
    routine.endLocal <= routine.startLocal ? shiftDay(day, 1) : day,
    routine.endLocal,
    zone,
  );
}
export function overlaps(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
) {
  return a.start < b.end && b.start < a.end;
}
export function executionLabel(
  block: { status: string; plannedStart: Date; plannedEnd: Date },
  now: Date,
) {
  if (block.status === 'COMPLETED') return 'Completed';
  if (block.status === 'SKIPPED') return 'Skipped';
  if (block.status === 'CANCELLED') return 'Cancelled';
  if (block.status === 'IN_PROGRESS') return 'In progress';
  if (block.plannedEnd <= now) return 'Overdue — not recorded';
  if (block.plannedStart <= now) return 'Current';
  return 'Upcoming';
}
/** Focus time excludes Work, Gym and Personal; every other (custom) category counts. */
export const isFocusCategory = (category: string) =>
  !['WORK', 'GYM', 'PERSONAL'].includes(category);
export function dayProgress(
  blocks: {
    status: string;
    category: string;
    plannedStart: Date;
    plannedEnd: Date;
  }[],
  sessions: { category: string; startedAt: Date; endedAt: Date | null }[],
  start: Date,
  end: Date,
  now: Date,
) {
  const active = blocks.filter((b) => b.status !== 'CANCELLED');
  const focus = isFocusCategory;
  return {
    planned: active.length,
    completed: active.filter((b) => b.status === 'COMPLETED').length,
    skipped: active.filter((b) => b.status === 'SKIPPED').length,
    remaining: active.filter((b) =>
      ['PLANNED', 'IN_PROGRESS'].includes(b.status),
    ).length,
    plannedFocus: active
      .filter((b) => focus(b.category))
      .reduce(
        (n, b) =>
          n +
          minutes(
            new Date(Math.max(+start, +b.plannedStart)),
            new Date(Math.min(+end, +b.plannedEnd)),
          ),
        0,
      ),
    actualFocus: sessions
      .filter((s) => focus(s.category))
      .reduce(
        (n, s) =>
          n +
          minutes(
            new Date(Math.max(+start, +s.startedAt)),
            new Date(Math.min(+end, +(s.endedAt ?? now))),
          ),
        0,
      ),
    percent: active.length
      ? Math.round(
          (active.filter((b) => b.status === 'COMPLETED').length /
            active.length) *
            100,
        )
      : 0,
  };
}
export function routineOverlaps(
  a: {
    weekdays: number[];
    startLocal: string;
    endLocal: string;
    enabled: boolean;
  },
  b: {
    weekdays: number[];
    startLocal: string;
    endLocal: string;
    enabled: boolean;
  },
) {
  if (!a.enabled || !b.enabled) return false;
  const minute = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const ranges = (r: typeof a) =>
    r.weekdays.map((d) => {
      const start = d * 1440 + minute(r.startLocal);
      let end = d * 1440 + minute(r.endLocal);
      if (end <= start) end += 1440;
      return { start, end };
    });
  return ranges(a).some((x) =>
    ranges(b).some((y) =>
      [-10080, 0, 10080].some(
        (offset) => x.start < y.end + offset && y.start + offset < x.end,
      ),
    ),
  );
}
