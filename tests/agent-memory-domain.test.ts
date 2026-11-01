import { describe, expect, it } from 'vitest';
import {
  expiryFor,
  extractionInput,
  extractionMessages,
  isActive,
  MEMORY,
  MEMORY_FORMAT,
  memoryContext,
  memoryLines,
  normaliseMemory,
  readMemories,
  sameMemory,
  shouldExtract,
  stalest,
} from '../src/features/agent/memory-domain';
import { PERSONA, STYLE_LINES } from '../src/features/agent/domain';
import { BANNED_WORDS } from '../src/features/nudges/domain';

const row = (
  text: string,
  kind: 'GOAL' | 'HABIT' | 'PREFERENCE' | 'SITUATION',
  extra: Partial<{
    source: 'OWNER' | 'RUMI';
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
  }> = {},
) => ({
  id: text,
  text,
  kind,
  source: extra.source ?? 'OWNER',
  expiresAt: extra.expiresAt ? new Date(extra.expiresAt) : null,
  lastUsedAt: extra.lastUsedAt ? new Date(extra.lastUsedAt) : null,
  createdAt: new Date(extra.createdAt ?? '2026-10-01T00:00:00Z'),
});

describe('what Rumi keeps (WI-100)', () => {
  it('gates the extraction: long enough, a statement, about the owner', () => {
    expect(shouldExtract('What is on today?')).toBe(false);
    expect(
      shouldExtract('I usually study best before 09:00 in the morning.'),
    ).toBe(true);
    expect(shouldExtract('plan tomorrow')).toBe(false);
    expect(
      shouldExtract('The weather in Toronto is cold in November, apparently.'),
    ).toBe(false);
    expect(
      shouldExtract('Mera rest day Saturday hota hai, usko mat chhuo kabhi.'),
    ).toBe(true);
    expect(
      shouldExtract(
        'I have an interview at Northwind on Wednesday, two prep items open?',
      ),
    ).toBe(false);
  });
  it('sends only the owner’s own last two messages, clipped', () => {
    const texts = extractionInput([
      { role: 'USER', content: 'first' },
      { role: 'ASSISTANT', content: 'Rumi said this; never sent' },
      { role: 'USER', content: 'second' },
      { role: 'ASSISTANT', content: '{"tool":"never"}' },
      { role: 'USER', content: 'x'.repeat(2000) },
    ]);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toBe('second');
    expect(texts[1]).toHaveLength(1000);
    const messages = extractionMessages(
      PERSONA,
      ['Rest day is Saturday'],
      texts,
    );
    expect(messages[0].content).toContain('Already on the list');
    expect(messages[0].content).not.toMatch(/never sent/);
    expect(messages[1].content).toBe(JSON.stringify({ ownerMessages: texts }));
    expect(MEMORY_FORMAT.name).toBe('memories');
  });
  it('reads the answer strictly', () => {
    expect(readMemories('not json').ok).toBe(false);
    expect(readMemories('{"memories":[]}')).toEqual({ ok: true, value: [] });
    const ok = readMemories(
      JSON.stringify({
        memories: [
          {
            kind: 'HABIT',
            text: 'Studies best before 09:00',
            expiresInDays: null,
          },
          {
            kind: 'SITUATION',
            text: 'Northwind code review on Wednesday',
            expiresInDays: 10,
          },
        ],
      }),
    );
    expect(ok.ok && ok.value.map((m) => m.kind)).toEqual([
      'HABIT',
      'SITUATION',
    ]);
    expect(
      readMemories(
        JSON.stringify({
          memories: [{ kind: 'MOOD', text: 'x', expiresInDays: null }],
        }),
      ).ok,
    ).toBe(false);
    expect(
      readMemories(
        JSON.stringify({
          memories: [
            { kind: 'GOAL', text: 'a'.repeat(201), expiresInDays: null },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(readMemories(JSON.stringify({ memories: [1, 2, 3] })).ok).toBe(
      false,
    );
  });
  it('dedupes by normalised text or a shared four fifths of the words', () => {
    expect(normaliseMemory('  Rest-day: Saturday. ')).toBe('rest day saturday');
    expect(sameMemory('Rest day is Saturday', 'rest day is saturday.')).toBe(
      true,
    );
    expect(
      sameMemory(
        'I study best before 09:00 in the morning',
        'Study best before 09:00 in the morning',
      ),
    ).toBe(true);
    expect(
      sameMemory('Rest day is Saturday', 'Interview at Northwind on Wednesday'),
    ).toBe(false);
  });
  it('gives situations and dated goals a day, keeps habits and preferences for good', () => {
    expect(expiryFor('SITUATION', '2026-10-31')).toBe('2026-11-30');
    expect(expiryFor('SITUATION', '2026-10-31', 10)).toBe('2026-11-10');
    expect(expiryFor('GOAL', '2026-10-31', 30)).toBe('2026-12-07');
    expect(expiryFor('GOAL', '2026-10-31')).toBeNull();
    expect(expiryFor('HABIT', '2026-10-31', 5)).toBeNull();
    expect(isActive({ expiresAt: new Date('2026-11-01') }, '2026-11-01')).toBe(
      true,
    );
    expect(isActive({ expiresAt: new Date('2026-11-01') }, '2026-11-02')).toBe(
      false,
    );
    expect(isActive({ expiresAt: null }, '2030-01-01')).toBe(true);
  });
  it('groups the active lines by kind for the prompt, situations with their day', () => {
    const lines = memoryLines(
      [
        row('Answer in Hinglish', 'PREFERENCE'),
        row('Ready for interviews by December', 'GOAL'),
        row('Northwind review on Wednesday', 'SITUATION', {
          expiresAt: '2026-11-10',
          source: 'RUMI',
        }),
        row('Old situation', 'SITUATION', { expiresAt: '2026-10-01' }),
        row('Mornings before 09:00', 'HABIT', { source: 'RUMI' }),
      ],
      '2026-10-31',
    );
    expect(lines).toEqual([
      'Goal: Ready for interviews by December',
      'Habit: Mornings before 09:00',
      'Preference: Answer in Hinglish',
      'Situation (until 2026-11-10): Northwind review on Wednesday',
    ]);
  });
  it('evicts the Rumi line sent least recently; the caps are 40 and 25', () => {
    expect(MEMORY).toEqual({ items: 40, rumi: 25, text: 200 });
    const gone = stalest([
      row('a', 'HABIT', { lastUsedAt: '2026-10-20T00:00:00Z' }),
      row('b', 'HABIT', {
        lastUsedAt: null,
        createdAt: '2026-10-05T00:00:00Z',
      }),
      row('c', 'HABIT', { lastUsedAt: '2026-10-28T00:00:00Z' }),
    ]);
    expect(gone?.text).toBe('b');
    expect(stalest([])).toBeNull();
  });
  it('names the Settings row and keeps the persona and styles clean', () => {
    expect(memoryContext([])).toBe('Nothing yet');
    expect(memoryContext([{ source: 'OWNER' }])).toBe('1 line');
    expect(
      memoryContext([
        { source: 'OWNER' },
        { source: 'RUMI' },
        { source: 'RUMI' },
      ]),
    ).toBe('3 lines · 2 by Rumi');
    // The styles never use a banned word; the persona names "streaks" only to forbid them.
    for (const text of Object.values(STYLE_LINES))
      for (const w of BANNED_WORDS) expect(text.toLowerCase()).not.toContain(w);
    expect(PERSONA).toMatch(/never count streaks or scores/);
    expect(PERSONA).toMatch(/first person/);
    expect(PERSONA).not.toMatch(/!/);
  });
});
