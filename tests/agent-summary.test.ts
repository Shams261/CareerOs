import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { lineOk, LINE_MAX } from '../src/features/agent/line-domain';
import {
  SUMMARY_MAX,
  summaryOn,
  weekSummary,
} from '../src/features/agent/summary';
import { keepWeekSummary } from '../src/features/review/service';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

describe('the review summary (WI-110, pure)', () => {
  it('holds a summary to its longer limit and the same checks', () => {
    const two =
      'A steady week of study with Graphs done on 3 evenings. Next week, keep the evening start.';
    expect(lineOk(two, 'done 3', SUMMARY_MAX)).toEqual({ ok: true });
    expect(lineOk('x'.repeat(LINE_MAX + 10), '', SUMMARY_MAX).ok).toBe(true);
    expect(lineOk('x'.repeat(SUMMARY_MAX + 1), '', SUMMARY_MAX)).toEqual({
      ok: false,
      code: 'too_long',
    });
    expect(lineOk('You did 12 blocks.', 'done 3', SUMMARY_MAX)).toEqual({
      ok: false,
      code: 'number',
    });
  });
});

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
// Sunday 1 November 2026: the week of Monday 26 October.
const now = localInstant('2026-11-01', '18:00', zone);
const monday = '2026-10-26';
const endpointList = {
  data: {
    endpoints: [
      {
        tag: ENDPOINT,
        supported_parameters: [
          'max_tokens',
          'response_format',
          'structured_outputs',
          'tools',
          'tool_choice',
        ],
        pricing: { prompt: '0.0000001', completion: '0.0000005' },
      },
    ],
  },
};
function fakeRouter(lines: string[]) {
  const bodies: { messages: { content: string }[] }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr'))
      return Response.json({ data: [{ model_id: MODEL, tag: ENDPOINT }] });
    if (u.includes('/models/')) return Response.json(endpointList);
    bodies.push(JSON.parse(String(init!.body)));
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 900, completion_tokens: 60, cost: 0.0001 },
      choices: [
        {
          message: {
            content: JSON.stringify({ line: lines.shift() ?? 'Fine.' }),
          },
        },
      ],
    });
  }) as typeof fetch;
  return { fetcher, bodies };
}

describe.skipIf(!url)('the review summary (WI-110, PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const saved = { ...process.env };
  let user: { id: string; timezone: string };
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const id = `summary-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'S', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('is off until Rumi writes the lines', async () => {
    expect(await summaryOn(user)).toBe(false);
    const r = fakeRouter([]);
    await expect(weekSummary(user, monday, now, r.fetcher)).rejects.toThrow(
      /writes the lines/,
    );
    expect(r.bodies).toHaveLength(0);
  });

  it('writes two checked sentences from the week, stores nothing, and Keep adds them to What went well?', async () => {
    await prisma.studyNudgeSetting.create({
      data: { userId: user.id, rumiLines: true },
    });
    const plan = await prisma.dailyPlan.create({
      data: { userId: user.id, date: new Date('2026-10-27') },
    });
    await prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title: 'Graphs',
        category: 'DSA',
        plannedStart: localInstant('2026-10-27', '18:00', zone),
        plannedEnd: localInstant('2026-10-27', '19:00', zone),
      },
    });
    const r = fakeRouter([
      'You recorded 9 hours this week.',
      'Graphs was planned on Tuesday at 18:00. Next week, keep that evening start.',
    ]);
    const text = await weekSummary(user, monday, now, r.fetcher);
    // An invented number is refused once; the checked retry is kept.
    expect(text).toBe(
      'Graphs was planned on Tuesday at 18:00. Next week, keep that evening start.',
    );
    const sent = JSON.parse(r.bodies[0].messages[1].content);
    expect(sent).toMatchObject({
      part: 'week',
      week: { from: monday, to: '2026-11-01' },
    });
    expect(sent.data.schedule).toContain('Graphs');
    expect(
      await prisma.weeklyReview.count({ where: { userId: user.id } }),
    ).toBe(0);
    await keepWeekSummary(user, monday, 'Mine first.');
    await keepWeekSummary(user, monday, text);
    const review = await prisma.weeklyReview.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(review.biggestWin).toBe(`Mine first.\n\n${text}`);
    expect(review.completedAt).toBeNull();
  });
});
