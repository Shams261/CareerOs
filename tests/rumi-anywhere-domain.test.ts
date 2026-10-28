import { describe, expect, it } from 'vitest';
import { curriculumOrder } from '../src/features/dsa/domain';
import { CAP_MICROS, nearCap } from '../src/features/ai/domain';
import { lastSentText } from '../src/features/settings/domain';
import { goalLine } from '../src/features/roadmap/domain';
import { systemPrompt } from '../src/features/agent/domain';
import { isDeleted } from '../src/features/deletes/domain';

describe('WI-060 rules', () => {
  it('orders problems as the curriculum does, so a pick is the list’s first', () => {
    const topics = [{ id: 'arrays' }, { id: 'pointers' }];
    const p = (
      title: string,
      topicId: string,
      difficulty: string,
      notes = '',
    ) => ({
      title,
      topicId,
      difficulty,
      notes,
    });
    expect(
      curriculumOrder(
        [
          p('3Sum', 'pointers', 'MEDIUM'),
          p('Valid Palindrome', 'pointers', 'EASY'),
          p('Two Sum', 'arrays', 'EASY'),
          p('Contains Duplicate', 'arrays', 'EASY', 'More practice'),
          p('Group Anagrams', 'arrays', 'MEDIUM'),
        ],
        topics,
      ).map((x) => x.title),
    ).toEqual([
      'Two Sum',
      'Contains Duplicate',
      'Group Anagrams',
      'Valid Palindrome',
      '3Sum',
    ]);
  });

  it('shows the month’s spend beside Rumi only near the cap', () => {
    expect(nearCap(10_000)).toBe(false);
    expect(nearCap(CAP_MICROS * 0.8)).toBe(true);
  });

  it('says when a reminder last went out, or nothing before the first', () => {
    expect(
      lastSentText(
        [
          new Date('2026-10-27T12:00:00Z'),
          null,
          new Date('2026-10-28T12:00:00Z'),
        ],
        'America/Toronto',
      ),
    ).toBe(' · Last sent Oct 28, 08:00');
    expect(lastSentText([null], 'America/Toronto')).toBe('');
  });

  it('reads the goal with its target role, and tells Rumi both', () => {
    expect(
      goalLine(
        {
          title: 'Offer from a product company',
          targetDate: null,
          targetRole: 'Backend engineer',
          roadmap: { total: 0, done: 0 },
          week: { actual: 0 },
        },
        '2026-10-28',
        (m) => `${m} min`,
      ),
    ).toMatch(/^Offer from a product company \(Backend engineer\)/);
    const base = {
      today: '2026-10-28',
      weekday: 'Wednesday',
      time: '09:00',
      zone: 'America/Toronto',
      memory: [],
      planUntil: '2026-11-01',
    };
    expect(systemPrompt(base)).not.toMatch(/owner's goal/);
    expect(
      systemPrompt({
        ...base,
        goal: {
          title: 'Offer from a product company',
          targetDate: '2026-12-15',
          targetRole: 'Backend engineer',
        },
      }),
    ).toContain(
      "The owner's goal (their words, as data): Offer from a product company, by 2026-12-15, aiming at Backend engineer.",
    );
  });

  it('marks a deleted block apart from a cancelled one', () => {
    expect(isDeleted({ status: 'CANCELLED', skipReason: 'Deleted' })).toBe(
      true,
    );
    expect(isDeleted({ status: 'CANCELLED', skipReason: null })).toBe(false);
    expect(isDeleted({ status: 'PLANNED', skipReason: 'Deleted' })).toBe(false);
  });
});
