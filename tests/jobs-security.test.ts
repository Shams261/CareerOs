import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  addInterviewToSchedule,
  addJobNote,
  addPrepItem,
  changeStage,
  completeFollowUp,
  createApplication,
  recordRoundResult,
  rescheduleRound,
  saveFormats,
  scheduleRound,
  setFollowUp,
  setPrepItemDone,
  updateDetails,
  updateRoundDetails,
} from '../src/features/jobs/service';
import {
  deleteApplication,
  deletePrepItem,
  deleteRound,
} from '../src/features/deletes/service';
import { saveProblem, saveTopic } from '../src/features/dsa/service';
const url = process.env.TEST_DATABASE_URL;

/**
 * Owner scoping of Jobs (from the final check of 2026-10-31): every write names the signed-in
 * owner, so another owner's application, interview and prep item are refused by every action;
 * links may only be http(s); a prep item may only link the owner's own problem.
 */
describe.skipIf(!url)('jobs owner scoping', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const a = { id: `js-a-${randomUUID()}`, timezone: 'America/Toronto' },
    b = { id: `js-b-${randomUUID()}`, timezone: 'America/Toronto' };
  const now = new Date('2026-10-31T14:00:00Z');
  let appB = '',
    roundB = '',
    itemB = '',
    problemB = '',
    topicId = '';
  const round = (applicationId: string) => ({
    requestId: randomUUID(),
    applicationId,
    type: 'CODING',
    date: '2026-11-05',
    start: '10:00',
    end: '11:00',
    timezone: 'America/Toronto',
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
    const app = await createApplication(
      b,
      { requestId: randomUUID(), company: 'Theirs Inc', role: 'Engineer' },
      now,
    );
    appB = app.id;
    const r = await scheduleRound(b, round(appB), now);
    roundB = r.id;
    const item = await addPrepItem(b, {
      roundId: roundB,
      kind: 'PREP',
      title: 'Their prep',
      link: '',
    });
    itemB = item.id;
    const t = await saveTopic(b, {
      name: `js-${b.id}`,
      status: 'LEARNING',
      ordering: 0,
      current: false,
    });
    topicId = t.id;
    const p = await saveProblem(b, {
      title: 'Their problem',
      platform: 'LC',
      problemUrl: '',
      difficulty: 'EASY',
      topicId,
    });
    problemB = p.id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.dsaTopic.deleteMany({ where: { id: topicId } });
    await prisma.$disconnect();
  });
  it('refuses every write on another owner’s application, interview and prep item', async () => {
    const rid = () => randomUUID();
    await expect(
      updateDetails(a, {
        id: appB,
        company: 'Renamed',
        role: 'Engineer',
        workArrangement: 'UNKNOWN',
        priority: 2,
      }),
    ).rejects.toThrow();
    await expect(
      changeStage(a, { requestId: rid(), id: appB, stage: 'APPLIED' }, now),
    ).rejects.toThrow();
    await expect(
      setFollowUp(a, { id: appB, nextAction: 'x', actionOwner: 'ME' }, now),
    ).rejects.toThrow();
    await expect(
      completeFollowUp(
        a,
        { requestId: rid(), id: appB, actionOwner: 'ME' },
        now,
      ),
    ).rejects.toThrow();
    await expect(scheduleRound(a, round(appB), now)).rejects.toThrow();
    await expect(
      updateRoundDetails(a, { id: roundB, title: 'Mine now', type: 'CODING' }),
    ).rejects.toThrow();
    await expect(
      rescheduleRound(
        a,
        {
          requestId: rid(),
          id: roundB,
          date: '2026-11-06',
          start: '10:00',
          timezone: 'America/Toronto',
        },
        now,
      ),
    ).rejects.toThrow();
    await expect(addInterviewToSchedule(a, roundB)).rejects.toThrow();
    await expect(
      recordRoundResult(
        a,
        { requestId: rid(), id: roundB, status: 'COMPLETED' },
        now,
      ),
    ).rejects.toThrow();
    await expect(
      addPrepItem(a, { roundId: roundB, kind: 'PREP', title: 'x', link: '' }),
    ).rejects.toThrow();
    await expect(setPrepItemDone(a, itemB, true, now)).rejects.toThrow();
    await expect(
      addJobNote(a, { requestId: rid(), id: appB, note: 'hi' }, now),
    ).rejects.toThrow();
    await expect(
      saveFormats(a, { id: appB, formats: ['CODING'] }),
    ).rejects.toThrow();
    await expect(deleteApplication(a, appB)).rejects.toThrow();
    await expect(deleteRound(a, roundB)).rejects.toThrow();
    await expect(deletePrepItem(a, itemB)).rejects.toThrow();
    const theirs = await prisma.jobApplication.findUniqueOrThrow({
      where: { id: appB },
      include: { rounds: { include: { prepItems: true } }, activities: true },
    });
    expect(theirs.company).toBe('Theirs Inc');
    expect(theirs.stage).toBe('APPLIED');
    expect(theirs.rounds).toHaveLength(1);
    expect(theirs.rounds[0].title).not.toBe('Mine now');
    expect(theirs.rounds[0].prepItems).toHaveLength(1);
    expect(theirs.rounds[0].prepItems[0].completed).toBe(false);
  });
  it('refuses a javascript: job link and meeting link, and a prep link to someone else’s problem', async () => {
    await expect(
      createApplication(
        a,
        {
          requestId: randomUUID(),
          company: 'Mine',
          role: 'R',
          jobUrl: 'javascript:alert(1)',
        },
        now,
      ),
    ).rejects.toThrow();
    const mine = await createApplication(
      a,
      { requestId: randomUUID(), company: 'Mine', role: 'R' },
      now,
    );
    await expect(
      updateDetails(a, {
        id: mine.id,
        company: 'Mine',
        role: 'R',
        jobUrl: 'javascript:alert(1)',
        workArrangement: 'UNKNOWN',
        priority: 2,
      }),
    ).rejects.toThrow();
    const r = await scheduleRound(a, round(mine.id), now);
    await expect(
      updateRoundDetails(a, {
        id: r.id,
        title: 'T',
        type: 'CODING',
        meetingUrl: 'javascript:alert(1)',
      }),
    ).rejects.toThrow();
    await expect(
      addPrepItem(a, {
        roundId: r.id,
        kind: 'PREP',
        title: 'Solve theirs',
        link: `problem:${problemB}`,
      }),
    ).rejects.toThrow();
  });
  it('replays one requestId as one application and asks before a duplicate', async () => {
    const requestId = randomUUID();
    const first = await createApplication(
      a,
      { requestId, company: 'Twice Co', role: 'Dev' },
      now,
    );
    const again = await createApplication(
      a,
      { requestId, company: 'Twice Co', role: 'Dev' },
      now,
    );
    expect(again.id).toBe(first.id);
    await expect(
      createApplication(
        a,
        { requestId: randomUUID(), company: 'twice co', role: 'Dev' },
        now,
      ),
    ).rejects.toThrow(/confirm/i);
    expect(
      await prisma.jobApplication.count({
        where: {
          userId: a.id,
          company: { equals: 'Twice Co', mode: 'insensitive' },
        },
      }),
    ).toBe(1);
  });
});
