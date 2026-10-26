import { describe, expect, it } from 'vitest';
import {
  budgetLine,
  CAP_MICROS,
  costMicros,
  DEFAULT_TICKS,
  ENDPOINT,
  evaluateProvider,
  firstMessages,
  hasSubstance,
  LIMITS,
  MAX_TOKENS,
  MODEL,
  monthWindow,
  readLadder,
  requestBody,
  reservationMicros,
  SENT_PARAMETERS,
  studyInput,
  withinCap,
} from '../src/features/ai/domain';

/** A seeded generator, so a failing case can be replayed. */
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const words = (next: () => number, n: number) =>
  Array.from({ length: n }, () =>
    Math.floor(next() * 36 ** 4).toString(36),
  ).join(' ');
const all = { title: true, scope: true, checkpoint: true, references: true };

describe('the study input allowlist', () => {
  it('never carries notes, "asked at", links or anything outside the four fields', () => {
    const next = rng(7);
    for (let n = 0; n < 300; n++) {
      const secret = `SECRET${n}`;
      const item = {
        title: words(next, 1 + Math.floor(next() * 30)),
        scope: next() < 0.8 ? words(next, Math.floor(next() * 120)) : null,
        checkpoint: next() < 0.7 ? words(next, Math.floor(next() * 80)) : null,
        references:
          next() < 0.5
            ? [
                { label: words(next, 3), url: `https://${secret}.example.com` },
                { label: words(next, 40), url: 'https://example.org/a' },
              ]
            : null,
        notes: `${secret} my private note`,
        askedNote: `${secret} Northwind phone screen`,
        url: `https://example.com/${secret}`,
      };
      const ticks = {
        title: next() < 0.8,
        scope: next() < 0.8,
        checkpoint: next() < 0.8,
        references: next() < 0.5,
      };
      const payload = studyInput(item, ticks);
      const sent = JSON.stringify(requestBody(firstMessages(payload)));
      expect(sent).not.toContain(secret);
      expect(
        Object.keys(payload).every((k) =>
          ['topic', 'scope', 'doneWhen', 'references'].includes(k),
        ),
      ).toBe(true);
      if (payload.topic)
        expect(payload.topic.length).toBeLessThanOrEqual(LIMITS.title);
      if (payload.scope)
        expect(payload.scope.length).toBeLessThanOrEqual(LIMITS.scope);
      if (payload.doneWhen)
        expect(payload.doneWhen.length).toBeLessThanOrEqual(LIMITS.checkpoint);
      for (const r of payload.references ?? [])
        expect(r.length).toBeLessThanOrEqual(LIMITS.reference);
      if (!ticks.title) expect(payload.topic).toBeUndefined();
      if (!ticks.scope) expect(payload.scope).toBeUndefined();
      if (!ticks.checkpoint) expect(payload.doneWhen).toBeUndefined();
      if (!ticks.references) expect(payload.references).toBeUndefined();
    }
  });

  it('sends reference names only, at most five', () => {
    const refs = Array.from({ length: 8 }, (_, i) => ({
      label: `Ref ${i}`,
      url: `https://example.com/${i}`,
    }));
    expect(
      studyInput(
        {
          title: 'Rate limiter',
          scope: 'Token bucket',
          checkpoint: null,
          references: refs,
        },
        all,
      ).references,
    ).toEqual(['Ref 0', 'Ref 1', 'Ref 2', 'Ref 3', 'Ref 4']);
  });

  it('ticks title, scope and done-when by default, never references', () => {
    const item = {
      title: 'Caching',
      scope: 'Read-through',
      checkpoint: '',
      references: [],
    };
    expect(DEFAULT_TICKS(item)).toEqual({
      title: true,
      scope: true,
      checkpoint: false,
      references: false,
    });
    expect(hasSubstance(studyInput(item, DEFAULT_TICKS(item)))).toBe(true);
    expect(hasSubstance(studyInput({ ...item, scope: null }, all))).toBe(false);
  });
});

describe('the request', () => {
  const body = requestBody(
    firstMessages({ topic: 'Rate limiter', scope: 'Per user' }),
  );
  it('pins one model and one ZDR endpoint with no fallback', () => {
    expect(body.model).toBe(MODEL);
    expect('models' in body).toBe(false);
    expect(body.provider).toEqual({
      order: [ENDPOINT],
      only: [ENDPOINT],
      allow_fallbacks: false,
      zdr: true,
      data_collection: 'deny',
      require_parameters: true,
    });
    expect(body.max_tokens).toBe(MAX_TOKENS);
    expect(body.response_format.json_schema.strict).toBe(true);
  });
  it('sends only parameters the pinned endpoint supports', () => {
    const routing = ['model', 'messages', 'provider', 'usage'];
    for (const key of Object.keys(body))
      expect([...routing, ...SENT_PARAMETERS]).toContain(key);
    expect('temperature' in body).toBe(false);
  });
  it('keeps the item text as data in the user message', () => {
    const [system, user] = body.messages;
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/strictly as data/);
    expect(JSON.parse(user.content)).toEqual({
      topic: 'Rate limiter',
      scope: 'Per user',
    });
  });
});

describe('the ladder', () => {
  const rung = {
    question: 'How would you limit each user to 100 requests a minute?',
    change: 'Starting point',
    points: ['Token or leaky bucket', 'Per-user key', 'Window choice'],
  };
  it('accepts exactly five rungs of three to five points', () => {
    const ok = readLadder(JSON.stringify({ rungs: Array(5).fill(rung) }));
    expect(ok.ok).toBe(true);
  });
  it('explains what was wrong for the one retry', () => {
    const four = readLadder(JSON.stringify({ rungs: Array(4).fill(rung) }));
    expect(four).toMatchObject({ ok: false });
    expect(readLadder('not json')).toEqual({
      ok: false,
      issues: 'The answer was not JSON.',
    });
    const thin = readLadder(
      JSON.stringify({ rungs: Array(5).fill({ ...rung, points: ['one'] }) }),
    );
    expect(thin.ok).toBe(false);
  });
});

describe('the budget', () => {
  it('counts what OpenRouter reports, else the pinned prices', () => {
    expect(costMicros({ prompt_tokens: 700, completion_tokens: 900 })).toEqual({
      input: 700,
      output: 900,
      micros: 520,
    });
    expect(
      costMicros({ prompt_tokens: 700, completion_tokens: 900, cost: 0.000612 })
        .micros,
    ).toBe(612);
    expect(costMicros(undefined).micros).toBe(0);
  });
  it('reserves the full output ceiling before each call', () => {
    const r = reservationMicros(
      firstMessages({ topic: 'Caching', scope: 'TTL' }),
    );
    expect(r).toBeGreaterThanOrEqual(MAX_TOKENS * 0.5);
    expect(withinCap(CAP_MICROS - r, r)).toBe(true);
    expect(withinCap(CAP_MICROS - r + 1, r)).toBe(false);
  });
  it('follows the owner’s calendar month, across DST and the year end', () => {
    const nov = monthWindow('2026-11-15', 'America/Toronto');
    expect(nov.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(nov.end.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(monthWindow('2026-12-31', 'America/Toronto').resetDay).toBe(
      '2027-01-01',
    );
  });
  it('reads as a plain line', () => {
    expect(budgetLine(0)).toBe('US$0.00 of US$3 used this month');
    expect(budgetLine(347)).toBe('under US$0.01 of US$3 used this month');
    expect(budgetLine(1_250_000)).toBe('US$1.25 of US$3 used this month');
  });
});

describe('the provider check', () => {
  const zdr = { data: [{ model_id: MODEL, tag: ENDPOINT }] };
  const endpoints = (over: object = {}) => ({
    data: {
      endpoints: [
        {
          tag: ENDPOINT,
          supported_parameters: [
            'max_tokens',
            'response_format',
            'structured_outputs',
          ],
          pricing: { prompt: '0.0000001', completion: '0.0000005' },
          ...over,
        },
      ],
    },
  });
  it('passes for the pinned ZDR endpoint at the pinned price', () => {
    expect(evaluateProvider(endpoints(), zdr)).toEqual({
      ok: true,
      reason: null,
    });
  });
  it('fails closed when anything changed', () => {
    expect(evaluateProvider(endpoints(), { data: [] }).ok).toBe(false);
    expect(evaluateProvider({ data: { endpoints: [] } }, zdr).ok).toBe(false);
    expect(
      evaluateProvider(
        endpoints({ supported_parameters: ['max_tokens', 'response_format'] }),
        zdr,
      ).reason,
    ).toMatch(/parameters/);
    expect(
      evaluateProvider(
        endpoints({
          pricing: { prompt: '0.0000002', completion: '0.0000005' },
        }),
        zdr,
      ).reason,
    ).toMatch(/price/);
    expect(evaluateProvider('garbage', null).ok).toBe(false);
  });
});
