import { describe, expect, it } from 'vitest';
import {
  HOME_COPY,
  QUIET_LINES,
  firstSteps,
  headerLine,
  weekProgress,
} from '../src/features/today/home';
import { BANNED_WORDS } from '../src/features/nudges/domain';

describe("Today's home (WI-065)", () => {
  it('cheers the day on from its facts, the same quiet line all day', () => {
    expect(headerLine({ completed: 3, planned: 3, day: '2026-10-28' })).toBe(
      "Today's plan is done. Well kept.",
    );
    expect(headerLine({ completed: 1, planned: 3, day: '2026-10-28' })).toBe(
      'One block done today. It counts.',
    );
    expect(headerLine({ completed: 2, planned: 4, day: '2026-10-28' })).toBe(
      '2 blocks done today. Keep the rhythm.',
    );
    const quiet = headerLine({ completed: 0, planned: 2, day: '2026-10-28' });
    expect(QUIET_LINES).toContain(quiet);
    expect(headerLine({ completed: 0, planned: 0, day: '2026-10-28' })).toBe(
      quiet,
    );
  });

  it('measures the week as blocks done of planned, with its milestone', () => {
    expect(weekProgress({ done: 0, planned: 0 })).toMatchObject({
      ratio: 0,
      milestone: 'none',
      line: 'Plan a few blocks and the week fills in here.',
    });
    expect(weekProgress({ done: 0, planned: 4 }).milestone).toBe('none');
    expect(weekProgress({ done: 1, planned: 4 })).toMatchObject({
      ratio: 0.25,
      milestone: 'first',
      line: 'One session in. That counts.',
    });
    expect(weekProgress({ done: 2, planned: 4 }).milestone).toBe('half');
    expect(weekProgress({ done: 5, planned: 4 })).toMatchObject({
      ratio: 1,
      milestone: 'done',
    });
  });

  it('counts the three first steps', () => {
    const r = firstSteps({ hasGoal: true, hasRoutine: false, hasFocus: true });
    expect(r.done).toBe(2);
    expect(r.steps.map((s) => s.key)).toEqual(['goal', 'times', 'focus']);
  });

  it('never uses a banned word: no streaks, no guilt', () => {
    for (const line of HOME_COPY)
      for (const word of BANNED_WORDS)
        expect(line.toLowerCase()).not.toContain(word.toLowerCase());
  });
});
