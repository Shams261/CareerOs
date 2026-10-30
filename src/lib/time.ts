import { addDays, differenceInMinutes } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { localTime, timezone } from './validation';
export const dayKey = (date: Date, zone: string) =>
  formatInTimeZone(date, zone, 'yyyy-MM-dd');
export function localInstant(day: string, time: string, zone: string) {
  z.iso.date().parse(day);
  localTime.parse(time);
  timezone.parse(zone);
  const result = fromZonedTime(`${day}T${time}:00`, zone);
  if (formatInTimeZone(result, zone, 'yyyy-MM-dd HH:mm') !== `${day} ${time}`)
    throw new Error('This local time does not exist during the DST transition');
  return result;
}
export function dayBounds(day: string, zone: string) {
  return {
    start: localInstant(day, '00:00', zone),
    end: localInstant(
      addDays(new Date(`${day}T12:00:00Z`), 1)
        .toISOString()
        .slice(0, 10),
      '00:00',
      zone,
    ),
  };
}
/** A DATE label ("2026-10-28") shown as "Oct 28"; never an instant, so no zone is involved. */
export const shortDate = (day: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', 'MMM d');
/** A DATE label shown as "Thu, Oct 22". */
export const weekdayDate = (day: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', 'EEE, MMM d');
/** A DATE label shown in full, "Wednesday 31 December", for the goal card (WI-088). */
export const longDate = (day: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', 'EEEE d MMMM');
/** A clock time as the app reads it everywhere since WI-021: "06:00", "19:30". */
export const hhmm = (date: Date, zone: string) =>
  formatInTimeZone(date, zone, 'HH:mm');
export function minutes(start: Date, end: Date) {
  return Math.max(0, differenceInMinutes(end, start));
}
export function blockSummary<
  T extends { plannedStart: Date; plannedEnd: Date; status: string },
>(blocks: T[], now: Date) {
  const active = blocks.filter(
    (b) => !['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(b.status),
  );
  return {
    current: active
      .sort((a, b) => +a.plannedStart - +b.plannedStart)
      .find((b) => b.plannedStart <= now && b.plannedEnd > now),
    previous: [...blocks]
      .filter((b) => b.plannedEnd <= now)
      .sort((a, b) => +b.plannedEnd - +a.plannedEnd)[0],
    next: active
      .filter((b) => b.plannedStart > now)
      .sort((a, b) => +a.plannedStart - +b.plannedStart)[0],
    completed: blocks.filter((b) => b.status === 'COMPLETED').length,
    total: blocks.filter((b) => b.status !== 'CANCELLED').length,
  };
}
