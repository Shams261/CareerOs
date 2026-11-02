/**
 * Owner-calendar days as `YYYY-MM-DD` labels (ADR-003): a label, never an instant, so the
 * arithmetic runs at noon UTC and no zone is involved. No Zod here: client code imports this.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written as `YYYY-MM-DD` ("2026-02-30" is not one). */
export function isDay(value: string) {
  if (!DAY.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function checkDay(day: string) {
  if (!isDay(day)) throw new Error('Enter a valid date.');
  return day;
}
export const shiftDay = (day: string, count: number) => {
  const d = new Date(`${checkDay(day)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
};
/** Monday to Sunday of the week holding `day`. */
export function weekDays(day: string) {
  const weekday = new Date(`${checkDay(day)}T12:00:00Z`).getUTCDay();
  const monday = shiftDay(day, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}
/** The Monday of the week holding `day`: owner-local Monday → Sunday weeks. */
export const weekOf = (day: string) => weekDays(day)[0];
/** True for a Sunday label. */
export const isSunday = (day: string) =>
  new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
