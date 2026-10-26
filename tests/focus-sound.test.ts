import { describe, expect, it } from 'vitest';
import { appendNote, soundsLine } from '../src/features/execution/focus-domain';
import { brownNoise, pinkNoise, seamlessLoop } from '../src/lib/ambient';

/** A repeatable stand-in for Math.random. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const peak = (a: Float32Array) => Math.max(...Array.from(a, Math.abs));

describe('focus sound names', () => {
  it('names the sounds that played, in a fixed order, and drops anything else', () => {
    expect(soundsLine('brown rain')).toBe('Rain, Brown noise');
    expect(soundsLine('rain rain')).toBe('Rain');
    expect(soundsLine('off <b>x</b>')).toBe('');
    expect(soundsLine(undefined)).toBe('');
  });
  it('appends a Sound line after the existing notes', () => {
    expect(
      appendNote('Intention: Graphs\nLearned: BFS by levels', 'Sound', 'Rain'),
    ).toBe('Intention: Graphs\nLearned: BFS by levels\nSound: Rain');
    expect(appendNote(null, 'Sound', '')).toBeNull();
  });
});

describe('ambient noise', () => {
  it('makes a loop that stays within range and has no click at the seam', () => {
    const length = 48_000;
    for (const make of [brownNoise, pinkNoise]) {
      const loop = seamlessLoop(make(length + 4096, seeded()), length);
      expect(loop).toHaveLength(length);
      expect(peak(loop)).toBeCloseTo(0.9, 5);
      // The step from the last sample back to the first is no bigger than the steps inside.
      let largest = 0;
      for (let i = 1; i < length; i++)
        largest = Math.max(largest, Math.abs(loop[i] - loop[i - 1]));
      expect(Math.abs(loop[0] - loop[length - 1])).toBeLessThanOrEqual(largest);
    }
  });
  it('keeps brown noise darker than pink noise (smaller sample-to-sample steps)', () => {
    const step = (a: Float32Array) => {
      let sum = 0;
      for (let i = 1; i < a.length; i++) sum += Math.abs(a[i] - a[i - 1]);
      return sum / (a.length - 1);
    };
    const length = 48_000;
    const brown = seamlessLoop(brownNoise(length + 4096, seeded(3)), length);
    const pink = seamlessLoop(pinkNoise(length + 4096, seeded(3)), length);
    expect(step(brown)).toBeLessThan(step(pink) / 2);
  });
});
