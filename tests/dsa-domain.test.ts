import { describe, expect, it } from 'vitest';
import {
  attemptInput,
  revision,
  learningState,
  revisionQueue,
  todayDsaSummary,
} from '../src/features/dsa/domain';
import { dayKey, localInstant } from '../src/lib/time';
const day = '2026-09-24';
const problem = (
  id: string,
  confidence: 'RED' | 'YELLOW' | 'GREEN',
  date: string,
  attemptsCount = 1,
) => ({ id, confidence, nextRevisionAt: new Date(date), attemptsCount });
describe('DSA revision policy', () => {
  it('schedules Red tomorrow and resets all Green progression', () =>
    expect(revision('RED', 3, day)).toEqual({
      revisionStage: 0,
      nextRevisionAt: new Date('2026-09-25'),
      revisionManual: false,
    }));
  it('repositions Yellow to zero, due in three days', () =>
    expect(revision('YELLOW', 3, day)).toEqual({
      revisionStage: 0,
      nextRevisionAt: new Date('2026-09-27'),
      revisionManual: false,
    }));
  it('progresses Green 7/14/30 days and caps at 30', () => {
    expect(
      [0, 1, 2, 3].map((s) =>
        revision('GREEN', s, day).nextRevisionAt.toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-10-01', '2026-10-08', '2026-10-24', '2026-10-24']);
    expect(revision('GREEN', 3, day).revisionStage).toBe(3);
  });
  it.each([
    ['NO', 'GREEN', false],
    ['PARTIAL', 'GREEN', false],
    ['YES', 'RED', false],
    ['YES', 'GREEN', true],
    ['YES', 'YELLOW', true],
    ['PARTIAL', 'YELLOW', true],
    ['NO', 'RED', true],
    ['NO', 'YELLOW', true],
    ['PARTIAL', 'RED', true],
  ])('validates %s / %s', (solvedIndependently, confidenceAfter, valid) => {
    expect(
      attemptInput.safeParse({
        problemId: 'p',
        requestId: 'e5f10fdd-603d-4d04-979b-5501908f905a',
        solvedIndependently,
        confidenceAfter,
      }).success,
    ).toBe(valid);
  });
  it('uses Toronto calendar days across UTC midnight and DST', () => {
    expect(dayKey(new Date('2026-09-25T02:00:00Z'), 'America/Toronto')).toBe(
      day,
    );
    const next = revision('RED', 0, '2026-03-08').nextRevisionAt;
    expect(next.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(
      +localInstant('2026-03-09', '00:00', 'America/Toronto') -
        +localInstant('2026-03-08', '00:00', 'America/Toronto'),
    ).toBe(23 * 3600000);
    expect(
      revision('RED', 0, '2026-11-01')
        .nextRevisionAt.toISOString()
        .slice(0, 10),
    ).toBe('2026-11-02');
  });
  it('orders overdue by confidence, then today by confidence, oldest first', () => {
    const list = [
      problem('today-red', 'RED', day),
      problem('overdue-green', 'GREEN', '2026-09-20'),
      problem('overdue-yellow', 'YELLOW', '2026-09-21'),
      problem('overdue-red-new', 'RED', '2026-09-23'),
      problem('overdue-red-old', 'RED', '2026-09-22'),
      problem('future', 'RED', '2026-09-25'),
      problem('new', 'RED', '2026-09-01', 0),
    ];
    expect(revisionQueue(list, day).map((p) => p.id)).toEqual([
      'overdue-red-old',
      'overdue-red-new',
      'overdue-yellow',
      'overdue-green',
      'today-red',
    ]);
    expect(learningState(list[5], day)).toBe('upcoming');
    expect(learningState(list[6], day)).toBe('unattempted');
  });
  it('Today summary changes at local midnight, not UTC midnight', () => {
    const list = [problem('p', 'YELLOW', '2026-09-25')];
    expect(
      todayDsaSummary(list, new Date('2026-09-25T03:59:59Z'), 'America/Toronto')
        .queue,
    ).toHaveLength(0);
    expect(
      todayDsaSummary(list, new Date('2026-09-25T04:00:00Z'), 'America/Toronto')
        .yellow,
    ).toBe(1);
  });
});
