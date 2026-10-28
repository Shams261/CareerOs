import { describe, expect, it } from 'vitest';
import { forToday, type ForTodayInput } from '../src/features/for-today/domain';
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
const problem = (
  id: string,
  over: Partial<ForTodayInput['problems'][number]> = {},
) => ({
  id,
  title: `Problem ${id}`,
  confidence: 'YELLOW',
  attemptsCount: 0,
  topicId: 'tp',
  topic: { name: 'Two Pointers' },
  ...over,
});
const base = (over: Partial<ForTodayInput> = {}): ForTodayInput => ({
  today,
  problemsDue: [],
  itemsDue: [],
  interviewRows: [],
  continueItem: null,
  problems: [],
  currentTopicId: 'tp',
  ...over,
});

describe('For today (WI-059)', () => {
  it('picks the oldest revision, what the next interview tests, and one problem, each with its reason', () => {
    const picks = forToday(
      base({
        problemsDue: [
          {
            id: 'p1',
            title: 'Two Sum',
            confidence: 'RED',
            nextRevisionAt: new Date('2026-10-26'),
          },
        ],
        itemsDue: [
          {
            id: 'i1',
            title: 'HTTP caching',
            section: 'Foundations',
            nextRevisionAt: new Date('2026-10-27'),
            roadmap: { id: 'r1', title: 'Backend engineering' },
          },
        ],
        interviewRows: [
          {
            label: 'Code review',
            format: 'CODE_REVIEW',
            done: 0,
            target: 1,
            interview: { company: 'Northwind Labs', on: '2026-10-30' },
            next: {
              id: 'i2',
              title: 'Code review drill',
              section: 'Drills',
              roadmapId: 'r2',
              roadmapTitle: 'Technical mastery',
              priority: 1,
            },
          },
        ],
        problems: [
          problem('p1', { attemptsCount: 2, confidence: 'RED' }),
          problem('p2'),
        ],
      }),
    );
    expect(picks.map((p) => [p.kind, p.title, p.reason, p.href])).toEqual([
      [
        'revise',
        'Revise Two Sum',
        'Revision overdue by 2 days · Red',
        '/dsa/p1',
      ],
      [
        'study',
        'Code review drill',
        'Northwind Labs code review on Oct 30 · P0',
        '/roadmap/r2?section=Drills#item-i2',
      ],
      // p1 is already the revision; the current topic's untried problem is next.
      [
        'problem',
        'Problem p2',
        'Current topic Two Pointers · not tried yet',
        '/dsa/p2',
      ],
    ]);
    expect(picks.map((p) => p.category)).toEqual(['DSA', 'TECHNICAL', 'DSA']);
  });

  it('falls back to the roadmap revision, the Continue item and Red from last time', () => {
    const picks = forToday(
      base({
        itemsDue: [
          {
            id: 'i1',
            title: 'HTTP caching',
            section: 'Foundations',
            nextRevisionAt: new Date('2026-10-28'),
            roadmap: { id: 'r1', title: 'Backend engineering' },
          },
        ],
        continueItem: {
          id: 'i3',
          title: 'Internet foundations',
          section: 'Week 1',
          roadmapId: 'r1',
          roadmapTitle: 'Backend engineering',
        },
        problems: [
          problem('p2'),
          problem('p3', { attemptsCount: 1, confidence: 'RED' }),
        ],
      }),
    );
    expect(picks.map((p) => [p.title, p.reason])).toEqual([
      ['Revise HTTP caching', 'Revision due today · Backend engineering'],
      ['Internet foundations', 'Next in Backend engineering'],
      ['Problem p3', 'Shaky last time · Two Pointers'],
    ]);
    expect(forToday(base())).toEqual([]);
  });
});

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
