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
  middayDue,
  morningDue,
  morningLine,
  nudgeContext,
  nudgeInput,
  recapDue,
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

describe('Rumi’s afternoon line and evening recap (WI-101)', () => {
  const rumi: NudgeSetting = { ...on, rumiLines: true, middayEnabled: true };
  const ahead = facts({ morningAt: at(day, '08:00') });
  it('comes inside its window while a study block is still ahead, four hours after the morning', () => {
    expect(middayDue(rumi, ahead, at(day, '12:59'), zone)).toBeNull();
    expect(middayDue(rumi, ahead, at(day, '13:00'), zone)?.id).toBe('b1');
    expect(middayDue(rumi, ahead, at(day, '14:59'), zone)?.id).toBe('b1');
    expect(middayDue(rumi, ahead, at(day, '15:00'), zone)).toBeNull();
    expect(
      middayDue(
        rumi,
        facts({ morningAt: at(day, '09:30') }),
        at(day, '13:10'),
        zone,
      ),
    ).toBeNull();
    // Picks the first block still ahead, never one begun, recorded or already past.
    expect(
      middayDue(
        rumi,
        facts({
          studyBlocks: [
            block('11:00', '12:00'),
            block('19:00', '20:00', { id: 'b2', recorded: true }),
            block('20:00', '21:00', { id: 'b3' }),
          ],
        }),
        at(day, '13:10'),
        zone,
      )?.id,
    ).toBe('b3');
  });
  it('stays silent when off, without Rumi, sent, rested by "Too many", rested, closed, running or quiet', () => {
    const now = at(day, '13:10');
    expect(
      middayDue({ ...rumi, middayEnabled: false }, ahead, now, zone),
    ).toBeNull();
    expect(
      middayDue({ ...rumi, rumiLines: false }, ahead, now, zone),
    ).toBeNull();
    expect(middayDue(rumi, { ...ahead, middayAt: now }, now, zone)).toBeNull();
    expect(
      middayDue({ ...rumi, middayPausedUntil: '2026-11-03' }, ahead, now, zone),
    ).toBeNull();
    expect(
      middayDue({ ...rumi, middayPausedUntil: '2026-10-26' }, ahead, now, zone)
        ?.id,
    ).toBe('b1');
    expect(middayDue(rumi, { ...ahead, rested: true }, now, zone)).toBeNull();
    expect(middayDue(rumi, { ...ahead, closed: true }, now, zone)).toBeNull();
    expect(middayDue(rumi, { ...ahead, running: true }, now, zone)).toBeNull();
    expect(
      middayDue(
        { ...rumi, quietStart: '13:00', quietEnd: '14:00' },
        ahead,
        now,
        zone,
      ),
    ).toBeNull();
    expect(middayDue(rumi, facts({ studyBlocks: [] }), now, zone)).toBeNull();
  });
  it('recaps every active evening, with the block left when there is one', () => {
    const now = at(day, '19:45');
    expect(recapDue(rumi, facts(), now, zone)).toEqual({
      left: expect.objectContaining({ id: 'b1' }),
    });
    // Unlike the check-in, a recorded day still gets its recap.
    expect(
      recapDue(
        rumi,
        facts({ studySessionToday: true, studyBlocks: [] }),
        now,
        zone,
      ),
    ).toEqual({ left: null });
    expect(recapDue(rumi, facts(), at(day, '19:00'), zone)).toBeNull();
    expect(
      recapDue({ ...rumi, rumiLines: false }, facts(), now, zone),
    ).toBeNull();
    expect(
      recapDue({ ...rumi, eveningEnabled: false }, facts(), now, zone),
    ).toBeNull();
    expect(recapDue(rumi, facts({ eveningAt: now }), now, zone)).toBeNull();
    expect(recapDue(rumi, facts({ rested: true }), now, zone)).toBeNull();
    expect(recapDue(rumi, facts({ closed: true }), now, zone)).toBeNull();
    expect(recapDue(rumi, facts({ running: true }), now, zone)).toBeNull();
    expect(
      recapDue(rumi, facts({ morningAt: at(day, '16:00') }), now, zone),
    ).toBeNull();
  });
  it('reads the settings row and parses the form with the lines off by default', () => {
    expect(nudgeContext(rumi)).toBe(
      'Rumi writes · Mornings 08:00 · Afternoon 13:00 · Evening from 19:30 · Weekdays',
    );
    const parsed = nudgeInput.parse({
      morningEnabled: true,
      morningTime: '08:00',
      eveningEnabled: false,
      eveningTime: '19:30',
      days: 31,
      onlyStudyDays: true,
      quietStart: '22:00',
      quietEnd: '07:30',
      studyCategories: ['DSA'],
    });
    expect(parsed).toMatchObject({
      rumiLines: false,
      middayEnabled: false,
      middayTime: '13:00',
    });
    expect(() =>
      nudgeInput.parse({ ...parsed, middayTime: '25:00' }),
    ).toThrow();
  });
});
