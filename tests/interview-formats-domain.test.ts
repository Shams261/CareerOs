import { describe, expect, it } from 'vitest';
import {
  companyMatches,
  formatPractice,
  loopFormats,
  practiceFormats,
  typeLabel,
  type FormatItem,
} from '../src/features/jobs/formats';
import { interviewTypes, label } from '../src/features/jobs/domain';
import { searchQueries } from '../src/features/prep/domain';

let n = 0;
const item = (over: Partial<FormatItem>): FormatItem => ({
  id: `i${++n}`,
  roadmapId: 'r',
  roadmapTitle: 'DSA patterns',
  section: 'Arrays & Hashing',
  slug: null,
  title: `Item ${n}`,
  status: 'NOT_STARTED',
  priority: 2,
  ordering: n,
  dsaProblemId: null,
  ...over,
});

describe('interview formats (WI-047)', () => {
  it('names every round type, keeping the older ones as round titles always read', () => {
    for (const t of interviewTypes) expect(typeLabel[t]).toBeTruthy();
    for (const t of [
      'RECRUITER',
      'ASSESSMENT',
      'CODING',
      'SYSTEM_DESIGN',
      'BEHAVIORAL',
      'HIRING_MANAGER',
      'FINAL',
      'OTHER',
    ] as const)
      expect(typeLabel[t]).toBe(label(t));
    expect(typeLabel.AI_ASSISTED).toBe('AI-assisted coding');
    expect(practiceFormats.every((f) => interviewTypes.includes(f))).toBe(true);
  });

  it('matches a company to its own behavioural section only', () => {
    expect(companyMatches('Company: Stripe', 'Stripe')).toBe(true);
    expect(companyMatches('Company: Stripe', 'stripe, inc.')).toBe(false);
    expect(
      companyMatches(
        'Company: Canadian scale-ups (Clio, Cohere, 1Password)',
        'Cohere',
      ),
    ).toBe(true);
    expect(companyMatches('Company: YC and high-growth startups', 'Meta')).toBe(
      false,
    );
    expect(companyMatches('Stories', 'Stripe')).toBe(false);
    expect(companyMatches('Company: Meta', '')).toBe(false);
  });

  it('takes the guide and the next item not done, in roadmap order, counting each once', () => {
    const guide = item({
      roadmapTitle: 'Technical mastery',
      section: 'Interview formats you will meet (2025–2026)',
      slug: 'format-code-review',
      title: 'Code review round',
    });
    const drills = 'Code review and bug squash drills';
    const review = item({
      section: drills,
      slug: 'drill-code-review-drill-a-pr-with-35-planted-issues',
      ordering: 50,
    });
    const bug = item({
      section: drills,
      slug: 'drill-bug-families-off-by-one',
    });
    const items = [bug, review, guide];
    expect(formatPractice('CODE_REVIEW', items, 'Stripe')).toMatchObject({
      guide: { id: guide.id },
      next: { id: review.id },
      done: 0,
      total: 1,
    });
    expect(formatPractice('DEBUGGING', items, 'Stripe')).toMatchObject({
      guide: null,
      next: { id: bug.id },
      total: 1,
    });
    // Coding: P0 problem items only, the first not done.
    const p0done = item({
      priority: 1,
      dsaProblemId: 'p1',
      status: 'DONE',
      ordering: 1,
    });
    const p0next = item({ priority: 1, dsaProblemId: 'p2', ordering: 2 });
    const p1 = item({ priority: 2, dsaProblemId: 'p3', ordering: 0 });
    const concept = item({ priority: 1, ordering: 0 });
    expect(
      formatPractice('CODING', [p1, concept, p0next, p0done], 'X'),
    ).toMatchObject({ next: { id: p0next.id }, done: 1, total: 2 });
    // Behavioural: the company's section first, then the stories.
    const story = item({
      roadmapTitle: 'Behavioural and resume',
      section: 'Stories',
      ordering: 1,
    });
    const stripe = item({
      roadmapTitle: 'Behavioural and resume',
      section: 'Company: Stripe',
      ordering: 90,
    });
    const amazon = item({
      roadmapTitle: 'Behavioural and resume',
      section: 'Company: Amazon',
      ordering: 80,
    });
    const b = formatPractice('BEHAVIORAL', [story, amazon, stripe], 'Stripe');
    expect(b.next?.id).toBe(stripe.id);
    expect(b.total).toBe(2);
    expect(formatPractice('SYSTEM_DESIGN', [], 'X')).toEqual({
      format: 'SYSTEM_DESIGN',
      guide: null,
      next: null,
      done: 0,
      total: 0,
    });
  });

  it('joins ticked formats and upcoming round types in a fixed order with a stated AI rule', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const at = (d: string) => new Date(`2026-${d}T15:00:00Z`);
    const loop = loopFormats(
      ['SYSTEM_DESIGN', 'CODE_REVIEW'],
      [
        {
          type: 'AI_ASSISTED',
          aiPolicy: 'ALLOWED',
          status: 'SCHEDULED',
          scheduledStart: at('11-04'),
        },
        {
          type: 'AI_ASSISTED',
          aiPolicy: 'UNKNOWN',
          status: 'SCHEDULED',
          scheduledStart: at('11-02'),
        },
        {
          type: 'CODING',
          aiPolicy: 'NOT_ALLOWED',
          status: 'SCHEDULED',
          scheduledStart: at('10-20'),
        },
        {
          type: 'BEHAVIORAL',
          aiPolicy: 'UNKNOWN',
          status: 'CANCELLED',
          scheduledStart: at('11-05'),
        },
        {
          type: 'RECRUITER',
          aiPolicy: 'UNKNOWN',
          status: 'SCHEDULED',
          scheduledStart: at('11-01'),
        },
        {
          type: 'CODE_REVIEW',
          aiPolicy: 'ALLOWED',
          status: 'SCHEDULED',
          scheduledStart: at('11-06'),
        },
        {
          type: 'CODE_REVIEW',
          aiPolicy: 'NOT_ALLOWED',
          status: 'SCHEDULED',
          scheduledStart: at('11-07'),
        },
      ],
      now,
    );
    expect(loop).toEqual([
      { format: 'AI_ASSISTED', nextRound: at('11-02'), aiPolicy: 'ALLOWED' },
      // Two rounds disagree, so no single rule is shown.
      { format: 'CODE_REVIEW', nextRound: at('11-06'), aiPolicy: null },
      { format: 'SYSTEM_DESIGN', nextRound: null, aiPolicy: null },
    ]);
    expect(loopFormats([], [], now)).toEqual([]);
  });

  it('searches the formats of the loop with generic words only', () => {
    const q = searchQueries({
      company: 'Stripe',
      role: 'Software Engineer',
      roundTypes: ['CODING', 'DEBUGGING', 'CODE_REVIEW'],
    });
    expect(q).toContain(
      'Stripe Software Engineer debugging bug squash interview questions',
    );
    expect(q).toContain(
      'Stripe Software Engineer code review interview questions',
    );
  });
});
