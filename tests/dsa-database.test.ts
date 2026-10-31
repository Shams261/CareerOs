import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  saveTopic,
  saveProblem,
  recordAttempt,
  scheduleRevision,
  dsaSnapshot,
  markRevised,
  settleRevisions,
  setCurrentTopic,
  startRevision,
} from '../src/features/dsa/service';
import { processNotifications } from '../src/features/notifications/service';
import { revisionQueue, todayDsaSummary } from '../src/features/dsa/domain';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('DSA PostgreSQL integrity', () => {
  const prisma = new PrismaClient({
    adapter: createPgAdapter(url!),
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
  it('starts a Not started topic when it is made current, and keeps refusing a paused one (WI-091)', async () => {
    const t = await saveTopic(user, {
      name: `${user.id}-fresh`,
      status: 'NOT_STARTED',
      ordering: 5,
      current: false,
    });
    topicIds.push(t.id);
    const made = await setCurrentTopic(user, t.id);
    expect(made.status).toBe('LEARNING');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .currentDsaTopicId,
    ).toBe(t.id);
    await saveTopic(user, { ...made, current: false, status: 'PAUSED' });
    await expect(setCurrentTopic(user, t.id)).rejects.toThrow('current topic');
    await setCurrentTopic(user, topicId);
  });
  it('saves a problem without a platform or a link (WI-091)', async () => {
    const p = await saveProblem(user, {
      title: 'From a book',
      platform: '',
      problemUrl: '',
      difficulty: 'EASY',
      topicId,
    });
    expect([p.platform, p.problemUrl]).toEqual(['Other', '']);
    await expect(
      saveProblem(user, {
        title: 'Bad',
        platform: '',
        problemUrl: 'javascript:alert(1)',
        difficulty: 'EASY',
        topicId,
      }),
    ).rejects.toThrow();
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
  it('starts the ladder on the first attempt, revises on an open step, moves a step by hand (WI-094)', async () => {
    const p = await fresh();
    await recordAttempt(user, input(p.id, 'YELLOW', 'PARTIAL'), now);
    let state = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: p.id },
    });
    const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
    expect(state.confidence).toBe('YELLOW');
    expect(day(state.revisionStartedOn)).toBe('2026-09-24');
    expect(day(state.nextRevisionAt)).toBe('2026-09-27');
    expect(state.revisionOutcomes).toEqual([]);
    expect(state.lastAttemptedAt).toEqual(now);
    // An attempt while a step is open counts as that revision; the next keeps its own day.
    await recordAttempt(
      user,
      input(p.id, 'GREEN', 'YES'),
      new Date('2026-09-27T14:00:00Z'),
    );
    state = await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } });
    expect(state.revisionOutcomes).toEqual(['revised']);
    expect(state.revisionStage).toBe(1);
    expect(day(state.nextRevisionAt)).toBe('2026-10-01');
    expect(day(state.revisionStartedOn)).toBe('2026-09-24');
    const history = await prisma.dsaAttempt.findMany({
      where: { problemId: p.id },
      orderBy: { id: 'asc' },
    });
    await scheduleRevision(user, p.id, '2026-09-30');
    const scheduled = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(scheduled.revisionManual).toBe(true);
    expect(day(scheduled.nextRevisionAt)).toBe('2026-09-30');
    expect(revisionQueue([scheduled], '2026-09-30')).toHaveLength(1);
    expect(
      await prisma.dsaAttempt.findMany({
        where: { problemId: p.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(history);
    // Mark revised closes step 2; step 3 waits on day 14 from the start.
    await markRevised(user, p.id);
    state = await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } });
    expect(state.revisionOutcomes).toEqual(['revised', 'revised']);
    expect(state.revisionManual).toBe(false);
    expect(day(state.nextRevisionAt)).toBe('2026-10-08');
    await markRevised(user, p.id);
    state = await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } });
    expect(state.nextRevisionAt).toBeNull();
    await expect(markRevised(user, p.id)).rejects.toThrow(
      'No revision is open',
    );
    await expect(scheduleRevision(user, p.id, '2026-10-20')).rejects.toThrow(
      'No revision is open',
    );
    // A finished ladder: the next attempt starts a new one from its day.
    await recordAttempt(
      user,
      input(p.id, 'GREEN', 'YES'),
      new Date('2026-11-01T14:00:00Z'),
    );
    state = await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } });
    expect(day(state.revisionStartedOn)).toBe('2026-11-01');
    expect(state.revisionOutcomes).toEqual([]);
    expect(day(state.nextRevisionAt)).toBe('2026-11-04');
  });
  it('settles passed steps as missed before Practice and the reminder read them (WI-094)', async () => {
    const p = await fresh();
    await recordAttempt(user, input(p.id), now);
    // Step 1 (Sep 27) passes; read on Sep 29: missed, step 2 open on Oct 1.
    expect(await settleRevisions(user, new Date('2026-09-29T14:00:00Z'))).toBe(
      1,
    );
    let state = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(state.revisionOutcomes).toEqual(['missed']);
    expect(state.nextRevisionAt?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(revisionQueue([state], '2026-09-29')).toHaveLength(0);
    // Weeks away: the rest lapse too and nothing is due any more.
    await settleRevisions(user, new Date('2026-11-01T14:00:00Z'));
    state = await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } });
    expect(state.revisionOutcomes).toEqual(['missed', 'missed', 'missed']);
    expect(state.nextRevisionAt).toBeNull();
    // A problem attempted before the ladder: Start revision begins one today.
    const legacy = await fresh();
    await prisma.dsaProblem.update({
      where: { id: legacy.id },
      data: { attemptsCount: 2, confidence: 'YELLOW' },
    });
    await startRevision(user, legacy.id, now);
    const started = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(started.revisionStartedOn?.toISOString().slice(0, 10)).toBe(
      '2026-09-24',
    );
    expect(started.nextRevisionAt?.toISOString().slice(0, 10)).toBe(
      '2026-09-27',
    );
    await expect(startRevision(user, (await fresh()).id, now)).rejects.toThrow(
      'first attempt',
    );
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
    // The first attempt started the ladder; the two later ones revised steps 1 and 2.
    expect(state.revisionStage).toBe(2);
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
      todayDsaSummary(
        (await dsaSnapshot(user, now)).problems,
        now,
        user.timezone,
      ).queue,
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
    // The next day the step is missed, not carried (WI-094): nothing is due, no reminder.
    await processNotifications(new Date('2026-09-25T14:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DSA_REVISION' },
      }),
    ).toBe(1);
    expect(
      (await prisma.dsaProblem.findUniqueOrThrow({ where: { id: p.id } }))
        .revisionOutcomes,
    ).toEqual(['missed']);
    // Step 2 moved to Sep 26: a reminder again on its day.
    await prisma.dsaProblem.updateMany({
      where: { id: { in: [p.id, q.id] } },
      data: { nextRevisionAt: new Date('2026-09-26') },
    });
    await processNotifications(new Date('2026-09-26T14:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DSA_REVISION' },
      }),
    ).toBe(2);
    await prisma.notificationPreference.update({
      where: { userId_type: { userId: user.id, type: 'DSA_REVISION' } },
      data: { enabled: false },
    });
    await prisma.dsaProblem.updateMany({
      where: { id: { in: [p.id, q.id] } },
      data: { nextRevisionAt: new Date('2026-09-27') },
    });
    await processNotifications(new Date('2026-09-27T14:00:00Z'));
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
    await processNotifications(new Date('2026-09-28T14:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DSA_REVISION' },
      }),
    ).toBe(2);
  });
});
