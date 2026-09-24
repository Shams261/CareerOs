import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  addPrepItem,
  changeStage,
  completeFollowUp,
  createApplication,
  DUPLICATE_TOKEN,
  jobSnapshot,
  jobTodaySummary,
  recordRoundResult,
  rescheduleRound,
  saveJobReminders,
  scheduleRound,
  setFollowUp,
  setPrepItemDone,
  todaysInterviews,
  updateDetails,
} from '../src/features/jobs/service';
import { PreviewRequired } from '../src/features/schedule/editing';
import { processNotifications } from '../src/features/notifications/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('job pipeline PostgreSQL integrity', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  client.value = prisma;
  const user = { id: `jobs-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `jobs-${randomUUID()}`, timezone: 'America/Toronto' },
    // Thursday 2026-09-24 10:00 Toronto.
    now = new Date('2026-09-24T14:00:00Z');
  let n = 0;
  const add = (over: Record<string, unknown> = {}, who = user) =>
    createApplication(
      who,
      {
        requestId: randomUUID(),
        company: `Company ${++n}`,
        role: 'Backend Engineer',
        ...over,
      },
      now,
    );
  const interview = (
    applicationId: string,
    over: Record<string, unknown> = {},
  ) =>
    scheduleRound(
      user,
      {
        requestId: randomUUID(),
        applicationId,
        title: 'Coding round',
        type: 'CODING',
        date: '2026-09-25',
        start: '14:00',
        end: '15:00',
        timezone: 'America/Toronto',
        ...over,
      },
      now,
    );
  const count = (where: object) =>
    prisma.notificationLog.count({ where: { userId: user.id, ...where } });
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [user, other].map((u) => ({
        ...u,
        name: 'Test',
        email: `${u.id}@example.com`,
      })),
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });

  it('creates quickly with owner-local applied date, CREATED history and idempotent retries', async () => {
    const requestId = randomUUID();
    const input = { requestId, company: 'Amazon', role: 'SDE II' };
    const [a, b] = await Promise.all([
      createApplication(user, input, now),
      createApplication(user, input, now),
    ]);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({
      stage: 'APPLIED',
      appliedAt: new Date('2026-09-24'),
      actionOwner: 'NONE',
    });
    const history = await prisma.jobActivity.findMany({
      where: { applicationId: a.id },
    });
    expect(history).toMatchObject([{ type: 'CREATED', toStage: 'APPLIED' }]);
    const saved = await add({ stage: 'SAVED', appliedAt: '2026-09-01' });
    expect(saved.appliedAt).toBeNull();
  });
  it('warns on exact duplicates, allows confirmed or different roles', async () => {
    const base = {
      company: 'Duplicate Co',
      role: 'Frontend Engineer',
      jobUrl: 'https://example.com/jobs/1',
    };
    await add(base);
    await expect(
      add({ ...base, company: 'duplicate co ' }),
    ).rejects.toBeInstanceOf(PreviewRequired);
    await add({ ...base, role: 'Backend Engineer' });
    await add({ ...base, token: DUPLICATE_TOKEN });
    expect(
      await prisma.jobApplication.count({
        where: { userId: user.id, company: 'Duplicate Co' },
      }),
    ).toBe(3);
  });
  it('scopes every mutation to the owner and rejects unsafe URLs', async () => {
    const mine = await add();
    const request = {
      requestId: randomUUID(),
      id: mine.id,
      stage: 'OFFER',
    };
    await expect(changeStage(other, request, now)).rejects.toThrow('not found');
    await expect(
      updateDetails(other, {
        id: mine.id,
        company: 'X',
        role: 'Y',
        workArrangement: 'REMOTE',
        priority: 1,
      }),
    ).rejects.toThrow('not found');
    await expect(add({ jobUrl: 'javascript:alert(1)' })).rejects.toThrow();
    await expect(
      interview(mine.id, { meetingUrl: 'ftp://example.com' }),
    ).rejects.toThrow();
    const edited = await updateDetails(user, {
      id: mine.id,
      company: 'Edited',
      role: 'Staff',
      jobUrl: 'https://example.com/edited',
      workArrangement: 'HYBRID',
      priority: 1,
      recruiterName: 'Jane Doe',
      compensationNotes: 'Base 150k; deadline Oct 3',
    });
    expect(edited).toMatchObject({
      recruiterName: 'Jane Doe',
      workArrangement: 'HYBRID',
      jobUrl: 'https://example.com/edited',
    });
  });
  it('writes stage history with the stage transactionally and idempotently', async () => {
    const a = await add({ stage: 'SAVED' });
    const requestId = randomUUID();
    const move = { requestId, id: a.id, stage: 'APPLIED', note: 'Submitted' };
    await Promise.all([
      changeStage(user, move, now),
      changeStage(user, move, now),
    ]);
    const after = await prisma.jobApplication.findUniqueOrThrow({
      where: { id: a.id },
    });
    expect(after).toMatchObject({
      stage: 'APPLIED',
      appliedAt: new Date('2026-09-24'),
    });
    expect(
      await prisma.jobActivity.findMany({
        where: { applicationId: a.id, type: 'STAGE_CHANGED' },
      }),
    ).toMatchObject([
      { fromStage: 'SAVED', toStage: 'APPLIED', note: 'Submitted' },
    ]);
    await expect(
      changeStage(user, { ...move, requestId: randomUUID() }, now),
    ).rejects.toThrow('already');
    const b = await add();
    await expect(changeStage(user, { ...move, id: b.id }, now)).rejects.toThrow(
      'already saved',
    );
  });
  it('rolls the stage back when the history insert fails', async () => {
    const a = await add();
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION wi005_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."applicationId" = '${a.id}' AND NEW.type = 'STAGE_CHANGED' THEN RAISE EXCEPTION 'Injected failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER wi005_test_failure BEFORE INSERT ON "JobActivity" FOR EACH ROW EXECUTE FUNCTION wi005_test_failure()',
    );
    try {
      await expect(
        changeStage(
          user,
          { requestId: randomUUID(), id: a.id, stage: 'TECHNICAL' },
          now,
        ),
      ).rejects.toThrow();
      expect(
        (await prisma.jobApplication.findUniqueOrThrow({ where: { id: a.id } }))
          .stage,
      ).toBe('APPLIED');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER wi005_test_failure ON "JobActivity"',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION wi005_test_failure()');
    }
  });
  it('schedules, reschedules with preserved history, and records results with an explicit stage move', async () => {
    const a = await add({ stage: 'RECRUITER_SCREEN' });
    const r = await interview(a.id, {
      timezone: 'America/Vancouver',
      date: '2026-09-28',
      start: '11:00',
      end: '12:00',
    });
    expect(r).toMatchObject({
      timezone: 'America/Vancouver',
      scheduledStart: new Date('2026-09-28T18:00:00Z'),
      status: 'SCHEDULED',
    });
    const moved = await rescheduleRound(
      user,
      {
        requestId: randomUUID(),
        id: r.id,
        date: '2026-09-29',
        start: '09:00',
        timezone: 'America/Vancouver',
        note: 'Interviewer unavailable',
      },
      now,
    );
    expect(moved.scheduledStart).toEqual(new Date('2026-09-29T16:00:00Z'));
    expect(
      await prisma.jobActivity.findFirstOrThrow({
        where: { interviewRoundId: r.id, type: 'INTERVIEW_RESCHEDULED' },
      }),
    ).toMatchObject({
      previousStart: new Date('2026-09-28T18:00:00Z'),
      newStart: new Date('2026-09-29T16:00:00Z'),
    });
    const result = {
      requestId: randomUUID(),
      id: r.id,
      status: 'COMPLETED',
      toImprove: 'Explain isolation levels',
      stage: 'TECHNICAL',
    };
    await expect(recordRoundResult(user, result, now)).rejects.toThrow(
      'before it starts',
    );
    const later = new Date('2026-09-29T17:30:00Z');
    await recordRoundResult(user, result, later);
    await recordRoundResult(user, result, later); // replay
    expect(
      await prisma.interviewRound.findUniqueOrThrow({ where: { id: r.id } }),
    ).toMatchObject({
      status: 'COMPLETED',
      completedAt: later,
      toImprove: 'Explain isolation levels',
    });
    expect(
      await prisma.jobActivity.findMany({
        where: { applicationId: a.id, type: 'STAGE_CHANGED' },
      }),
    ).toMatchObject([
      {
        fromStage: 'RECRUITER_SCREEN',
        toStage: 'TECHNICAL',
        interviewRoundId: r.id,
      },
    ]);
    await recordRoundResult(
      user,
      {
        requestId: randomUUID(),
        id: r.id,
        status: 'COMPLETED',
        toImprove: 'Explain isolation levels with an example',
      },
      later,
    );
    expect(
      await prisma.interviewRound.findUniqueOrThrow({ where: { id: r.id } }),
    ).toMatchObject({
      completedAt: later,
      toImprove: 'Explain isolation levels with an example',
    });
    await expect(
      recordRoundResult(
        user,
        { requestId: randomUUID(), id: r.id, status: 'NO_SHOW' },
        later,
      ),
    ).rejects.toThrow('Only the reflection');
    await expect(
      rescheduleRound(
        user,
        {
          requestId: randomUUID(),
          id: r.id,
          date: '2026-10-01',
          start: '09:00',
          timezone: 'UTC',
        },
        now,
      ),
    ).rejects.toThrow('Completed');
    // Old rounds stay visible after later stage changes.
    await changeStage(
      user,
      { requestId: randomUUID(), id: a.id, stage: 'FINAL' },
      now,
    );
    expect(
      await prisma.interviewRound.count({ where: { applicationId: a.id } }),
    ).toBe(1);
  });
  it('links prep items by reference only and toggles idempotently', async () => {
    const a = await add({ stage: 'TECHNICAL' });
    const r = await interview(a.id);
    const subject = await prisma.learningSubject.create({
      data: { userId: user.id, name: `PostgreSQL ${n}`, status: 'ACTIVE' },
    });
    const topic = await prisma.learningTopic.create({
      data: {
        userId: user.id,
        subjectId: subject.id,
        title: 'Isolation Levels',
      },
    });
    const foreignSubject = await prisma.learningSubject.create({
      data: { userId: other.id, name: `Other ${n}`, status: 'ACTIVE' },
    });
    const foreign = await prisma.learningTopic.create({
      data: { userId: other.id, subjectId: foreignSubject.id, title: 'Theirs' },
    });
    const linked = await addPrepItem(user, {
      roundId: r.id,
      title: 'Review isolation levels',
      link: `learning:${topic.id}`,
    });
    await addPrepItem(user, {
      roundId: r.id,
      title: 'Practice Design News Feed',
    });
    await expect(
      addPrepItem(user, {
        roundId: r.id,
        title: 'Steal',
        link: `learning:${foreign.id}`,
      }),
    ).rejects.toThrow('not found');
    await expect(
      addPrepItem(other, { roundId: r.id, title: 'Cross-owner' }),
    ).rejects.toThrow('not found');
    await setPrepItemDone(user, linked.id, true, now);
    await setPrepItemDone(user, linked.id, true, new Date(+now + 60000));
    expect(
      await prisma.interviewPrepItem.findUniqueOrThrow({
        where: { id: linked.id },
      }),
    ).toMatchObject({ completed: true, completedAt: now });
    // No mastery change or activity is created by linking.
    expect(
      await prisma.learningTopic.findUniqueOrThrow({ where: { id: topic.id } }),
    ).toMatchObject({ understanding: 0, recall: 0, status: 'NOT_STARTED' });
    expect(
      await prisma.learningActivity.count({ where: { topicId: topic.id } }),
    ).toBe(0);
  });
  it('separates action-required from waiting and completes follow-ups with history', async () => {
    const a = await add({ company: 'Follow Co' });
    await setFollowUp(
      user,
      {
        id: a.id,
        nextAction: 'Follow up with Sarah',
        nextActionDate: '2026-09-22',
        actionOwner: 'ME',
      },
      now,
    );
    // Identical save is not logged twice.
    await setFollowUp(
      user,
      {
        id: a.id,
        nextAction: 'Follow up with Sarah',
        nextActionDate: '2026-09-22',
        actionOwner: 'ME',
      },
      now,
    );
    expect(
      await prisma.jobActivity.count({
        where: { applicationId: a.id, type: 'FOLLOW_UP_SET' },
      }),
    ).toBe(1);
    const snap = await jobSnapshot(user, now);
    expect(snap.weekly.followUpsDue).toBeGreaterThanOrEqual(1);
    const summary = await jobTodaySummary(user, now);
    expect(summary!.attention.some((x) => x.app.id === a.id)).toBe(true);
    const request = {
      requestId: randomUUID(),
      id: a.id,
      note: 'Sent email',
      nextAction: 'Wait for reply',
      nextActionDate: '2026-10-01',
      actionOwner: 'COMPANY',
    };
    await completeFollowUp(user, request, now);
    await completeFollowUp(user, request, now);
    expect(
      await prisma.jobActivity.findMany({
        where: { applicationId: a.id, type: 'FOLLOW_UP_DONE' },
      }),
    ).toMatchObject([{ note: 'Follow up with Sarah — Sent email' }]);
    const after = await prisma.jobApplication.findUniqueOrThrow({
      where: { id: a.id },
    });
    expect(after).toMatchObject({ actionOwner: 'COMPANY', stage: 'APPLIED' });
    const later = await jobTodaySummary(user, now);
    expect(later!.attention.some((x) => x.app.id === a.id)).toBe(false);
    expect(
      (await jobSnapshot(user, now)).weekly.followUpsDone,
    ).toBeGreaterThanOrEqual(1);
  });
  it('finds today’s interviews by owner calendar day and excludes closed applications', async () => {
    const a = await add({ company: 'Interview Day Co', stage: 'TECHNICAL' });
    const r = await interview(a.id, {
      date: '2026-09-24',
      start: '23:30',
      end: '',
    });
    const day = await todaysInterviews(user, '2026-09-24');
    expect(day.map((x) => x.id)).toContain(r.id);
    expect(
      (await todaysInterviews(user, '2026-09-25')).map((x) => x.id),
    ).not.toContain(r.id);
    await changeStage(
      user,
      { requestId: randomUUID(), id: a.id, stage: 'WITHDRAWN' },
      now,
    );
    expect(
      (await todaysInterviews(user, '2026-09-24')).map((x) => x.id),
    ).not.toContain(r.id);
    await expect(interview(a.id)).rejects.toThrow('Reopen');
  });
  it('queues one follow-up reminder per planned date and interview reminders per window', async () => {
    await saveJobReminders(user, {
      followUpEnabled: true,
      followUpTime: '09:00',
      interviewEnabled: true,
      interviewOffset: 60,
    });
    await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
    const a = await add({ company: 'Reminder Co', stage: 'TECHNICAL' });
    await setFollowUp(
      user,
      {
        id: a.id,
        nextAction: 'Send availability',
        nextActionDate: '2026-09-24',
        actionOwner: 'ME',
      },
      now,
    );
    const r = await interview(a.id, {
      date: '2026-09-25',
      start: '09:00',
      end: '',
    });
    await addPrepItem(user, { roundId: r.id, title: 'Review caching' });
    const followUps = {
      type: 'JOB_FOLLOW_UP' as const,
      dedupeKey: { contains: a.id },
    };
    const interviews = {
      type: 'INTERVIEW' as const,
      dedupeKey: { contains: r.id },
    };
    // 08:30 Toronto: before preferred time; interview 24.5h away.
    await processNotifications(new Date('2026-09-24T12:30:00Z'));
    expect(await count(followUps)).toBe(0);
    expect(await count(interviews)).toBe(0);
    // 10:00 Toronto, concurrent runs: one follow-up, one 24h interview reminder.
    await Promise.all([processNotifications(now), processNotifications(now)]);
    expect(await count(followUps)).toBe(1);
    expect(await count(interviews)).toBe(1);
    const dayReminder = await prisma.notificationLog.findFirstOrThrow({
      where: interviews,
    });
    expect(dayReminder.title).toBe(
      'Your Reminder Co Coding round interview is tomorrow at 9:00 AM. 1 prep item open.',
    );
    // Next day while overdue: no repeat for the same planned date.
    await processNotifications(new Date('2026-09-25T12:30:00Z'));
    expect(await count(followUps)).toBe(1);
    // 08:30 on interview day is inside the 60-minute window.
    expect(await count(interviews)).toBe(2);
    await processNotifications(new Date('2026-09-25T12:40:00Z'));
    expect(await count(interviews)).toBe(2);
    // Rescheduling re-arms reminders for the new time.
    await rescheduleRound(
      user,
      {
        requestId: randomUUID(),
        id: r.id,
        date: '2026-09-26',
        start: '09:00',
        timezone: 'America/Toronto',
      },
      new Date('2026-09-25T12:45:00Z'),
    );
    await processNotifications(new Date('2026-09-25T14:00:00Z'));
    expect(await count(interviews)).toBe(3);
    // Disabled preferences and closed applications produce nothing.
    await saveJobReminders(user, {
      followUpEnabled: false,
      followUpTime: '09:00',
      interviewEnabled: false,
      interviewOffset: 60,
    });
    await setFollowUp(
      user,
      {
        id: a.id,
        nextAction: 'Send availability',
        nextActionDate: '2026-09-27',
        actionOwner: 'ME',
      },
      now,
    );
    await processNotifications(new Date('2026-09-27T14:00:00Z'));
    expect(await count(followUps)).toBe(1);
    await saveJobReminders(user, {
      followUpEnabled: true,
      followUpTime: '09:00',
      interviewEnabled: true,
      interviewOffset: 60,
    });
    await changeStage(
      user,
      { requestId: randomUUID(), id: a.id, stage: 'REJECTED' },
      now,
    );
    await processNotifications(new Date('2026-09-27T14:00:00Z'));
    expect(await count(followUps)).toBe(1);
    expect(a.stage).not.toBe('REJECTED'); // rejection only by explicit action
  });
});
