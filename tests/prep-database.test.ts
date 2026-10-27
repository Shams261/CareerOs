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
import {
  deletePrepDoc,
  latestPrepDocs,
  prepDoc,
  prepPreview,
  writePrepDoc,
} from '../src/features/prep/service';
import { DOCS_PER_DAY, type PrepDoc } from '../src/features/prep/domain';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';
import { exportOwnerData } from '../src/server/export';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = localInstant('2026-10-27', '10:00', zone);
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

type Body = {
  messages: { role: string; content: string }[];
  plugins?: unknown[];
  response_format?: { json_schema?: { name?: string } };
};
/** A fake OpenRouter: searches cite pages; the writing call answers with `doc(input)`. */
function fakeRouter(
  doc: (input: Record<string, unknown>) => unknown,
  opts: { searchProvider?: string; emptySearches?: boolean } = {},
) {
  const bodies: Body[] = [];
  let n = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr'))
      return Response.json({ data: [{ model_id: MODEL, tag: ENDPOINT }] });
    if (u.includes('/models/')) return Response.json(endpointList);
    const body = JSON.parse(String(init!.body)) as Body;
    bodies.push(body);
    if (body.plugins) {
      n++;
      return Response.json({
        provider: opts.searchProvider ?? 'Google',
        usage: { prompt_tokens: 1000, completion_tokens: 150, cost: 0.007 },
        choices: [
          {
            message: {
              content: opts.emptySearches ? '' : `Notes from search ${n}.`,
              annotations: [
                `https://www.northwind.com/careers/interviews-${n % 2}`,
                `https://guides.example.org/northwind-${n}`,
              ].map((url) => ({
                type: 'url_citation',
                url_citation: { url, title: `Page ${url.slice(-12)}` },
              })),
            },
          },
        ],
      });
    }
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 5000, completion_tokens: 1500, cost: 0.00125 },
      choices: [
        {
          message: {
            content: JSON.stringify(doc(JSON.parse(body.messages[1].content))),
          },
        },
      ],
    });
  }) as typeof fetch;
  return {
    fetcher,
    searches: () => bodies.filter((b) => b.plugins),
    writes: () => bodies.filter((b) => !b.plugins),
  };
}
/** A doc that cites the first sources and links the first owner items. */
const goodDoc = (input: Record<string, unknown>) => {
  const s = (input.sources as { id: string }[]).map((x) => x.id);
  const r = (input.roadmap as { id: string }[]).map((x) => x.id);
  const p = (input.problems as { id: string }[]).map((x) => x.id);
  return {
    process: [
      { text: 'A screen, then a loop of four rounds.', sources: [s[0]] },
    ],
    rounds: [{ name: 'Coding', tests: ['Graphs'], sources: [s[1]] }],
    topics: [
      {
        name: 'Graphs',
        why: 'Common in coding.',
        sources: [s[1]],
        links: [p[0], r[0]],
      },
    ],
    plan: [{ day: 1, focus: 'Graphs', links: [p[0]] }],
    questions: ['How is on-call shared?'],
  };
};

describe.skipIf(!url)('Interview prep docs (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  let app: { id: string };
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
    delete process.env.STUDY_AI_ENABLED;
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const id = `prep-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Prep', timezone: zone },
    });
    app = await prisma.jobApplication.create({
      data: {
        userId: user.id,
        company: 'Northwind',
        role: 'Backend Engineer',
        stage: 'TECHNICAL',
        jobUrl: 'https://www.northwind.com/careers/123',
        notes: 'PRIVATE-JOB-NOTE',
        compensationNotes: 'PRIVATE-COMPENSATION',
        recruiterName: 'PRIVATE-RECRUITER',
        recruiterContact: 'PRIVATE-CONTACT',
        jobDescription: 'Build PRIVATE-JD-MARKER services.',
        nextAction: 'PRIVATE-NEXT',
      },
    });
    await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'System design with ROUND-TITLE',
        type: 'SYSTEM_DESIGN',
        scheduledStart: localInstant('2026-10-30', '15:00', zone),
        timezone: zone,
        interviewers: 'PRIVATE-INTERVIEWER',
        notes: 'PRIVATE-ROUND-NOTE',
      },
    });
    const shared = await prisma.roadmap.create({
      data: { userId: user.id, title: 'System design', studyAi: true },
    });
    const hidden = await prisma.roadmap.create({
      data: { userId: user.id, title: 'PRIVATE-ROADMAP', studyAi: false },
    });
    await prisma.roadmapItem.createMany({
      data: [
        {
          userId: user.id,
          roadmapId: shared.id,
          section: 'Basics',
          title: 'Caching',
          notes: 'PRIVATE-ITEM-NOTE',
        },
        {
          userId: user.id,
          roadmapId: hidden.id,
          section: 'Basics',
          title: 'PRIVATE-HIDDEN-ITEM',
        },
      ],
    });
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'Graphs' },
      create: { name: 'Graphs' },
      update: {},
    });
    await prisma.dsaProblem.create({
      data: {
        userId: user.id,
        title: 'Number of Islands',
        platform: 'LeetCode',
        problemUrl: 'https://leetcode.com/problems/PRIVATE-URL/',
        difficulty: 'MEDIUM',
        topicId: topic.id,
        notes: 'PRIVATE-PROBLEM-NOTE',
      },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('searches with generic words only, writes a sourced doc mapped to the owner’s items, and counts each call', async () => {
    const r = fakeRouter(goodDoc);
    const row = await writePrepDoc(
      user,
      { applicationId: app.id, jobDescription: false },
      now,
      r.fetcher,
    );
    const searches = r.searches();
    expect(searches).toHaveLength(5);
    for (const s of searches) {
      expect(s.messages[1].content).toMatch(
        /^Northwind Backend Engineer|^Northwind hiring/,
      );
      expect(JSON.stringify(s)).not.toMatch(/PRIVATE/);
    }
    const sent = JSON.stringify(r.writes());
    expect(sent).not.toMatch(/PRIVATE/);
    // A round's title helps the writing call; it never reaches a search.
    expect(sent).toMatch(/ROUND-TITLE/);
    expect(JSON.stringify(searches)).not.toMatch(/ROUND-TITLE/);
    expect(sent).toMatch(/Caching/);
    expect(sent).toMatch(/Number of Islands/);
    const doc = await prepDoc(user, row.id);
    expect(doc?.doc.topics[0].links.map((l) => l.title)).toEqual([
      'Number of Islands',
      'Caching',
    ]);
    expect(doc?.cited.map((s) => [s.site, s.official])).toEqual([
      ['northwind.com', true],
      ['guides.example.org', false],
    ]);
    expect(row.usedJobDescription).toBe(false);
    expect(row.queries).toHaveLength(5);
    const usage = await prisma.aiUsage.findMany({ where: { userId: user.id } });
    expect(
      usage.every((u) => u.feature === 'PREP_RESEARCH' && u.outcome === 'OK'),
    ).toBe(true);
    expect(usage).toHaveLength(6);
    expect(row.costMicros).toBe(5 * 7000 + 1250);
  });

  it('sends the job description to the writing call only, when ticked', async () => {
    const r = fakeRouter(goodDoc);
    const row = await writePrepDoc(
      user,
      { applicationId: app.id, jobDescription: true },
      now,
      r.fetcher,
    );
    expect(JSON.stringify(r.writes())).toMatch(/PRIVATE-JD-MARKER/);
    expect(JSON.stringify(r.searches())).not.toMatch(/PRIVATE-JD-MARKER/);
    expect(row.usedJobDescription).toBe(true);
  });

  it('writes nothing when the searches find too little or the doc is not grounded', async () => {
    await expect(
      writePrepDoc(
        user,
        { applicationId: app.id, jobDescription: false },
        now,
        fakeRouter(goodDoc, { emptySearches: true }).fetcher,
      ),
    ).rejects.toThrow(/found too little/);
    const thin = () => ({
      process: [],
      rounds: [],
      topics: [],
      plan: [],
      questions: [],
    });
    await expect(
      writePrepDoc(
        user,
        { applicationId: app.id, jobDescription: false },
        now,
        fakeRouter(thin).fetcher,
      ),
    ).rejects.toThrow(/grounded doc/);
    expect(
      await prisma.interviewPrepDoc.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it('stops when a search is answered by another provider', async () => {
    const r = fakeRouter(goodDoc, { searchProvider: 'Elsewhere' });
    await expect(
      writePrepDoc(
        user,
        { applicationId: app.id, jobDescription: false },
        now,
        r.fetcher,
      ),
    ).rejects.toThrow(/couldn’t prepare/);
    expect(r.writes()).toHaveLength(0);
    expect(
      (await prisma.aiSetting.findUnique({ where: { userId: user.id } }))
        ?.blockedAt,
    ).not.toBeNull();
  });

  it('keeps to five docs a day, previews what it sends, and leaves Grill Me its limits', async () => {
    const preview = await prepPreview(user, app.id, now);
    expect(preview).toMatchObject({
      rounds: 1,
      roadmapItems: 1,
      problems: 1,
      hasJobDescription: true,
    });
    expect(preview.queries.join(' ')).not.toMatch(/PRIVATE/);
    await prisma.interviewPrepDoc.createMany({
      data: Array.from({ length: DOCS_PER_DAY }, () => ({
        userId: user.id,
        applicationId: app.id,
        company: 'Northwind',
        role: 'Backend Engineer',
        queries: ['q'],
        content: {},
        sources: [],
        createdAt: new Date(+now - 3600_000),
      })),
    });
    await expect(
      writePrepDoc(
        user,
        { applicationId: app.id, jobDescription: false },
        now,
        fakeRouter(goodDoc).fetcher,
      ),
    ).rejects.toThrow(/up to 5 prep docs a day/);
  });

  it('is the owner’s alone, deletable, exported and readable by Rumi', async () => {
    const row = await writePrepDoc(
      user,
      { applicationId: app.id, jobDescription: false },
      now,
      fakeRouter(goodDoc).fetcher,
    );
    const otherId = `prep-other-${randomUUID()}`;
    const other = await prisma.user.create({
      data: {
        id: otherId,
        email: `${otherId}@example.com`,
        name: 'Other',
        timezone: zone,
      },
    });
    try {
      expect(await prepDoc(other, row.id)).toBeNull();
      await expect(deletePrepDoc(other, row.id)).rejects.toThrow();
      await expect(
        writePrepDoc(
          other,
          { applicationId: app.id, jobDescription: false },
          now,
          fakeRouter(goodDoc).fetcher,
        ),
      ).rejects.toThrow(/no longer exists/);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
    const forRumi = await latestPrepDocs(user);
    expect(forRumi.docs[0]).toMatchObject({
      company: 'Northwind',
      topics: [{ name: 'Graphs', yourItems: ['Number of Islands', 'Caching'] }],
    });
    const data = await exportOwnerData(user.id, now);
    expect(data.jobs.prepDocs.map((d) => d.id)).toEqual([row.id]);
    expect(
      (data.jobs.prepDocs[0].content as unknown as PrepDoc).questions,
    ).toHaveLength(1);
    expect(await deletePrepDoc(user, row.id)).toBe(app.id);
    expect(
      await prisma.interviewPrepDoc.count({ where: { userId: user.id } }),
    ).toBe(0);
  });
});
