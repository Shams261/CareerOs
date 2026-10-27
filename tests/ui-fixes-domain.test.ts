import { describe, expect, it } from 'vitest';
import { railRepeatsList } from '../src/features/attention/domain';
import {
  DAILY_REVIEW_TEXT,
  overdueText,
} from '../src/features/notifications/domain';
import { BANNED_WORDS } from '../src/features/nudges/domain';

describe('UI fixes (WI-049)', () => {
  it('says the Jobs rail repeats the list only for a short list it fully covers', () => {
    const rows = [
      { href: '/jobs/a' },
      { href: '/jobs/b#round-r1' },
      { href: '/jobs/a?tab=x' },
    ];
    expect(railRepeatsList(rows, ['a', 'b', 'c'], 5)).toBe(true);
    // A row about an application not shown here keeps the rail.
    expect(railRepeatsList(rows, ['a'], 5)).toBe(false);
    // A long list keeps the rail, which picks the few that matter.
    expect(railRepeatsList(rows, ['a', 'b', 'c', 'd', 'e', 'f'], 5)).toBe(
      false,
    );
    expect(railRepeatsList([], ['a'], 5)).toBe(false);
    expect(railRepeatsList([{ href: null }], ['a'], 5)).toBe(false);
    expect(railRepeatsList([{ href: '/jobsa' }], ['a'], 5)).toBe(false);
  });

  it('writes reminders as what is true now, never what was not done', () => {
    const texts = [
      DAILY_REVIEW_TEXT,
      overdueText('Graphs: BFS practice', '18:00', '19:30'),
    ];
    expect(texts[1]).toBe(
      'Graphs: BFS practice (18:00–19:30) has nothing recorded yet.',
    );
    for (const t of texts)
      for (const w of BANNED_WORDS) expect(t.toLowerCase()).not.toContain(w);
    expect(BANNED_WORDS).toContain('haven’t');
  });
});
