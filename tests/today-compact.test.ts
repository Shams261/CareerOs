import { describe, expect, it } from 'vitest';
import { earlierFold, type AgendaEntry } from '../src/features/today/domain';

const now = new Date('2026-10-29T20:00:00Z');
const at = (iso: string) => new Date(iso);
const block = (
  id: string,
  status: string,
  from: string,
  to: string,
  sessions: { from: string; to: string }[] = [],
): AgendaEntry => ({
  kind: 'block',
  key: id,
  at: at(from),
  end: at(to),
  round: null,
  block: {
    id,
    title: id,
    category: 'DSA',
    status,
    plannedStart: at(from),
    plannedEnd: at(to),
    completedAt: status === 'COMPLETED' ? at(to) : null,
    skipReason: null,
    interviewRoundId: null,
    sessions: sessions.map((s, i) => ({
      id: `${id}-${i}`,
      startedAt: at(s.from),
      endedAt: at(s.to),
    })),
  } as AgendaEntry extends { block: infer B } ? B : never,
});

describe('Earlier, folded (WI-077)', () => {
  it('folds done and skipped rows into one line and keeps open rows out', () => {
    const entries = [
      block(
        'Morning DSA',
        'COMPLETED',
        '2026-10-29T09:00:00Z',
        '2026-10-29T09:30:00Z',
        [{ from: '2026-10-29T09:00:00Z', to: '2026-10-29T09:30:00Z' }],
      ),
      block(
        'Reading',
        'SKIPPED',
        '2026-10-29T11:00:00Z',
        '2026-10-29T11:30:00Z',
      ),
      block(
        'Not yet decided',
        'PLANNED',
        '2026-10-29T13:00:00Z',
        '2026-10-29T13:40:00Z',
      ),
    ];
    const fold = earlierFold(entries, now);
    expect(fold.folded.map((e) => e.key)).toEqual(['Morning DSA', 'Reading']);
    expect(fold.open.map((e) => e.key)).toEqual(['Not yet decided']);
    expect(fold.label).toBe('Earlier · 1 done · 1 skipped · 30 min recorded');
  });
  it('has no line when nothing is settled', () => {
    const fold = earlierFold(
      [
        block(
          'Open',
          'PLANNED',
          '2026-10-29T13:00:00Z',
          '2026-10-29T13:40:00Z',
        ),
      ],
      now,
    );
    expect(fold.folded).toEqual([]);
    expect(fold.label).toBe('');
  });
});
