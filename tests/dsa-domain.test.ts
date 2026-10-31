import { describe, expect, it } from 'vitest';
import {
  attemptInput,
  ladderLine,
  ladderState,
  learningState,
  markRevised,
  nextProblemFor,
  problemNoteLine,
  revisionQueue,
  settleLadder,
  startLadder,
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
    const next = startLadder('2026-03-08').nextRevisionAt;
    expect(next.toISOString().slice(0, 10)).toBe('2026-03-11');
    expect(
      +localInstant('2026-03-09', '00:00', 'America/Toronto') -
        +localInstant('2026-03-08', '00:00', 'America/Toronto'),
    ).toBe(23 * 3600000);
    expect(
      startLadder('2026-11-01').nextRevisionAt.toISOString().slice(0, 10),
    ).toBe('2026-11-04');
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

describe('An imported problem’s notes on screen (WI-093)', () => {
  it('keeps the number and the companies, names the list as one word, drops the source', () => {
    expect(
      problemNoteLine(
        'LeetCode 217 · Companies (Prashad): Google, Amazon, Meta · Core list (Arrays & Hashing)',
      ),
    ).toEqual({
      line: 'LeetCode 217 · Companies: Google, Amazon, Meta',
      list: 'core',
    });
    expect(
      problemNoteLine(
        'LeetCode 617 · Companies (Prashad):  · More practice (Trees), from the Prashad list',
      ),
    ).toEqual({ line: 'LeetCode 617', list: 'more' });
    expect(problemNoteLine('LeetCode 110 · Core list (Trees)')).toEqual({
      line: 'LeetCode 110',
      list: 'core',
    });
    expect(problemNoteLine('My own note')).toEqual({
      line: 'My own note',
      list: null,
    });
    expect(problemNoteLine(null)).toEqual({ line: null, list: null });
  });
});

describe('The revision ladder (WI-094)', () => {
  const label = (d: string) => d.slice(5);
  const started = (over: Partial<Parameters<typeof ladderState>[0]> = {}) => ({
    attemptsCount: 1,
    ...startLadder('2026-10-31'),
    ...over,
  });
  it('starts three steps 3, 7 and 14 days from the solve day', () => {
    const l = ladderState(started(), '2026-10-31');
    expect(l.state).toBe('upcoming');
    expect(l.steps.map((s) => s.due)).toEqual([
      '2026-11-03',
      '2026-11-07',
      '2026-11-14',
    ]);
    expect(ladderLine(l, label)).toBe('1 of 3 · 11-03');
    expect(ladderLine(ladderState(started(), '2026-11-03'), label)).toBe(
      'Revision 1 of 3 · Due today',
    );
  });
  it('marks a step revised and keeps the later days from the start', () => {
    const one = { ...started(), ...markRevised(started()) };
    expect(one.revisionOutcomes).toEqual(['revised']);
    expect(one.nextRevisionAt!.toISOString().slice(0, 10)).toBe('2026-11-07');
    const two = { ...one, ...markRevised(one) };
    const three = { ...two, ...markRevised(two) };
    expect(three.nextRevisionAt).toBeNull();
    const l = ladderState(three, '2026-11-20');
    expect(l.state).toBe('finished');
    expect(ladderLine(l, label)).toBe('Revised 3 of 3');
    expect(() => markRevised(three)).toThrow('No revision is open');
  });
  it('settles a passed step as missed, never overdue, and several at once after days away', () => {
    expect(settleLadder(started(), '2026-11-03')).toBeNull();
    const one = settleLadder(started(), '2026-11-04')!;
    expect(one.revisionOutcomes).toEqual(['missed']);
    expect(one.nextRevisionAt!.toISOString().slice(0, 10)).toBe('2026-11-07');
    const l = ladderState({ ...started(), ...one }, '2026-11-05');
    expect(l.missed).toEqual([1]);
    expect(ladderLine(l, label)).toBe('2 of 3 · 11-07 · missed 1');
    const all = settleLadder(started(), '2026-11-20')!;
    expect(all.revisionOutcomes).toEqual(['missed', 'missed', 'missed']);
    expect(all.nextRevisionAt).toBeNull();
    expect(
      ladderLine(ladderState({ ...started(), ...all }, '2026-11-20'), label),
    ).toBe('Missed 3 of 3');
    expect(
      learningState(
        { id: 'p', ...started(), ...all, confidence: 'RED' },
        '2026-11-20',
      ),
    ).toBe('unscheduled');
  });
  it('a problem attempted before the ladder, or never, has no steps', () => {
    expect(
      ladderState(
        {
          attemptsCount: 2,
          nextRevisionAt: null,
          revisionStartedOn: null,
          revisionOutcomes: [],
        },
        '2026-11-01',
      ).state,
    ).toBe('none');
    expect(
      ladderState(
        {
          attemptsCount: 0,
          nextRevisionAt: null,
          revisionStartedOn: null,
          revisionOutcomes: [],
        },
        '2026-11-01',
      ).state,
    ).toBe('unattempted');
  });
});

describe('Next problem (WI-094)', () => {
  const topics = [{ id: 'arrays' }, { id: 'pointers' }, { id: 'window' }];
  const p = (
    id: string,
    topicId: string,
    attempts = 0,
    last: string | null = null,
  ) => ({
    id,
    topicId,
    attemptsCount: attempts,
    lastAttemptedAt: last ? new Date(last) : null,
  });
  it('starts with the first topic, follows the latest attempt, moves on when a topic is done', () => {
    const list = [
      p('contains', 'arrays'),
      p('two-sum', 'arrays'),
      p('valid-pal', 'pointers'),
      p('three-sum', 'pointers'),
      p('max-sub', 'window'),
    ];
    expect(nextProblemFor(list, topics, null)?.id).toBe('contains');
    const afterOne = [
      p('contains', 'arrays', 1, '2026-10-31'),
      ...list.slice(1),
    ];
    expect(nextProblemFor(afterOne, topics, null)?.id).toBe('two-sum');
    const arraysDone = [
      p('contains', 'arrays', 1, '2026-10-31'),
      p('two-sum', 'arrays', 1, '2026-11-01'),
      ...list.slice(2),
    ];
    expect(nextProblemFor(arraysDone, topics, null)?.id).toBe('valid-pal');
    // The current topic wins while it has untried problems; the latest attempt otherwise.
    expect(nextProblemFor(afterOne, topics, 'window')?.id).toBe('max-sub');
    const latestInWindow = [
      p('contains', 'arrays', 1, '2026-10-31'),
      p('two-sum', 'arrays'),
      p('valid-pal', 'pointers'),
      p('three-sum', 'pointers'),
      p('max-sub', 'window', 1, '2026-11-02'),
      p('min-win', 'window'),
    ];
    expect(nextProblemFor(latestInWindow, topics, null)?.id).toBe('min-win');
    // The last topic done wraps to the first topic with untried problems.
    const lastDone = [
      p('contains', 'arrays'),
      p('max-sub', 'window', 1, '2026-11-02'),
    ];
    expect(nextProblemFor(lastDone, topics, null)?.id).toBe('contains');
    expect(
      nextProblemFor([p('a', 'arrays', 1, '2026-11-01')], topics, null),
    ).toBeNull();
  });
});

describe('Next problem keeps the core before More practice (WI-094)', () => {
  const topics = [{ id: 'arrays' }, { id: 'pointers' }];
  const p = (
    id: string,
    topicId: string,
    notes: string,
    attempts = 0,
    last: string | null = null,
  ) => ({
    id,
    topicId,
    notes,
    attemptsCount: attempts,
    lastAttemptedAt: last ? new Date(last) : null,
  });
  it('takes a Medium core problem before an Easy extra, and the next topic before the extras', () => {
    const list = [
      p('easy-more', 'arrays', 'More practice (Arrays)'),
      p('medium-core', 'arrays', 'Core list (Arrays)'),
      p('pal', 'pointers', 'Core list (Two Pointers)'),
      p('pal-more', 'pointers', 'More practice (Two Pointers)'),
    ];
    expect(nextProblemFor(list, topics, null)?.id).toBe('medium-core');
    const arraysCoreDone = [
      list[0],
      { ...list[1], attemptsCount: 1, lastAttemptedAt: new Date('2026-10-31') },
      list[2],
      list[3],
    ];
    expect(nextProblemFor(arraysCoreDone, topics, null)?.id).toBe('pal');
    const allCoreDone = [
      list[0],
      { ...list[1], attemptsCount: 1, lastAttemptedAt: new Date('2026-10-31') },
      { ...list[2], attemptsCount: 1, lastAttemptedAt: new Date('2026-11-01') },
      list[3],
    ];
    expect(nextProblemFor(allCoreDone, topics, null)?.id).toBe('pal-more');
  });
});
