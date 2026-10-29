import { describe, expect, it } from 'vitest';
import {
  DAY_PARTS,
  QUOTES,
  dailyQuote,
  dayPart,
  greeting,
} from '../src/features/today/daily-line';
import { BANNED_WORDS } from '../src/features/nudges/domain';

describe('The daily line (WI-073, ADR-028)', () => {
  it('names the part of the day by the local hour', () => {
    expect([0, 4, 5, 11, 12, 16, 17, 20, 21, 23].map(dayPart)).toEqual([
      'night',
      'night',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
      'night',
    ]);
  });
  it('greets by first name, or without one', () => {
    expect(greeting('morning', 'Shams Tabrez')).toBe('Good morning, Shams.');
    expect(greeting('night', '  ')).toBe('Good night.');
    expect(greeting('evening', null)).toBe('Good evening.');
  });
  it('keeps one quotation for a day and a part, and Another steps through the pool', () => {
    const a = dailyQuote('2026-10-29', 'morning');
    expect(dailyQuote('2026-10-29', 'morning')).toEqual(a);
    expect(QUOTES.morning).toContainEqual(a);
    const seen = new Set(
      QUOTES.morning.map((_, i) => dailyQuote('2026-10-29', 'morning', i).text),
    );
    expect(seen.size).toBe(QUOTES.morning.length);
    // A different day or part usually reads differently.
    const others = DAY_PARTS.map((p) => dailyQuote('2026-10-30', p).text);
    expect(new Set(others).size).toBeGreaterThan(1);
  });
  it('every quotation is short, attributed and free of banned words', () => {
    for (const part of DAY_PARTS)
      for (const q of QUOTES[part]) {
        expect(q.text.split(/\s+/).length).toBeLessThanOrEqual(16);
        expect(q.by.length).toBeGreaterThan(0);
        for (const w of BANNED_WORDS)
          expect(q.text.toLowerCase()).not.toContain(w.toLowerCase());
      }
  });
});
