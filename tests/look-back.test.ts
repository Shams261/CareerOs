import { describe, expect, it } from 'vitest';
import {
  miniRings,
  moments,
  monthFacts,
  seasonGrid,
} from '../src/features/look-back/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const at = (d: string, t: string) => localInstant(d, t, zone);

describe('Look Back (WI-034)', () => {
  it('lays the season out as Monday-to-Sunday weeks of day prints', () => {
    const g = seasonGrid({
      sessions: [
        {
          startedAt: at('2026-10-20', '09:00'),
          endedAt: at('2026-10-20', '10:00'),
          category: 'DSA',
        },
        {
          startedAt: at('2026-10-20', '14:00'),
          endedAt: at('2026-10-20', '14:30'),
          category: 'JOB_SEARCH',
        },
        {
          startedAt: at('2026-10-14', '20:00'),
          endedAt: at('2026-10-14', '21:00'),
          category: 'DSA',
        },
      ],
      restDays: ['2026-10-18'],
      firstDay: '2026-10-14',
      today: '2026-10-22',
      zone,
    });
    expect(g.weeks).toHaveLength(2);
    expect(g.weeks[0][0].day).toBe('2026-10-12');
    expect(g.weeks[1][6].day).toBe('2026-10-25');
    const tue = g.weeks[1][1];
    expect(tue).toMatchObject({ sessions: 2, minutes: 90, isToday: false });
    expect(tue.label).toBe('Tue 20 Oct: 2 sessions, 1h 30m');
    expect(g.weeks[0][6]).toMatchObject({
      rested: true,
      label: 'Sun 18 Oct: rest day',
    });
    expect(g.weeks[1][3]).toMatchObject({ isToday: true });
    expect(g.weeks[1][4].future).toBe(true);
    expect(g.range).toBe('Oct 12 – Oct 22');
    expect(g.clipped).toBe(false);
  });

  it('shows at most 26 weeks and says when earlier weeks are left out', () => {
    const g = seasonGrid({
      sessions: [],
      restDays: [],
      firstDay: '2025-01-01',
      today: '2026-10-22',
      zone,
    });
    expect(g.weeks).toHaveLength(26);
    expect(g.clipped).toBe(true);
  });

  it('fits a day’s rings inside its square', () => {
    for (const n of [1, 2, 5, 12]) {
      const rings = miniRings(
        Array.from({ length: n }, (_, i) => ({
          minutes: 15 + i * 20,
          group: 'DSA',
        })),
      );
      for (const r of rings) {
        expect(r.cx - r.r).toBeGreaterThanOrEqual(0);
        expect(r.cx + r.r).toBeLessThanOrEqual(100);
        expect(r.cy - r.r).toBeGreaterThanOrEqual(0);
      }
    }
    expect(miniRings([])).toEqual([]);
  });

  it('turns real firsts into quiet moments, newest first', () => {
    const list = moments(
      {
        firstSession: at('2026-09-01', '09:00'),
        firstOwnSolve: { at: at('2026-09-03', '10:00'), title: 'Two Sum' },
        firstRoadmapDone: null,
        firstInterview: {
          at: at('2026-10-20', '15:00'),
          company: 'Northwind Labs',
          round: 'hiring manager chat',
        },
        firstFinal: null,
        firstOffer: null,
        firstWeekReviewed: { at: at('2026-09-07', '18:00') },
      },
      zone,
    );
    expect(list.map((m) => m.key)).toEqual([
      'first-interview',
      'first-week-reviewed',
      'first-own-solve',
      'first-session',
    ]);
    expect(list[0]).toMatchObject({
      title: 'First interview',
      line: 'Northwind Labs, hiring manager chat. Seven weeks after your first practice session.',
    });
    expect(list.find((m) => m.key === 'first-own-solve')!.line).toBe(
      'Two Sum, solved without help.',
    );
    for (const m of list)
      expect(m.line).not.toMatch(/streak|score|missed|best|record-breaking/i);
  });

  it('states the month in facts', () => {
    const f = monthFacts({
      sessions: [
        {
          startedAt: at('2026-10-02', '08:00'),
          endedAt: at('2026-10-02', '10:00'),
          category: 'DSA',
        },
        {
          startedAt: at('2026-10-05', '19:00'),
          endedAt: at('2026-10-05', '19:30'),
          category: 'JOB_SEARCH',
        },
      ],
      attempts: [{ own: true }, { own: false }, { own: true }],
      roadmapDone: 4,
      roadmapRevised: 1,
      rounds: 1,
      zone,
      now: at('2026-10-22', '12:00'),
    });
    expect(f).toMatchObject({
      month: 'October',
      headline: '2h 30m of recorded work',
      lines: [
        '3 practice attempts, 2 on your own',
        '4 roadmap items done, 1 revised',
        '1 interview round',
        'Most time: DSA, mostly before noon',
      ],
    });
    expect(
      monthFacts({
        sessions: [],
        attempts: [],
        roadmapDone: 0,
        roadmapRevised: 0,
        rounds: 0,
        zone,
      }).headline,
    ).toBe('Nothing recorded yet this month');
  });
});
