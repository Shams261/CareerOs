import { describe, expect, it } from 'vitest';
import {
  factsLine,
  quietYesterday,
  recentFacts,
} from '../src/features/today/domain';
import { completedLine } from '../src/features/schedule/row';
import {
  openTemplates,
  ROUTINE_TEMPLATES,
} from '../src/features/schedule/templates';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const today = '2026-10-28';
const at = (d: string, t: string) => localInstant(d, t, zone);
describe('Facts on Today (WI-059)', () => {
  const block = (day: string, status = 'PLANNED', sessions = 0) => ({
    day,
    status,
    plannedStart: at(day, '07:00'),
    plannedEnd: at(day, '08:30'),
    sessions,
  });
  it('counts yesterday and the week as facts, and says when yesterday was quiet', () => {
    const facts = recentFacts({
      past: [
        block('2026-10-26', 'COMPLETED', 1),
        block('2026-10-27'),
        block('2026-10-27'),
        block('2026-10-27', 'CANCELLED'),
      ],
      todayBlocks: [
        {
          status: 'PLANNED',
          plannedStart: at(today, '20:00'),
          plannedEnd: at(today, '21:00'),
        },
      ],
      sessions: [
        {
          startedAt: at('2026-10-26', '07:00'),
          endedAt: at('2026-10-26', '08:15'),
        },
      ],
      monday: '2026-10-26',
      yesterday: '2026-10-27',
      now: at(today, '09:00'),
    });
    expect(facts.yesterday).toEqual({ planned: 2, recorded: 0 });
    expect(quietYesterday(facts)).toBe(true);
    expect(factsLine(facts)).toBe(
      'Yesterday: 0 of 2 blocks recorded · This week: 1h 15m recorded of 5h 30m planned',
    );
    // Nothing planned yesterday: no yesterday fact, and not quiet.
    const none = recentFacts({
      past: [],
      todayBlocks: [],
      sessions: [],
      monday: '2026-10-26',
      yesterday: '2026-10-27',
      now: at(today, '09:00'),
    });
    expect(quietYesterday(none)).toBe(false);
    expect(factsLine(none)).toBe('');
  });

  it('names the recorded time and the next block after Complete', () => {
    expect(completedLine(45, { title: 'System design', at: '20:00' })).toBe(
      'Done · 45 min recorded. Next: System design at 20:00.',
    );
    expect(completedLine(0, null)).toBe('Done. Nothing else is planned today.');
  });
});

describe('Routine templates (WI-059)', () => {
  it('offers the weekly interview mix and hides what the owner already has', () => {
    expect(ROUTINE_TEMPLATES.map((t) => t.title)).toEqual([
      'DSA practice',
      'System design',
      'Code review and bug squash',
      'Behavioural stories',
      'Job search',
    ]);
    expect(
      openTemplates([
        { title: 'DSA', category: 'DSA' },
        { title: 'behavioural  stories', category: 'PERSONAL' },
      ]).map((t) => t.key),
    ).toEqual(['system-design', 'code-review', 'job-search']);
  });
});
