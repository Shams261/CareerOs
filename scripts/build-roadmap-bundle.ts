/**
 * pnpm roadmap:bundle "<sources folder>" [out.json]
 *
 * Builds the roadmap bundle from the owner's study materials: the two HTML trackers, the
 * technical roadmap Markdown, the DSA pattern book (PDF, via `pdftotext -layout`) and the
 * behavioural handbook (PDF), plus the researched curriculum in scripts/lib. Writes JSON next
 * to the sources (or to the given path) and touches no database. The output may contain the
 * owner's rehearsal text: keep it outside the repository.
 *
 * Needs poppler's `pdftotext` on PATH. The Sean Prashad problem list is fetched once from
 * GitHub and cached as `leetcode-patterns.json` beside the sources (set PRASHAD_JSON to a
 * local path to skip the network).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bundleCounts,
  slugify,
  validateBundle,
  type Bundle,
  type BundleItem,
  type BundleProblem,
  type BundleRoadmap,
  type BundleSection,
} from './lib/roadmap-bundle';
import {
  groupedBullets,
  parseBackendTracker,
  parseHandbook,
  parsePatternBook,
  parseSystemDesignTracker,
  parseTechnicalRoadmap,
  refs,
  type BookChapter,
  type Handbook,
} from './lib/roadmap-sources';
import {
  DESIGN_CLASS,
  DRILLS,
  HOW_TO_USE,
  PATTERNS,
  PRACTICAL_TASKS,
  PRASHAD_TAG_TO_PATTERN,
  TOOLKIT,
  type CoreProblem,
} from './lib/dsa-curriculum';
import {
  BEHAVIOURAL_UNCERTAINTY,
  DEEP_DIVE_PROBES,
  DELIVERY_GUIDANCE,
  FRAMEWORK_SECTIONS,
  INTERVIEW_FORMATS,
  questionBankSections,
  type ResearchSection,
} from './lib/interview-research';

const FILES = {
  backend: 'backend_interview_mastery_roadmap (1).html',
  systemDesign: 'system_design_mastery_tracker.html',
  technical: '02_TECHNICAL_ROADMAP.md',
  book: join('LearningMaterialsPDF', 'DSA-PATTERN_BOOK.pdf'),
  handbook: 'Behavioural_Resume_Deep_Dive_2026_Answered.pdf',
};
const PRASHAD_URL =
  'https://raw.githubusercontent.com/seanprashad/leetcode-patterns/main/src/data/questions.json';

type PrashadProblem = {
  id: number;
  title: string;
  slug: string;
  pattern: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
  premium: boolean;
  companies: { name: string; frequency: number }[];
};

const leetcodeUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;

function researchSection(s: ResearchSection): BundleSection {
  return {
    name: s.name,
    items: s.items.map((i) => ({
      slug: i.slug,
      title: i.title,
      kind: i.kind ?? 'CONCEPT',
      priority: i.priority ?? 2,
      estimateMinutes: i.estimateMinutes,
      scope: i.scope,
      checkpoint: i.checkpoint,
      notes: i.notes,
      references: refs(i.references ?? []),
      sourceRef: 'Interview research, October 2026',
    })),
  };
}

/* ------------------------------------------------------------------ DSA roadmap */

function dsaRoadmap(
  book: BookChapter[],
  prashad: PrashadProblem[],
): {
  roadmap: BundleRoadmap;
  topics: Bundle['dsa']['topics'];
  problems: BundleProblem[];
} {
  const chapter = (n: number) => book.find((c) => c.number === n);
  const bySlug = new Map(prashad.map((q) => [q.slug, q]));
  const companies = (q?: PrashadProblem) =>
    q?.companies
      .slice()
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 6)
      .map((c) => c.name)
      .join(', ') ?? '';
  const topics: Bundle['dsa']['topics'] = [];
  const problems = new Map<string, BundleProblem>();
  const addProblem = (
    topic: string,
    p: CoreProblem,
    q: PrashadProblem | undefined,
    extra: string,
  ) => {
    const url = leetcodeUrl(p.slug);
    if (problems.has(url)) return url;
    problems.set(url, {
      title: p.title,
      problemUrl: url,
      difficulty: p.difficulty,
      topic,
      notes: [
        `LeetCode ${p.id}`,
        p.note,
        q ? `Companies (Prashad): ${companies(q)}` : null,
        q?.premium || p.note?.includes('premium')
          ? 'Premium on LeetCode'
          : null,
        extra,
      ]
        .filter(Boolean)
        .join(' · '),
    });
    return url;
  };
  const problemItem = (
    prefix: string,
    topic: string,
    p: CoreProblem,
    q: PrashadProblem | undefined,
    priority: 1 | 2 | 3,
    extra: string,
  ): BundleItem => ({
    slug: `${prefix}-${p.id}`,
    title: `${p.id}. ${p.title}`,
    kind: 'QUESTION',
    priority,
    estimateMinutes:
      p.difficulty === 'EASY' ? 25 : p.difficulty === 'MEDIUM' ? 40 : 60,
    scope: [
      `${p.difficulty[0]}${p.difficulty.slice(1).toLowerCase()} · pattern: ${topic}`,
      p.lists
        ? `Lists: ${[...p.lists].map((l) => ({ N: 'NeetCode 150', B: 'Blind 75', G: 'Grind 75', P: 'Prashad' })[l]).join(', ')}`
        : null,
      q ? `Asked at (Prashad): ${companies(q)}` : null,
      p.note,
    ]
      .filter(Boolean)
      .join('\n'),
    checkpoint:
      'Solved on my own in JavaScript inside the estimate; attempt recorded in Practice; can state the pattern and the complexity.',
    url: leetcodeUrl(p.slug),
    sourceRef: extra,
    problemUrl: addProblem(topic, p, q, extra),
  });
  const sections: BundleSection[] = [];
  sections.push({
    name: 'How to use this roadmap',
    items: [
      {
        slug: 'dsa-how-to-use',
        title: HOW_TO_USE.title,
        kind: 'CONCEPT',
        priority: 1,
        scope: HOW_TO_USE.scope,
        checkpoint: 'Read once; re-read when a company loop is booked.',
        references: refs(HOW_TO_USE.references),
        sourceRef: 'Interview research, October 2026',
      },
    ],
  });
  PATTERNS.forEach((pattern, index) => {
    topics.push({
      name: pattern.name,
      description: pattern.signal,
      ordering: index + 1,
    });
    const chapters = pattern.chapters
      .map(chapter)
      .filter(Boolean) as BookChapter[];
    const items: BundleItem[] = [
      {
        slug: `pattern-${slugify(pattern.name)}`,
        title: `${pattern.name}: recognise it and know the template`,
        kind: 'CONCEPT',
        priority: 1,
        estimateMinutes: 45,
        scope: [
          `Signal: ${pattern.signal}`,
          ...chapters.map((c) =>
            [
              `Book chapter ${c.number}: ${c.title}${c.pages ? ` (${c.pages})` : ''}.`,
              c.recognise,
              c.intro,
              c.headings.length
                ? `Templates and headings: ${c.headings.join(' · ')}`
                : null,
            ]
              .filter(Boolean)
              .join(' '),
          ),
        ].join('\n\n'),
        checkpoint:
          'Can write the template from memory in JavaScript and name three signals that call for it.',
        references: refs([
          [
            'NeetCode roadmap mirror',
            'https://github.com/aridepai17/NEETCODE-ROADMAP',
          ],
        ]),
        sourceRef:
          chapters.map((c) => `DSA Pattern Bible ch. ${c.number}`).join(', ') ||
          'Interview research',
        dsaTopic: pattern.name,
      },
      ...pattern.problems.map((p) =>
        problemItem(
          `core`,
          pattern.name,
          p,
          bySlug.get(p.slug),
          1,
          `Core list (${pattern.name})`,
        ),
      ),
    ];
    // Remaining Prashad problems under this pattern: "More practice", P2.
    const more = prashad.filter(
      (q) =>
        !pattern.problems.some((p) => p.slug === q.slug) &&
        patternOf(q) === pattern.name,
    );
    for (const q of more) {
      const p: CoreProblem = {
        id: q.id,
        title: q.title,
        slug: q.slug,
        difficulty: q.difficulty.toUpperCase() as CoreProblem['difficulty'],
        lists: 'P',
      };
      items.push(
        problemItem(
          'more',
          pattern.name,
          p,
          q,
          3,
          `More practice (${pattern.name}), from the Prashad list`,
        ),
      );
    }
    sections.push({ name: pattern.name, items });
  });
  // Design a class.
  topics.push({
    name: DESIGN_CLASS.name,
    description: DESIGN_CLASS.signal,
    ordering: PATTERNS.length + 1,
  });
  sections.push({
    name: DESIGN_CLASS.name,
    items: [
      {
        slug: 'pattern-design-a-class',
        title: 'Design a class: state, invariants, a small API and tests',
        kind: 'CONCEPT',
        priority: 1,
        estimateMinutes: 45,
        scope: DESIGN_CLASS.signal,
        checkpoint:
          'Can build LRU cache, Min Stack and a rate limiter from a blank file with tests, narrating the invariants.',
        sourceRef: 'Interview research, October 2026',
        dsaTopic: DESIGN_CLASS.name,
      },
      ...DESIGN_CLASS.problems.map((p) => ({
        ...problemItem(
          'design',
          DESIGN_CLASS.name,
          p,
          bySlug.get(p.slug),
          1,
          'Design a class',
        ),
        // The same LeetCode problem may already sit under its pattern; keep one Practice row.
        problemUrl: problems.has(leetcodeUrl(p.slug))
          ? leetcodeUrl(p.slug)
          : addProblem(
              DESIGN_CLASS.name,
              p,
              bySlug.get(p.slug),
              'Design a class',
            ),
      })),
      ...DESIGN_CLASS.tasks.map((t) => ({
        slug: `design-task-${slugify(t.title)}`,
        title: t.title,
        kind: 'CONCEPT' as const,
        priority: 1 as const,
        estimateMinutes: 60,
        scope: `${t.scope}\nReported at: ${t.companies}.`,
        checkpoint:
          'Built from a blank file with tests in 60 minutes while narrating; can extend it when the interviewer changes a requirement.',
        sourceRef: 'Interview research, October 2026',
      })),
    ],
  });
  sections.push({
    name: 'Practical coding for product companies',
    items: PRACTICAL_TASKS.map((t) => ({
      slug: `practical-${slugify(t.title)}`,
      title: t.title,
      kind: 'CONCEPT' as const,
      priority: 1 as const,
      estimateMinutes: 60,
      scope: `${t.scope}\nReported at: ${t.companies}.`,
      checkpoint:
        'Built from a blank file with tests in 60 minutes while narrating; requirements changed once mid-way and handled.',
      references: refs(t.source),
      sourceRef: 'Interview research, October 2026',
    })),
  });
  sections.push({
    name: 'Code review and bug squash drills',
    items: DRILLS.map((t) => ({
      slug: `drill-${slugify(t.title)}`,
      title: t.title,
      kind: 'CONCEPT' as const,
      priority: 1 as const,
      estimateMinutes: 30,
      scope: `${t.scope}\nWhere it shows up: ${t.companies}.`,
      checkpoint:
        'Done three times with the "review" or "bugsquash" scenario from Copy prompt; the last one inside the time box.',
      references: refs(t.source),
      sourceRef: 'Interview research, October 2026',
    })),
  });
  sections.push({
    name: 'JavaScript toolkit',
    items: [
      ...TOOLKIT.map((t) => ({
        slug: `toolkit-${slugify(t.title)}`,
        title: t.title,
        kind: 'CONCEPT' as const,
        priority: 1 as const,
        estimateMinutes: 20,
        scope: t.scope,
        checkpoint: 'Can write it from memory without looking it up.',
        sourceRef: t.chapters
          .map((n) => `DSA Pattern Bible ch. ${n}`)
          .join(', '),
      })),
      ...[18, 19]
        .map(chapter)
        .filter(Boolean)
        .map((c) => ({
          slug: `book-chapter-${c!.number}`,
          title: `Book chapter ${c!.number}: ${c!.title}`,
          kind: 'CONCEPT' as const,
          priority: 1 as const,
          estimateMinutes: 30,
          scope: [
            c!.intro,
            c!.headings.length ? `Headings: ${c!.headings.join(' · ')}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          checkpoint:
            'Read twice; the cheat sheet reproduced from memory once.',
          sourceRef: `DSA Pattern Bible ch. ${c!.number}${c!.pages ? ` (${c!.pages})` : ''}`,
        })),
    ],
  });
  return {
    roadmap: {
      title: 'DSA patterns',
      description:
        'Sixteen patterns in dependency order with the core problems per pattern (NeetCode 150, Blind 75, Grind 75 and the Prashad list cross-checked), then design-a-class, the practical tasks product companies ask, review and bug-squash drills, and the JavaScript toolkit. Problems also live in Practice for attempts and revision.',
      promptTemplate: DSA_PROMPT_TEMPLATE,
      scenarios: DSA_SCENARIOS,
      sections,
    },
    topics,
    problems: [...problems.values()],
  };
}

/** Rules are ordered most-specific first, so "Array, Two Pointers" lands in Two Pointers. */
function patternOf(q: PrashadProblem) {
  for (const [re, name] of PRASHAD_TAG_TO_PATTERN)
    if (q.pattern.some((tag) => re.test(tag))) return name;
  return 'Arrays & Hashing';
}

const DSA_PROMPT_TEMPLATE = `DSA PRACTICE — {{roadmap}}
Pattern / section: {{section}}
Item: {{topic}}
Priority: {{priority}} · Estimate: {{estimate}}
Scope: {{scope}}
Done means: {{checkpoint}}

Links and references:
{{references}}

My notes so far:
{{notes}}

I practise in JavaScript. Teach in simple Hinglish with standard English technical terms. Intuition and pattern recognition first, then the template, then edge cases and complexity. Do not give me the full solution before I attempt it; give hints one at a time when I ask. No forced quizzes.

WHAT I WANT NOW:
{{scenario}}
{{extra}}
Begin now.`;

const DSA_SCENARIOS = [
  {
    id: 'learn',
    name: 'Learn the pattern',
    intro:
      'Teach this pattern from first principles: the signal that calls for it, the JavaScript template, a dry run on one small example, the two most common mistakes. Then list the core problems in the order I should do them.',
  },
  {
    id: 'solve',
    name: 'Guide me through this problem',
    intro:
      'Help me solve this problem without giving the code first. Ask me for my approach, then give one hint at a time. After I finish, review my code for bugs, complexity and naming, and show a cleaner version only if mine works.',
  },
  {
    id: 'stuck',
    name: 'I am stuck',
    intro:
      'I am stuck on this problem. Here is where I am (see the extra context). Do not give the whole solution: find the exact gap in my reasoning, fix that, and let me continue.',
  },
  {
    id: 'practical',
    name: 'Run a practical coding task',
    intro:
      'Act as the interviewer for this practical task. Give me the requirements in parts like a real screen, let me implement part 1 in JavaScript/TypeScript with tests, then add the next part, change one requirement mid-way, and keep the clock. At the end tell me what a strong candidate did differently.',
  },
  {
    id: 'review',
    name: 'Code review drill',
    intro:
      'Hand me a realistic pull request in TypeScript/Node of 80–150 lines with 3–5 planted issues (at least one correctness bug, one missing test, one design smell, one nit). I review it as comments. Then score my review on correctness-first ranking, naming the failing test, giving the fix, blockers versus nits, and tone.',
  },
  {
    id: 'bugsquash',
    name: 'Bug squash drill',
    intro:
      'Set up a small bug-squash scenario: a module of 100–200 lines with a failing test and one planted bug from these families: off-by-one, stale state, bad comparator, unguarded read-modify-write. I debug aloud; answer only what I ask (test output, file contents). Afterwards, grade my method: ran the test first, one hypothesis at a time, minimal fix, said what else might break.',
  },
  {
    id: 'mock',
    name: 'Timed mock',
    intro:
      'Run a 40-minute coding interview on this pattern: one medium problem I have not listed, no hints unless I ask, keep time, then grade pattern recognition, correctness, complexity analysis and communication, and say exactly what to fix next.',
  },
  {
    id: 'revision',
    name: 'Spaced revision',
    intro:
      'Revision, not a replay: give me three fresh problems of this pattern, one at a time, and test whether I still recognise and solve them. Explain only what I miss. Recommend the next revision interval.',
  },
  {
    id: 'summary',
    name: 'Revision summary',
    intro:
      'Summarize what we covered: the signal, the template, mistakes I made, and three problems to redo later. Keep it to a short revision sheet I can paste into my notes.',
  },
];

/* ------------------------------------------------------------------ behavioural roadmap */

function behaviouralRoadmap(hb: Handbook): BundleRoadmap {
  const part = (n: string) => hb.parts.find((p) => p.number === n);
  const sections: BundleSection[] = [];
  sections.push({
    name: 'How to rehearse',
    items: [
      {
        slug: 'evidence-audit',
        title: 'Evidence and chronology audit',
        kind: 'CONCEPT',
        priority: 1,
        scope:
          'Interviewers probe dates, ownership, production behaviour and metric definitions. Reconcile the resume, the deep dive and the LinkedIn bullets before rehearsing.',
        checkpoint:
          'Every row of the audit table answered; one accurate timeline written.',
        notes: part('01')?.body,
        sourceRef: 'Behavioural handbook 01',
      },
      {
        slug: 'answer-rubric',
        title: 'Answer quality rubric and the practice protocols',
        kind: 'CONCEPT',
        priority: 1,
        scope:
          'Clarity, ownership, depth, impact, reflection on a 1–5 scale; the 15-minute self-practice protocol; the 45-minute mixed mock.',
        checkpoint: 'Rated three recorded answers with the rubric honestly.',
        notes: part('07')?.body,
        sourceRef: 'Behavioural handbook 07',
      },
      {
        slug: 'seven-day-sprint',
        title: 'Seven-day preparation sprint',
        kind: 'CONCEPT',
        priority: 2,
        scope:
          "The handbook's day-by-day plan: chronology, 1Visa stories, correctness and CI/CD, AdvantageClub, Accenture, projects and difficult questions, mixed mock.",
        checkpoint: 'Run once before the first onsite.',
        notes: part('10')?.body,
        sourceRef: 'Behavioural handbook 10',
      },
      {
        slug: 'research-uncertainty',
        title: 'Where the researched material is uncertain',
        kind: 'CONCEPT',
        priority: 3,
        scope: BEHAVIOURAL_UNCERTAINTY,
        checkpoint: 'Read once.',
        sourceRef: 'Interview research, October 2026',
      },
    ],
  });
  sections.push({
    name: 'Career narrative',
    items: [
      {
        slug: 'tell-me-about-yourself',
        title: 'Tell me about yourself (60–75 s and 25 s versions)',
        kind: 'QUESTION',
        priority: 1,
        estimateMinutes: 20,
        scope:
          'The career narrative, the compact version, the "why are you looking" framework and the differentiating themes.',
        checkpoint:
          'Both versions delivered from memory, timed, without overstating scale.',
        notes: part('02')?.body,
        sourceRef: 'Behavioural handbook 02',
      },
    ],
  });
  sections.push({
    name: 'Stories',
    items: hb.stories.map((s) => ({
      slug: `story-${s.code.toLowerCase()}`,
      title: `${s.code} · ${s.title}`,
      kind: 'CONCEPT' as const,
      priority: (/^1V/.test(s.code) ? 1 : 2) as 1 | 2,
      estimateMinutes: 30,
      scope: `Competencies: ${s.competencies}. Rehearse the 30-second and 90-second versions, then the follow-ups and the deep dive.`,
      checkpoint:
        'Both versions from memory; every follow-up answered; the verification questions for this story answered with real facts.',
      notes: s.body,
      sourceRef: `Behavioural handbook story ${s.code}`,
    })),
  });
  const matrixPart = part('03');
  sections.push({
    name: 'Story selection',
    items: [
      {
        slug: 'story-matrix',
        title: 'Story selection matrix and the missing evidence',
        kind: 'CONCEPT',
        priority: 1,
        scope:
          'Which story answers which competency, with a backup; the five competencies where a true incident still has to be identified (conflict, a substantial mistake, a hard deadline, mentoring, feedback received).',
        checkpoint: 'One true incident chosen for each of the five gaps.',
        notes: [
          ...hb.matrix.map(
            (m) => `${m.competency}: best ${m.best}; backup ${m.backup}`,
          ),
          '',
          matrixPart?.body ?? '',
        ].join('\n'),
        sourceRef: 'Behavioural handbook 03',
      },
    ],
  });
  const bank = part('04');
  if (bank)
    sections.push({
      name: 'Question bank (handbook)',
      items: groupedBullets(bank.body).flatMap((g) =>
        g.bullets.map((q, i) => ({
          slug: `hb-${slugify(g.heading)}-${i + 1}`,
          title: q,
          kind: 'QUESTION' as const,
          priority: 1 as const,
          scope: `Handbook practice bank: ${g.heading}. Answer method: 10% context, 20% task and constraint, 50% decisions and actions, 15% outcome, 5% reflection.`,
          checkpoint: 'Answered aloud from a real story in 60–120 seconds.',
          sourceRef: 'Behavioural handbook 04',
        })),
      ),
    });
  const cross = part('05');
  if (cross)
    sections.push({
      name: 'Resume cross-examination',
      items: groupedBullets(cross.body).flatMap((g) =>
        g.bullets.map((q, i) => ({
          slug: `cross-${slugify(g.heading)}-${i + 1}`,
          title: q,
          kind: 'QUESTION' as const,
          priority: 1 as const,
          scope: `What interviewers may challenge: ${g.heading}.`,
          checkpoint:
            'Answered for the relevant resume bullet with facts, not estimates.',
          sourceRef: 'Behavioural handbook 05',
        })),
      ),
    });
  const cards = part('06');
  if (cards)
    sections.push({
      name: 'Architecture rehearsal cards',
      items: [
        {
          slug: 'architecture-cards',
          title: '1Visa architecture rehearsal cards (A, B, C)',
          kind: 'CONCEPT',
          priority: 1,
          estimateMinutes: 30,
          scope:
            'Lead and workflow pipeline; correctness pipeline (idempotency, version-checked transaction, outbox, lease); verified image release. Conceptual reconstructions: sketch only what matches the real system.',
          checkpoint:
            'All three sketched from memory in under five minutes each, with the atomicity boundary explained.',
          notes: cards.body,
          sourceRef: 'Behavioural handbook 06',
        },
      ],
    });
  const worksheet = part('09');
  if (worksheet) {
    const items: BundleItem[] = [];
    let heading = '';
    for (const line of worksheet.body.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/_{4,}/.test(t))
        items.push({
          slug: `verify-${items.length + 1}`,
          title:
            `${heading ? `${heading}: ` : ''}${t.replace(/[:\s_]+$/, '').trim()}`.slice(
              0,
              200,
            ),
          kind: 'QUESTION',
          priority: 1,
          scope:
            'Fill with real information before using the corresponding story confidently. "I do not remember exactly" is more credible than a fabricated detail.',
          checkpoint:
            'Answered in the notes with the real figure or "unknown".',
          sourceRef: 'Behavioural handbook 09',
        });
      else if (t.length < 40 && !/[.?!:]$/.test(t) && !/^[•\-]/.test(t))
        heading = t;
    }
    sections.push({ name: 'Verification worksheet', items });
  }
  if (hb.addendum.length)
    sections.push({
      name: 'Answered follow-ups (addendum)',
      items: hb.addendum.map((a) => ({
        slug: `addendum-${slugify(a.title)}`,
        title: a.title,
        kind: 'CONCEPT' as const,
        priority: 1 as const,
        estimateMinutes: 30,
        scope:
          'Speaking-ready answers to the technical and behavioural follow-ups for this part of the resume. Proposed mechanisms are not implementation facts until verified.',
        checkpoint:
          'Each answer spoken once from memory; unverified claims marked.',
        notes: a.body,
        sourceRef: 'Behavioural handbook addendum',
      })),
    });
  for (const s of FRAMEWORK_SECTIONS) sections.push(researchSection(s));
  for (const s of questionBankSections(hb.matrix))
    sections.push(researchSection(s));
  sections.push(researchSection(DEEP_DIVE_PROBES));
  sections.push(researchSection(DELIVERY_GUIDANCE));
  const prompts = part('08');
  const scenarios = prompts ? scenariosFromPrompts(prompts.body) : [];
  return {
    title: 'Behavioural and resume',
    description:
      'The behavioural and resume deep-dive handbook (narrative, thirteen stories, selection matrix, question bank, cross-examination, rubric, worksheet, addendum) plus the researched per-company frameworks, a 76-question bank with the companies that ask each one, the project deep-dive probes and delivery guidance.',
    promptTemplate: BEHAVIOURAL_PROMPT_TEMPLATE,
    scenarios,
    sections,
  };
}

/** The handbook's four reusable prompts become scenarios: a heading line, then the quoted text. */
function scenariosFromPrompts(body: string) {
  const out: { id: string; name: string; intro: string }[] = [];
  let name = '';
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^“/.test(t) && name) {
      out.push({
        id: slugify(name).slice(0, 40),
        name,
        intro: t.replace(/^“|”$/g, ''),
      });
      name = '';
    } else if (t.length < 60 && !/[.]$/.test(t)) name = t;
  }
  return out;
}

const BEHAVIOURAL_PROMPT_TEMPLATE = `BEHAVIOURAL REHEARSAL — {{roadmap}}
Section: {{section}}
Item: {{topic}}
Scope: {{scope}}
Done means: {{checkpoint}}

My rehearsal notes for this item (the answers, follow-ups and risks I already prepared):
{{notes}}

Rules: use only facts I establish; never invent experience, metrics, teammates or incidents on my behalf. Mark anything unverified. One question at a time when rehearsing; let me answer first. Keep the structure, not the exact sentences.

WHAT I WANT NOW:
{{scenario}}
{{extra}}
Begin now.`;

/* ------------------------------------------------------------------ main */

function main() {
  const [dir, outArg] = process.argv.slice(2);
  if (!dir) {
    console.error('Usage: pnpm roadmap:bundle "<sources folder>" [out.json]');
    process.exit(1);
  }
  const read = (name: string) => readFileSync(join(dir, name), 'utf8');
  const pdf = (name: string) =>
    execFileSync('pdftotext', ['-layout', join(dir, name), '-'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const prashadPath =
    process.env.PRASHAD_JSON ?? join(dir, 'leetcode-patterns.json');
  if (!existsSync(prashadPath)) {
    console.log(`Fetching ${PRASHAD_URL} → ${prashadPath}`);
    writeFileSync(
      prashadPath,
      execFileSync('curl', ['-fsSL', PRASHAD_URL], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  }
  const prashadRaw = JSON.parse(readFileSync(prashadPath, 'utf8')) as
    { data: PrashadProblem[] } | PrashadProblem[];
  const prashad = Array.isArray(prashadRaw) ? prashadRaw : prashadRaw.data;

  const technical = parseTechnicalRoadmap(read(FILES.technical));
  technical.sections.unshift(researchSection(INTERVIEW_FORMATS));
  technical.scenarios = TECHNICAL_SCENARIOS;
  technical.promptTemplate = TECHNICAL_PROMPT_TEMPLATE;

  const dsa = dsaRoadmap(parsePatternBook(pdf(FILES.book)), prashad);
  const bundle: Bundle = {
    format: 'silsila-roadmap-bundle',
    version: 1,
    builtAt: new Date().toISOString(),
    goal: {
      title: 'Offer from a product company',
      category: 'Career',
      targetDate: '2026-12-31',
      description:
        'SDE II / Full Stack / Backend in Toronto or Canadian remote; practical coding, system design, behavioural and the fundamentals all ready by December.',
    },
    roadmaps: [
      parseBackendTracker(read(FILES.backend)),
      parseSystemDesignTracker(read(FILES.systemDesign)),
      technical,
      dsa.roadmap,
      behaviouralRoadmap(parseHandbook(pdf(FILES.handbook))),
    ],
    dsa: { topics: dsa.topics, problems: dsa.problems },
  };
  const problems = validateBundle(bundle);
  if (problems.length) {
    console.error(
      'Bundle problems:\n' + problems.map((p) => ` - ${p}`).join('\n'),
    );
    process.exit(1);
  }
  const out = outArg ?? join(dir, 'roadmap-bundle.json');
  writeFileSync(out, JSON.stringify(bundle, null, 1));
  console.table(bundleCounts(bundle));
  console.log(
    `DSA topics ${bundle.dsa.topics.length}, problems ${bundle.dsa.problems.length}`,
  );
  console.log(`Wrote ${out}. Review it, then: pnpm roadmap:import "${out}"`);
}

const TECHNICAL_PROMPT_TEMPLATE = `TECHNICAL MASTERY — {{roadmap}}
Area: {{section}}
Topic: {{topic}} ({{priority}})
Scope: {{scope}}
Done means: {{checkpoint}}

References:
{{references}}

My notes so far:
{{notes}}

Context: full-stack / backend engineer with about four years of experience (Next.js, NestJS, PostgreSQL, Redis) preparing for SDE II loops. Teach in natural Hinglish with standard English technical terms, intuition first, then mechanisms, edge cases and why. Adaptive depth; no unsolicited diagnostics or forced quizzes. On substantial lessons include interviewer questions with answers and a concise reusable summary.

WHAT I WANT NOW:
{{scenario}}
{{extra}}
Begin now.`;

const TECHNICAL_SCENARIOS = [
  {
    id: 'learn',
    name: 'Learn the topic',
    intro:
      'Teach this topic now, Hinglish, first-principles intuition, small examples, real interview pitfalls. Practice only if it helps; do not show final answers until I attempt. End with important interview Q&A and a short revision summary.',
  },
  {
    id: 'doubt',
    name: 'Quick doubt',
    intro:
      'Short factual clarification of the doubt below, 5–7 lines maximum. No quiz, no long summary.',
  },
  {
    id: 'deep',
    name: 'Deep dive',
    intro:
      'Teach this deeply from first principles: internals, one accurate trace or example, production bugs, trade-offs, and SDE II follow-ups with answers.',
  },
  {
    id: 'questions',
    name: 'Interview questions only',
    intro:
      'Give 8 realistic SDE II questions on this scope with concise spoken-English model answers, the likely follow-up and one common trap each. No full lesson.',
  },
  {
    id: 'practice',
    name: 'Hands-on practice',
    intro:
      'Give me 2–3 focused exercises for this scope (code, SQL or debugging as fits), one at a time, with inputs and expected outputs. Do not reveal solutions until I submit mine or ask.',
  },
  {
    id: 'review',
    name: 'Code review drill',
    intro:
      'Hand me a realistic PR in TypeScript/Node (NestJS or Next.js where it fits) of 80–150 lines with 3–5 planted issues for this scope. I review it; then score me on correctness-first ranking, naming the failing test, giving the fix, blockers versus nits, and tone.',
  },
  {
    id: 'bugsquash',
    name: 'Bug squash drill',
    intro:
      'Set up a small failing-test scenario in this scope that I debug aloud: give me the module and the failing test; answer only what I ask. Afterwards grade my method: ran the test first, one hypothesis at a time, minimal fix, said what else might break.',
  },
  {
    id: 'mock',
    name: 'Mock interview',
    intro:
      'Mock interview, SDE II, 35 minutes on this scope. One question at a time; wait for me; challenge assumptions. At the end grade correctness and communication and say exactly what to fix next.',
  },
  {
    id: 'summary',
    name: 'Tiny revision note',
    intro:
      'A 10-line muscle-memory revision note for this topic: mental model, when it helps, when it hurts, common interview traps.',
  },
  {
    id: 'jobmap',
    name: 'Map a job posting',
    intro:
      "Here is a job description (below). Extract only credible technical requirements, map them to this roadmap, rank the top 5 missing skills for a technical interview and suggest two 45-minute study blocks. Do not invent the company's interview format.",
  },
];

main();
