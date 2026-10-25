import { describe, expect, it } from 'vitest';
import {
  drillDeck,
  drillResult,
  familyOf,
  optionsFor,
  type DrillProblem,
  type DrillTopic,
} from '../src/features/drills/deck';

const names = [
  'Arrays & Hashing',
  'Two Pointers',
  'Sliding Window & Prefix Sum',
  'Stack & Monotonic Stack',
  'Binary Search',
  'Linked List',
  'Trees',
  'Graphs',
  '1-D Dynamic Programming',
];
const topics: DrillTopic[] = names.map((name, i) => ({
  id: `t${i}`,
  name,
  description: `Signal for ${name}.`,
}));
let n = 0;
const problem = (over: Partial<DrillProblem> = {}): DrillProblem => ({
  id: `p${n++}`,
  title: `Problem ${n}`,
  difficulty: 'MEDIUM',
  confidence: 'RED',
  attemptsCount: 0,
  lastAttemptedAt: null,
  topicId: 't1',
  ...over,
});
const day = '2026-10-27';

describe('Which Pattern? deck', () => {
  it('needs four problems and four topics', () => {
    expect(
      drillDeck([problem(), problem(), problem()], topics, day),
    ).toBeNull();
    expect(
      drillDeck(
        [problem(), problem(), problem(), problem()],
        topics.slice(0, 3),
        day,
      ),
    ).toBeNull();
  });

  it('puts Red, then Yellow, then unattempted, then the oldest seen first', () => {
    const green = (d: string) =>
      problem({
        confidence: 'GREEN',
        attemptsCount: 2,
        lastAttemptedAt: new Date(d),
      });
    const deck = drillDeck(
      [
        green('2026-10-20'),
        problem({ title: 'Fresh' }),
        problem({ confidence: 'YELLOW', attemptsCount: 1, title: 'Yellow' }),
        green('2026-09-01'),
        problem({ attemptsCount: 3, title: 'Red' }),
      ],
      topics,
      day,
    )!;
    expect(deck.map((c) => c.title)).toEqual([
      'Red',
      'Yellow',
      'Fresh',
      expect.any(String),
      expect.any(String),
    ]);
    expect(deck).toHaveLength(5);
  });

  it('stops at ten cards and is stable for a day', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      problem({ topicId: `t${i % names.length}` }),
    );
    const a = drillDeck(many, topics, day)!;
    expect(a).toHaveLength(10);
    expect(drillDeck(many, topics, day)).toEqual(a);
  });

  it('never offers the answer twice and prefers the same family', () => {
    for (const t of topics)
      for (let s = 0; s < 30; s++) {
        const options = optionsFor(t.name, topics, `${day}:${s}`);
        expect(options).toHaveLength(4);
        expect(new Set(options).size).toBe(4);
        expect(options.filter((o) => o === t.name)).toHaveLength(1);
      }
    const options = optionsFor('Two Pointers', topics, 'seed');
    const linear = options.filter(
      (o) => familyOf(o) === familyOf('Two Pointers'),
    );
    expect(linear).toHaveLength(4);
  });

  it('leaves empty topics that are not curriculum patterns out of the options', () => {
    const extra = [...topics, { id: 'x', name: 'Arrays', description: null }];
    const deck = drillDeck(
      Array.from({ length: 12 }, (_, i) => problem({ topicId: `t${i % 3}` })),
      extra,
      day,
    )!;
    expect(deck.flatMap((c) => c.options)).not.toContain('Arrays');
  });

  it('carries the topic’s signal for the reveal', () => {
    const deck = drillDeck(
      Array.from({ length: 4 }, () => problem({ topicId: 't4' })),
      topics,
      day,
    )!;
    expect(deck[0]).toMatchObject({
      answer: 'Binary Search',
      signal: 'Signal for Binary Search.',
    });
  });

  it('reports a count and the pairs mixed up, never a score', () => {
    expect(
      drillResult([
        { answer: 'Two Pointers', picked: 'Two Pointers' },
        { answer: 'Two Pointers', picked: 'Binary Search' },
        { answer: 'Two Pointers', picked: 'Binary Search' },
        { answer: 'Binary Search', picked: 'Two Pointers' },
        { answer: 'Graphs', picked: 'Trees' },
      ]),
    ).toEqual({
      line: '1 of 5',
      mixedUp: ['Binary Search ↔ Two Pointers', 'Graphs ↔ Trees'],
    });
  });
});
