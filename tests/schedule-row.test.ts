import { describe, it, expect } from 'vitest';
import {
  blockFacts,
  blockResolution,
  factsLine,
  recordedMinutes,
  rowMeta,
  type RowBlock,
} from '../src/features/schedule/row';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const at = (time: string, day = '2026-10-22') => localInstant(day, time, zone);
const now = at('12:00');
const block = (over: Partial<RowBlock> = {}): RowBlock => ({
  id: 'b1',
  title: 'Reading',
  category: 'PERSONAL',
  status: 'PLANNED',
  plannedStart: at('07:00'),
  plannedEnd: at('07:45'),
  interviewRoundId: null,
  sessions: [],
  ...over,
});
const session = (start: string, end: string | null, id = 's1') => ({
  id,
  startedAt: at(start),
  endedAt: end ? at(end) : null,
});

describe('rowMeta', () => {
  it('reads the recorded length for a done block and "Completed" without a session', () => {
    expect(
      rowMeta(
        block({ status: 'COMPLETED', sessions: [session('07:00', '07:45')] }),
        null,
        now,
        zone,
      ),
    ).toBe('45 min recorded');
    expect(rowMeta(block({ status: 'COMPLETED' }), null, now, zone)).toBe(
      'Completed',
    );
  });
  it('names the past states and the skip reason', () => {
    expect(rowMeta(block(), null, now, zone)).toBe('No session recorded');
    expect(
      rowMeta(
        block({ sessions: [session('07:00', '07:20')] }),
        null,
        now,
        zone,
      ),
    ).toBe('20 min recorded');
    expect(
      rowMeta(
        block({ status: 'SKIPPED', skipReason: 'travel' }),
        null,
        now,
        zone,
      ),
    ).toBe('Skipped: travel');
    expect(rowMeta(block({ status: 'SKIPPED' }), null, now, zone)).toBe(
      'Skipped',
    );
  });
  it('shows the context and the end for a block covering now, the length for one ahead', () => {
    expect(
      rowMeta(
        block({
          plannedStart: at('11:30'),
          plannedEnd: at('12:30'),
          description: 'Two pointers',
        }),
        null,
        now,
        zone,
      ),
    ).toBe('Two pointers · Until 12:30');
    expect(
      rowMeta(
        block({
          plannedStart: at('17:00'),
          plannedEnd: at('18:00'),
          category: 'DSA',
        }),
        null,
        now,
        zone,
      ),
    ).toBe('DSA · 1h');
    expect(
      rowMeta(
        block({ plannedStart: at('17:00'), plannedEnd: at('17:45') }),
        { company: 'Example Labs' },
        now,
        zone,
      ),
    ).toBe('Example Labs · 45 min');
  });
  it('counts a running session up to now and says "under a minute" only once it ended', () => {
    const running = block({
      status: 'IN_PROGRESS',
      plannedStart: at('11:00'),
      plannedEnd: at('13:00'),
      sessions: [session('11:40', null)],
    });
    expect(recordedMinutes(running, now)).toBe(20);
    expect(rowMeta(running, null, now, zone)).toBe('Personal · Until 13:00');
    expect(
      rowMeta(
        block({ sessions: [session('07:00', '07:00')] }),
        null,
        now,
        zone,
      ),
    ).toBe('under a minute recorded');
  });
  it('handles a block that crosses midnight', () => {
    const b = block({
      plannedStart: at('23:00'),
      plannedEnd: at('01:00', '2026-10-23'),
    });
    expect(blockResolution(b, now)).toBe('upcoming');
    expect(rowMeta(b, null, now, zone)).toBe('Personal · 2h');
  });
});

describe('blockFacts and factsLine', () => {
  it('counts each resolution once, leaves cancelled blocks out and omits zeros', () => {
    const facts = blockFacts(
      [
        block({ id: '1', status: 'COMPLETED' }),
        block({ id: '2' }),
        block({ id: '3', sessions: [session('07:00', '07:10')] }),
        block({ id: '4', status: 'CANCELLED' }),
        block({ id: '5', plannedStart: at('17:00'), plannedEnd: at('18:00') }),
      ],
      now,
    );
    expect(facts).toEqual({
      planned: 4,
      done: 1,
      skipped: 0,
      notRecorded: 1,
      needsUpdate: 1,
      plannedMinutes: 45 * 3 + 60,
    });
    expect(factsLine(facts)).toBe(
      '4 blocks planned · 1 done · 1 not recorded · 1 recorded, needs update · 3h 15m planned',
    );
  });
  it('reads "Nothing planned" for an empty day and the singular for one block', () => {
    expect(factsLine(blockFacts([], now))).toBe('Nothing planned');
    expect(
      factsLine(
        blockFacts(
          [block({ plannedStart: at('17:00'), plannedEnd: at('17:30') })],
          now,
        ),
      ),
    ).toBe('1 block planned · 30 min planned');
  });
});
