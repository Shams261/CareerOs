import { describe, expect, it } from 'vitest';
import { isFocusCategory } from '../src/lib/categories';

describe('isFocusCategory (WI-141)', () => {
  it("reads the owner's study kinds, DSA, Technical and job search as focus", () => {
    for (const c of ['DSA', 'Technical', 'Job search', 'INTERVIEW', 'Reading'])
      expect(isFocusCategory(c, ['Reading'])).toBe(true);
  });

  it('reads anything else as the rest of life, drawn quietly on Plan', () => {
    for (const c of ['Work', 'Gym', 'Errands'])
      expect(isFocusCategory(c, ['Reading'])).toBe(false);
  });
});
