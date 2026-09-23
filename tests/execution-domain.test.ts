import { describe, it, expect } from 'vitest';
import {
  weekDays,
  shiftDay,
  interval,
  dayProgress,
  executionLabel,
  overlaps,
  routineOccurrence,
  routineOverlaps,
} from '../src/features/schedule/domain';
import { blockSummary, minutes } from '../src/lib/time';
import { blockReminderDue } from '../src/features/notifications/domain';
const zone = 'America/Toronto';
const block = {
  status: 'PLANNED',
  category: 'DSA',
  plannedStart: new Date('2026-09-23T11:30Z'),
  plannedEnd: new Date('2026-09-23T13:00Z'),
};
describe('editable schedules', () => {
  it('uses Monday–Sunday across month/year boundaries', () =>
    expect(weekDays('2027-01-01')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]));
  it('moves calendar dates independently from machine timezone', () =>
    expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09'));
  it('rejects reversed and zero duration intervals', () => {
    expect(() =>
      interval('2026-09-23', '09:00', '2026-09-23', '08:00', zone),
    ).toThrow();
    expect(() =>
      interval('2026-09-23', '09:00', '2026-09-23', '09:00', zone),
    ).toThrow();
  });
  it('generates all selected weekdays only', () => {
    const r = {
      weekdays: [1, 3],
      startLocal: '07:30',
      endLocal: '09:00',
      enabled: true,
    };
    expect(routineOccurrence(r, '2026-09-23', zone)).not.toBeNull();
    expect(routineOccurrence(r, '2026-09-24', zone)).toBeNull();
  });
  it('computes elapsed time across both DST changes', () => {
    const r = {
      weekdays: [0],
      startLocal: '01:30',
      endLocal: '03:30',
      enabled: true,
    };
    const spring = routineOccurrence(r, '2026-03-08', zone)!;
    const fall = routineOccurrence(
      { ...r, endLocal: '02:30' },
      '2026-11-01',
      zone,
    )!;
    expect(minutes(spring.plannedStart, spring.plannedEnd)).toBe(60);
    expect(minutes(fall.plannedStart, fall.plannedEnd)).toBe(120);
  });
  it('finds overlaps but permits adjacent blocks', () => {
    expect(
      overlaps(
        { start: new Date(0), end: new Date(60) },
        { start: new Date(30), end: new Date(90) },
      ),
    ).toBe(true);
    expect(
      overlaps(
        { start: new Date(0), end: new Date(60) },
        { start: new Date(60), end: new Date(90) },
      ),
    ).toBe(false);
  });
  it('finds recurring overlaps across Sunday and Monday', () => {
    const a = {
      weekdays: [0],
      startLocal: '23:30',
      endLocal: '01:00',
      enabled: true,
    };
    const b = {
      weekdays: [1],
      startLocal: '00:30',
      endLocal: '02:00',
      enabled: true,
    };
    expect(routineOverlaps(a, b)).toBe(true);
    expect(routineOverlaps(a, { ...b, enabled: false })).toBe(false);
    expect(routineOverlaps(a, { ...b, startLocal: '01:00' })).toBe(false);
  });
  it('finds recurring overlaps across Saturday/Sunday wraparound', () =>
    expect(
      routineOverlaps(
        {
          weekdays: [6],
          startLocal: '23:30',
          endLocal: '01:00',
          enabled: true,
        },
        {
          weekdays: [0],
          startLocal: '00:30',
          endLocal: '01:30',
          enabled: true,
        },
      ),
    ).toBe(true));
});
describe('truthful execution', () => {
  it('treats an elapsed planned block as unrecorded, not skipped', () => {
    expect(executionLabel(block, new Date('2026-09-23T14:00Z'))).toBe(
      'Overdue — not recorded',
    );
    expect(block.status).toBe('PLANNED');
  });
  it('prioritizes recorded statuses over scheduled position', () => {
    expect(executionLabel({ ...block, status: 'COMPLETED' }, new Date(0))).toBe(
      'Completed',
    );
    expect(
      executionLabel(
        { ...block, status: 'IN_PROGRESS' },
        new Date('2026-10-01'),
      ),
    ).toBe('In progress');
  });
  it('calculates current, next, and previous from unsorted blocks', () => {
    const next = {
      ...block,
      plannedStart: new Date('2026-09-23T14:00Z'),
      plannedEnd: new Date('2026-09-23T15:00Z'),
    };
    const previous = {
      ...block,
      plannedStart: new Date('2026-09-23T09:00Z'),
      plannedEnd: new Date('2026-09-23T10:00Z'),
    };
    const summary = blockSummary(
      [next, block, previous],
      new Date('2026-09-23T12:00Z'),
    );
    expect(summary.current).toEqual(block);
    expect(summary.next).toEqual(next);
    expect(summary.previous).toEqual(previous);
  });
  it('separates actual focus minutes from planned minutes and block counts', () => {
    const summary = dayProgress(
      [
        { ...block, status: 'COMPLETED' },
        { ...block, category: 'WORK', status: 'SKIPPED' },
        { ...block, status: 'CANCELLED' },
      ],
      [
        {
          category: 'DSA',
          startedAt: new Date('2026-09-23T11:42Z'),
          endedAt: new Date('2026-09-23T12:51Z'),
        },
      ],
      new Date('2026-09-23T04:00Z'),
      new Date('2026-09-24T04:00Z'),
      new Date('2026-09-23T18:00Z'),
    );
    expect(summary).toMatchObject({
      planned: 2,
      completed: 1,
      skipped: 1,
      remaining: 0,
      plannedFocus: 90,
      actualFocus: 69,
      percent: 50,
    });
  });
  it('clips ongoing actual time at the day boundary', () => {
    expect(
      dayProgress(
        [],
        [
          {
            category: 'CUSTOM_STUDY',
            startedAt: new Date('2026-09-23T03:00Z'),
            endedAt: null,
          },
        ],
        new Date('2026-09-23T04:00Z'),
        new Date('2026-09-24T04:00Z'),
        new Date('2026-09-23T05:00Z'),
      ).actualFocus,
    ).toBe(60);
  });
  it('only reminds about upcoming or unrecorded planned blocks', () => {
    expect(
      blockReminderDue(block, new Date('2026-09-23T11:15Z'), 15, 'upcoming'),
    ).toBe(true);
    expect(blockReminderDue(block, block.plannedStart, 15, 'upcoming')).toBe(
      false,
    );
    expect(blockReminderDue(block, block.plannedEnd, 15, 'overdue')).toBe(true);
    expect(
      blockReminderDue(
        { ...block, sessions: [{}] },
        block.plannedEnd,
        15,
        'overdue',
      ),
    ).toBe(false);
    expect(
      blockReminderDue(
        { ...block, status: 'SKIPPED' },
        block.plannedEnd,
        15,
        'overdue',
      ),
    ).toBe(false);
  });
});
