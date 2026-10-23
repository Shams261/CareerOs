import { describe, it, expect } from 'vitest';
import {
  dueContext,
  interviewPrepRows,
  jobAttentionRows,
  practiceRevisionRows,
  revisionContext,
  roadmapRevisionRows,
  sortAttention,
} from '../src/features/attention/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const day = '2026-10-22';
const at = (time: string, d = day) => localInstant(d, time, zone);
const now = at('12:00');
const round = (id: string, start: Date, title = 'Coding') => ({
  id,
  title,
  type: 'CODING',
  status: 'SCHEDULED',
  scheduledStart: start,
  scheduledEnd: null,
  timezone: zone,
});

describe('due and revision context', () => {
  it('reads overdue, today and a future date against the owner day', () => {
    expect(dueContext('2026-10-20', day)).toBe('Overdue by 2 days');
    expect(dueContext('2026-10-21', day)).toBe('Overdue by 1 day');
    expect(dueContext(day, day)).toBe('Due today');
    expect(dueContext('2026-10-28', day)).toBe('Due Oct 28');
    expect(revisionContext('2026-10-20', day)).toBe(
      'Revision overdue by 2 days',
    );
    expect(revisionContext(day, day)).toBe('Revision due today');
  });
});

describe('interview prep rows', () => {
  it('lists only interviews today that are still ahead with open prep', () => {
    const base = {
      applicationId: 'a1',
      company: 'Example Labs',
      scheduledEnd: null,
    };
    const rows = interviewPrepRows(
      [
        {
          ...base,
          id: 'r1',
          title: 'Coding',
          scheduledStart: at('16:00'),
          openPrep: 2,
        },
        {
          ...base,
          id: 'r2',
          title: 'Design',
          scheduledStart: at('16:00'),
          openPrep: 0,
        },
        {
          ...base,
          id: 'r3',
          title: 'Early',
          scheduledStart: at('09:00'),
          openPrep: 1,
        },
        {
          ...base,
          id: 'r4',
          title: 'Tomorrow',
          scheduledStart: at('10:00', '2026-10-23'),
          openPrep: 1,
        },
      ],
      now,
      zone,
    );
    expect(rows.map((r) => [r.id, r.title, r.context, r.tier])).toEqual([
      [
        'prep:r1',
        'Prepare Coding',
        'Example Labs · Today at 16:00 · 2 prep items open',
        1,
      ],
    ]);
  });
});

describe('job attention rows', () => {
  it('names every move, keeps one follow-up row per application and skips taken rounds', () => {
    const app = {
      id: 'a1',
      company: 'Example Labs',
      nextAction: 'Send follow-up',
      nextActionDate: new Date('2026-10-20T00:00:00Z'),
    };
    const ended = round('r0', at('09:00'), 'Recruiter call');
    const tomorrow = round('r2', at('10:00', '2026-10-23'), 'System design');
    const rows = jobAttentionRows(
      [
        {
          app,
          reasons: [
            { kind: 'FOLLOW_UP_OVERDUE', days: 2 },
            { kind: 'RESULT_NEEDED', round: ended },
            { kind: 'INTERVIEW_SOON', round: round('r1', at('16:00')) },
            { kind: 'INTERVIEW_SOON', round: tomorrow },
            { kind: 'FOLLOW_UP_TODAY' },
          ],
        },
        {
          app: {
            id: 'a2',
            company: 'Acme',
            nextAction: null,
            nextActionDate: null,
          },
          reasons: [{ kind: 'ACTION_REQUIRED' }],
        },
      ],
      now,
      zone,
      new Set(['r1']),
    );
    expect(rows.map((r) => [r.id, r.title, r.context, r.tier])).toEqual([
      ['job:a1', 'Send follow-up', 'Example Labs · Overdue by 2 days', 2],
      [
        'result:r0',
        'Log the Recruiter call result',
        'Example Labs · Interview ended Thu, Oct 22',
        2,
      ],
      [
        'interview:r2',
        'Prepare System design',
        'Example Labs · Tomorrow at 10:00',
        4,
      ],
      ['job:a2', 'Decide the next step', 'Acme · No date set', 4],
    ]);
  });
});

describe('revision rows and order', () => {
  it('phrases Practice and roadmap revisions and sorts by tier, due, id', () => {
    const practice = practiceRevisionRows(
      [
        {
          id: 'p1',
          title: 'Two Sum',
          confidence: 'YELLOW',
          nextRevisionAt: new Date(`${day}T00:00:00Z`),
        },
        { id: 'p2', title: 'Skip', confidence: 'RED', nextRevisionAt: null },
      ],
      now,
      zone,
    );
    const roadmap = roadmapRevisionRows(
      [
        {
          id: 'i1',
          title: 'HTTP semantics',
          section: 'Week 1',
          nextRevisionAt: new Date('2026-10-20T00:00:00Z'),
          roadmap: { id: 'rm', title: 'Backend' },
        },
      ],
      now,
      zone,
    );
    expect(practice.map((r) => [r.title, r.context])).toEqual([
      ['Review Two Sum', 'Revision due today · Yellow'],
    ]);
    expect(roadmap.map((r) => [r.title, r.context, r.href])).toEqual([
      [
        'Revisit HTTP semantics',
        'Revision overdue by 2 days · Backend',
        '/roadmap/rm?section=Week%201&show=revision#item-i1',
      ],
    ]);
    expect(sortAttention([...practice, ...roadmap]).map((r) => r.id)).toEqual([
      'roadmap:i1',
      'practice:p1',
    ]);
  });
});
