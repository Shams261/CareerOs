import { describe, expect, it } from 'vitest';
import {
  focusWindow,
  pausedLeft,
  recordedBefore,
} from '../src/features/execution/focus-domain';
import { logDefaults } from '../src/features/schedule/log-time';
import { lengthLabel } from '../src/features/schedule/quick-fields';
import { nextSlot } from '../src/features/today/domain';

const at = (iso: string) => new Date(iso);
const MIN = 60_000;

describe('Resume continues where the pause left it (WI-068)', () => {
  const slot = {
    plannedStart: at('2026-10-28T22:00:00Z'),
    plannedEnd: at('2026-10-28T22:30:00Z'),
  };

  it('counts only finished sessions as time done before', () => {
    expect(
      recordedBefore([
        {
          startedAt: at('2026-10-28T22:00:00Z'),
          endedAt: at('2026-10-28T22:05:00Z'),
        },
        { startedAt: at('2026-10-28T22:10:00Z'), endedAt: null },
      ]),
    ).toBe(5 * MIN);
  });

  it('resumes at the time left, not at the full length', () => {
    // Five minutes done of thirty; resumed at 22:12, so 25 minutes are left from there.
    const ring = focusWindow({
      ...slot,
      startedAt: at('2026-10-28T22:12:00Z'),
      doneBefore: 5 * MIN,
    })!;
    expect(ring.start.toISOString()).toBe('2026-10-28T22:07:00.000Z');
    expect(ring.target.toISOString()).toBe('2026-10-28T22:37:00.000Z');
    expect(+ring.target - +at('2026-10-28T22:12:00Z')).toBe(25 * MIN);
  });

  it('runs the slot itself when the first session begins inside it', () => {
    // Forty seconds in, the window is still the whole 30-minute slot (WI-069).
    const ring = focusWindow({
      ...slot,
      startedAt: at('2026-10-28T22:00:40Z'),
    })!;
    expect(ring.start.toISOString()).toBe('2026-10-28T22:00:00.000Z');
    expect(ring.target.toISOString()).toBe('2026-10-28T22:30:00.000Z');
    // Begun early, the planned length runs from the start (WI-058).
    const early = focusWindow({
      ...slot,
      startedAt: at('2026-10-28T21:50:00Z'),
    })!;
    expect(early.start.toISOString()).toBe('2026-10-28T21:50:00.000Z');
    expect(early.target.toISOString()).toBe('2026-10-28T22:20:00.000Z');
  });

  it('reads Time is up at once when the length is already used', () => {
    const ring = focusWindow({
      ...slot,
      startedAt: at('2026-10-28T22:40:00Z'),
      doneBefore: 35 * MIN,
    })!;
    expect(+ring.target).toBe(+at('2026-10-28T22:40:00Z'));
  });

  it('says what a paused block has left', () => {
    expect(pausedLeft(slot.plannedStart, slot.plannedEnd, 5 * MIN)).toBe(
      25 * MIN,
    );
    expect(pausedLeft(slot.plannedStart, slot.plannedEnd, 40 * MIN)).toBe(0);
  });
});

describe('Log time never starts in the future (WI-068)', () => {
  const slot = {
    plannedStart: at('2026-10-29T03:15:00Z'),
    plannedEnd: at('2026-10-29T03:45:00Z'),
  };
  it('takes the slot once it is over', () => {
    expect(logDefaults(slot, at('2026-10-29T04:00:00Z'))).toEqual({
      start: slot.plannedStart,
      end: slot.plannedEnd,
    });
  });
  it('runs from the slot’s start to now while it is on', () => {
    const r = logDefaults(slot, at('2026-10-29T03:27:40Z'));
    expect(r.start).toEqual(slot.plannedStart);
    expect(r.end.toISOString()).toBe('2026-10-29T03:27:00.000Z');
  });
  it('ends now and starts half an hour back before the slot begins', () => {
    const r = logDefaults(slot, at('2026-10-29T03:00:00Z'));
    expect(r.end.toISOString()).toBe('2026-10-29T03:00:00.000Z');
    expect(r.start.toISOString()).toBe('2026-10-29T02:30:00.000Z');
  });
});

describe('The suggested slot is one Save accepts (WI-068)', () => {
  const zone = 'America/Toronto';
  it('treats a done block as busy, like the overlap check', () => {
    // 22:44 with a done block at 22:45–23:15: the next free half hour is 23:15.
    expect(
      nextSlot(at('2026-10-29T02:44:00Z'), zone, '2026-10-28', [
        { start: at('2026-10-29T02:45:00Z'), end: at('2026-10-29T03:15:00Z') },
      ]),
    ).toEqual({ start: '23:15', end: '23:45' });
  });
  it('late at night it takes the minutes after the last block', () => {
    expect(
      nextSlot(at('2026-10-29T03:20:00Z'), zone, '2026-10-28', [
        { start: at('2026-10-29T03:16:00Z'), end: at('2026-10-29T03:46:00Z') },
      ]),
    ).toEqual({ start: '23:46', end: '23:59' });
  });
});

describe('Block lengths read in words (WI-068)', () => {
  it('names half an hour to an hour and a half', () => {
    expect([30, 45, 60, 90, 120].map(lengthLabel)).toEqual([
      '30 min',
      '45 min',
      '1 hour',
      '1.5 hours',
      '2 hours',
    ]);
  });
});
