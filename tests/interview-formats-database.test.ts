import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  applicationDetail,
  createApplication,
  loopPractice,
  saveFormats,
  scheduleRound,
  updateRoundDetails,
} from '../src/features/jobs/service';
import { runTool } from '../src/features/agent/tools';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('interview formats (WI-047)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `formats-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `formats-${randomUUID()}`, timezone: 'America/Toronto' };
  // Wednesday 2026-10-28 10:00 Toronto.
  const now = new Date('2026-10-28T14:00:00Z');
  let n = 0;
  const app = (who = user, company = 'Stripe') =>
    createApplication(
      who,
      { requestId: randomUUID(), company, role: `Software Engineer ${++n}` },
      now,
    );
  const round = (applicationId: string, over: Record<string, unknown>) =>
    scheduleRound(
      user,
      {
        requestId: randomUUID(),
        applicationId,
        date: '2026-11-04',
        start: '14:00',
        end: '15:00',
        timezone: 'America/Toronto',
        ...over,
      },
      now,
    );

  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Formats test',
          timezone: u.timezone,
        },
      });
    // The owner's imported material, as the bundle names it.
    const roadmap = (title: string) =>
      prisma.roadmap.create({ data: { userId: user.id, title } });
    const tech = await roadmap('Technical mastery');
    const dsa = await roadmap('DSA patterns');
    const stories = await roadmap('Behavioural and resume');
    let ordering = 0;
    const add = (
      roadmapId: string,
      section: string,
      title: string,
      over: Record<string, unknown> = {},
    ) =>
      prisma.roadmapItem.create({
        data: {
          userId: user.id,
          roadmapId,
          section,
          title,
          ordering: ordering++,
          ...over,
        },
      });
    const formats = 'Interview formats you will meet (2025–2026)';
    await add(tech.id, formats, 'Code review round', {
      slug: 'format-code-review',
    });
    await add(tech.id, formats, 'Bug squash', { slug: 'format-bug-squash' });
    const drills = 'Code review and bug squash drills';
    await add(dsa.id, drills, 'Bug squash: run the failing test first', {
      slug: 'drill-bug-squash-run-the-failing-test-first',
      status: 'DONE',
    });
    await add(dsa.id, drills, 'Bug families: off-by-one', {
      slug: 'drill-bug-families-off-by-one',
    });
    await add(
      dsa.id,
      drills,
      'Code review drill: a PR with 3–5 planted issues',
      {
        slug: 'drill-code-review-drill-a-pr-with-35-planted-issues',
      },
    );
    await add(stories.id, 'Company: Stripe', 'Stripe operating principles');
    await add(stories.id, 'Company: Amazon', 'Leadership principles');
    await add(stories.id, 'Stories', 'Story 1');
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });

  it('keeps a round’s format and AI rule and edits them', async () => {
    const a = await app();
    const r = await round(a.id, { type: 'DEBUGGING', aiPolicy: 'NOT_ALLOWED' });
    expect(r).toMatchObject({
      title: 'Bug squash / debugging',
      type: 'DEBUGGING',
      aiPolicy: 'NOT_ALLOWED',
    });
    // A round without a stated rule reads Not known.
    expect((await round(a.id, { type: 'CODING' })).aiPolicy).toBe('UNKNOWN');
    await updateRoundDetails(user, {
      id: r.id,
      title: r.title,
      type: 'CODE_REVIEW',
      aiPolicy: 'ALLOWED',
    });
    expect(
      await prisma.interviewRound.findUniqueOrThrow({ where: { id: r.id } }),
    ).toMatchObject({ type: 'CODE_REVIEW', aiPolicy: 'ALLOWED' });
  });

  it('saves ticked formats for the owner only, without duplicates', async () => {
    const a = await app();
    await saveFormats(user, {
      id: a.id,
      formats: ['CODE_REVIEW', 'BEHAVIORAL', 'CODE_REVIEW'],
    });
    expect(
      (await prisma.jobApplication.findUniqueOrThrow({ where: { id: a.id } }))
        .formats,
    ).toEqual(['CODE_REVIEW', 'BEHAVIORAL']);
    await expect(
      saveFormats(user, { id: a.id, formats: ['RECRUITER'] }),
    ).rejects.toThrow();
    await expect(saveFormats(other, { id: a.id, formats: [] })).rejects.toThrow(
      'Application not found',
    );
    await saveFormats(user, { id: a.id, formats: [] });
    expect(
      (await prisma.jobApplication.findUniqueOrThrow({ where: { id: a.id } }))
        .formats,
    ).toEqual([]);
  });

  it('points each format of the loop at the owner’s own material', async () => {
    const a = await app();
    await saveFormats(user, { id: a.id, formats: ['BEHAVIORAL'] });
    await round(a.id, { type: 'DEBUGGING', aiPolicy: 'NOT_ALLOWED' });
    await round(a.id, { type: 'CODE_REVIEW', date: '2026-11-06' });
    const detail = (await applicationDetail(user, a.id))!;
    const loop = await loopPractice(user, detail, now);
    expect(
      loop.map((f) => ({
        format: f.format,
        ai: f.aiPolicy,
        guide: f.guide?.title ?? null,
        next: f.next?.title ?? null,
        counts: `${f.done}/${f.total}`,
      })),
    ).toEqual([
      {
        format: 'CODE_REVIEW',
        ai: null,
        guide: 'Code review round',
        next: 'Code review drill: a PR with 3–5 planted issues',
        counts: '0/1',
      },
      {
        format: 'DEBUGGING',
        ai: 'NOT_ALLOWED',
        guide: 'Bug squash',
        next: 'Bug families: off-by-one',
        counts: '1/2',
      },
      {
        format: 'BEHAVIORAL',
        ai: null,
        guide: null,
        next: 'Stripe operating principles',
        counts: '0/2',
      },
    ]);
    // Another owner's application has no material of this owner's.
    const theirs = await app(other, 'Stripe');
    await saveFormats(other, { id: theirs.id, formats: ['CODE_REVIEW'] });
    const otherLoop = await loopPractice(
      other,
      (await applicationDetail(other, theirs.id))!,
      now,
    );
    expect(otherLoop).toMatchObject([
      { format: 'CODE_REVIEW', guide: null, next: null, total: 0 },
    ]);
  });

  it('tells Rumi the loop’s formats and each round’s AI rule', async () => {
    const a = await app(user, 'Northwind');
    await saveFormats(user, { id: a.id, formats: ['AI_ASSISTED'] });
    await round(a.id, { type: 'AI_ASSISTED', aiPolicy: 'ALLOWED' });
    const jobs = (await runTool(user, 'get_jobs', {}, now)) as {
      applications: {
        company: string;
        formats?: string[];
        upcomingRounds: { type: string; ai?: string }[];
      }[];
    };
    const northwind = jobs.applications.find((j) => j.company === 'Northwind')!;
    expect(northwind.formats).toEqual(['ai-assisted coding']);
    expect(northwind.upcomingRounds).toMatchObject([
      { type: 'ai assisted', ai: 'ai allowed' },
    ]);
    // An application without formats sends no formats key.
    const stripe = jobs.applications.find(
      (j) => j.company === 'Stripe' && !j.formats,
    );
    expect(stripe).toBeDefined();
  });
});
