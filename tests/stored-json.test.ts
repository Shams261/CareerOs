import { describe, expect, it } from 'vitest';
import { storedPrepDoc } from '../src/features/prep/domain';
import { readBundle } from '../src/features/curriculum/bundle';

/**
 * Stored JSON is read through its shape, never cast (WI-139): a prep doc from an older version
 * or a hand-edited row shows what still fits, and a broken curriculum bundle is refused with
 * the path of the first problem instead of failing halfway through a copy.
 */
describe('storedPrepDoc', () => {
  const doc = {
    process: [{ text: 'Two rounds', sources: ['S1'] }],
    rounds: [{ name: 'Coding', tests: ['Arrays'], sources: ['S1'] }],
    topics: [
      {
        name: 'Graphs',
        why: 'Asked often',
        sources: ['S2'],
        links: [{ kind: 'problem', id: 'p1', title: 'Islands' }],
      },
    ],
    plan: [{ day: 1, focus: 'Graphs', links: [] }],
    questions: ['Why us?'],
    asks: [],
    order: [],
  };

  it('reads a doc as written', () => {
    expect(storedPrepDoc(doc)).toEqual(doc);
  });

  it('reads a doc from before WI-105 with no asks or order', () => {
    const { asks: _a, order: _o, ...old } = doc;
    expect(storedPrepDoc(old)).toMatchObject({ asks: [], order: [] });
    expect(storedPrepDoc(old).topics[0].name).toBe('Graphs');
  });

  it('keeps the parts that fit when one does not', () => {
    const read = storedPrepDoc({ ...doc, rounds: 'not a list' });
    expect(read.rounds).toEqual([]);
    expect(read.process).toEqual(doc.process);
  });

  it('reads nothing at all as an empty doc', () => {
    for (const bad of [null, 'text', 42, []])
      expect(storedPrepDoc(bad)).toMatchObject({
        process: [],
        topics: [],
        plan: [],
      });
  });
});

describe('readBundle', () => {
  const bundle = {
    format: 'silsila-roadmap-bundle',
    version: 1,
    builtAt: '2026-11-02T00:00:00Z',
    roadmaps: [
      {
        title: 'DSA patterns',
        sections: [
          {
            name: 'Week 1',
            items: [
              {
                slug: 'two-pointers',
                title: 'Two pointers',
                kind: 'CONCEPT',
                priority: 1,
              },
            ],
          },
        ],
      },
    ],
    dsa: { topics: [{ name: 'Arrays', ordering: 1 }], problems: [] },
  };

  it('reads a version 1 bundle', () => {
    const read = readBundle(bundle);
    expect(read.ok && read.bundle.roadmaps[0].sections[0].items[0].slug).toBe(
      'two-pointers',
    );
  });

  it('refuses another format with where it went wrong', () => {
    expect(readBundle({ ...bundle, version: 2 })).toEqual({
      ok: false,
      problem: expect.stringContaining('version'),
    });
    const broken = structuredClone(bundle);
    (broken.roadmaps[0].sections[0].items[0] as { priority: number }).priority =
      7;
    const read = readBundle(broken);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.problem).toMatch(
      /^roadmaps\.0\.sections\.0\.items\.0\.priority/,
    );
  });
});
