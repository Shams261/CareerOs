import { describe, it, expect } from 'vitest';
import {
  activityInput,
  assess,
  readiness,
  reviewQueue,
  dueState,
  learningSuggestions,
  weekStart,
  isTechnical,
} from '../src/features/learning/domain';
import { dayKey } from '../src/lib/time';
import { randomUUID } from 'node:crypto';
const empty = {
  understanding: 0,
  recall: 0,
  application: 0,
  interview: 0,
  status: 'NOT_STARTED',
};
const strong = {
  understanding: 3,
  recall: 3,
  application: 3,
  interview: 3,
  status: 'INTERVIEW_READY',
};
describe('technical mastery and reviews', () => {
  it('requires four strong ratings; unassessed dimensions are allowed without false readiness', () => {
    expect(readiness(strong)).toBe('INTERVIEW_READY');
    expect(readiness({ ...strong, interview: 0 })).toBe('LEARNING');
    expect(readiness({ ...strong, interview: 1 })).toBe('NEEDS_REVISION');
    expect(readiness({ ...strong, application: 2 })).toBe('NEEDS_REVISION');
  });
  it('keeps unsupplied dimensions and resets weak assessments to three days', () => {
    const s = assess(strong, { recall: 1 }, '2026-09-24');
    expect(s).toMatchObject({
      understanding: 3,
      recall: 1,
      application: 3,
      interview: 3,
      status: 'NEEDS_REVISION',
      nextReviewDate: new Date('2026-09-27'),
    });
  });
  it('uses 2/3/14/30 day concept intervals, not DSA progression', () => {
    expect(
      assess(empty, { understanding: 2 }, '2026-09-24').nextReviewDate,
    ).toEqual(new Date('2026-09-26'));
    expect(assess(empty, strong, '2026-09-24').nextReviewDate).toEqual(
      new Date('2026-10-08'),
    );
    expect(assess(strong, { recall: 3 }, '2026-09-24').nextReviewDate).toEqual(
      new Date('2026-10-24'),
    );
    expect(
      assess(strong, { understanding: 3 }, '2026-09-24').nextReviewDate,
    ).toEqual(new Date('2026-10-08'));
  });
  it('allows explicit clearing, rejects invalid scores, and prevents notes from changing mastery', () => {
    const input = {
      topicId: 't',
      requestId: randomUUID(),
      activityType: 'REVIEW',
    };
    expect(
      activityInput.parse({ ...input, understanding: '' }).understanding,
    ).toBeUndefined();
    expect(assess(strong, { interview: 0 }, '2026-09-24').status).toBe(
      'LEARNING',
    );
    for (const v of [-1, 4, 1.5, 'bad'])
      expect(activityInput.safeParse({ ...input, recall: v }).success).toBe(
        false,
      );
    expect(
      activityInput.safeParse({
        ...input,
        activityType: 'NOTE',
        notes: 'Text',
        recall: 3,
      }).success,
    ).toBe(false);
  });
  const topic = (
    id: string,
    status: string,
    date: string,
    subjectStatus = 'ACTIVE',
  ) => ({
    id,
    status,
    nextReviewDate: new Date(date),
    subject: { status: subjectStatus },
    subjectId: 's',
    ordering: 0,
  });
  it('ranks overdue before today, weak before learning before maintenance; excludes paused/completed subjects/topics', () => {
    const list = [
      topic('strong', 'INTERVIEW_READY', '2026-09-20'),
      topic('learn', 'LEARNING', '2026-09-21'),
      topic('weak', 'NEEDS_REVISION', '2026-09-23'),
      topic('today', 'NEEDS_REVISION', '2026-09-24'),
      topic('future', 'LEARNING', '2026-09-25'),
      topic('paused', 'PAUSED', '2026-09-01'),
      topic('archived', 'LEARNING', '2026-09-01', 'ARCHIVED'),
    ];
    expect(reviewQueue(list, '2026-09-24').map((t) => t.id)).toEqual([
      'weak',
      'learn',
      'strong',
      'today',
      'future',
    ]);
    expect(dueState(list[3], '2026-09-24')).toBe('today');
  });
  it('Today suggests due reviews plus the first unstarted current-subject topic', () => {
    const list = [
      topic('due', 'NEEDS_REVISION', '2026-09-24'),
      topic('next', 'NOT_STARTED', '2026-09-25'),
      { ...topic('later', 'NOT_STARTED', '2026-09-25'), ordering: 2 },
    ];
    const s = learningSuggestions(list, 's', '2026-09-24');
    expect(s.queue.map((t) => t.id)).toEqual(['due']);
    expect(s.next?.id).toBe('next');
    expect(learningSuggestions(list, null, '2026-09-24').next).toBeUndefined();
    expect(isTechnical('SYSTEM_DESIGN')).toBe(true);
    expect(isTechnical(' System Design ')).toBe(true);
    expect(isTechnical('system-design')).toBe(true);
    expect(isTechnical('Technical')).toBe(true);
    expect(isTechnical('DSA')).toBe(false);
  });
  it('uses owner dates across midnight/DST and Monday-local weekly bounds', () => {
    const day = dayKey(new Date('2026-11-02T02:00:00Z'), 'America/Toronto');
    expect(day).toBe('2026-11-01');
    expect(assess(empty, { understanding: 2 }, day).nextReviewDate).toEqual(
      new Date('2026-11-03'),
    );
    expect(
      weekStart(new Date('2026-11-02T02:00:00Z'), 'America/Toronto'),
    ).toEqual(new Date('2026-10-26T04:00:00Z'));
  });
});
