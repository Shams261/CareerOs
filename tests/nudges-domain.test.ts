import { describe, expect, it } from 'vitest';
import {
  BANNED_WORDS,
  DEFAULT_NUDGES,
  EVENING_LINES,
  MORNING_LINES,
  eveningDue,
  inAppOnly,
  inQuietHours,
  isStudyCategory,
  morningDue,
  morningLine,
  nudgeContext,
  nudgeInput,
  weekdayBit,
  type NudgeDay,
  type NudgeSetting,
} from '../src/features/nudges/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const at = (day: string, time: string) => localInstant(day, time, zone);
// Tuesday 27 October 2026 (fictional plan).
const day = '2026-10-27';
const on: NudgeSetting = {
  ...DEFAULT_NUDGES,
  morningEnabled: true,
  eveningEnabled: true,
};
const block = (
  start: string,
  end: string,
  extra: Partial<NudgeDay['studyBlocks'][number]> = {},
) => ({
  id: 'b1',
  title: 'Two pointers practice',
  status: 'PLANNED',
  plannedStart: at(day, start),
  plannedEnd: at(day, end),
  recorded: false,
  ...extra,
});
const facts = (extra: Partial<NudgeDay> = {}): NudgeDay => ({
  studyBlocks: [block('18:00', '19:00')],
  studySessionToday: false,
  rested: false,
  closed: false,
  running: false,
  morningAt: null,
  eveningAt: null,
  ...extra,
});

describe('days, quiet hours and categories', () => {
  it('reads weekday bits from a calendar label', () => {
    expect(weekdayBit('2026-10-26')).toBe(1); // Monday
    expect(weekdayBit('2026-10-31')).toBe(32); // Saturday
    expect(weekdayBit('2026-11-01')).toBe(64); // Sunday
  });
  it('handles quiet hours across midnight and equal ends', () => {
    expect(inQuietHours('23:30', '22:00', '07:30')).toBe(true);
    expect(inQuietHours('07:00', '22:00', '07:30')).toBe(true);
    expect(inQuietHours('07:30', '22:00', '07:30')).toBe(false);
    expect(inQuietHours('12:00', '13:00', '14:00')).toBe(false);
    expect(inQuietHours('13:30', '13:00', '14:00')).toBe(true);
    expect(inQuietHours('03:00', '00:00', '00:00')).toBe(false);
  });
  it('matches study categories by name or group', () => {
    expect(isStudyCategory('DSA', ['DSA', 'Technical'])).toBe(true);
    expect(isStudyCategory('system design', ['Technical'])).toBe(
      isStudyCategory('SYSTEM_DESIGN', ['Technical']),
    );
    expect(isStudyCategory('GYM', ['DSA', 'Technical'])).toBe(false);
  });
  it('treats a page seen in the last five minutes as open', () => {
    const now = at(day, '19:45');
    expect(inAppOnly(new Date(+now - 60_000), now)).toBe(true);
    expect(inAppOnly(new Date(+now - 6 * 60_000), now)).toBe(false);
    expect(inAppOnly(null, now)).toBe(false);
  });
});

describe('morning encouragement', () => {
  it('goes out at the chosen time on a study day, within three hours', () => {
    expect(morningDue(on, facts(), at(day, '07:59'), zone)).toBe(false);
    expect(morningDue(on, facts(), at(day, '08:00'), zone)).toBe(true);
    expect(morningDue(on, facts(), at(day, '10:59'), zone)).toBe(true);
    expect(morningDue(on, facts(), at(day, '11:00'), zone)).toBe(false);
  });
  it('is suppressed when off, sent, paused, not a chosen day, rested, running or without study', () => {
    const now = at(day, '08:10');
    expect(
      morningDue({ ...on, morningEnabled: false }, facts(), now, zone),
    ).toBe(false);
    expect(morningDue(on, facts({ morningAt: now }), now, zone)).toBe(false);
    expect(
      morningDue({ ...on, pausedUntil: '2026-11-01' }, facts(), now, zone),
    ).toBe(false);
    expect(
      morningDue({ ...on, pausedUntil: '2026-10-26' }, facts(), now, zone),
    ).toBe(true);
    expect(morningDue({ ...on, days: 1 }, facts(), now, zone)).toBe(false);
    expect(morningDue(on, facts({ rested: true }), now, zone)).toBe(false);
    expect(morningDue(on, facts({ running: true }), now, zone)).toBe(false);
    expect(morningDue(on, facts({ studyBlocks: [] }), now, zone)).toBe(false);
    expect(
      morningDue(
        { ...on, onlyStudyDays: false },
        facts({ studyBlocks: [] }),
        now,
        zone,
      ),
    ).toBe(true);
  });
  it('waits for quiet hours to end, inside its window', () => {
    const early = { ...on, morningTime: '07:00' };
    expect(morningDue(early, facts(), at(day, '07:10'), zone)).toBe(false);
    expect(morningDue(early, facts(), at(day, '07:30'), zone)).toBe(true);
  });
  it('keeps local time across the 2026-11-01 DST change', () => {
    const sunday = '2026-11-01';
    const s = { ...on, days: 127 };
    const d = facts({
      studyBlocks: [
        {
          ...block('18:00', '19:00'),
          plannedStart: localInstant(sunday, '18:00', zone),
          plannedEnd: localInstant(sunday, '19:00', zone),
        },
      ],
    });
    expect(morningDue(s, d, localInstant(sunday, '07:59', zone), zone)).toBe(
      false,
    );
    expect(morningDue(s, d, localInstant(sunday, '08:00', zone), zone)).toBe(
      true,
    );
    expect(localInstant(sunday, '08:00', zone).toISOString()).toBe(
      '2026-11-01T13:00:00.000Z',
    );
  });
});

describe('evening check-in', () => {
  const now = at(day, '19:45');
  it('names the passed, unrecorded, still planned study block', () => {
    expect(eveningDue(on, facts(), now, zone)?.id).toBe('b1');
  });
  it('waits for the evening time and the block to end', () => {
    expect(eveningDue(on, facts(), at(day, '19:29'), zone)).toBeNull();
    expect(
      eveningDue(
        on,
        facts({ studyBlocks: [block('19:00', '20:00')] }),
        now,
        zone,
      ),
    ).toBeNull();
  });
  it('is suppressed by a session, a rest day, a closed day, a running session or a move', () => {
    expect(
      eveningDue(on, facts({ studySessionToday: true }), now, zone),
    ).toBeNull();
    expect(eveningDue(on, facts({ rested: true }), now, zone)).toBeNull();
    expect(eveningDue(on, facts({ closed: true }), now, zone)).toBeNull();
    expect(eveningDue(on, facts({ running: true }), now, zone)).toBeNull();
    expect(
      eveningDue(
        on,
        facts({ studyBlocks: [block('18:00', '19:00', { recorded: true })] }),
        now,
        zone,
      ),
    ).toBeNull();
    expect(
      eveningDue(
        on,
        facts({
          studyBlocks: [block('18:00', '19:00', { status: 'SKIPPED' })],
        }),
        now,
        zone,
      ),
    ).toBeNull();
    // Moved to tomorrow: no longer on today's plan.
    expect(eveningDue(on, facts({ studyBlocks: [] }), now, zone)).toBeNull();
  });
  it('never in quiet hours, never twice, never within four hours of the morning', () => {
    expect(eveningDue(on, facts(), at(day, '22:10'), zone)).toBeNull();
    expect(eveningDue(on, facts({ eveningAt: now }), now, zone)).toBeNull();
    expect(
      eveningDue(on, facts({ morningAt: at(day, '16:00') }), now, zone),
    ).toBeNull();
    expect(
      eveningDue(on, facts({ morningAt: at(day, '08:00') }), now, zone)?.id,
    ).toBe('b1');
  });
});

describe('copy and settings', () => {
  it('never uses guilt words and never names a task', () => {
    for (const line of [...MORNING_LINES, ...EVENING_LINES])
      for (const word of BANNED_WORDS)
        expect(line.toLowerCase()).not.toContain(word);
    // The title already says "Good morning"; the line never repeats it.
    for (const line of MORNING_LINES)
      expect(line.toLowerCase()).not.toContain('good morning');
    expect(morningLine('2026-10-27')).toBe(morningLine('2026-10-27'));
    expect(
      new Set([0, 1, 2].map((i) => morningLine(`2026-10-2${7 + i}`))).size,
    ).toBe(3);
  });
  it('validates the settings form', () => {
    const ok = {
      morningEnabled: true,
      morningTime: '08:00',
      eveningEnabled: true,
      eveningTime: '19:30',
      days: 31,
      onlyStudyDays: true,
      quietStart: '22:00',
      quietEnd: '07:30',
      studyCategories: ['DSA'],
    };
    expect(nudgeInput.parse(ok)).toMatchObject(ok);
    expect(() => nudgeInput.parse({ ...ok, days: 0 })).toThrow();
    expect(() => nudgeInput.parse({ ...ok, morningTime: '8am' })).toThrow();
    expect(() => nudgeInput.parse({ ...ok, studyCategories: [] })).toThrow();
    expect(() => nudgeInput.parse({ ...ok, morningTime: '02:00' })).toThrow();
    expect(nudgeInput.parse({ ...ok, morningTime: '06:00' }).morningTime).toBe(
      '06:00',
    );
  });
  it('describes the settings in one line', () => {
    expect(nudgeContext(DEFAULT_NUDGES)).toBe('Off');
    expect(nudgeContext(on)).toBe(
      'Mornings 08:00 · Check-in from 19:30 · Weekdays',
    );
    expect(nudgeContext({ ...on, eveningEnabled: false, days: 1 | 4 })).toBe(
      'Mornings 08:00 · Mon Wed',
    );
  });
});
