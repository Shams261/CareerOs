import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  nextStatus,
  parseBulkLines,
  roadmapProgress,
  targetLabel,
} from '../src/features/roadmap/domain';

describe('parseBulkLines', () => {
  it('turns an outline into items and marks questions', () => {
    expect(
      parseBulkLines(
        '- Consistent hashing\n* ? Design a URL shortener\n\n1. CAP theorem\n2) How does a load balancer work?\n   ',
      ),
    ).toEqual([
      { title: 'Consistent hashing', kind: 'CONCEPT' },
      { title: 'Design a URL shortener', kind: 'QUESTION' },
      { title: 'CAP theorem', kind: 'CONCEPT' },
      { title: 'How does a load balancer work?', kind: 'QUESTION' },
    ]);
  });
  it('ignores empty input', () => {
    expect(parseBulkLines('\n  \n')).toEqual([]);
  });
});

describe('nextStatus', () => {
  it('moves forward and back without skipping done', () => {
    expect(nextStatus('start', 'NOT_STARTED')).toBe('IN_PROGRESS');
    expect(nextStatus('start', 'DONE')).toBe('DONE');
    expect(nextStatus('done', 'NOT_STARTED')).toBe('DONE');
    expect(nextStatus('reopen', 'DONE')).toBe('IN_PROGRESS');
    expect(nextStatus('asked', 'IN_PROGRESS')).toBe('IN_PROGRESS');
  });
});

describe('roadmapProgress and target labels', () => {
  it('counts without scoring', () => {
    expect(
      roadmapProgress([
        { status: 'DONE', askedInInterview: true },
        { status: 'IN_PROGRESS', askedInInterview: false },
        { status: 'NOT_STARTED', askedInInterview: true },
      ]),
    ).toEqual({ total: 3, done: 1, inProgress: 1, asked: 2 });
  });
  it("describes a target date in the owner's words", () => {
    expect(daysUntil('2026-11-01', '2026-10-21')).toBe(11);
    expect(targetLabel('2026-11-01', '2026-10-21')).toBe('11 days left');
    expect(targetLabel('2027-01-15', '2026-10-21')).toBe('12 weeks left');
    expect(targetLabel('2026-10-21', '2026-10-21')).toBe('Target is today');
    expect(targetLabel('2026-10-20', '2026-10-21')).toBe(
      'Target passed 1 day ago',
    );
    expect(targetLabel(null, '2026-10-21')).toBe('No target date');
  });
});
