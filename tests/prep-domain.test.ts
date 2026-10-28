import { describe, expect, it } from 'vitest';
import {
  citedSources,
  collectSources,
  isOfficial,
  MAX_SEARCHES,
  PREP_FORMAT,
  prepMessages,
  readPrepDoc,
  searchBody,
  searchQueries,
  sourceKey,
} from '../src/features/prep/domain';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';

const cite = (url: string, title = 'A page') => ({
  type: 'url_citation',
  url_citation: { url, title },
});

describe('the searches (ADR-024)', () => {
  it('are built from the company, the role and round types only', () => {
    const q = searchQueries({
      company: 'Amazon',
      role: 'SDE II',
      roundTypes: ['CODING', 'SYSTEM_DESIGN', 'CODING', 'OTHER'],
    });
    expect(q).toEqual([
      'Amazon SDE II interview process and rounds',
      'Amazon SDE II coding interview questions',
      'Amazon SDE II system design interview questions',
      'Amazon SDE II interview experience',
      'Amazon hiring values what interviewers look for',
      'Amazon SDE II technical interview topics',
    ]);
    expect(
      searchQueries({
        company: 'A',
        role: 'B',
        roundTypes: [
          'RECRUITER',
          'ASSESSMENT',
          'CODING',
          'SYSTEM_DESIGN',
          'BEHAVIORAL',
          'FINAL',
        ],
      }).length,
    ).toBe(MAX_SEARCHES);
  });
  it('send the query alone on the pinned endpoint with Exa', () => {
    const body = searchBody('Amazon SDE II interview process and rounds');
    expect(body.model).toBe(MODEL);
    expect(body.provider).toMatchObject({
      only: [ENDPOINT],
      allow_fallbacks: false,
      zdr: true,
      data_collection: 'deny',
    });
    expect(body.plugins).toEqual([
      { id: 'web', engine: 'exa', max_results: 3 },
    ]);
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: 'Amazon SDE II interview process and rounds',
    });
    expect('temperature' in body).toBe(false);
  });
});

describe('sources', () => {
  it('are Official only on the company’s own domain or the posting’s host', () => {
    expect(isOfficial('amazon.jobs', 'Amazon')).toBe(true);
    expect(isOfficial('www.aws.amazon.com', 'Amazon')).toBe(true);
    expect(isOfficial('careers.google.com', 'Google')).toBe(true);
    expect(isOfficial('jointaro.com', 'Amazon')).toBe(false);
    expect(isOfficial('amazon-interview-prep.com', 'Amazon')).toBe(false);
    expect(
      isOfficial('boards.greenhouse.io', 'Northwind', 'boards.greenhouse.io'),
    ).toBe(true);
    expect(isOfficial('jobs.lever.co', 'Northwind Traders')).toBe(false);
    // A trailing suffix word the domain leaves out still counts (WI-058).
    expect(isOfficial('northwind.jobs', 'Northwind Labs')).toBe(true);
    expect(isOfficial('careers.northwind-labs.com', 'Northwind Labs')).toBe(
      true,
    );
    expect(isOfficial('labs.example.com', 'Northwind Labs')).toBe(false);
  });
  it('are deduplicated, HTTPS only, and numbered in order', () => {
    const s = collectSources(
      [
        cite(
          'https://www.amazon.jobs/en/landing_pages/interviewing#top',
          'How we hire',
        ),
        cite('https://www.amazon.jobs/en/landing_pages/interviewing'),
        cite('http://insecure.example.com/x'),
        cite('not a url'),
        { type: 'other' },
        cite('https://jointaro.com/amazon'),
      ],
      'Amazon',
    );
    expect(s).toEqual([
      {
        id: 'S1',
        url: 'https://www.amazon.jobs/en/landing_pages/interviewing',
        site: 'amazon.jobs',
        title: 'How we hire',
        official: true,
      },
      {
        id: 'S2',
        url: 'https://jointaro.com/amazon',
        site: 'jointaro.com',
        title: 'A page',
        official: false,
      },
    ]);
    expect(sourceKey(cite('https://a.example.com/p#x'))).toBe(
      'https://a.example.com/p',
    );
  });
});

describe('the doc', () => {
  const sources = [
    {
      id: 'S1',
      url: 'https://amazon.jobs/a',
      site: 'amazon.jobs',
      title: 'A',
      official: true,
    },
    {
      id: 'S2',
      url: 'https://b.example.com/b',
      site: 'b.example.com',
      title: 'B',
      official: false,
    },
  ];
  const input = {
    sources,
    roadmap: [
      { id: 'item-1', title: 'Caching', roadmap: 'System design', done: false },
    ],
    problems: [
      {
        id: 'prob-1',
        title: 'Number of Islands',
        topic: 'Graphs',
        confidence: 'red',
      },
    ],
  };
  const good = {
    process: [
      {
        text: 'A recruiter screen, then a loop of four rounds.',
        sources: ['S1'],
      },
      { text: 'Unsourced claim about pay.', sources: [] },
      { text: 'Made-up source.', sources: ['S9'] },
    ],
    rounds: [{ name: 'Coding', tests: ['Graphs'], sources: ['S2', 'S2'] }],
    topics: [
      {
        name: 'Graphs',
        why: 'Common in coding rounds.',
        sources: ['S2'],
        links: ['P1', 'R7', 'P1'],
      },
      {
        name: 'Caching',
        why: 'System design.',
        sources: ['S1'],
        links: ['R1'],
      },
    ],
    plan: [
      { day: 1, focus: 'Graphs', links: ['P1'] },
      { day: 1, focus: 'Again', links: [] },
      { day: 9, focus: 'Too late', links: [] },
    ],
    questions: ['How is on-call shared?'],
  };
  it('keeps only sourced points and the owner’s real items', () => {
    const r = readPrepDoc(JSON.stringify(good), input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.process.map((p) => p.text)).toEqual([
      'A recruiter screen, then a loop of four rounds.',
    ]);
    expect(r.value.rounds[0].sources).toEqual(['S2']);
    expect(r.value.topics[0].links).toEqual([
      { kind: 'problem', id: 'prob-1', title: 'Number of Islands' },
    ]);
    expect(r.value.topics[1].links).toEqual([
      { kind: 'roadmap', id: 'item-1', title: 'Caching' },
    ]);
    expect(r.value.plan).toEqual([{ day: 1, focus: 'Again', links: [] }]);
    expect(citedSources(r.value, sources).map((s) => s.id)).toEqual([
      'S1',
      'S2',
    ]);
  });
  it('refuses a doc with too few sourced points, or broken JSON', () => {
    const thin = { ...good, rounds: [], topics: [] };
    expect(readPrepDoc(JSON.stringify(thin), input)).toMatchObject({
      ok: false,
      codes: 'ungrounded',
    });
    expect(readPrepDoc('{', input)).toMatchObject({ ok: false, codes: 'json' });
  });
  it('sends the job description only when given, and ids for the owner’s items', () => {
    const base = {
      company: 'Amazon',
      role: 'SDE II',
      rounds: [{ title: 'Loop', type: 'FINAL', on: '2026-11-03' }],
      notes: [{ query: 'q', text: 'notes', sources: ['S1'] }],
      ...input,
    };
    const without = JSON.parse(prepMessages(base)[1].content);
    expect(without).not.toHaveProperty('jobDescription');
    expect(without.roadmap).toEqual([
      { id: 'R1', title: 'Caching', roadmap: 'System design', done: false },
    ]);
    expect(without.sources).toEqual([
      { id: 'S1', site: 'amazon.jobs', title: 'A' },
      { id: 'S2', site: 'b.example.com', title: 'B' },
    ]);
    const withJd = JSON.parse(
      prepMessages({ ...base, jobDescription: 'Build services.' })[1].content,
    );
    expect(withJd.jobDescription).toBe('Build services.');
    expect(PREP_FORMAT.maxTokens).toBe(3000);
  });
});
