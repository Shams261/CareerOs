import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  saveSubject,
  saveLearningTopic,
  recordActivity,
  scheduleReview,
  addLearningResource,
  learningSnapshot,
  saveLearningReminder,
} from '../src/features/learning/service';
import { processNotifications } from '../src/features/notifications/service';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('technical learning PostgreSQL integrity', () => {
  const prisma = new PrismaClient({
    adapter: createPgAdapter(url!),
  });
  client.value = prisma;
  const user = { id: `learn-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `learn-${randomUUID()}`, timezone: 'America/Toronto' },
    now = new Date('2026-09-24T23:00:00Z');
  let subjectId: string;
  const subjectInput = {
    name: 'TypeScript',
    status: 'ACTIVE',
    ordering: 0,
    current: true,
  };
  const fresh = () =>
    saveLearningTopic(user, {
      subjectId,
      title: 'Generics',
      ordering: 0,
      status: 'NOT_STARTED',
    });
  const activity = (topicId: string, scores: Record<string, number> = {}) => ({
    topicId,
    requestId: randomUUID(),
    activityType: 'REVIEW',
    ...scores,
  });
  const strong = { understanding: 3, recall: 3, application: 3, interview: 3 };
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [user, other].map((u) => ({
        ...u,
        name: 'Test',
        email: `${u.id}@example.com`,
      })),
    });
    subjectId = (await saveSubject(user, subjectInput)).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });
  it('supports custom subjects and owner-scoped focus with archive clearing', async () => {
    const custom = await saveSubject(user, {
      ...subjectInput,
      name: 'Kubernetes',
    });
    expect((await learningSnapshot(user, now)).currentSubjectId).toBe(
      custom.id,
    );
    await saveSubject(user, {
      ...subjectInput,
      id: custom.id,
      name: 'Kubernetes',
      status: 'ARCHIVED',
      current: false,
    });
    expect((await learningSnapshot(user, now)).currentSubjectId).toBeNull();
    await expect(
      saveSubject(other, { ...subjectInput, id: subjectId }),
    ).rejects.toThrow('workspace');
    await expect(
      saveSubject(user, { ...subjectInput, status: 'PAUSED' }),
    ).rejects.toThrow('active');
    await expect(
      saveSubject(user, { ...subjectInput, name: 'Other', goalId: 'missing' }),
    ).rejects.toThrow('goal');
  });
  it('allows simple hierarchy but rejects cross-owner, cross-subject, cycle and deep parents', async () => {
    const root = await fresh(),
      child = await saveLearningTopic(user, {
        subjectId,
        title: 'Constraints',
        ordering: 1,
        status: 'NOT_STARTED',
        parentId: root.id,
      });
    await expect(
      saveLearningTopic(user, {
        subjectId,
        title: 'Too deep',
        ordering: 2,
        status: 'NOT_STARTED',
        parentId: child.id,
      }),
    ).rejects.toThrow('top-level');
    await expect(
      saveLearningTopic(user, {
        ...root,
        notes: '',
        description: '',
        parentId: root.id,
      }),
    ).rejects.toThrow();
    await expect(
      saveLearningTopic(other, {
        subjectId,
        title: 'Stolen',
        ordering: 0,
        status: 'NOT_STARTED',
      }),
    ).rejects.toThrow('workspace');
  });
  it('records partial updates, strong transition and later regression preserving history', async () => {
    const t = await fresh();
    await recordActivity(user, activity(t.id, { understanding: 2 }), now);
    let state = await prisma.learningTopic.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(state).toMatchObject({
      understanding: 2,
      recall: 0,
      status: 'LEARNING',
      nextReviewDate: new Date('2026-09-26'),
    });
    const a = await recordActivity(user, activity(t.id, strong), now);
    expect(a).toMatchObject({
      statusBefore: 'LEARNING',
      statusAfter: 'INTERVIEW_READY',
    });
    await recordActivity(user, activity(t.id, { recall: 3 }), now);
    state = await prisma.learningTopic.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(state.nextReviewDate).toEqual(new Date('2026-10-24'));
    await recordActivity(user, activity(t.id, { recall: 1 }), now);
    state = await prisma.learningTopic.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(state).toMatchObject({
      understanding: 3,
      recall: 1,
      application: 3,
      interview: 3,
      status: 'NEEDS_REVISION',
      nextReviewDate: new Date('2026-09-27'),
    });
    expect(
      await prisma.learningActivity.findUnique({ where: { id: a.id } }),
    ).toEqual(a);
  });
  it('cannot manually claim readiness, hide weak assessment or reset studied topics', async () => {
    const t = await fresh();
    const raw = { ...t, parentId: '', description: '', notes: '' };
    await expect(
      saveLearningTopic(user, { ...raw, status: 'INTERVIEW_READY' }),
    ).rejects.toThrow('four');
    await recordActivity(user, activity(t.id, { recall: 1 }), now);
    expect(
      (await saveLearningTopic(user, { ...raw, status: 'LEARNING' })).status,
    ).toBe('NEEDS_REVISION');
    await expect(saveLearningTopic(user, raw)).rejects.toThrow('reset');
    await saveLearningTopic(user, { ...raw, status: 'PAUSED' });
    await expect(recordActivity(user, activity(t.id), now)).rejects.toThrow(
      'resume',
    );
    await saveLearningTopic(user, { ...raw, status: 'LEARNING' });
    expect((await recordActivity(user, activity(t.id), now)).statusAfter).toBe(
      'NEEDS_REVISION',
    );
  });
  it('keeps unassessed legacy interview-ready topics editable without re-claiming readiness', async () => {
    const t = await fresh();
    await prisma.learningTopic.update({
      where: { id: t.id },
      data: { status: 'INTERVIEW_READY' },
    });
    const raw = { ...t, parentId: '', description: '', notes: 'Legacy note' };
    const saved = await saveLearningTopic(user, {
      ...raw,
      status: 'INTERVIEW_READY',
    });
    expect(saved).toMatchObject({
      status: 'INTERVIEW_READY',
      notes: 'Legacy note',
    });
    await recordActivity(user, activity(t.id, { interview: 1 }), now);
    await expect(
      saveLearningTopic(user, { ...raw, status: 'INTERVIEW_READY' }),
    ).rejects.toThrow('four');
  });
  it('deduplicates concurrent identical retries and rejects conflicting payload reuse', async () => {
    const t = await fresh(),
      input = activity(t.id, strong);
    const results = await Promise.all([
      recordActivity(user, input, now),
      recordActivity(user, input, now),
    ]);
    expect(results[0].id).toBe(results[1].id);
    await expect(
      recordActivity(user, { ...input, recall: 1 }, now),
    ).rejects.toThrow('already saved');
    await Promise.all([
      recordActivity(user, activity(t.id, { recall: 2 }), now),
      recordActivity(user, activity(t.id, { interview: 1 }), now),
    ]);
    expect(
      await prisma.learningActivity.count({ where: { topicId: t.id } }),
    ).toBe(3);
    expect(
      await prisma.learningTopic.findUnique({ where: { id: t.id } }),
    ).toMatchObject({ recall: 2, interview: 1 });
  });
  it('manual dates persist through notes/unassessed review, then reset on assessment', async () => {
    const t = await fresh();
    await recordActivity(user, activity(t.id, strong), now);
    await scheduleReview(user, t.id, '2026-09-23');
    const manual = await prisma.learningTopic.findUniqueOrThrow({
      where: { id: t.id },
    });
    await recordActivity(
      user,
      { ...activity(t.id), activityType: 'NOTE', notes: 'Interview next week' },
      now,
    );
    expect(
      await prisma.learningTopic.findUnique({ where: { id: t.id } }),
    ).toMatchObject({
      reviewManual: true,
      nextReviewDate: manual.nextReviewDate,
      lastReviewedAt: manual.lastReviewedAt,
    });
    await recordActivity(user, activity(t.id), now);
    expect(
      (await prisma.learningTopic.findUniqueOrThrow({ where: { id: t.id } }))
        .reviewManual,
    ).toBe(true);
    await recordActivity(user, activity(t.id, { recall: 1 }), now);
    expect(
      (await prisma.learningTopic.findUniqueOrThrow({ where: { id: t.id } }))
        .reviewManual,
    ).toBe(false);
    await expect(scheduleReview(other, t.id, '2026-09-24')).rejects.toThrow(
      'workspace',
    );
  });
  it('persists HTTP resources and rejects unsafe/cross-owner resources', async () => {
    const t = await fresh(),
      raw = {
        topicId: t.id,
        title: 'Docs',
        url: 'https://www.typescriptlang.org/docs/',
        type: 'DOCUMENTATION',
      };
    expect((await addLearningResource(user, raw)).learningTopicId).toBe(t.id);
    await expect(
      addLearningResource(user, { ...raw, url: 'javascript:alert(1)' }),
    ).rejects.toThrow();
    await expect(
      addLearningResource(user, {
        ...raw,
        url: 'https://user:pass@example.com',
      }),
    ).rejects.toThrow();
    await expect(addLearningResource(other, raw)).rejects.toThrow('workspace');
  });
  it('links appropriate sessions without mutating timing or requiring a timer', async () => {
    const t = await fresh();
    expect(
      (await recordActivity(user, activity(t.id), now)).actualSessionId,
    ).toBeNull();
    const session = await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'SYSTEM_DESIGN',
        startedAt: new Date(+now - 3600000),
      },
    });
    expect(
      (await recordActivity(user, activity(t.id, { understanding: 2 }), now))
        .actualSessionId,
    ).toBe(session.id);
    expect(
      await prisma.actualSession.findUnique({ where: { id: session.id } }),
    ).toEqual(session);
    await prisma.actualSession.update({
      where: { id: session.id },
      data: { endedAt: now },
    });
    const wrong = await prisma.actualSession.create({
      data: { userId: user.id, category: 'DSA', startedAt: now },
    });
    expect(
      (await recordActivity(user, activity(t.id), now)).actualSessionId,
    ).toBeNull();
    await prisma.actualSession.update({
      where: { id: wrong.id },
      data: { endedAt: new Date(+now + 1000) },
    });
    expect((await learningSnapshot(user, now)).weekly.minutes).toBe(60);
  });
  it('links custom learning goal sessions and measures weekly events without counting notes', async () => {
    const goal = await prisma.goal.create({
      data: { userId: user.id, title: 'Custom learning', category: 'STUDY' },
    });
    const subject = await saveSubject(user, {
      ...subjectInput,
      name: 'GraphQL',
      goalId: goal.id,
      current: false,
    });
    const t = await saveLearningTopic(user, {
      subjectId: subject.id,
      title: 'Resolvers',
      ordering: 0,
      status: 'NOT_STARTED',
    });
    const before = (await learningSnapshot(user, now)).weekly;
    await recordActivity(
      user,
      {
        ...activity(t.id),
        activityType: 'NOTE',
        notes: 'Questions to investigate',
      },
      now,
    );
    expect((await learningSnapshot(user, now)).weekly.studied).toBe(
      before.studied,
    );
    const session = await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'CUSTOM',
        goalId: goal.id,
        startedAt: new Date(+now - 60000),
      },
    });
    expect(
      (await recordActivity(user, activity(t.id, strong), now)).actualSessionId,
    ).toBe(session.id);
    await prisma.actualSession.update({
      where: { id: session.id },
      data: { endedAt: now },
    });
    const after = (await learningSnapshot(user, now)).weekly;
    expect(after.studied).toBe(before.studied + 1);
    expect(after.ready).toBe(before.ready + 1);
    await expect(recordActivity(other, activity(t.id), now)).rejects.toThrow(
      'workspace',
    );
  });
  it('rolls back the inserted activity when summary write fails', async () => {
    const t = await fresh();
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION wi004_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${t.id}' THEN RAISE EXCEPTION 'Injected failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER wi004_test_failure BEFORE UPDATE ON "LearningTopic" FOR EACH ROW EXECUTE FUNCTION wi004_test_failure()',
    );
    try {
      await expect(
        recordActivity(user, activity(t.id, strong), now),
      ).rejects.toThrow();
      expect(
        await prisma.learningActivity.count({ where: { topicId: t.id } }),
      ).toBe(0);
      expect(
        (await prisma.learningTopic.findUniqueOrThrow({ where: { id: t.id } }))
          .understanding,
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER wi004_test_failure ON "LearningTopic"',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION wi004_test_failure()');
    }
  });
  it('deduplicates reminders per owner day, excludes inactive and respects preferences', async () => {
    await prisma.learningTopic.updateMany({
      where: { userId: user.id },
      data: { nextReviewDate: null },
    });
    const t = await fresh();
    await recordActivity(user, activity(t.id, { recall: 1 }), now);
    await scheduleReview(user, t.id, '2026-09-24');
    await saveLearningReminder(user, { enabled: true, preferredTime: '18:00' });
    await Promise.all([processNotifications(now), processNotifications(now)]);
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'TECHNICAL_REVIEW' },
      }),
    ).toBe(1);
    await processNotifications(new Date('2026-09-25T02:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'TECHNICAL_REVIEW' },
      }),
    ).toBe(1);
    await saveLearningReminder(user, {
      enabled: false,
      preferredTime: '18:00',
    });
    await processNotifications(new Date('2026-09-25T23:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'TECHNICAL_REVIEW' },
      }),
    ).toBe(1);
    await saveLearningReminder(user, { enabled: true, preferredTime: '18:00' });
    await saveSubject(user, {
      ...subjectInput,
      id: subjectId,
      current: false,
      status: 'PAUSED',
    });
    await processNotifications(new Date('2026-09-26T23:00:00Z'));
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'TECHNICAL_REVIEW' },
      }),
    ).toBe(1);
  });
});
