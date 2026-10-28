import { describe, expect, it } from 'vitest';
import { CONFIDENCE_WORD, confidenceWord } from '../src/features/dsa/words';
import { STATUS_FILTERS } from '../src/features/dsa/domain';
import { BANNED_WORDS } from '../src/features/nudges/domain';

describe('WI-063 plain words', () => {
  it('says how sure the owner is instead of a colour', () => {
    expect(confidenceWord('RED')).toBe('Shaky');
    expect(confidenceWord('YELLOW')).toBe('Okay');
    expect(confidenceWord('GREEN')).toBe('Solid');
  });

  it('uses the same words in the Practice filter', () => {
    expect(STATUS_FILTERS.RED).toBe(CONFIDENCE_WORD.RED);
    expect(STATUS_FILTERS.YELLOW).toBe(CONFIDENCE_WORD.YELLOW);
    expect(STATUS_FILTERS.GREEN).toBe(CONFIDENCE_WORD.GREEN);
  });

  it('keeps the words out of the banned list', () => {
    for (const word of Object.values(CONFIDENCE_WORD))
      expect(
        BANNED_WORDS.some((b) => word.toLowerCase().includes(b.toLowerCase())),
      ).toBe(false);
  });
});
