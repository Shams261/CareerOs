import { describe, expect, it } from 'vitest';
import {
  blockResolution,
  resolutionText,
  rowMeta,
  type RowBlock,
} from '../src/features/schedule/row';
import { agendaEntries, groupAgenda } from '../src/features/today/domain';
import { leftKind } from '../src/features/close-day/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const at = (time: string) => localInstant('2026-10-22', time, zone);
const now = at('12:00');
const block = (over: Partial<RowBlock> = {}): RowBlock => ({
  id: 'b1',
  title: 'Pause check',
  category: 'DSA',
  status: 'PLANNED',
  plannedStart: at('11:30'),
  plannedEnd: at('12:30'),
  interviewRoundId: null,
  sessions: [],
  ...over,
});
const part = (start: string, end: string, id: string) => ({
  id,
  startedAt: at(start),
  endedAt: at(end),
});

describe('Pause and Resume (WI-067)', () => {
  // Started, paused, resumed, paused again: two parts, 9 minutes, the slot still open.
  const paused = block({
    sessions: [part('11:31', '11:35', 'a'), part('11:40', '11:45', 'b')],
  });

  it('reads a block with recorded time and an open slot as Paused, with the time so far', () => {
    expect(blockResolution(paused, now)).toBe('paused');
    expect(resolutionText.paused).toBe('Paused');
    expect(rowMeta(paused, null, now, zone)).toBe('9 min so far · Until 12:30');
    // Once the slot is over it is a past block that needs a decision, as before.
    expect(blockResolution(paused, at('12:31'))).toBe('needs-update');
    // A running session is still In session; a fresh block is still Now.
    expect(blockResolution(block({ status: 'IN_PROGRESS' }), now)).toBe(
      'in-progress',
    );
    expect(blockResolution(block(), now)).toBe('current');
  });

  it('keeps a paused block in Now, even when its slot starts later', () => {
    const early = block({
      plannedStart: at('15:00'),
      plannedEnd: at('16:00'),
      sessions: [part('11:31', '11:35', 'c')],
    });
    const g = groupAgenda(agendaEntries([early], []), now, true);
    expect(g.now).toHaveLength(1);
    expect(g.later).toHaveLength(0);
    // A completed block with recorded time stays Earlier only.
    const done = block({ status: 'COMPLETED', sessions: paused.sessions });
    const d = groupAgenda(agendaEntries([done], []), now, true);
    expect([d.earlier.length, d.now.length]).toEqual([1, 0]);
  });

  it('lets Close the Day treat a paused block as recorded: Done or Let go, never moved', () => {
    expect(leftKind(paused, now)).toBe('recorded');
  });
});
