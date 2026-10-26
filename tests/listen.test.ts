import { describe, expect, it } from 'vitest';
import {
  codeLike,
  crossCheck,
  droppedLine,
  listenMessages,
  paragraphsOf,
  pickPassages,
  readDraft,
  sourcePlan,
  supports,
  tierOf,
  type Passage,
  type PlannedSource,
} from '../src/features/listen/domain';

const source = (
  host: string,
  tier: 'official' | 'secondary',
): PlannedSource => ({
  label: host,
  url: `https://${host}/page`,
  host,
  tier,
});
const passage = (
  id: string,
  text: string,
  host = 'developer.mozilla.org',
  tier: 'official' | 'secondary' = 'official',
): Passage => ({
  id,
  text,
  label: host,
  url: `https://${host}/x`,
  host,
  tier,
  fetchedAt: '2026-10-27T15:00:00.000Z',
});

describe('Listen sources', () => {
  it('fetches only HTTPS links on listed sites, official first, four at most', () => {
    expect(tierOf('www.postgresql.org')).toBe('official');
    expect(tierOf('cheatsheetseries.owasp.org')).toBe('official');
    expect(tierOf('www.hellointerview.com')).toBe('secondary');
    expect(tierOf('www.youtube.com')).toBeNull();
    expect(tierOf('evilpostgresql.org')).toBeNull();
    const plan = sourcePlan([
      { label: 'Guide', url: 'https://www.hellointerview.com/learn/x' },
      { label: 'Video', url: 'https://www.youtube.com/watch?v=1' },
      {
        label: 'Docs',
        url: 'https://www.postgresql.org/docs/current/mvcc.html#a',
      },
      {
        label: 'Docs again',
        url: 'https://www.postgresql.org/docs/current/mvcc.html',
      },
      { label: 'Plain', url: 'http://redis.io/docs' },
      {
        label: 'MDN',
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
      },
      {
        label: 'Repo',
        url: 'https://github.com/donnemartin/system-design-primer',
      },
      { label: 'Blog', url: 'https://martinfowler.com/articles/x.html' },
      { label: 'Broken', url: 'not a url' },
      'nonsense',
    ]);
    expect(plan.fetch.map((s) => s.label)).toEqual([
      'Docs',
      'MDN',
      'Guide',
      'Repo',
    ]);
    expect(plan.fetch[0].url).toBe(
      'https://www.postgresql.org/docs/current/mvcc.html',
    );
    expect(plan.skipped).toEqual([
      { label: 'Video', host: 'youtube.com', reason: 'not a checked source' },
      { label: 'Plain', host: 'redis.io', reason: 'not a secure link' },
      {
        label: 'Blog',
        host: 'martinfowler.com',
        reason: 'more than four sources',
      },
    ]);
  });
});

describe('Listen passages', () => {
  it('keeps readable paragraphs and drops navigation, scripts and code blocks', () => {
    const html = `<nav><p>Home · Docs · Blog · Pricing · Sign in to your account today</p></nav>
      <script>var p = "<p>never</p>";</script>
      <p>MVCC lets readers see a snapshot, so <code>SELECT</code> never blocks writers and writers never block readers.</p>
      <pre>for (let i = 0; i < n; i++) {}</pre>
      <ul><li>Each transaction sees data as of its snapshot &amp; ignores rows written by later transactions.</li></ul>
      <p>Too short.</p>
      <p>const x = { a: 1 }; // a paragraph that is really code and long enough</p>`;
    expect(paragraphsOf(html)).toEqual([
      'MVCC lets readers see a snapshot, so SELECT never blocks writers and writers never block readers.',
      'Each transaction sees data as of its snapshot & ignores rows written by later transactions.',
    ]);
    expect(
      paragraphsOf(
        'A plain text page about vacuum and dead tuples in PostgreSQL tables.\n\nshort',
        'text/plain; charset=utf-8',
      ),
    ).toEqual([
      'A plain text page about vacuum and dead tuples in PostgreSQL tables.',
    ]);
  });
  it('treats code punctuation as code, never ordinary words like let or for', () => {
    expect(
      codeLike(
        'Row versions let readers keep a snapshot, for as long as they need.',
      ),
    ).toBe(false);
    for (const code of [
      'Call `vacuum` often.',
      'if (a == b) retry',
      'x => x + 1',
      'Run analyze() first',
      'return value;',
      'Use the <code> tag',
    ])
      expect(codeLike(code)).toBe(true);
  });
  it('picks the paragraphs that match the item, three a page and nine in all', () => {
    const many = Array.from(
      { length: 6 },
      (_, i) =>
        `Snapshot isolation and MVCC visibility rule number ${i} for concurrent transactions.`,
    );
    const pages = [
      {
        source: source('postgresql.org', 'official'),
        paragraphs: [
          'Unrelated text about pricing tiers and billing cycles.',
          ...many,
        ],
        fetchedAt: 'T',
      },
      {
        source: source('hellointerview.com', 'secondary'),
        paragraphs: many,
        fetchedAt: 'T',
      },
      {
        source: source('github.com', 'secondary'),
        paragraphs: many,
        fetchedAt: 'T',
      },
      {
        source: source('martinfowler.com', 'secondary'),
        paragraphs: many,
        fetchedAt: 'T',
      },
    ];
    const picked = pickPassages(pages, 'MVCC snapshot isolation transactions');
    expect(picked).toHaveLength(9);
    expect(picked.map((p) => p.id)).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
      'P6',
      'P7',
      'P8',
      'P9',
    ]);
    expect(picked.filter((p) => p.host === 'postgresql.org')).toHaveLength(3);
    expect(picked.some((p) => p.text.includes('pricing'))).toBe(false);
  });
  it('sends only the item fields and the passages, never anything else', () => {
    const [, user] = listenMessages({ topic: 'MVCC', scope: 'Snapshots' }, [
      passage('P1', 'MVCC keeps old row versions for snapshots.'),
    ]);
    expect(JSON.parse(user.content)).toEqual({
      topic: 'MVCC',
      scope: 'Snapshots',
      passages: [
        {
          id: 'P1',
          source: 'developer.mozilla.org',
          text: 'MVCC keeps old row versions for snapshots.',
        },
      ],
    });
  });
});

describe('Listen cross-check', () => {
  const official = passage(
    'P1',
    'PostgreSQL uses multiversion concurrency control so readers see a consistent snapshot of committed rows.',
  );
  const guideA = passage(
    'P2',
    'Optimistic locking checks a version column before an update and retries when another writer changed the row.',
    'hellointerview.com',
    'secondary',
  );
  const guideB = passage(
    'P3',
    'With optimistic locking an update compares the version column and the writer retries if the row changed.',
    'github.com',
    'secondary',
  );
  const guideOnly = passage(
    'P4',
    'Sharding by tenant keeps hot customers isolated from each other in large deployments.',
    'designgurus.io',
    'secondary',
  );
  const all = [official, guideA, guideB, guideOnly];
  it('says whether a passage states what a line says', () => {
    expect(
      supports(
        'Readers see a consistent snapshot of committed rows.',
        official.text,
      ),
    ).toBe(true);
    expect(supports('Caching fixes latency everywhere.', official.text)).toBe(
      false,
    );
  });
  it('keeps lines backed by official docs or two sites, and drops the rest with reasons', () => {
    const { lines, dropped } = crossCheck(
      {
        lines: [
          {
            text: 'Readers see a consistent snapshot of committed rows.',
            sources: ['p1'],
          },
          {
            text: 'Optimistic locking compares a version column and retries when the row changed.',
            sources: ['P2', 'P3'],
          },
          {
            text: 'Sharding by tenant keeps hot customers isolated.',
            sources: ['P4'],
          },
          {
            text: 'Readers see a consistent snapshot of committed rows.',
            sources: ['P9'],
          },
          {
            text: 'Caching fixes latency everywhere in every system.',
            sources: ['P1'],
          },
          {
            text: 'See https://example.com for committed rows snapshot.',
            sources: ['P1'],
          },
          {
            text: 'Use const snapshot = read(); for committed rows.',
            sources: ['P1'],
          },
        ],
      },
      all,
    );
    expect(lines).toEqual([
      {
        text: 'Readers see a consistent snapshot of committed rows.',
        sources: ['P1'],
        check: 'official',
      },
      {
        text: 'Optimistic locking compares a version column and retries when the row changed.',
        sources: ['P2', 'P3'],
        check: 'two-sites',
      },
    ]);
    expect(dropped).toEqual({ unsupported: 2, 'one-source': 1, code: 2 });
    expect(droppedLine(dropped)).toBe(
      '5 lines dropped: 2 had no supporting passage, 1 had only one non-official source, 2 read as code or a link.',
    );
    expect(
      droppedLine({ unsupported: 0, 'one-source': 0, code: 0 }),
    ).toBeNull();
  });
  it('reads a draft only in the agreed shape', () => {
    expect(readDraft('nope')).toMatchObject({ ok: false, codes: 'json' });
    expect(readDraft(JSON.stringify({ lines: [] }))).toMatchObject({
      ok: false,
    });
    const good = {
      lines: Array.from({ length: 4 }, () => ({
        text: 'A line long enough.',
        sources: ['P1'],
      })),
    };
    expect(readDraft(JSON.stringify(good))).toEqual({ ok: true, value: good });
  });
});
