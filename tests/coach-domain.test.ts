import { describe, expect, it } from 'vitest';
import {
  BANNED_WORDS,
  blockBody,
  blockStartDue,
  DEFAULT_NUDGES,
  eveningBody,
  morningBody,
  nudgeContext,
  nudgeInput,
  type NudgeDay,
} from '../src/features/nudges/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const day = '2026-10-27';
const at = (t: string, d = day) => localInstant(d, t, zone);
const setting = { ...DEFAULT_NUDGES, days: 127, blockStartEnabled: true };
const block = (id: string, from: string, to: string, extra = {}) => ({
  id,
  title: id === 'a' ? 'DSA practice' : 'System design',
  status: 'PLANNED',
  plannedStart: at(from),
  plannedEnd: at(to),
  recorded: false,
  ...extra,
});
const facts = (extra: Partial<NudgeDay> = {}): NudgeDay => ({
  studyBlocks: [block('a', '18:00', '19:30'), block('b', '20:00', '21:00')],
  studySessionToday: false,
  rested: false,
  closed: false,
  running: false,
  morningAt: null,
  eveningAt: null,
  blockNudged: [],
  ...extra,
});

describe('the block-start nudge (WI-039)', () => {
  it('is due once the chosen minutes have passed, and only while the block runs', () => {
    expect(blockStartDue(setting, facts(), at('18:14'), zone)).toBeNull();
    expect(blockStartDue(setting, facts(), at('18:15'), zone)?.id).toBe('a');
    expect(blockStartDue(setting, facts(), at('19:29'), zone)?.id).toBe('a');
    expect(
      blockStartDue(
        { ...setting, blockStartMinutes: 5 },
        facts(),
        at('18:05'),
        zone,
      )?.id,
    ).toBe('a');
  });
  it('stays silent when off, recorded, done, rested, closed, running, quiet or capped', () => {
    const now = at('18:20');
    expect(blockStartDue(DEFAULT_NUDGES, facts(), now, zone)).toBeNull();
    for (const d of [
      facts({
        studyBlocks: [block('a', '18:00', '19:30', { recorded: true })],
      }),
      facts({
        studyBlocks: [block('a', '18:00', '19:30', { status: 'SKIPPED' })],
      }),
      facts({ rested: true }),
      facts({ closed: true }),
      facts({ running: true }),
      facts({ blockNudged: ['b'] }),
    ])
      expect(blockStartDue(setting, d, now, zone)).toBeNull();
    expect(
      blockStartDue(
        { ...setting, quietStart: '18:00', quietEnd: '07:30' },
        facts(),
        now,
        zone,
      ),
    ).toBeNull();
    expect(
      blockStartDue({ ...setting, pausedUntil: day }, facts(), now, zone),
    ).toBeNull();
  });
});

describe('the coach copy (WI-039)', () => {
  const a = block('a', '18:00', '19:30');
  const b = block('b', '20:00', '21:00');
  it('states the day in facts', () => {
    expect(
      morningBody(
        [a, b],
        [
          {
            ...a,
            plannedStart: at('18:00', '2026-10-26'),
            plannedEnd: at('21:00', '2026-10-26'),
            title: 'Coding',
          },
        ],
        day,
        zone,
      ),
    ).toMatch(
      /^Today: 18:00–19:30 DSA practice · 20:00–21:00 System design\. Yesterday 18:00–21:00 Coding had no session recorded\. /,
    );
    expect(morningBody([], [], day, zone)).toMatch(
      /^No study blocks are planned today\. /,
    );
    expect(morningBody([a], [a, b], day, zone)).toContain(
      'Yesterday 2 study blocks had no session recorded.',
    );
    expect(eveningBody(a, b, day, zone)).toMatch(
      /Left today: 18:00–19:30 DSA practice\. Tomorrow starts with 20:00–21:00 System design\.$/,
    );
    expect(blockBody(a, at('18:15'), zone)).toBe(
      '18:00–19:30 DSA practice started 15 minutes ago and no session has begun yet. 75 minutes of it are left.',
    );
  });
  it('never uses a banned word', () => {
    const texts = [
      morningBody([a, b], [a], day, zone),
      morningBody([], [a, b], day, zone),
      eveningBody(a, null, day, zone),
      eveningBody(a, b, '2026-10-28', zone),
      blockBody(a, at('18:15'), zone),
    ];
    for (const t of texts)
      for (const w of BANNED_WORDS) expect(t.toLowerCase()).not.toContain(w);
  });
  it('shows the block-start setting and validates its offset', () => {
    expect(nudgeContext({ ...DEFAULT_NUDGES, blockStartEnabled: true })).toBe(
      'Block start +15 min · Weekdays',
    );
    const form = {
      morningEnabled: false,
      morningTime: '08:00',
      eveningEnabled: false,
      eveningTime: '19:30',
      days: 31,
      onlyStudyDays: true,
      quietStart: '22:00',
      quietEnd: '07:30',
      studyCategories: ['DSA'],
    };
    expect(nudgeInput.parse(form)).toMatchObject({
      blockStartEnabled: false,
      blockStartMinutes: 15,
    });
    expect(
      nudgeInput.parse({
        ...form,
        blockStartEnabled: true,
        blockStartMinutes: '10',
      }),
    ).toMatchObject({ blockStartEnabled: true, blockStartMinutes: 10 });
    expect(() => nudgeInput.parse({ ...form, blockStartMinutes: 7 })).toThrow();
  });
});
