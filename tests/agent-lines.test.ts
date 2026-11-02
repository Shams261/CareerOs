import { describe, expect, it } from 'vitest';
import {
  LINE_FORMAT,
  LINE_MAX,
  LINE_READS,
  lineMessages,
  lineOk,
  readLine,
  readText,
  rumiStateOf,
  SHAMING_WORDS,
} from '../src/features/agent/line-domain';
import { lineHeading } from '../src/features/agent/text';
import { PERSONA, TOOLS } from '../src/features/agent/domain';
import {
  MIDDAY_LINES,
  middayBody,
  recapBody,
} from '../src/features/nudges/domain';
import { BANNED_WORDS } from '../src/lib/copy';
import { LOCK_SCREEN_TEXT } from '../src/features/push/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const day = '2026-11-03';
const at = (time: string) => localInstant(day, time, zone);
const reads = JSON.stringify({
  day,
  blocks: [{ start: '18:00', end: '19:30', title: 'Two pointers practice' }],
  recorded: { minutes: 45, sessions: 2 },
});

describe('lineOk (WI-101)', () => {
  it('accepts a short plain line whose numbers all come from the reads', () => {
    expect(
      lineOk(
        'Two pointers practice is at 18:00; 45 minutes are already recorded today. Begin with the first problem.',
        reads,
      ),
    ).toEqual({ ok: true });
  });
  it('rejects an invented number, even one close to the data', () => {
    expect(lineOk('You recorded 50 minutes today.', reads)).toEqual({
      ok: false,
      code: 'number',
    });
    expect(lineOk('Three blocks wait, 3 of them study.', reads).ok).toBe(false);
  });
  it('rejects every banned and shaming word, in any case', () => {
    for (const w of [...BANNED_WORDS, ...SHAMING_WORDS])
      expect(lineOk(`You ${w.toUpperCase()} it.`, reads).ok).toBe(false);
  });
  it('rejects length, markup, links, emoji and more than two sentences', () => {
    expect(lineOk('a'.repeat(LINE_MAX + 1), reads)).toMatchObject({
      code: 'too_long',
    });
    expect(lineOk('**Start** now.', reads)).toMatchObject({ code: 'markup' });
    expect(lineOk('- Start now.', reads)).toMatchObject({ code: 'markup' });
    expect(lineOk('Start now.\nThen rest.', reads)).toMatchObject({
      code: 'markup',
    });
    expect(lineOk('See https://example.com now.', reads)).toMatchObject({
      code: 'url',
    });
    expect(lineOk('Start now 🚀', reads)).toMatchObject({ code: 'emoji' });
    expect(lineOk('One. Two. Three.', reads)).toMatchObject({
      code: 'sentences',
    });
    // A clock time never counts as a sentence end.
    expect(lineOk('Practice is at 18:00. Begin then.', reads).ok).toBe(true);
    expect(lineOk('   ', reads)).toMatchObject({ code: 'empty' });
  });
});

describe('readLine and the format', () => {
  const read = readLine(reads);
  it('reads the strict object and applies the line rules', () => {
    expect(read(JSON.stringify({ line: ' Begin at 18:00. ' }))).toEqual({
      ok: true,
      value: 'Begin at 18:00.',
    });
    expect(read('not json')).toMatchObject({ ok: false, codes: 'json' });
    expect(read(JSON.stringify({ line: 'x', extra: 1 }))).toMatchObject({
      codes: 'shape',
    });
    expect(read(JSON.stringify({ line: 'You missed it.' }))).toMatchObject({
      codes: 'banned',
    });
  });
  it('asks for one short line and names the schema', () => {
    expect(LINE_FORMAT.name).toBe('line');
    expect(LINE_FORMAT.maxTokens).toBeLessThanOrEqual(150);
    expect(LINE_FORMAT.schema).toMatchObject({
      required: ['line'],
      additionalProperties: false,
    });
  });
});

describe('the prompt', () => {
  const messages = lineMessages({
    part: 'morning',
    persona: PERSONA,
    style: 'warm',
    language: 'hinglish',
    today: day,
    weekday: 'Tuesday',
    time: '08:05',
    name: 'Shams',
    goal: 'Backend role, by 2027-01-15',
    memory: ['Habit: Rest day is Saturday'],
    reads: { get_today: reads },
  });
  it('carries the persona, the rules, the style and the language, then the reads as data', () => {
    const [system, user] = messages;
    expect(system.role).toBe('system');
    expect(system.content).toContain(PERSONA);
    expect(system.content).toContain(`${LINE_MAX} characters`);
    expect(system.content).toContain('Hinglish');
    expect(system.content).toContain('Tone: warm');
    for (const w of BANNED_WORDS) expect(system.content).toContain(w);
    const data = JSON.parse(user.content);
    expect(data).toMatchObject({
      part: 'morning',
      ownerFirstName: 'Shams',
      goal: 'Backend role, by 2027-01-15',
      keepInMind: ['Habit: Rest day is Saturday'],
    });
    expect(data.data.get_today).toBe(reads);
    expect(user.content).not.toContain('notes');
  });
  it('stays under a small budget', () => {
    const chars = messages.reduce((n, m) => n + m.content.length, 0);
    expect(chars).toBeLessThan(4000);
  });
  it('reads only read-only tools the chat also has, and cuts each read', () => {
    const names = new Set(TOOLS.map((t) => t.function.name));
    for (const part of ['morning', 'midday', 'evening'] as const)
      for (const [name] of LINE_READS[part])
        expect(
          names.has(name as (typeof TOOLS)[number]['function']['name']),
        ).toBe(true);
    expect(LINE_READS.midday).toHaveLength(1);
    expect(readText({ long: 'x'.repeat(5000) }).length).toBeLessThanOrEqual(
      3001,
    );
  });
});

describe('fallbacks and the lock screen', () => {
  const block = {
    title: 'Two pointers practice',
    plannedStart: at('18:00'),
    plannedEnd: at('19:30'),
  };
  it('writes the afternoon and evening templates from facts, free of banned words', () => {
    const midday = middayBody(block, at('13:05'), day, zone);
    expect(midday).toMatch(
      /Next: 18:00–19:30 Two pointers practice, in 4 h 55 min\.$/,
    );
    expect(middayBody(block, at('17:40'), day, zone)).toMatch(/in 20 min\.$/);
    expect(recapBody(45, null, block, day, zone)).toBe(
      '45 min of study recorded today. Tomorrow starts with 18:00–19:30 Two pointers practice.',
    );
    expect(recapBody(0, null, null, day, zone)).toBe(
      'No study block was planned today.',
    );
    expect(recapBody(0, block, null, day, zone)).toMatch(
      /Left today: 18:00–19:30 Two pointers practice\.$/,
    );
    for (const text of [
      midday,
      ...MIDDAY_LINES,
      LOCK_SCREEN_TEXT.STUDY_MIDDAY,
      recapBody(0, block, block, day, zone),
    ])
      for (const w of [...BANNED_WORDS, ...SHAMING_WORDS])
        expect(text.toLowerCase()).not.toContain(w);
  });
  it('keeps the lock screen general and reads the row state', () => {
    expect(LOCK_SCREEN_TEXT.STUDY_MIDDAY).toBe(
      'Rumi has a line for the afternoon.',
    );
    expect(rumiStateOf({ rumi: 'written', blockId: 'b' })).toBe('written');
    expect(rumiStateOf({ blockId: 'b' })).toBeNull();
    expect(rumiStateOf(null)).toBeNull();
    expect(lineHeading('midday', 'Rumi')).toBe('Rumi · Afternoon');
  });
});
