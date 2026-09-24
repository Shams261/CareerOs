import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  saveTopic,
  saveProblem,
  recordAttempt,
  scheduleRevision,
  dsaSnapshot,
} from '../src/features/dsa/service';
import { processNotifications } from '../src/features/notifications/service';
import { revisionQueue, todayDsaSummary } from '../src/features/dsa/domain';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('DSA PostgreSQL integrity', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  client.value = prisma;
  const user = { id: `dsa-${randomUUID()}`, timezone: 'America/Toronto' },
    other = `dsa-${randomUUID()}`;
  const topicIds: string[] = [];
  let topicId: string;
  const now = new Date('2026-09-24T14:00:00Z');
  const fresh = async () =>
    saveProblem(user, {
      title: 'Window',
      platform: 'Custom',
      problemUrl: 'https://example.com/problem',
      difficulty: 'MEDIUM',
      topicId,
    });
  const input = (
    id: string,
    confidenceAfter = 'RED',
    solvedIndependently = 'NO',
  ) => ({
    problemId: id,
    requestId: randomUUID(),
    confidenceAfter,
    solvedIndependently,
    notes: 'Learned',
    mistake: 'Boundary',
  });
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { ...user, email: `${user.id}@example.com`, name: 'DSA test' },
        { id: other, email: `${other}@example.com`, name: 'Other' },
      ],
    });
    const topic = await saveTopic(user, {
      name: user.id,
      status: 'LEARNING',
      ordering: 0,
      current: true,
    });
    topicId = topic.id;
    topicIds.push(topicId);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other] } } });
    await prisma.dsaTopic.deleteMany({ where: { id: { in: topicIds } } });
    await prisma.$disconnect();
  });
  it('has one current topic under competing updates and clears a paused topic', async () => {
    const t = await saveTopic(user, {
      name: `${user.id}-two`,
      status: 'LEARNING',
      ordering: 1,
      current: true,
    });
    topicIds.push(t.id);
    await Promise.all([
      saveTopic(user, {
        id: topicId,
        name: user.id,
        status: 'LEARNING',
        ordering: 0,
        current: true,
      }),
      saveTopic(user, {
        id: t.id,
        name: `${user.id}-two`,
        status: 'LEARNING',
        ordering: 1,
        current: true,
      }),
    ]);
    const selected = (
      await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    ).currentDsaTopicId!;
    const topic = await prisma.dsaTopic.findUniqueOrThrow({
      where: { id: selected },
    });
    await saveTopic(user, { ...topic, current: false, status: 'PAUSED' });
    expect((await dsaSnapshot(user)).currentTopic).toBeNull();
    await expect(
      saveTopic(user, { ...topic, current: true, status: 'PAUSED' }),
    ).rejects.toThrow('current topic');
  });
  it('keeps arbitrary URLs, edits problems, and rejects unsafe links', async () => {
    const p = await fresh();
    const edited = await saveProblem(user, {
      ...p,
      title: 'Edited',
      problemUrl: 'https://custom.example.org/path?a=1',
    });
    expect(edited.problemUrl).toContain('custom.example.org');
    await expect(
      saveProblem(user, { ...p, problemUrl: 'javascript:alert(1)' }),
    ).rejects.toThrow();
    await expect(
      saveProblem(user, {
        ...p,
        problemUrl: 'https://password:secret@example.com',
      }),
    ).rejects.toThrow();
  });
  it('persists immutable history, Green progression, reset, and manual override', async () => {
    const p = await fresh();
    let count = 0;
    for (const [conf, independence, stage, days] of [
      ['RED', 'NO', 0, 1],
      ['YELLOW', 'PARTIAL', 0, 3],
      ['GREEN', 'YES', 1, 7],
      ['GREEN', 'YES', 2, 14],
      ['GREEN', 'YES', 3, 30],
      ['RED', 'NO', 0, 1],
    ] as const) {
      await recordAttempt(user, input(p.id, conf, independence), now);
      count++;
      const state = await prisma.dsaProblem.findUniqueOrThrow({
        where: { id: p.id },
      });
      expect(state.attemptsCount).toBe(count);
      expect(state.confidence).toBe(conf);
      expect(state.revisionStage).toBe(stage);
      expect(+state.nextRevisionAt!).toBe(
        +new Date('2026-09-24') + days * 86400000,
      );
      expect(state.lastAttemptedAt).toEqual(now);
    }
    const history = await prisma.dsaAttempt.findMany({
      where: { problemId: p.id },
      orderBy: { id: 'asc' },
    });
    await scheduleRevision(user, p.id, '2026-09-22');
    const scheduled = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(scheduled.revisionManual).toBe(true);
    expect(scheduled.revisionStage).toBe(0);
    expect(revisionQueue([scheduled], '2026-09-24')).toHaveLength(1);
    expect(
      await prisma.dsaAttempt.findMany({
        where: { problemId: p.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(history);
    await recordAttempt(user, input(p.id, 'GREEN', 'YES'), now);
    expect(
      (await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } }))
        .revisionManual,
    ).toBe(false);
  });
  it('deduplicates concurrent retries and serializes separate attempts', async () => {
    const p = await fresh(),
      raw = input(p.id, 'GREEN', 'YES');
    const results = await Promise.all([
      recordAttempt(user, raw, now),
      recordAttempt(user, raw, now),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.dsaAttempt.count({ where: { problemId: p.id } })).toBe(
      1,
    );
    await expect(
      recordAttempt(user, { ...raw, notes: 'different' }, now),
    ).rejects.toThrow('already saved');
    await Promise.all([
      recordAttempt(user, input(p.id, 'GREEN', 'YES'), now),
      recordAttempt(user, input(p.id, 'GREEN', 'YES'), now),
    ]);
    const state = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(state.attemptsCount).toBe(3);
    expect(state.revisionStage).toBe(3);
  });
  it('rejects contradictory confidence and cross-owner writes without history', async () => {
    const p = await fresh();
    await expect(
      recordAttempt(user, input(p.id, 'GREEN', 'NO'), now),
    ).rejects.toThrow();
    await expect(
      recordAttempt({ id: other, timezone: user.timezone }, input(p.id), now),
    ).rejects.toThrow('workspace');
    await expect(
      scheduleRevision(
        { id: other, timezone: user.timezone },
        p.id,
        '2026-09-24',
      ),
    ).rejects.toThrow('workspace');
    expect(await prisma.dsaAttempt.count({ where: { problemId: p.id } })).toBe(
      0,
    );
    expect(
      (await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } }))
        .attemptsCount,
    ).toBe(0);
  });
  it('links only an active owned DSA session without requiring a timer', async () => {
    const p = await fresh();
    const session = await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'DSA',
        startedAt: new Date(+now - 60000),
      },
    });
    const a = await recordAttempt(user, input(p.id), now);
    expect(a.actualSessionId).toBe(session.id);
    await prisma.actualSession.update({
      where: { id: session.id },
      data: { endedAt: now },
    });
    expect(
      (await recordAttempt(user, input(p.id), now)).actualSessionId,
    ).toBeNull();
    const work = await prisma.actualSession.create({
      data: { userId: user.id, category: 'WORK', startedAt: now },
    });
    expect(
      (await recordAttempt(user, input(p.id), now)).actualSessionId,
    ).toBeNull();
    await prisma.actualSession.update({
      where: { id: work.id },
      data: { endedAt: new Date(+now + 1000) },
    });
  });
  it('leaves unattempted problems unscheduled, preserving legacy counts', async () => {
    const p = await fresh();
    expect(p.nextRevisionAt).toBeNull();
    await expect(scheduleRevision(user, p.id, '2026-09-24')).rejects.toThrow(
      'first attempt',
    );
    await prisma.dsaProblem.update({
      where: { id: p.id },
      data: { attemptsCount: 2, confidence: 'YELLOW' },
    });
    await recordAttempt(user, input(p.id, 'GREEN', 'YES'), now);
    expect(
      (await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } }))
        .attemptsCount,
    ).toBe(3);
    expect(await prisma.dsaAttempt.count({ where: { problemId: p.id } })).toBe(
      1,
    );
  });
  it('rolls back the inserted history when a summary update fails', async () => {
    const p = await fresh();
    // Inject a failure for this test problem only; PostgreSQL enforces actual rollback.
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION wi003_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${p.id}' THEN RAISE EXCEPTION 'Injected summary failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER wi003_test_failure BEFORE UPDATE ON "DsaProblem" FOR EACH ROW EXECUTE FUNCTION wi003_test_failure()',
    );
    try {
      await expect(recordAttempt(user, input(p.id), now)).rejects.toThrow();
      expect(
        await prisma.dsaAttempt.count({ where: { problemId: p.id } }),
      ).toBe(0);
      expect(
        (await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } }))
          .attemptsCount,
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER wi003_test_failure ON "DsaProblem"',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION wi003_test_failure()');
    }
  });
  it('creates one daily inbox notification and honors disabled/empty preferences', async () => {
    await prisma.notificationPreference.create({
      data: {
        userId: user.id,
        type: 'DSA_REVISION',
        preferredTime: '07:00',
        timezone: user.timezone,
      },
    });
    // Isolate the due set from earlier cases, then put two practiced problems due today.
    await prisma.dsaProblem.updateMany({
      where: { userId: user.id },
      data: { nextRevisionAt: new Date('2026-10-30') },
    });
    const p = await fresh(),
      q = await fresh();
    for (const problem of [p, q]) {
      await recordAttempt(user, input(problem.id), now);
      await scheduleRevision(user, problem.id, '2026-09-24');
    }
    expect(
      todayDsaSummary((await dsaSnapshot(user)).problems, now, user.timezone)
        .queue,
    ).toHaveLength(2);
    await Promise.all([processNotifications(now), processNotifications(now)]);
    const logs = await prisma.notificationLog.findMany({
      where: { userId: user.id, type: 'DSA_REVISION' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].title).toBe('2 DSA problems due for revision today.');
    await processNotifications(new Date('2026-09-25T02:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DSA_REVISION' },
      }),
    ).toBe(1);
    await processNotifications(new Date('2026-09-25T14:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DSA_REVISION' },
      }),
    ).toBe(2);
    await prisma.notificationPreference.update({
      where: { userId_type: { userId: user.id, type: 'DSA_REVISION' } },
      data: { enabled: false },
    });
    await processNotifications(new Date('2026-09-26T14:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DSA_REVISION' },
      }),
    ).toBe(2);
    await prisma.notificationPreference.update({
      where: { userId_type: { userId: user.id, type: 'DSA_REVISION' } },
      data: { enabled: true },
    });
    await prisma.dsaProblem.updateMany({
      where: { userId: user.id },
      data: { nextRevisionAt: new Date('2026-10-30') },
    });
    await processNotifications(new Date('2026-09-27T14:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DSA_REVISION' },
      }),
    ).toBe(2);
  });
});
