import {
  afterAll,
  afterEach,
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
import { processNotifications } from '../src/features/notifications/service';
import {
  closeNudges,
  saveNudgeSetting,
  todaysNudge,
} from '../src/features/nudges/service';
import { pushPayload } from '../src/features/push/domain';
import { deliverPending } from '../src/features/push/service';
import {
  linesToday,
  lineStats,
  writeRumiLines,
} from '../src/features/agent/lines';
import { nudgeFeedback } from '../src/features/nudges/service';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const zdrList = { data: [{ model_id: MODEL, tag: ENDPOINT }] };
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
/** A fake OpenRouter answering the line format with the given lines in order (WI-101). */
function lineRouter(lines: (string | Error)[]) {
  const calls: {
    messages: { content: string }[];
    response_format: { json_schema: { name: string } };
  }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr')) return Response.json(zdrList);
    if (u.includes('/models/')) return Response.json(endpointList);
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    const next = lines.shift() ?? 'Done.';
    if (next instanceof Error) throw next;
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 700, completion_tokens: 40, cost: 0.0001 },
      choices: [
        {
          message: { content: JSON.stringify({ line: next }) },
          finish_reason: 'stop',
        },
      ],
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const day = '2026-10-27'; // a Tuesday; fictional plan
const at = (time: string, d = day) => localInstant(d, time, zone);
const off = {
  morningEnabled: false,
  morningTime: '08:00',
  eveningEnabled: false,
  eveningTime: '19:30',
  days: 127,
  onlyStudyDays: true,
  quietStart: '22:00',
  quietEnd: '07:30',
  studyCategories: ['DSA', 'Technical'],
};

describe.skipIf(!url)('coach notifications (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const saved = { ...process.env };
  afterAll(() => {
    process.env = saved;
  });
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
    const id = `coach-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Coach', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());

  async function block(
    title: string,
    from: string,
    to: string,
    d = day,
    category = 'DSA',
  ) {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(d) } },
      create: { userId: user.id, date: new Date(d) },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category,
        plannedStart: at(from, d),
        plannedEnd: at(to, d),
      },
    });
  }
  const rows = (
    type: 'STUDY_MORNING' | 'STUDY_MIDDAY' | 'STUDY_EVENING' | 'STUDY_BLOCK',
  ) =>
    prisma.notificationLog.findMany({
      where: { userId: user.id, type },
      orderBy: { createdAt: 'asc' },
    });

  it('nudges once when a study block has started with nothing begun', async () => {
    const dsa = await block('Two pointers practice', '18:00', '19:30');
    await block('Gym', '17:50', '19:00', day, 'GYM');
    await saveNudgeSetting(user, { ...off, blockStartEnabled: true });
    await processNotifications(at('18:10'));
    expect(await rows('STUDY_BLOCK')).toHaveLength(0);
    await processNotifications(at('18:16'));
    await processNotifications(at('18:30'));
    const sent = await rows('STUDY_BLOCK');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      title: 'Block started',
      body: '18:00–19:30 Two pointers practice started 16 minutes ago and no session has begun yet. 74 minutes of it are left.',
      metadata: { blockId: dsa.id },
    });
    // The lock screen only ever gets the general line.
    expect(JSON.parse(pushPayload(sent[0])).body).toBe(
      'A study block has started. Open Silsila to begin or move it.',
    );
    expect(pushPayload(sent[0])).not.toContain('Two pointers');
    expect(JSON.parse(pushPayload(sent[0])).url).toBe('/today#study-nudge');
    // One a day: a later study block that also starts unbegun is left alone.
    await block('Graphs', '20:00', '21:00');
    await processNotifications(at('20:20'));
    expect(await rows('STUDY_BLOCK')).toHaveLength(1);
    // Today shows it as the block card; closing the day's nudges answers it.
    expect(await todaysNudge(user, day)).toMatchObject({
      kind: 'block',
      blockId: dsa.id,
    });
    await closeNudges(prisma, user.id, day);
    expect(await todaysNudge(user, day)).toBeNull();
  });

  it('stays silent once a session is running or recorded for the block', async () => {
    const dsa = await block('Two pointers practice', '18:00', '19:30');
    await saveNudgeSetting(user, { ...off, blockStartEnabled: true });
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: dsa.id,
        category: 'DSA',
        startedAt: at('18:05'),
      },
    });
    await processNotifications(at('18:20'));
    expect(await rows('STUDY_BLOCK')).toHaveLength(0);
  });

  it('speaks for study blocks instead of the older upcoming and overdue reminders', async () => {
    const dsa = await block('Two pointers practice', '18:00', '19:30');
    const gym = await block('Gym', '18:00', '19:00', day, 'GYM');
    await saveNudgeSetting(user, { ...off, blockStartEnabled: true });
    await prisma.notificationPreference.createMany({
      data: [
        {
          userId: user.id,
          type: 'UPCOMING_BLOCK',
          offsetMinutes: 10,
          timezone: zone,
        },
        {
          userId: user.id,
          type: 'OVERDUE_TASK',
          offsetMinutes: 15,
          timezone: zone,
        },
      ],
    });
    await processNotifications(at('17:55'));
    await processNotifications(at('19:20'));
    const all = await prisma.notificationLog.findMany({
      where: { userId: user.id },
    });
    expect(
      all.filter((r) => r.dedupeKey.includes(dsa.id)).map((r) => r.type),
    ).toEqual(['STUDY_BLOCK']);
    // Other blocks keep their reminders.
    expect(
      all
        .filter((r) => r.dedupeKey.includes(gym.id))
        .map((r) => r.type)
        .sort(),
    ).toEqual(['OVERDUE_TASK', 'UPCOMING_BLOCK']);
  });

  it('fills the morning plan and the evening check-in with the day’s facts', async () => {
    await block('Coding', '18:00', '21:00', '2026-10-26');
    await block('Two pointers practice', '18:00', '19:00');
    await block('DSA warm-up', '07:30', '08:15', '2026-10-28');
    await saveNudgeSetting(user, {
      ...off,
      morningEnabled: true,
      eveningEnabled: true,
    });
    await processNotifications(at('08:05'));
    const [morning] = await rows('STUDY_MORNING');
    expect(morning.body).toMatch(
      /^Today: 18:00–19:00 Two pointers practice\. Yesterday 18:00–21:00 Coding had no session recorded\. /,
    );
    await processNotifications(at('19:45'));
    const [evening] = await rows('STUDY_EVENING');
    expect(evening.body).toMatch(
      /Left today: 18:00–19:00 Two pointers practice\. Tomorrow starts with 07:30–08:15 DSA warm-up\.$/,
    );
    expect(pushPayload(evening)).not.toContain('Two pointers');
  });

  describe('Rumi writes the lines (WI-101)', () => {
    const rumiOn = {
      ...off,
      morningEnabled: true,
      eveningEnabled: true,
      rumiLines: true,
      middayEnabled: true,
    };
    const sender = async () => 201;
    const cfg = {
      publicKey: 'pk',
      privateKey: 'sk',
      subject: 'mailto:x@example.com',
    };
    const subscribe = () =>
      prisma.pushSubscription.create({
        data: {
          userId: user.id,
          endpoint: `https://push.example.com/${user.id}`,
          p256dh: 'p',
          auth: 'a',
        },
      });

    it('queues the morning row pending, writes Rumi’s line from the reads once, and holds push meanwhile', async () => {
      await block('Two pointers practice', '18:00', '19:00');
      await saveNudgeSetting(user, rumiOn);
      await subscribe();
      const t = at('08:05');
      await processNotifications(t);
      let [morning] = await rows('STUDY_MORNING');
      expect(morning.metadata).toMatchObject({ rumi: 'pending' });
      expect(morning.body).toMatch(
        /^Today: 18:00–19:00 Two pointers practice\./,
      );
      // Push waits while the line is pending and fresh.
      expect((await deliverPending(t, sender, cfg)).notifications).toBe(0);
      const r = lineRouter([
        'Two pointers practice is at 18:00 today. Begin with the first problem.',
      ]);
      expect(await writeRumiLines(t, r.fetcher)).toEqual({
        written: 1,
        fallback: 0,
      });
      [morning] = await rows('STUDY_MORNING');
      expect(morning.body).toBe(
        'Two pointers practice is at 18:00 today. Begin with the first problem.',
      );
      expect(morning.metadata).toMatchObject({ rumi: 'written', rumiTries: 1 });
      // One strict call with the persona, the part and the reads as data; nothing else was sent.
      expect(r.calls).toHaveLength(1);
      const sent = JSON.parse(r.calls[0].messages[1].content);
      expect(sent.part).toBe('morning');
      expect(Object.keys(sent.data)).toEqual([
        'get_today',
        'get_activity',
        'get_jobs',
        'get_patterns',
      ]);
      expect(r.calls[0].response_format.json_schema.name).toBe('line');
      // The ledger holds the call under its own feature; the push now goes with the general text.
      expect(
        await prisma.aiUsage.count({
          where: { userId: user.id, feature: 'AGENT_LINE' },
        }),
      ).toBe(1);
      expect((await deliverPending(t, sender, cfg)).delivered).toBe(1);
      expect(JSON.parse(pushPayload(morning)).body).not.toContain(
        'Two pointers',
      );
      // Today reads it as Rumi's; repeated runs write nothing more and queue nothing twice.
      expect(await todaysNudge(user, day)).toMatchObject({
        kind: 'morning',
        rumi: true,
      });
      await processNotifications(at('08:30'));
      expect(await writeRumiLines(at('08:30'), r.fetcher)).toEqual({
        written: 0,
        fallback: 0,
      });
      expect(await rows('STUDY_MORNING')).toHaveLength(1);
      expect(await linesToday(user, day)).toEqual([
        'morning: Two pointers practice is at 18:00 today. Begin with the first problem.',
      ]);
      expect(await lineStats(user, at('09:00'))).toEqual({
        written: 1,
        total: 1,
      });
    });

    it('keeps the template after two failed runs, and pushes a stale pending row anyway', async () => {
      await block('Two pointers practice', '18:00', '19:00');
      await saveNudgeSetting(user, rumiOn);
      await subscribe();
      const t = at('08:05');
      await processNotifications(t);
      const r = lineRouter([
        new Error('ECONNREFUSED'),
        new Error('ECONNREFUSED'),
      ]);
      expect(await writeRumiLines(t, r.fetcher)).toEqual({
        written: 0,
        fallback: 0,
      });
      let [morning] = await rows('STUDY_MORNING');
      expect(morning.metadata).toMatchObject({ rumi: 'pending', rumiTries: 1 });
      // Older than two minutes: push stops waiting even while still pending.
      expect((await deliverPending(at('08:08'), sender, cfg)).delivered).toBe(
        1,
      );
      expect(await writeRumiLines(at('08:06'), r.fetcher)).toEqual({
        written: 0,
        fallback: 1,
      });
      [morning] = await rows('STUDY_MORNING');
      expect(morning.metadata).toMatchObject({
        rumi: 'fallback',
        rumiTries: 2,
      });
      expect(morning.body).toMatch(
        /^Today: 18:00–19:00 Two pointers practice\./,
      );
      expect(await todaysNudge(user, day)).toMatchObject({
        kind: 'morning',
        rumi: false,
      });
      expect(await lineStats(user, at('09:00'))).toEqual({
        written: 0,
        total: 1,
      });
    });

    it('rejects an invented number once, keeps the retry’s line, and never counts the line against Grill Me', async () => {
      await block('Two pointers practice', '18:00', '19:00');
      await saveNudgeSetting(user, rumiOn);
      const t = at('08:05');
      await processNotifications(t);
      const r = lineRouter([
        'You have 7 blocks today, so begin now.',
        'Two pointers practice waits at 18:00. One problem is a fine start.',
      ]);
      expect(await writeRumiLines(t, r.fetcher)).toEqual({
        written: 1,
        fallback: 0,
      });
      expect(r.calls).toHaveLength(2);
      expect(r.calls[1].messages.at(-1)?.content).toMatch(
        /every number must appear in the data/,
      );
      const [morning] = await rows('STUDY_MORNING');
      expect(morning.body).toBe(
        'Two pointers practice waits at 18:00. One problem is a fine start.',
      );
    });

    it('writes the afternoon line while a block is ahead and the recap in the evening, and "Too many" rests the afternoon', async () => {
      await block('Two pointers practice', '18:00', '19:00');
      await block('DSA warm-up', '07:30', '08:15', '2026-10-28');
      await saveNudgeSetting(user, rumiOn);
      await processNotifications(at('13:10'));
      const [midday] = await rows('STUDY_MIDDAY');
      expect(midday.body).toMatch(
        /Next: 18:00–19:00 Two pointers practice, in 4 h 50 min\.$/,
      );
      expect(midday.metadata).toMatchObject({ rumi: 'pending' });
      expect(JSON.parse(pushPayload(midday))).toMatchObject({
        body: 'Rumi has a line for the afternoon.',
        url: '/today#study-nudge',
      });
      const r = lineRouter([
        'Two pointers practice is at 18:00. The afternoon is open until then.',
      ]);
      await writeRumiLines(at('13:10'), r.fetcher);
      expect(JSON.parse(r.calls[0].messages[1].content).part).toBe('midday');
      expect(await todaysNudge(user, day)).toMatchObject({
        kind: 'midday',
        rumi: true,
      });
      // "Too many" on the afternoon line rests it for a week.
      await nudgeFeedback(user, midday.id, 'TOO_MANY', at('13:20'));
      const setting = await prisma.studyNudgeSetting.findUnique({
        where: { userId: user.id },
      });
      expect(setting?.middayPausedUntil?.toISOString().slice(0, 10)).toBe(
        '2026-11-03',
      );
      // The evening recap comes on a recorded day too (the check-in would not).
      const dsa = (await rows('STUDY_MIDDAY'))[0].metadata as {
        blockId: string;
      };
      await prisma.actualSession.create({
        data: {
          userId: user.id,
          taskId: dsa.blockId,
          category: 'DSA',
          startedAt: at('18:00'),
          endedAt: at('18:40'),
        },
      });
      await processNotifications(at('19:45'));
      const [evening] = await rows('STUDY_EVENING');
      expect(evening.title).toBe('This evening');
      expect(evening.body).toBe(
        '40 min of study recorded today. Tomorrow starts with 07:30–08:15 DSA warm-up.',
      );
      expect(evening.metadata).toMatchObject({ rumi: 'pending' });
    });

    it('leaves the rows as templates when AI is not configured', async () => {
      delete process.env.OPENROUTER_API_KEY;
      await block('Two pointers practice', '18:00', '19:00');
      await saveNudgeSetting(user, rumiOn);
      await processNotifications(at('08:05'));
      const [morning] = await rows('STUDY_MORNING');
      expect(morning.metadata).not.toHaveProperty('rumi');
      expect(await writeRumiLines(at('08:05'))).toEqual({
        written: 0,
        fallback: 0,
      });
    });
  });
});
