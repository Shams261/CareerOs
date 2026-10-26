import { describe, expect, it } from 'vitest';
import {
  colourOf,
  dayPrint,
  layoutRings,
  ringRadius,
  WIDTH,
} from '../src/features/day-print/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const day = '2026-10-22';
const at = (t: string, d = day) => localInstant(d, t, zone);
const bounds = { start: at('00:00'), end: at('00:00', '2026-10-23') };
const s = (from: string, to: string | null, category = 'DSA') => ({
  startedAt: at(from),
  endedAt: to ? at(to) : null,
  category,
});

describe('the Day Print (WI-033)', () => {
  it('draws one ring per session in the order they happened, coloured by kind', () => {
    const m = dayPrint({
      day,
      bounds,
      sessions: [
        s('14:00', '15:30', 'JOB_SEARCH'),
        s('09:00', '10:00'),
        s('11:00', '11:20', 'Technical'),
      ],
      letGo: 1,
      rested: false,
    });
    expect(m.rings.map((r) => r.group)).toEqual([
      'DSA',
      'Technical',
      'Job search',
    ]);
    expect(m.rings.map((r) => r.minutes)).toEqual([60, 20, 90]);
    expect(m.rings[2].r).toBeGreaterThan(m.rings[1].r);
    expect(m.headline).toBe('2h 50m of recorded work.');
    expect(m.detail).toBe(
      '3 sessions, one ring each, in the order you did them. 1 block let go.',
    );
    expect(m.weekday).toBe('Thursday');
    expect(m.dateLabel).toBe('Thu 22 Oct 2026');
    expect(m.legend.map((l) => l.colour)).toEqual([
      colourOf('DSA'),
      colourOf('Technical'),
      colourOf('Job search'),
    ]);
  });

  it('clips sessions to the day and says so plainly when there is none', () => {
    const m = dayPrint({
      day,
      bounds,
      sessions: [
        s('23:30', null),
        { ...s('00:00', '00:30'), startedAt: at('23:00', '2026-10-21') },
      ],
      letGo: 0,
      rested: false,
      now: at('23:45'),
    });
    expect(m.rings.map((r) => r.minutes)).toEqual([30, 15]);
    const empty = dayPrint({
      day,
      bounds,
      sessions: [],
      letGo: 0,
      rested: true,
    });
    expect(empty.rings).toEqual([]);
    expect(empty.headline).toBe('Rested.');
    expect(empty.detail).toBe('A rest day.');
    expect(
      dayPrint({ day, bounds, sessions: [], letGo: 0, rested: false }).detail,
    ).toBe('No session recorded.');
  });

  it('keeps every ring inside the print and touching its neighbour', () => {
    for (const n of [1, 3, 8, 20]) {
      const rings = layoutRings(
        Array.from({ length: n }, (_, i) => ({
          minutes: 10 + i * 17,
          group: 'DSA',
        })),
      );
      for (const r of rings) {
        expect(r.cx - r.r).toBeGreaterThanOrEqual(0);
        expect(r.cx + r.r).toBeLessThanOrEqual(WIDTH);
      }
      for (let i = 1; i < rings.length; i++)
        expect(rings[i].cx - rings[i - 1].cx).toBeLessThan(
          rings[i].r + rings[i - 1].r,
        );
    }
    expect(ringRadius(1)).toBeLessThan(ringRadius(120));
    expect(ringRadius(100000)).toBe(54);
  });
});
