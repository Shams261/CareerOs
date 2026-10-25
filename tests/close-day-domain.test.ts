import { describe, expect, it } from 'vitest';
import {
  choicesFor,
  closeDayOpen,
  closedMessage,
  closeTarget,
  leftKind,
  moveLabel,
  readCloseForm,
  tomorrowSlot,
} from '../src/features/close-day/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const day = '2026-10-27'; // a Tuesday; fictional blocks
const at = (time: string, d = day) => localInstant(d, time, zone);
const block = (
  over: Partial<{
    status: string;
    start: string;
    end: string;
    sessions: { id: string; startedAt: Date; endedAt: Date | null }[];
  }> = {},
) => ({
  id: 'b',
  title: 'Two pointers practice',
  category: 'DSA',
  status: over.status ?? 'PLANNED',
  plannedStart: at(over.start ?? '18:00'),
  plannedEnd: at(over.end ?? '19:00'),
  interviewRoundId: null,
  sessions: over.sessions ?? [],
});

describe('when the day can be closed', () => {
  const base = { day, today: day, zone, stopTime: '21:30', reviewed: false };
  it('opens on today from the stop time, and on any past day', () => {
    expect(closeDayOpen({ ...base, now: at('21:29') })).toBe(false);
    expect(closeDayOpen({ ...base, now: at('21:30') })).toBe(true);
    expect(closeDayOpen({ ...base, day: '2026-10-26', now: at('09:00') })).toBe(
      true,
    );
  });
  it('never for a reviewed day or a day still ahead', () => {
    expect(closeDayOpen({ ...base, reviewed: true, now: at('22:00') })).toBe(
      false,
    );
    expect(closeDayOpen({ ...base, day: '2026-10-28', now: at('22:00') })).toBe(
      false,
    );
  });
});

describe('what is left', () => {
  const now = at('22:00');
  it('separates unrecorded from recorded blocks and skips settled ones', () => {
    expect(leftKind(block(), now)).toBe('unrecorded');
    expect(leftKind(block({ start: '22:30', end: '23:00' }), now)).toBe(
      'unrecorded',
    );
    expect(
      leftKind(
        block({
          sessions: [{ id: 's', startedAt: at('18:05'), endedAt: at('18:40') }],
        }),
        now,
      ),
    ).toBe('recorded');
    for (const status of ['COMPLETED', 'SKIPPED', 'CANCELLED'])
      expect(leftKind(block({ status }), now)).toBeNull();
  });
  it('offers Tomorrow only for unrecorded blocks that are not interviews', () => {
    expect(choicesFor('unrecorded')).toEqual(['tomorrow', 'letgo']);
    expect(choicesFor('unrecorded', true)).toEqual(['letgo']);
    expect(choicesFor('recorded')).toEqual(['done', 'letgo']);
  });
});

describe('where Tomorrow puts a block', () => {
  const target = '2026-10-28';
  it('keeps the planned time when it is free', () => {
    const slot = tomorrowSlot(block(), target, zone, []);
    expect(slot).toMatchObject({ same: true, start: at('18:00', target) });
    expect(+slot!.end - +slot!.start).toBe(60 * 60_000);
    expect(moveLabel(slot, at('18:00'), target, zone)).toBe(
      'Moves to Wed, Oct 28 · 18:00',
    );
  });
  it('takes the next free quarter hour and says why', () => {
    const taken = [{ start: at('18:00', target), end: at('18:40', target) }];
    const slot = tomorrowSlot(block(), target, zone, taken);
    expect(slot).toMatchObject({ same: false, start: at('18:45', target) });
    expect(moveLabel(slot, at('18:00'), target, zone)).toBe(
      'Moves to Wed, Oct 28 · 18:45 (18:00 is taken)',
    );
  });
  it('says so when the day has no room', () => {
    const taken = [
      { start: at('17:00', target), end: at('00:00', '2026-10-29') },
    ];
    const slot = tomorrowSlot(block(), target, zone, taken);
    expect(slot).toBeNull();
    expect(moveLabel(slot, at('18:00'), target, zone)).toMatch(
      /no free time this long/,
    );
  });
  it('keeps local time across the 2026-11-01 DST change', () => {
    const sat = '2026-10-31';
    const b = {
      plannedStart: at('18:00', sat),
      plannedEnd: at('19:00', sat),
    };
    const slot = tomorrowSlot(b, '2026-11-01', zone, []);
    expect(slot!.start.toISOString()).toBe('2026-11-01T23:00:00.000Z');
  });
  it('is always the owner’s tomorrow', () => {
    expect(closeTarget('2026-10-27')).toBe('2026-10-28');
  });
});

describe('the submitted close', () => {
  it('reads one choice, version and slot per block', () => {
    const parsed = readCloseForm([
      ['day', day],
      ['note', '  Two pointers clicked  '],
      ['choice-a', 'tomorrow'],
      ['version-a', 'v1'],
      ['slot-a', '2026-10-28T22:00:00.000Z'],
      ['choice-b', 'letgo'],
    ]);
    expect(parsed).toEqual({
      day,
      note: 'Two pointers clicked',
      choices: { a: 'tomorrow', b: 'letgo' },
      versions: { a: 'v1' },
      slots: { a: '2026-10-28T22:00:00.000Z' },
    });
  });
  it('rejects unknown choices', () => {
    expect(() =>
      readCloseForm([
        ['day', day],
        ['note', ''],
        ['choice-a', 'delete'],
      ]),
    ).toThrow();
  });
  it('answers with the facts only', () => {
    expect(closedMessage({ tomorrow: 2, letgo: 1, done: 0 })).toBe(
      'Day closed · 2 moved to tomorrow · 1 let go.',
    );
    expect(closedMessage({ tomorrow: 0, letgo: 0, done: 0 })).toBe(
      'Day closed.',
    );
  });
});
