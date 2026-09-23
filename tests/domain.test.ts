import { describe, it, expect } from 'vitest';
import {
  dayBounds,
  dayKey,
  localInstant,
  blockSummary,
  minutes,
} from '../src/lib/time';
import { resourceUrl } from '../src/lib/validation';
import { routineOccurrence } from '../src/features/schedule/domain';
import {
  reminderKey,
  reviewReminderDue,
} from '../src/features/notifications/domain';
const zone = 'America/Toronto';
describe('timezone-safe time', () => {
  it('resolves local dates across UTC midnight', () =>
    expect(dayKey(new Date('2026-01-02T02:00Z'), zone)).toBe('2026-01-01'));
  it('uses EST in winter and EDT in summer', () => {
    expect(localInstant('2026-01-10', '07:30', zone).toISOString()).toBe(
      '2026-01-10T12:30:00.000Z',
    );
    expect(localInstant('2026-07-10', '07:30', zone).toISOString()).toBe(
      '2026-07-10T11:30:00.000Z',
    );
  });
  it('handles short and long DST days', () => {
    const spring = dayBounds('2026-03-08', zone),
      fall = dayBounds('2026-11-01', zone);
    expect(minutes(spring.start, spring.end)).toBe(23 * 60);
    expect(minutes(fall.start, fall.end)).toBe(25 * 60);
  });
  it('rejects nonexistent spring-forward times', () =>
    expect(() => localInstant('2026-03-08', '02:30', zone)).toThrow());
  it('rejects malformed calendar dates', () =>
    expect(() => localInstant('2026-02-30', '09:00', zone)).toThrow());
});
it('chooses the earlier Toronto occurrence during fall-back', () => {
  expect(localInstant('2026-11-01', '01:30', zone).toISOString()).toBe(
    '2026-11-01T05:30:00.000Z',
  );
});

describe('schedule', () => {
  const routine = {
    weekday: 0,
    startLocal: '23:30',
    endLocal: '00:30',
    enabled: true,
  };
  it('supports overnight routines', () => {
    const occurrence = routineOccurrence(routine, '2026-09-20', zone)!;
    expect(minutes(occurrence.plannedStart, occurrence.plannedEnd)).toBe(60);
  });
  it('ignores disabled and non-matching weekdays', () => {
    expect(
      routineOccurrence({ ...routine, enabled: false }, '2026-09-20', zone),
    ).toBeNull();
    expect(routineOccurrence(routine, '2026-09-21', zone)).toBeNull();
  });
  it('uses end-exclusive boundaries and excludes skipped blocks', () => {
    const b = {
      plannedStart: new Date('2026-01-01T10:00Z'),
      plannedEnd: new Date('2026-01-01T11:00Z'),
      status: 'PLANNED',
    };
    expect(blockSummary([b], b.plannedStart).current).toEqual(b);
    expect(blockSummary([b], b.plannedEnd).current).toBeUndefined();
    expect(
      blockSummary([{ ...b, status: 'SKIPPED' }], b.plannedStart).current,
    ).toBeUndefined();
  });
});
describe('resources', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,bad',
    'ftp://example.com',
    'https://user:password@example.com',
    'not a url',
  ])('rejects unsafe URL %s', (url) =>
    expect(resourceUrl.safeParse(url).success).toBe(false),
  );
  it('allows custom platforms', () =>
    expect(
      resourceUrl.safeParse('https://custom.example/problems/42').success,
    ).toBe(true));
});
describe('reminders', () => {
  const input = {
    now: new Date('2026-09-24T01:30Z'),
    timezone: zone,
    preferredTime: '21:30',
    enabled: true,
    reviewedAt: null,
  };
  it('becomes eligible at the configured local time', () => {
    expect(reviewReminderDue(input)).toBe(true);
    expect(
      reviewReminderDue({ ...input, now: new Date('2026-09-24T01:29Z') }),
    ).toBe(false);
  });
  it('suppresses reviewed or disabled reminders', () => {
    expect(reviewReminderDue({ ...input, reviewedAt: new Date() })).toBe(false);
    expect(reviewReminderDue({ ...input, enabled: false })).toBe(false);
  });
  it('dedupes an occurrence but permits the following day', () => {
    expect(reminderKey('u', 'DAILY_PROGRESS', 'day', '2026-09-23')).toBe(
      reminderKey('u', 'DAILY_PROGRESS', 'day', '2026-09-23'),
    );
    expect(reminderKey('u', 'DAILY_PROGRESS', 'day', '2026-09-23')).not.toBe(
      reminderKey('u', 'DAILY_PROGRESS', 'day', '2026-09-24'),
    );
  });
});
