import { describe, expect, it } from 'vitest';
import { weekSummary } from '../src/features/review/domain';

const at = (d: string, t: string) => new Date(`${d}T${t}:00Z`);
const item = (id: string, state: string, d: string, t: string) => ({
  id,
  title: id,
  state,
  plannedStart: at(d, t),
});

describe('weekly review step 1 summary (WI-054)', () => {
  it('names the week in one line and lists only what is left to decide, earliest first', () => {
    const days = [
      {
        day: '2026-10-26',
        items: [
          item('a', 'done', '2026-10-26', '10:00'),
          item('b', 'unrecorded', '2026-10-26', '18:00'),
        ],
      },
      {
        day: '2026-10-27',
        items: [
          item('c', 'needs-update', '2026-10-27', '09:00'),
          item('d', 'skipped', '2026-10-27', '11:00'),
          item('e', 'cancelled', '2026-10-27', '12:00'),
        ],
      },
      { day: '2026-10-28', items: [] },
    ];
    const s = weekSummary(days);
    expect(s.line).toBe(
      '1 of 4 done · 1 skipped · 1 not recorded · 1 recorded, needs update',
    );
    expect(s.open.map((o) => [o.day, o.item.id])).toEqual([
      ['2026-10-26', 'b'],
      ['2026-10-27', 'c'],
    ]);
    expect(s.more).toBe(0);
  });

  it('shows a few at a time and counts the rest', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item(`x${i}`, 'unrecorded', '2026-10-26', `0${i}:00`),
    );
    const s = weekSummary([{ day: '2026-10-26', items }], 5);
    expect(s.open.map((o) => o.item.id)).toEqual([
      'x0',
      'x1',
      'x2',
      'x3',
      'x4',
    ]);
    expect(s.more).toBe(3);
    expect(weekSummary([{ day: '2026-10-26', items: [] }]).line).toBe(
      'No plan',
    );
  });
});
