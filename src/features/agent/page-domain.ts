/**
 * The page Rumi is opened on (WI-117): the drawer sends only the path, and the server reads
 * the record it names for the owner alone, so "this problem" or "this application" means the
 * one on screen. Also the questions Rumi suggests on each page. Covered by
 * tests/agent-page.test.ts.
 */
import { z } from 'zod';

export type Place =
  'today' | 'plan' | 'roadmap' | 'practice' | 'jobs' | 'review' | 'other';
export type PageRef =
  | { kind: 'problem'; id: string }
  | { kind: 'application'; id: string }
  | { kind: 'roadmap'; id: string }
  | { kind: 'place'; place: Place };

/** A path only: no query, no host, short. */
export const pageInput = z
  .string()
  .max(200)
  .regex(/^\/[A-Za-z0-9/_-]*$/)
  .nullable()
  .optional();

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const PLACES: Record<string, Place> = {
  today: 'today',
  calendar: 'plan',
  roadmap: 'roadmap',
  dsa: 'practice',
  jobs: 'jobs',
  review: 'review',
};
/** "/dsa/abc…" is a problem, "/jobs/abc…" (and its prep pages) an application, "/roadmap/abc…" a roadmap. */
export function pageRef(path: string | null | undefined): PageRef {
  const [, first, second] = (path ?? '').split('/');
  const place = PLACES[first ?? ''] ?? 'other';
  if (
    second &&
    ID.test(second) &&
    !['drill', 'deck', 'look-back'].includes(second)
  ) {
    if (first === 'dsa') return { kind: 'problem', id: second };
    if (first === 'jobs') return { kind: 'application', id: second };
    if (first === 'roadmap') return { kind: 'roadmap', id: second };
  }
  return { kind: 'place', place };
}

const BY_PLACE: Record<Place, readonly string[]> = {
  today: [
    'What is on today, and what should I start with?',
    'Plan tomorrow for me',
    'What did I study least in the last 7 days?',
    'How is my interview prep going?',
  ],
  plan: [
    'Plan tomorrow for me',
    'Where is free time this week for study?',
    'What did I study least in the last 7 days?',
    'Plan next week for me, starting Monday',
  ],
  roadmap: [
    'What should I study next on my roadmap?',
    'Which roadmap items are due for revision?',
    'Plan this week’s roadmap study for me',
    'What did I study least in the last 7 days?',
  ],
  practice: [
    'Which problem should I do next?',
    'Which problems are due for revision?',
    'Which pattern am I weakest at?',
    'Plan a practice block for me today',
  ],
  jobs: [
    'Which application needs me next?',
    'How should I prepare for my next interview?',
    'How is my interview prep going?',
    'Plan interview prep for this week',
  ],
  review: [
    'Sum up my week in two lines',
    'What did I study least this week?',
    'Plan next week for me, starting Monday',
    'Which roadmap items are due for revision?',
  ],
  other: [
    'What did I study least in the last 7 days?',
    'What is on today, and what should I start with?',
    'Which roadmap items are due for revision?',
    'How is my interview prep going?',
  ],
};
/** Four questions for the page Rumi is opened on; a record's own page leads with it. */
export function promptsFor(ref: PageRef): readonly string[] {
  if (ref.kind === 'problem')
    return [
      'Give me a hint for this problem, without the code',
      'What pattern is this problem?',
      'When should I revise this problem?',
      ...BY_PLACE.practice.slice(0, 1),
    ];
  if (ref.kind === 'application')
    return [
      'How should I prepare for this application’s next round?',
      'What should I do next for this application?',
      'Plan prep time for this interview this week',
      ...BY_PLACE.jobs.slice(0, 1),
    ];
  if (ref.kind === 'roadmap')
    return [
      'What should I study next on this roadmap?',
      'Which items here are due for revision?',
      'Plan time for this roadmap this week',
      ...BY_PLACE.roadmap.slice(1, 2),
    ];
  return BY_PLACE[ref.place];
}

/** True for a Sunday label (YYYY-MM-DD). */
export const isSunday = (day: string) =>
  new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
