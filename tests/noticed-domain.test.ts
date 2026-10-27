import { describe, expect, it } from 'vitest';
import {
  cleanCopy,
  hiddenUntil,
  noticed,
  type NoticedInput,
} from '../src/features/noticed/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const today = '2026-10-27';
const now = localInstant(today, '09:00', zone);
const at = (d: string, t: string) => localInstant(d, t, zone);
const base = (over: Partial<NoticedInput> = {}): NoticedInput => ({
  now,
  zone,
  studyKinds: ['DSA', 'Technical'],
  sessions: [],
  blocks: [],
  routines: [],
  rounds: [],
  hidden: [],
  ...over,
});
const session = (
  d: string,
  from = '07:00',
  to = '08:00',
  category = 'DSA',
) => ({
  category,
  startedAt: at(d, from),
  endedAt: at(d, to),
});
const block = (
  d: string,
  from: string,
  to: string,
  over: Partial<NoticedInput['blocks'][number]> = {},
) => ({
  category: 'DSA',
  routineKey: null,
  status: 'PLANNED',
  plannedStart: at(d, from),
  plannedEnd: at(d, to),
  day: d,
  recorded: false,
  ...over,
});

describe('Rumi noticed', () => {
  it('names a kind silent for five days or more, only when the owner uses it', () => {
    const cards = noticed(
      base({
        sessions: [
          session('2026-10-26'),
          session('2026-10-21', '20:00', '21:00', 'Technical'),
        ],
      }),
    );
    expect(cards).toEqual([
      {
        key: 'idle:technical',
        kind: 'idle',
        title: 'No Technical recorded in 6 days',
        context: 'Last on Oct 21',
        action: {
          label: 'Plan it with Rumi',
          ask: 'Plan a Technical block in my free time between today and Sunday.',
        },
      },
    ]);
    // Four days is not enough; a kind never planned or recorded is never named.
    expect(
      noticed(
        base({
          sessions: [
            session('2026-10-26'),
            session('2026-10-23', '20:00', '21:00', 'Technical'),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      noticed(
        base({
          studyKinds: ['DSA', 'Technical', 'Backend'],
          sessions: [session('2026-10-26')],
        }),
      ),
    ).toEqual([]);
  });

  it('puts an interview in the next three days with open prep first, and caps the day at two', () => {
    const cards = noticed(
      base({
        sessions: [
          session('2026-10-20'),
          session('2026-10-19', '20:00', '21:00', 'Technical'),
        ],
        rounds: [
          {
            id: 'r1',
            title: 'System design',
            applicationId: 'a1',
            company: 'Northwind',
            scheduledStart: at('2026-10-29', '15:00'),
            openPrep: 2,
          },
          {
            id: 'r2',
            title: 'Coding',
            applicationId: 'a1',
            company: 'Northwind',
            scheduledStart: at('2026-10-27', '15:00'),
            openPrep: 1,
          },
          {
            id: 'r3',
            title: 'Final',
            applicationId: 'a2',
            company: 'Fabrikam',
            scheduledStart: at('2026-10-28', '15:00'),
            openPrep: 0,
          },
        ],
      }),
    );
    expect(cards.map((c) => c.key)).toEqual(['interview:r1', 'idle:dsa']);
    expect(cards[0]).toMatchObject({
      title: 'Northwind System design in 2 days, 2 prep items open',
      context: 'Thu, Oct 29 at 15:00',
      action: { label: 'Open prep', href: '/jobs/a1#round-r1' },
    });
  });

  it('names a routine left in each of the last three weeks, never one recorded since', () => {
    const left = (d: string) =>
      block(d, '06:00', '07:00', { routineKey: 'rt1', category: 'DSA' });
    const input = base({
      sessions: [
        session('2026-10-26', '20:00', '21:00'),
        session('2026-10-26', '21:00', '22:00', 'Technical'),
      ],
      routines: [{ id: 'rt1', title: 'Morning DSA', startLocal: '06:00' }],
      blocks: [left('2026-10-06'), left('2026-10-13'), left('2026-10-20')],
    });
    expect(noticed(input)).toEqual([
      {
        key: 'routine:rt1:2026-10-20',
        kind: 'routine',
        title: 'Morning DSA at 06:00 was left 3 weeks running',
        context: 'A different time may fit better',
        action: {
          label: 'Open routines',
          href: '/calendar',
          panel: 'routines',
        },
      },
    ]);
    expect(
      noticed({
        ...input,
        blocks: [
          left('2026-10-06'),
          { ...left('2026-10-13'), recorded: true },
          left('2026-10-20'),
        ],
      }),
    ).toEqual([]);
  });

  it('names a day planned at twice the usual recorded study or more', () => {
    const days = [
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ];
    const input = base({
      sessions: days.flatMap((d) => [
        session(d, '07:00', '08:00'),
        session(d, '20:00', '21:00', 'Technical'),
      ]),
      blocks: [
        block('2026-10-28', '06:00', '09:00'),
        block('2026-10-28', '13:00', '16:00', { category: 'Technical' }),
      ],
    });
    expect(noticed(input)).toEqual([
      expect.objectContaining({
        key: 'heavy:2026-10-28',
        title: 'Tomorrow plans 6h of study; you usually record about 2h',
        action: { label: 'Open Plan', href: '/calendar?date=2026-10-28' },
      }),
    ]);
    expect(
      noticed({ ...input, blocks: [block('2026-10-28', '06:00', '09:00')] }),
    ).toEqual([]);
  });

  it('keeps an answered card away for a few days', () => {
    const input = base({
      sessions: [
        session('2026-10-20', '20:00', '21:00', 'Technical'),
        session('2026-10-26'),
      ],
    });
    expect(noticed(input)).toHaveLength(1);
    expect(
      noticed({
        ...input,
        hidden: [{ key: 'idle:technical', until: '2026-10-30' }],
      }),
    ).toEqual([]);
    expect(
      noticed({
        ...input,
        hidden: [{ key: 'idle:technical', until: '2026-10-26' }],
      }),
    ).toHaveLength(1);
    expect(hiddenUntil(today, false)).toBe('2026-11-03');
    expect(hiddenUntil(today, true)).toBe('2026-10-30');
  });

  it('uses no banned word in any template', () => {
    const days = [
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ];
    const all = noticed({
      ...base({
        sessions: days.map((d) => session(d)),
        routines: [{ id: 'rt1', title: 'Morning DSA', startLocal: '06:00' }],
        rounds: [
          {
            id: 'r1',
            title: 'Coding',
            applicationId: 'a',
            company: 'N',
            scheduledStart: at('2026-10-28', '10:00'),
            openPrep: 1,
          },
        ],
        blocks: [block('2026-10-28', '06:00', '12:00')],
      }),
    });
    expect(all.length).toBeGreaterThan(0);
    expect(all.every(cleanCopy)).toBe(true);
  });
});
