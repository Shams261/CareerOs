import { describe, expect, it } from 'vitest';
import {
  cleanBlock,
  extractLiteral,
  groupedBullets,
  normaliseBackendTemplate,
  parseBackendTracker,
  parseHandbook,
  parsePatternBook,
  parseScenarioLiteral,
  parseSystemDesignTracker,
  parseTechnicalRoadmap,
  priorityOf,
  singleQuotedStrings,
} from '../scripts/lib/roadmap-sources';
import { validateBundle, type Bundle } from '../scripts/lib/roadmap-bundle';

const backendHtml = `<html><body><script>
const weeks=[{"week": 1, "title": "Foundations", "outcome": "Trace a request", "topics": [{"id": "w1t1", "title": "HTTP [semantics]", "scope": "Methods, codes", "priority": "P0", "checkpoint": "Explain retry risks."}]}];
const extras=[["Advanced databases", "WAL, MVCC"]];
const master="not used";
const curatedReferences={"w1t1":[{"name":"MDN HTTP","url":"https://developer.mozilla.org/docs/Web/HTTP","type":"Official documentation"}]};
const starter=\`Start Week [WEEK] — [TOPIC].
Scope: [PASTE ROADMAP SCOPE]
Checkpoint: [PASTE ROADMAP CHECKPOINT]
Priority: [PRIORITY]
[CURATED REFERENCES]
[USER REFERENCES]\`;
const scenarioDefinitions=[
{id:'start',name:'▶ Start',intro:'Teach it; don\\'t quiz.'},
{id:'pause',name:'⏸ Pause',intro:'Stop now.'}
];
let progress={};
</script></body></html>`;

const sdHtml = `<script>const DATA={"items": [{"id": "01-1", "unit": "01", "section": "Orientation", "title": "Introduction", "kind": "orientation", "scope": "What is assessed", "refs": []}, {"id": "02-1", "unit": "02", "section": "Foundations", "title": "Caching", "kind": "concept", "scope": "TTL, eviction", "refs": [["Redis docs", "https://redis.io/docs/"]]}, {"id": "02-2", "unit": "02", "section": "Foundations", "title": "Practice: Bitly", "kind": "practice", "scope": "URL shortener", "refs": []}], "units": [{"id": "01", "title": "Orientation"}, {"id": "02", "title": "Foundations"}], "resource": {"official": [["Course", "https://www.hellointerview.com/learn/courses/system-design"]], "supplementary": [["Primer", "https://github.com/donnemartin/system-design-primer"]]}, "extras": [["Reliability", "SLOs"]]};const scenarios=[['start','Learn','Teach the concept.'],['mock','Mock','Interview me.']];</script>`;

const technicalMd = `# Roadmap
## A. Programming fundamentals
### A1. JavaScript core — P0
- Closures and scope.
- **Practice:** output tracing.
- **Sample questions:** Why does closure retain variables?
### A2. TypeScript — P1 (P0 for TS-heavy roles)
- Generics.
## F. How to prioritize a posting
1. Read requirements.
2. Map each requirement.
`;

const bookText = `Table of contents
Chapter 0: JavaScript DSA Toolkit — Pehle Hathiyaar Seekho
Chapter 1: Arrays & Hashing — O(n) ka Jaadu

                                 DSA Pattern Bible | Page 2
Chapter 0: JavaScript DSA Toolkit — Pehle
Hathiyaar Seekho
Bhai, pehle tools seekho. Map sabse important hai.

Map — Tera Sabse Important Weapon
  const map = new Map();
  map.set('k', 1); // insert

                                 DSA Pattern Bible | Page 3
Chapter 1: Arrays & Hashing — O(n) Ka
Jaadu
Hash map se O(n) ho jaata hai.
  Pattern Pehchaano Jab: 'contains duplicate', 'first unique',
  'pair with target sum'.

Template — Complement Lookup
  function twoSum(nums, t) {
  }

                                 DSA Pattern Bible | Page 4
`;

const handbookText = `   BEHAVIORAL + RESUME DEEP DIVE
   01 Evidence and chronology audit
   02 Your career narrative
   03 Behavioral story selection matrix
   04 Behavioral questions - practice bank
   09 Final verification worksheet
BEHAVIORAL + RESUME DEEP DIVE | 2026                                   1 / 4
   01 Evidence and chronology audit
   Dates matter.
   02 Your career narrative
   60-second draft
     “I am an engineer.”
   1V-01 / Ownership / ambiguity

   Building the platform
   30-second version
      “At work I built a platform.”
   Interview follow-ups to be able to answer
   • What was manual before?
   • What was the baseline? It
     was measured monthly.
BEHAVIORAL + RESUME DEEP DIVE | 2026                                   2 / 4
   03 Behavioral story selection matrix
    Competency                             Best initial story                             Backup
    Ambiguous requirements /               1V-01 platform workflow                        AC-03 reimbursement
    end-to-end ownership
    Performance optimization               ACC-01 API/cache                               ACC-03 analytics SQL
   04 Behavioral questions - practice bank
   Ownership and ambiguity
   • Tell me about the most ambiguous requirement you owned.
   • Describe something you delivered end-to-end.
   Team and growth
   • Why this role and why now?
   Answer method: 10% context, 50% actions. This is a guideline,
   not a rigid formula.
   09 Final verification worksheet
   Fill these in.
   1Visa
   My exact role: __________________________
   80% metric (baseline): _________________________
  ANSWERED FOLLOW-UPS | INTERVIEW ADDENDUM
 Evidence standard: answers rely on the bullets.
 1Visa | End-to-end platform architecture
 1. Walk me through the architecture.
 The UI is Next.js.
 2. What problem were you solving?
 Manual steps.
 Behavioral | Tough follow-ups
 1. Tell me about a conflict.
 I listened.
`;

describe('inline-script literals', () => {
  it('bracket-matches arrays and objects and reads quoted strings', () => {
    expect(JSON.parse(extractLiteral(backendHtml, 'extras'))).toEqual([
      ['Advanced databases', 'WAL, MVCC'],
    ]);
    expect(extractLiteral(backendHtml, 'master')).toBe('"not used"');
    expect(
      extractLiteral(backendHtml, 'starter').startsWith('`Start Week'),
    ).toBe(true);
    expect(() => extractLiteral(backendHtml, 'missing')).toThrow('not found');
    // Brackets inside strings do not end the literal.
    expect(
      JSON.parse(extractLiteral(backendHtml, 'weeks'))[0].topics[0].title,
    ).toBe('HTTP [semantics]');
  });
  it('reads single-quoted JS strings with escapes', () => {
    expect(singleQuotedStrings(`['a','b\\'c','d']`)).toEqual(['a', "b'c", 'd']);
    expect(
      parseScenarioLiteral(extractLiteral(backendHtml, 'scenarioDefinitions')),
    ).toEqual([
      { id: 'start', name: '▶ Start', intro: "Teach it; don't quiz." },
      { id: 'pause', name: '⏸ Pause', intro: 'Stop now.' },
    ]);
  });
});

describe('backend tracker', () => {
  const roadmap = parseBackendTracker(backendHtml);
  it('maps weeks to sections, topics to items with references, and normalises the template', () => {
    expect(roadmap.sections.map((s) => [s.name, s.items.length])).toEqual([
      ['Week 1 · Foundations', 1],
      ['Beyond week 8', 1],
    ]);
    expect(roadmap.sections[0].items[0]).toMatchObject({
      slug: 'w1t1',
      title: 'HTTP [semantics]',
      priority: 1,
      scope: 'Methods, codes',
      checkpoint: 'Explain retry risks.',
      references: [
        {
          label: 'MDN HTTP',
          url: 'https://developer.mozilla.org/docs/Web/HTTP',
          kind: 'Official documentation',
        },
      ],
    });
    expect(roadmap.sections[1].items[0]).toMatchObject({
      slug: 'beyond-advanced-databases',
      priority: 3,
    });
    expect(roadmap.promptTemplate).toContain('Start {{section}} — {{topic}}.');
    expect(roadmap.promptTemplate).toContain('{{references}}');
    expect(roadmap.promptTemplate).toContain('{{extra}}');
    expect(roadmap.promptTemplate?.trim().endsWith('{{scenario}}')).toBe(true);
    expect(roadmap.promptTemplate).not.toMatch(/\[[A-Z ]+\]/);
    expect(roadmap.scenarios).toHaveLength(2);
    expect(normaliseBackendTemplate('[PRIORITY]')).toContain('{{priority}}');
  });
});

describe('system design tracker', () => {
  const roadmap = parseSystemDesignTracker(sdHtml);
  it('adds the sources item, one section per unit and the extended-depth section', () => {
    expect(roadmap.sections.map((s) => [s.name, s.items.length])).toEqual([
      ['How to use this roadmap', 1],
      ['01 · Orientation', 1],
      ['02 · Foundations', 2],
      ['Extended depth', 1],
    ]);
    const [caching, bitly] = roadmap.sections[2].items;
    expect(caching).toMatchObject({
      slug: '02-1',
      kind: 'CONCEPT',
      priority: 1,
    });
    expect(caching.references?.map((r) => r.label)).toEqual([
      'Course',
      'Redis docs',
    ]);
    expect(bitly).toMatchObject({ slug: '02-2', kind: 'QUESTION' });
    expect(bitly.checkpoint).toContain('delivery framework');
    expect(roadmap.scenarios?.map((s) => s.id)).toEqual(['start', 'mock']);
    expect(roadmap.promptTemplate).toContain('{{scenario}}');
  });
});

describe('technical roadmap markdown', () => {
  const roadmap = parseTechnicalRoadmap(technicalMd);
  it('turns headings into sections and items, bullets into scope and practice into checkpoints', () => {
    expect(roadmap.sections.map((s) => [s.name, s.items.length])).toEqual([
      ['A. Programming fundamentals', 2],
      ['How to use this roadmap', 1],
    ]);
    const [js, ts] = roadmap.sections[0].items;
    expect(js).toMatchObject({
      slug: 'a1-javascript-core',
      title: 'A1. JavaScript core',
      priority: 1,
      scope: '• Closures and scope.',
      checkpoint:
        'Practice: output tracing.\nSample questions: Why does closure retain variables?',
    });
    expect(ts).toMatchObject({
      priority: 2,
      sourceRef: 'Technical roadmap A2 (P0 for TS-heavy roles)',
    });
    expect(roadmap.sections[1].items[0]).toMatchObject({
      slug: 'guide-how-to-prioritize-a-posting',
    });
    expect(roadmap.sections[1].items[0].scope).toContain(
      '1. Read requirements.',
    );
    expect(priorityOf('P2 (promote)')).toBe(3);
    expect(priorityOf(undefined)).toBe(2);
  });
});

describe('DSA pattern book text', () => {
  const chapters = parsePatternBook(bookText);
  it('takes titles from the contents, bodies after it, with pages, intro, signals and headings', () => {
    expect(chapters.map((c) => [c.number, c.title, c.pages])).toEqual([
      [0, 'JavaScript DSA Toolkit — Pehle Hathiyaar Seekho', 'p. 3'],
      [1, 'Arrays & Hashing — O(n) ka Jaadu', 'p. 4'],
    ]);
    expect(chapters[0].intro).toBe(
      'Bhai, pehle tools seekho. Map sabse important hai.',
    );
    expect(chapters[0].headings).toEqual(['Map — Tera Sabse Important Weapon']);
    expect(chapters[1].recognise).toBe(
      "Pattern Pehchaano Jab: 'contains duplicate', 'first unique', 'pair with target sum'.",
    );
    expect(chapters[1].headings).toEqual(['Template — Complement Lookup']);
  });
});

describe('behavioural handbook text', () => {
  const hb = parseHandbook(handbookText);
  it('splits stories, parts, the matrix and the addendum', () => {
    expect(hb.stories).toHaveLength(1);
    expect(hb.stories[0]).toMatchObject({
      code: '1V-01',
      competencies: 'Ownership / ambiguity',
      title: 'Building the platform',
    });
    expect(hb.stories[0].body).toContain(
      '• What was the baseline? It was measured monthly.',
    );
    expect(hb.stories[0].body).not.toContain('DEEP DIVE | 2026');
    expect(hb.parts.map((p) => p.number)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '09',
    ]);
    // Part 02 stops where the first story starts.
    expect(hb.parts[1].body).toBe('60-second draft\n“I am an engineer.”');
    expect(hb.matrix).toEqual([
      {
        competency: 'Ambiguous requirements / end-to-end ownership',
        best: '1V-01 platform workflow',
        backup: 'AC-03 reimbursement',
      },
      {
        competency: 'Performance optimization',
        best: 'ACC-01 API/cache',
        backup: 'ACC-03 analytics SQL',
      },
    ]);
    expect(groupedBullets(hb.parts[3].body)).toEqual([
      {
        heading: 'Ownership and ambiguity',
        bullets: [
          'Tell me about the most ambiguous requirement you owned.',
          'Describe something you delivered end-to-end.',
        ],
      },
      { heading: 'Team and growth', bullets: ['Why this role and why now?'] },
    ]);
    expect(hb.parts[4].body.split('\n')).toContain(
      'My exact role: __________________________',
    );
    expect(hb.addendum.map((a) => a.title)).toEqual([
      '1Visa · End-to-end platform architecture',
      'Behavioral · Tough follow-ups',
    ]);
    expect(hb.addendum[0].body).toContain(
      '1. Walk me through the architecture.',
    );
  });
  it('cleanBlock keeps bullets and paragraphs apart', () => {
    expect(
      cleanBlock([
        '  • one',
        '    continues',
        '',
        '  Para one',
        '  para one too',
        '  • two.',
        '  New sentence.',
      ]),
    ).toBe('• one continues\n\nPara one para one too\n• two.\nNew sentence.');
  });
});

describe('bundle validation', () => {
  it('reports duplicates and dangling links', () => {
    const bundle: Bundle = {
      format: 'silsila-roadmap-bundle',
      version: 1,
      builtAt: 'now',
      roadmaps: [
        {
          title: 'A',
          sections: [
            {
              name: 'S',
              items: [
                { slug: 'x', title: 'X', kind: 'CONCEPT', priority: 1 },
                {
                  slug: 'x',
                  title: 'X again',
                  kind: 'CONCEPT',
                  priority: 1,
                  problemUrl: 'https://leetcode.com/problems/none/',
                },
                {
                  slug: 'y',
                  title: 'Y',
                  kind: 'CONCEPT',
                  priority: 1,
                  dsaTopic: 'Nope',
                },
              ],
            },
          ],
        },
      ],
      dsa: {
        topics: [],
        problems: [
          {
            title: 'P',
            problemUrl: 'https://leetcode.com/problems/p/',
            difficulty: 'EASY',
            topic: 'Nope',
          },
        ],
      },
    };
    expect(validateBundle(bundle)).toEqual([
      'A: duplicate slug x',
      'A: x links to an unknown problem https://leetcode.com/problems/none/',
      'A: y links to an unknown topic Nope',
      'Problem P names an unknown topic Nope',
    ]);
  });
});
