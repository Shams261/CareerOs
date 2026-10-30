import { describe, expect, it } from 'vitest';
import {
  dayName,
  groupName,
  weekGroups,
  weekRange,
} from '@/features/schedule/week-list';

const week = (
  blocks: Record<string, number>,
  lines: Record<string, string> = {},
) =>
  [
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ].map((day) => ({
    day,
    blocks: Array.from({ length: blocks[day] ?? 0 }, (_, i) => `${day}#${i}`),
    line:
      lines[day] ?? (blocks[day] ? `${blocks[day]} blocks` : 'Nothing planned'),
  }));

describe('weekGroups (WI-083)', () => {
  it('keeps days with blocks and today apart, merges empty neighbours', () => {
    const groups = weekGroups(
      week({ '2026-10-28': 1, '2026-10-29': 3 }),
      '2026-10-30',
    );
    expect(groups.map(groupName)).toEqual([
      'Mon 26 – Tue 27',
      'Wed 28',
      'Thu 29',
      'Fri 30',
      'Sat 31 – Sun 1',
    ]);
    expect(groups[3].isToday).toBe(true);
    expect(groups[3].blocks).toEqual([]);
    expect(groups[1].blocks).toEqual(['2026-10-28#0']);
    expect(groups[4].line).toBe('Nothing planned');
  });

  it('merges a whole empty week into one line when today is elsewhere', () => {
    const groups = weekGroups(week({}), '2026-11-04');
    expect(groups.map(groupName)).toEqual(['Mon 26 – Sun 1']);
  });

  it('does not merge days whose lines differ (planned vs not planned yet)', () => {
    const groups = weekGroups(
      week(
        {},
        { '2026-10-31': 'Not planned yet', '2026-11-01': 'Not planned yet' },
      ),
      '2026-10-29',
    );
    expect(groups.map((g) => [groupName(g), g.line])).toEqual([
      ['Mon 26 – Wed 28', 'Nothing planned'],
      ['Thu 29', 'Nothing planned'],
      ['Fri 30', 'Nothing planned'],
      ['Sat 31 – Sun 1', 'Not planned yet'],
    ]);
  });

  it('names days and weeks', () => {
    expect(dayName('2026-11-01')).toBe('Sun 1');
    expect(
      weekRange([
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
      ]),
    ).toBe('26 Oct – 1 Nov');
    expect(
      weekRange([
        '2026-10-19',
        '2026-10-20',
        '2026-10-21',
        '2026-10-22',
        '2026-10-23',
        '2026-10-24',
        '2026-10-25',
      ]),
    ).toBe('19 – 25 Oct');
  });
});
