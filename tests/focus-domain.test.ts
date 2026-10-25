import { describe, expect, it } from 'vitest';
import {
  appendNote,
  focusLabel,
  focusTarget,
  intentionOf,
  minutesLeft,
  ringFraction,
  targetMinutes,
} from '../src/features/execution/focus-domain';

const t = (iso: string) => new Date(`2026-10-27T${iso}:00Z`);

describe('focus target', () => {
  it('is the planned end while a minute of the block is left', () => {
    expect(
      focusTarget({
        startedAt: t('09:02'),
        plannedStart: t('09:00'),
        plannedEnd: t('10:00'),
      }),
    ).toEqual(t('10:00'));
  });
  it('gives a late start the block’s planned length from its own start', () => {
    expect(
      focusTarget({
        startedAt: t('10:30'),
        plannedStart: t('09:00'),
        plannedEnd: t('10:00'),
      }),
    ).toEqual(t('11:30'));
  });
  it('is untimed without a planned window', () => {
    expect(focusTarget({ startedAt: t('09:00') })).toBeNull();
    expect(
      focusTarget({
        startedAt: t('10:30'),
        plannedStart: t('10:00'),
        plannedEnd: t('10:00'),
      }),
    ).toBeNull();
  });
});

describe('ring and minutes', () => {
  it('fills from 0 to 1 and clamps', () => {
    expect(ringFraction(t('09:00'), t('10:00'), t('09:00'))).toBe(0);
    expect(ringFraction(t('09:00'), t('10:00'), t('09:30'))).toBe(0.5);
    expect(ringFraction(t('09:00'), t('10:00'), t('11:00'))).toBe(1);
    expect(ringFraction(t('09:00'), t('08:00'), t('09:00'))).toBe(1);
  });
  it('rounds minutes left up and never below zero', () => {
    expect(minutesLeft(t('10:00'), new Date('2026-10-27T09:37:10Z'))).toBe(23);
    expect(minutesLeft(t('10:00'), t('10:05'))).toBe(0);
    expect(targetMinutes(t('09:02'), t('10:00'))).toBe(58);
  });
  it('reads as words', () => {
    expect(focusLabel(22, 60)).toBe('22 minutes left of 60');
    expect(focusLabel(1, 60)).toBe('1 minute left of 60');
    expect(focusLabel(0, 60)).toBe('Time is up · 60 min');
  });
});

describe('session notes', () => {
  it('appends labelled lines without replacing what is there', () => {
    const start = appendNote(
      null,
      'Intention',
      '  Two problems   without hints ',
    );
    expect(start).toBe('Intention: Two problems without hints');
    expect(appendNote(start, 'Learned', 'Store indices, not values')).toBe(
      'Intention: Two problems without hints\nLearned: Store indices, not values',
    );
    expect(appendNote('Owner wrote this', 'Learned', 'x')).toBe(
      'Owner wrote this\nLearned: x',
    );
  });
  it('adds nothing for an empty line and keeps existing notes', () => {
    expect(appendNote(null, 'Intention', '   ')).toBeNull();
    expect(appendNote('Kept', 'Learned', '')).toBe('Kept');
    expect(appendNote('', 'Learned', undefined)).toBeNull();
  });
  it('stays within the notes limit', () => {
    expect(appendNote('a'.repeat(990), 'Learned', 'b'.repeat(50))).toHaveLength(
      1000,
    );
  });
  it('reads the intention back', () => {
    expect(intentionOf('Intention: Ship it\nLearned: x')).toBe('Ship it');
    expect(intentionOf('no intention here')).toBeNull();
    expect(intentionOf(null)).toBeNull();
  });
});
