import { describe, expect, it } from 'vitest';
import { readingLine, readLine } from '../src/features/agent/domain';
import { readTools } from '../src/features/agent/plan-domain';

describe('what Rumi read (WI-055)', () => {
  it('names the reads in plain words, once each, in the order used', () => {
    expect(readLine(['get_today', 'get_roadmaps', 'get_today'])).toBe(
      'Read: today, roadmaps',
    );
    expect(readLine(['get_activity', 'get_patterns', 'get_prep_docs'])).toBe(
      'Read: recorded activity, your patterns, prep docs',
    );
    // Cards and unknown names are not reads; an answer that read nothing shows no line.
    expect(readLine(['propose_blocks', 'suggest_memory', 'nope'])).toBeNull();
    expect(readLine([])).toBeNull();
  });

  it('says what it is reading while the answer is on its way', () => {
    expect(readingLine([])).toBe('Rumi is reading your records…');
    expect(readingLine(['get_jobs'])).toBe('Rumi is reading jobs…');
    expect(readingLine(['get_today', 'get_schedule'])).toBe(
      'Rumi is reading today, your schedule…',
    );
  });

  it('reads the tools from an answer’s stored metadata, ignoring anything else', () => {
    expect(readTools({ tools: ['get_today', 3, null], costMicros: 1 })).toEqual(
      ['get_today'],
    );
    expect(readTools(null)).toEqual([]);
    expect(readTools({ tools: 'get_today' })).toEqual([]);
  });
});
