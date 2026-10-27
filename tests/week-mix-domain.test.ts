import { describe, expect, it } from 'vitest';
import {
  WEEKLY_MIX,
  planQuestion,
  readyLine,
  weekMix,
} from '../src/features/roadmap/week';
import type { FormatItem } from '../src/features/jobs/formats';
import { BANNED_WORDS } from '../src/features/nudges/domain';

let n = 0;
const item = (over: Partial<FormatItem>): FormatItem => ({
  id: `i${++n}`,
  roadmapId: 'r',
  roadmapTitle: 'DSA patterns',
  section: 'Code review and bug squash drills',
  slug: null,
  title: `Item ${n}`,
  status: 'NOT_STARTED',
  priority: 2,
  ordering: n,
  dsaProblemId: null,
  completedAt: null,
  ...over,
});
const week = {
  start: new Date('2026-10-26T04:00:00Z'),
  end: new Date('2026-11-02T05:00:00Z'),
};

describe('weekly mix (WI-048)', () => {
  it('keeps the mix order, counts this week and points at the next item', () => {
    const doneThisWeek = item({
      slug: 'drill-bug-families-off-by-one',
      status: 'DONE',
      completedAt: new Date('2026-10-27T15:00:00Z'),
    });
    const doneLastWeek = item({
      slug: 'drill-bug-families-stale-state',
      status: 'DONE',
      completedAt: new Date('2026-10-20T15:00:00Z'),
    });
    const next = item({ slug: 'drill-bug-families-bad-comparator' });
    const rows = weekMix({
      items: [doneThisWeek, doneLastWeek, next],
      problemsAttempted: 2,
      week,
      interviews: [],
    });
    expect(rows.map((r) => r.format)).toEqual(WEEKLY_MIX.map((m) => m.format));
    expect(rows.map((r) => `${r.label} ${r.done}/${r.target}`)).toEqual([
      'DSA problems 2/3',
      'Code review 0/1',
      'Bug squash 1/1',
      'Practical task 0/1',
      'System design 0/1',
      'Behavioural stories 0/2',
    ]);
    expect(rows[2].next?.id).toBe(next.id);
    expect(rows[1].next).toBeNull();
  });

  it('puts the formats of the next interviews first and adds one the mix lacks', () => {
    const stripe = item({
      roadmapTitle: 'Behavioural and resume',
      section: 'Company: Stripe',
    });
    const story = item({
      roadmapTitle: 'Behavioural and resume',
      section: 'Stories',
    });
    const rows = weekMix({
      items: [story, stripe],
      problemsAttempted: 0,
      week,
      interviews: [
        { company: 'Stripe', format: 'BEHAVIORAL', on: '2026-11-06' },
        { company: 'Northwind', format: 'AI_ASSISTED', on: '2026-11-04' },
        { company: 'Fabrikam', format: 'AI_ASSISTED', on: '2026-11-09' },
      ],
    });
    expect(rows.slice(0, 2).map((r) => [r.format, r.interview])).toEqual([
      ['AI_ASSISTED', { company: 'Northwind', on: '2026-11-04' }],
      ['BEHAVIORAL', { company: 'Stripe', on: '2026-11-06' }],
    ]);
    expect(rows[0]).toMatchObject({ label: 'AI-assisted coding', target: 1 });
    // The company's own section comes before the stories.
    expect(rows[1].next?.id).toBe(stripe.id);
    expect(rows).toHaveLength(WEEKLY_MIX.length + 1);
  });

  it('writes the ready line and the question for Rumi in plain, calm words', () => {
    expect(
      readyLine(
        {
          title: 'Offer from a product company',
          targetDate: new Date('2026-12-15'),
        },
        406,
        '2026-10-28',
      ),
    ).toBe('Offer from a product company · 7 weeks left · 406 P0 items left');
    expect(readyLine(null, 1, '2026-10-28')).toBe('1 P0 item left');
    const rows = weekMix({
      items: [],
      problemsAttempted: 3,
      week,
      interviews: [],
    });
    const q = planQuestion(rows);
    expect(q).toBe(
      "Plan the rest of this week's practice: 1 code review, 1 bug squash, 1 practical task, 1 system design, 2 behavioural stories. Use my free time and best hours.",
    );
    for (const w of BANNED_WORDS) expect(q.toLowerCase()).not.toContain(w);
    expect(
      planQuestion(
        weekMix({
          items: [],
          problemsAttempted: 0,
          week,
          interviews: [
            { company: 'N', format: 'AI_ASSISTED', on: '2026-11-04' },
          ],
        }),
      ),
    ).toMatch(
      /^Plan the rest of this week's practice: 1 AI-assisted coding, 3 DSA problems, 1 code review,/,
    );
    const covered = rows.map((r) => ({ ...r, done: r.target }));
    expect(planQuestion(covered)).toContain('covered');
  });
});
