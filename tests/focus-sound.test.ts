import { describe, expect, it } from 'vitest';
import { appendNote, soundsLine } from '../src/features/execution/focus-domain';
import {
  brown,
  brownNoise,
  highpass,
  lowpass,
  pinkNoise,
  rain,
  seamlessLoop,
} from '../src/lib/ambient';

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

describe('rain and brown noise (WI-069)', () => {
  const rate = 48_000;
  const length = rate * 2;
  const rms = (a: Float32Array) =>
    Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const correlation = (a: Float32Array, b: Float32Array) => {
    let ab = 0,
      aa = 0,
      bb = 0;
    for (let i = 0; i < a.length; i++) {
      ab += a[i] * b[i];
      aa += a[i] * a[i];
      bb += b[i] * b[i];
    }
    return ab / Math.sqrt(aa * bb);
  };
  it('rain is drops over a bed, in stereo, not one static', () => {
    const [left, right] = rain(length, rate, seeded(11)).map((c) =>
      seamlessLoop(c, length),
    );
    // Drops: the loudest moments stand far above the average level.
    expect(peak(left) / rms(left)).toBeGreaterThan(6);
    // Stereo: the two ears hear different drops.
    expect(correlation(left, right)).toBeLessThan(0.6);
    // Between drops there is still a bed: a quiet stretch is never silent.
    const quiet = Array.from(left.slice(0, 2000), Math.abs).sort(
      (a, b) => a - b,
    );
    expect(quiet[Math.floor(quiet.length / 2)]).toBeGreaterThan(0.002);
  });
  it('brown noise is deep and steady, darker than the raw walk', () => {
    const step = (a: Float32Array) => {
      let sum = 0;
      for (let i = 1; i < a.length; i++) sum += Math.abs(a[i] - a[i - 1]);
      return sum / (a.length - 1);
    };
    const [left, right] = brown(length, rate, seeded(5)).map((c) =>
      seamlessLoop(c, length),
    );
    const raw = seamlessLoop(brownNoise(length + 4096, seeded(5)), length);
    expect(step(left)).toBeLessThan(step(raw) / 4);
    expect(correlation(left, right)).toBeLessThan(0.3);
    // No drift: the loop sits around zero.
    expect(
      Math.abs(left.reduce((s, v) => s + v, 0) / left.length),
    ).toBeLessThan(0.02);
  });
  it('filters pass what they should', () => {
    const tone = (hz: number) =>
      Float32Array.from({ length: rate }, (_, i) =>
        Math.sin((2 * Math.PI * hz * i) / rate),
      );
    const low = lowpass(tone(50), 180, rate).slice(rate / 2);
    const high = lowpass(tone(2000), 180, rate).slice(rate / 2);
    expect(rms(low)).toBeGreaterThan(rms(high) * 5);
    const kept = highpass(tone(2000), 500, rate).slice(rate / 2);
    const cut = highpass(tone(20), 500, rate).slice(rate / 2);
    expect(rms(kept)).toBeGreaterThan(rms(cut) * 5);
  });
});
