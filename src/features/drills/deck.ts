/**
 * Which Pattern? (WI-030): a ten-card drill built by code from the owner's own Practice
 * problems. Nothing here is generated and nothing is recorded as an attempt. Pure; covered by
 * tests/drills-deck.test.ts.
 */

export const DECK_SIZE = 10;
export const OPTIONS = 4;

/**
 * Pattern families from the DSA curriculum (`scripts/lib/dsa-curriculum.ts`): distractors
 * come from the same family first, so the choice is between patterns that look alike.
 */
const FAMILIES: string[][] = [
  [
    'Arrays & Hashing',
    'Two Pointers',
    'Sliding Window & Prefix Sum',
    'Stack & Monotonic Stack',
    'Binary Search',
  ],
  ['Linked List', 'Trees', 'Tries', 'Heap / Priority Queue'],
  ['Backtracking', 'Graphs'],
  ['1-D Dynamic Programming', '2-D Dynamic Programming', 'Greedy & Intervals'],
  ['Bit Manipulation & Math', 'Design a class'],
];
export const familyOf = (topic: string) =>
  FAMILIES.findIndex((f) => f.includes(topic));

/** FNV-1a: a stable order for a given day, so a refresh shows the same deck. */
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const bySeed =
  <T>(seed: string, key: (t: T) => string) =>
  (a: T, b: T) =>
    hash(`${seed}:${key(a)}`) - hash(`${seed}:${key(b)}`);

export type DrillProblem = {
  id: string;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  confidence: 'RED' | 'YELLOW' | 'GREEN';
  attemptsCount: number;
  lastAttemptedAt: Date | null;
  topicId: string;
};
export type DrillTopic = {
  id: string;
  name: string;
  description: string | null;
};
export type Card = {
  problemId: string;
  title: string;
  difficulty: DrillProblem['difficulty'];
  answer: string;
  signal: string | null;
  options: string[];
};

/**
 * The deck, in the plan's order: problems practised and still Red, then Yellow, then the
 * ones never attempted, then the oldest seen. Ties follow the day's seed. Null when there are
 * too few problems or topics for four options.
 */
export function drillDeck(
  problems: DrillProblem[],
  topics: DrillTopic[],
  day: string,
): Card[] | null {
  const named = new Map(topics.map((t) => [t.id, t]));
  const usable = problems.filter((p) => named.has(p.topicId));
  // Distractors are curriculum patterns or topics with the owner's own problems, never an
  // empty topic that only looks like a pattern.
  const pool = topics.filter(
    (t) => familyOf(t.name) >= 0 || usable.some((p) => p.topicId === t.id),
  );
  if (usable.length < OPTIONS || pool.length < OPTIONS) return null;
  const rank = (p: DrillProblem) =>
    !p.attemptsCount
      ? 2
      : p.confidence === 'RED'
        ? 0
        : p.confidence === 'YELLOW'
          ? 1
          : 3;
  const seeded = bySeed<DrillProblem>(day, (p) => p.id);
  const ordered = [...usable].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 3
        ? +(a.lastAttemptedAt ?? 0) - +(b.lastAttemptedAt ?? 0)
        : 0) ||
      seeded(a, b),
  );
  return ordered.slice(0, DECK_SIZE).map((p) => {
    const topic = named.get(p.topicId)!;
    return {
      problemId: p.id,
      title: p.title,
      difficulty: p.difficulty,
      answer: topic.name,
      signal: topic.description?.trim() || null,
      options: optionsFor(topic.name, pool, `${day}:${p.id}`),
    };
  });
}

/** The answer and three distractors (same family first), in the seed's order. */
export function optionsFor(answer: string, topics: DrillTopic[], seed: string) {
  const family = familyOf(answer);
  const others = [...new Set(topics.map((t) => t.name))].filter(
    (n) => n !== answer,
  );
  const near = others.filter((n) => family >= 0 && familyOf(n) === family);
  const far = others.filter((n) => !near.includes(n));
  const order = bySeed<string>(seed, (n) => n);
  const distractors = [...near.sort(order), ...far.sort(order)].slice(
    0,
    OPTIONS - 1,
  );
  return [answer, ...distractors].sort(bySeed<string>(`${seed}:o`, (n) => n));
}

export type Pick = { answer: string; picked: string };
/** "7 of 10" and the pairs mixed up, most frequent first ("Binary Search ↔ Two Pointers"). */
export function drillResult(picks: Pick[]) {
  const right = picks.filter((p) => p.picked === p.answer).length;
  const pairs = new Map<string, number>();
  for (const p of picks)
    if (p.picked !== p.answer) {
      // A mix-up is the same whichever way round it happened.
      const key = [p.answer, p.picked].sort().join(' ↔ ');
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  return {
    line: `${right} of ${picks.length}`,
    mixedUp: [...pairs.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([pair]) => pair),
  };
}
