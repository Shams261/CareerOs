import { describe, expect, it } from 'vitest';
import { nextSlot } from '../src/features/today/domain';
import {
  publishFeedback,
  subscribeFeedback,
} from '../src/components/feedback-channel';

const zone = 'America/Toronto';

describe('Today fixes (WI-066)', () => {
  it('starts a new block at the next quarter hour today, never in the past', () => {
    // 21:07 in Toronto on 28 October 2026 (UTC−4).
    const now = new Date('2026-10-29T01:07:00Z');
    expect(nextSlot(now, zone, '2026-10-28')).toEqual({
      start: '21:15',
      end: '21:45',
    });
    // On a quarter hour it moves to the next one.
    expect(
      nextSlot(new Date('2026-10-29T01:15:00Z'), zone, '2026-10-28').start,
    ).toBe('21:30');
    // Late at night it stops before midnight; another day keeps the morning default.
    expect(
      nextSlot(new Date('2026-10-29T03:50:00Z'), zone, '2026-10-28'),
    ).toEqual({
      start: '23:30',
      end: '23:59',
    });
    expect(nextSlot(now, zone, '2026-10-30')).toEqual({
      start: '09:00',
      end: '10:00',
    });
    // A block at 21:15–22:00 is skipped: the first free half hour is 22:00.
    expect(
      nextSlot(now, zone, '2026-10-28', [
        {
          start: new Date('2026-10-29T01:15:00Z'),
          end: new Date('2026-10-29T02:00:00Z'),
        },
      ]),
    ).toEqual({ start: '22:00', end: '22:30' });
  });

  it('shows the last result again to the outlet that mounts after the page changes', () => {
    const seen: string[] = [];
    const stop = subscribeFeedback('wi066', (f) =>
      seen.push(`a:${f.state.message}`),
    );
    publishFeedback('wi066', { ok: true, message: 'Deleted Graphs.' });
    stop();
    // The old outlet left with its layout; the new one gets the message, Undo with it.
    const stop2 = subscribeFeedback('wi066', (f) =>
      seen.push(`b:${f.state.message}`),
    );
    stop2();
    expect(seen).toEqual(['a:Deleted Graphs.', 'b:Deleted Graphs.']);
  });
});
