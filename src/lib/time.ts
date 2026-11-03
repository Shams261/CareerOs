import { addDays, differenceInMinutes } from 'date-fns';
import {
  formatInTimeZone,
  fromZonedTime,
  getTimezoneOffset,
} from 'date-fns-tz';
import { checkDay } from './day';
/** "08:00" … "23:59". No Zod here: client code imports this module (WI-123). */
export const isLocalTime = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export const dayKey = (date: Date, zone: string) =>
  formatInTimeZone(date, zone, 'yyyy-MM-dd');
/** Whether a local wall time exists on that day (it does not inside a spring-forward gap). */
export function wallTimeExists(day: string, time: string, zone: string) {
  const result = fromZonedTime(`${day}T${time}:00`, zone);
  return (
    formatInTimeZone(result, zone, 'yyyy-MM-dd HH:mm') === `${day} ${time}`
  );
}
export function localInstant(day: string, time: string, zone: string) {
  checkDay(day);
  if (!isLocalTime(time)) throw new Error('Enter a time as HH:MM.');
  if (!isTimeZone(zone)) throw new Error('Use a valid IANA timezone');
  if (!wallTimeExists(day, time, zone))
    throw new Error('This local time does not exist during the DST transition');
  return fromZonedTime(`${day}T${time}:00`, zone);
}
/**
 * The moment a repeated local time is reached (a reminder's time, a day's midnight): inside a
 * spring-forward gap that is when the clock jumps past it (02:30 → 03:30 in Toronto), instead
 * of an error that stopped the whole reminder run (WI-145). A threshold only: plans never use
 * it, since ADR-003 never shifts a time into a plan (`routineOccurrence` skips such a day).
 */
export function repeatedInstant(day: string, time: string, zone: string) {
  checkDay(day);
  if (!isLocalTime(time)) throw new Error('Enter a time as HH:MM.');
  if (!isTimeZone(zone)) throw new Error('Use a valid IANA timezone');
  const result = fromZonedTime(`${day}T${time}:00`, zone);
  if (wallTimeExists(day, time, zone)) return result;
  const gap =
    getTimezoneOffset(zone, new Date(+result + 12 * 3600000)) -
    getTimezoneOffset(zone, new Date(+result - 12 * 3600000));
  return new Date(+result + Math.max(0, gap));
}
export function dayBounds(day: string, zone: string) {
  return {
    start: repeatedInstant(day, '00:00', zone),
    end: repeatedInstant(
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
