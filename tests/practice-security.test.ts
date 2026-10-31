import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  markRevised,
  recordAttempt,
  saveProblem,
  saveTopic,
  scheduleRevision,
  settleRevisions,
  startRevision,
} from '../src/features/dsa/service';
import { removeProblem, unhideProblem } from '../src/features/deletes/service';
const url = process.env.TEST_DATABASE_URL;

/**
 * Owner scoping of Practice (from the final check of 2026-10-31): every write names the
 * signed-in owner, so another owner's problem is refused by every action, a lapsed step of
 * theirs is never settled by my read, and a link may only be http(s).
 */
describe.skipIf(!url)('practice owner scoping', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const a = { id: `ps-a-${randomUUID()}`, timezone: 'America/Toronto' },
    b = { id: `ps-b-${randomUUID()}`, timezone: 'America/Toronto' };
  const now = new Date('2026-10-31T14:00:00Z');
  let topicId = '',
    problemB = '',
    problemA = '';
  const attempt = (problemId: string) => ({
    problemId,
    requestId: randomUUID(),
    confidenceAfter: 'YELLOW',
    solvedIndependently: 'PARTIAL',
  });
  beforeAll(async () => {
    for (const u of [a, b])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Test',
          timezone: u.timezone,
        },
      });
    const t = await saveTopic(a, {
      name: `ps-${a.id}`,
      status: 'LEARNING',
      ordering: 0,
      current: false,
    });
    topicId = t.id;
    const pb = await saveProblem(b, {
      title: 'Theirs',
      platform: 'LC',
      problemUrl: 'https://example.com/theirs',
      difficulty: 'EASY',
      topicId,
    });
    problemB = pb.id;
    await recordAttempt(b, attempt(problemB), now);
    const pa = await saveProblem(a, {
      title: 'Mine',
      platform: 'LC',
      problemUrl: 'https://example.com/mine',
      difficulty: 'EASY',
      topicId,
    });
    problemA = pa.id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.dsaTopic.deleteMany({ where: { id: topicId } });
    await prisma.$disconnect();
  });
  it('refuses every write on another owner’s problem', async () => {
    await expect(recordAttempt(a, attempt(problemB), now)).rejects.toThrow();
    await expect(
      saveProblem(a, {
        id: problemB,
        title: 'Renamed by a',
        platform: 'LC',
        problemUrl: 'https://example.com/x',
        difficulty: 'EASY',
        topicId,
      }),
    ).rejects.toThrow();
    await expect(scheduleRevision(a, problemB, '2026-11-05')).rejects.toThrow();
    await expect(markRevised(a, problemB)).rejects.toThrow();
    await expect(startRevision(a, problemB, now)).rejects.toThrow();
    await expect(removeProblem(a, problemB)).rejects.toThrow();
    await expect(unhideProblem(a, problemB)).rejects.toThrow();
    const theirs = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: problemB },
    });
    expect(theirs.title).toBe('Theirs');
    expect(theirs.attemptsCount).toBe(1);
    expect(theirs.revisionOutcomes).toEqual([]);
    expect(theirs.hiddenAt).toBeNull();
  });
  it('settles only my own lapsed steps', async () => {
    // b's step 1 (Nov 3) has passed by Nov 10; a's read settles nothing of b's.
    await settleRevisions(a, new Date('2026-11-10T14:00:00Z'));
    expect(
      (await prisma.dsaProblem.findUniqueOrThrow({ where: { id: problemB } }))
        .revisionOutcomes,
    ).toEqual([]);
    await settleRevisions(b, new Date('2026-11-10T14:00:00Z'));
    expect(
      (await prisma.dsaProblem.findUniqueOrThrow({ where: { id: problemB } }))
        .revisionOutcomes,
    ).toEqual(['missed', 'missed']);
  });
  it('keeps a hostile title as text and refuses a javascript: or credentialed link', async () => {
    const saved = await saveProblem(a, {
      id: problemA,
      title: '<img src=x onerror=alert(1)>',
      platform: 'LC',
      problemUrl: 'https://example.com/mine',
      difficulty: 'EASY',
      topicId,
    });
    expect(saved.title).toBe('<img src=x onerror=alert(1)>');
    for (const bad of [
      'javascript:alert(1)',
      'https://user:secret@example.com/x',
      'ftp://example.com/x',
    ])
      await expect(
        saveProblem(a, {
          id: problemA,
          title: 'Mine',
          platform: 'LC',
          problemUrl: bad,
          difficulty: 'EASY',
          topicId,
        }),
      ).rejects.toThrow();
  });
  it('refuses a malformed revision date and a step that is not open', async () => {
    await recordAttempt(a, attempt(problemA), now);
    await expect(scheduleRevision(a, problemA, '2026-13-40')).rejects.toThrow();
    await expect(scheduleRevision(a, problemA, 'tomorrow')).rejects.toThrow();
    // A day already gone would be missed on the next read (WI-095).
    await expect(
      scheduleRevision(a, problemA, '2026-10-30', now),
    ).rejects.toThrow('today or a later day');
    await expect(
      scheduleRevision(a, problemA, '2026-10-31', now),
    ).resolves.not.toThrow();
    await markRevised(a, problemA);
    await markRevised(a, problemA);
    await markRevised(a, problemA);
    await expect(markRevised(a, problemA)).rejects.toThrow(
      'No revision is open',
    );
    await expect(scheduleRevision(a, problemA, '2026-11-20')).rejects.toThrow(
      'No revision is open',
    );
  });
  it('a double Mark revised settles one step, not two', async () => {
    const p = await saveProblem(a, {
      title: 'Twice',
      platform: 'LC',
      problemUrl: '',
      difficulty: 'EASY',
      topicId,
    });
    await recordAttempt(a, attempt(p.id), now);
    const results = await Promise.allSettled([
      markRevised(a, p.id, 1),
      markRevised(a, p.id, 1),
    ]);
    const state = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(state.revisionOutcomes).toEqual(['revised']);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
