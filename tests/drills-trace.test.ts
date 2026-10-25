import { describe, expect, it } from 'vitest';
import {
  bruteForce,
  parseInput,
  trace,
  traceForTopic,
  TRACES,
  type TraceKind,
} from '../src/features/drills/trace';

/** A seeded generator, so a failure can be replayed. */
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const kinds = Object.keys(TRACES) as TraceKind[];

describe('Watch It Run tracers', () => {
  for (const kind of kinds)
    it(`${kind} agrees with brute force on 200 random inputs`, () => {
      const next = rng(kinds.indexOf(kind) + 1);
      for (let n = 0; n < 200; n++) {
        const length = 1 + Math.floor(next() * 12);
        let input = Array.from({ length }, () =>
          kind === 'two-pointers'
            ? Math.floor(next() * 20)
            : Math.floor(next() * 21) - 10,
        );
        if (kind === 'two-pointers' && input.length < 2) input.push(3);
        if (kind === 'binary-search') input = input.sort((a, b) => a - b);
        const target = Math.floor(next() * 25) - 12;
        const t = trace(kind, input, target);
        expect(t.answer, JSON.stringify({ input, target })).toBe(
          bruteForce[kind](input, target),
        );
        expect(t.steps.length).toBeGreaterThan(0);
        for (const s of t.steps) {
          expect(s.narration.length).toBeGreaterThan(10);
          for (const at of Object.values(s.marks))
            expect(at).toBeGreaterThanOrEqual(0);
        }
      }
    });

  it('traces the samples with plain narration', () => {
    const t = trace('two-pointers', TRACES['two-pointers'].sample);
    expect(t.answer).toBe('49');
    expect(t.steps[0].narration).toMatch(/widest pair/);
    expect(t.steps.at(-1)!.narration).toBe(
      'The pointers met. The largest area is 49.',
    );
    const b = trace(
      'binary-search',
      TRACES['binary-search'].sample,
      TRACES['binary-search'].target,
    );
    expect(b.answer).toBe('5');
    expect(trace('monotonic-stack', [2, 1, 5]).answer).toBe('5 5 -1');
    expect(trace('sliding-window', [1, 2, 1, 3]).answer).toBe('3');
  });

  it('maps only the four traced patterns', () => {
    expect(traceForTopic('Two Pointers')).toBe('two-pointers');
    expect(traceForTopic('Sliding Window & Prefix Sum')).toBe('sliding-window');
    expect(traceForTopic('Binary Search')).toBe('binary-search');
    expect(traceForTopic('Stack & Monotonic Stack')).toBe('monotonic-stack');
    for (const other of ['Graphs', 'Trees', 'Arrays & Hashing', 'Stack'])
      expect(traceForTopic(other)).toBeNull();
  });

  it('validates the owner’s numbers', () => {
    expect(parseInput('3, 1 4', 'sliding-window')).toEqual({
      values: [3, 1, 4],
    });
    expect(parseInput('9 2 5', 'binary-search')).toEqual({ values: [2, 5, 9] });
    expect(parseInput('', 'sliding-window').error).toMatch(/Type a few/);
    expect(parseInput('1 '.repeat(13), 'sliding-window').error).toMatch(
      /Up to 12/,
    );
    expect(parseInput('1.5, 2', 'sliding-window').error).toMatch(/Whole/);
    expect(parseInput('100', 'sliding-window').error).toMatch(/-99 to 99/);
    expect(parseInput('3, -1', 'two-pointers').error).toMatch(/negative/);
    expect(parseInput('3', 'two-pointers').error).toMatch(/two heights/);
  });
});
