import { describe, expect, it } from 'vitest';
import {
  HINTS_FORMAT,
  hintMessages,
  looksLikeCode,
  problemInput,
  readHints,
  requestBody,
} from '../src/features/ai/domain';
import { revisionDeckRow } from '../src/features/attention/domain';

const hint = (h: string, focus = 'Pattern') => ({ focus, hint: h });
const five = (h = 'Think about which pairs you have already seen.') =>
  JSON.stringify({ hints: Array.from({ length: 5 }, () => hint(h)) });

describe('problem hints (WI-032)', () => {
  it('sends four short fields and nothing the owner wrote', () => {
    const payload = problemInput({
      title: 'Two Sum',
      difficulty: 'EASY',
      platform: 'LeetCode',
      topic: 'Arrays & Hashing',
    });
    expect(payload).toEqual({
      problem: 'Two Sum',
      difficulty: 'Easy',
      platform: 'LeetCode',
      topic: 'Arrays & Hashing',
    });
    const body = requestBody(hintMessages(payload), HINTS_FORMAT);
    expect(body.max_tokens).toBe(1000);
    expect(body.response_format.json_schema.name).toBe('hints');
    expect(body.provider).toMatchObject({ allow_fallbacks: false, zdr: true });
    expect(JSON.parse(body.messages[1].content)).toEqual(payload);
  });

  it('tells code from plain advice', () => {
    for (const plain of [
      'Read the problem again: you need two numbers that add up to the target.',
      'A hash map lets you check in constant time whether the partner exists.',
      'Return the indices once you find the pair; you only need one pass.',
      'If the input were sorted, two pointers would work.',
      'Return true if (and only if) some value appears twice.',
    ])
      expect(looksLikeCode(plain), plain).toBe(false);
    for (const code of [
      'Use `seen` as a map.',
      'for (let i = 0; i < n; i++)',
      'map[target - x] gives the index',
      'store x => i in a map',
      'check if diff == target',
      'const seen = new Map()',
      'def two_sum(nums, target):',
      'return seen.get(diff);',
    ])
      expect(looksLikeCode(code), code).toBe(true);
  });

  it('accepts five plain hints and rejects code, length and count', () => {
    expect(readHints(five()).ok).toBe(true);
    expect(
      readHints(five('Loop with for (i = 0; i < n; i++) over nums')).ok,
    ).toBe(false);
    expect(readHints(five('x'.repeat(300))).ok).toBe(false);
    expect(
      readHints(five(`${'A longer but plain hint. '.repeat(8)}`.trim())).ok,
    ).toBe(true);
    expect(
      readHints(
        JSON.stringify({ hints: [hint('Only one hint here for you.')] }),
      ).ok,
    ).toBe(false);
    expect(readHints('not json')).toEqual({
      ok: false,
      issues: 'The answer was not JSON.',
      codes: 'json',
    });
  });
});

describe('the revision deck row (WI-032)', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  it('appears only when due items hold kept cards', () => {
    expect(
      revisionDeckRow([{ nextRevisionAt: d('2026-10-26'), cards: 0 }]),
    ).toBeNull();
    expect(revisionDeckRow([{ nextRevisionAt: d('2026-10-26') }])).toBeNull();
    const row = revisionDeckRow([
      { nextRevisionAt: d('2026-10-26'), cards: 4 },
      { nextRevisionAt: d('2026-10-24'), cards: 2 },
      { nextRevisionAt: d('2026-10-25'), cards: 0 },
    ])!;
    expect(row).toMatchObject({
      title: 'Revision deck',
      context: '6 cards from 2 items due',
      href: '/roadmap/deck',
      tier: 3,
    });
    expect(row.due).toBeLessThan(+d('2026-10-24'));
    expect(
      revisionDeckRow([{ nextRevisionAt: d('2026-10-26'), cards: 1 }])!.context,
    ).toBe('1 card from 1 item due');
  });
});
