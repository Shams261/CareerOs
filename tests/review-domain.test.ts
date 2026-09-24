import { describe, expect, it } from 'vitest';
import {
  categoryGroup,
  dsaWeek,
  formatMinutes,
  jobWeek,
  learningWeek,
  reviewInput,
  routinePreview,
  scheduleWeek,
  weekBounds,
  weekOf,
  weeklyPromptDue,
  weeklyReminderDue,
} from '../src/features/review/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const at = (day: string, time: string) => localInstant(day, time, zone);
const H = 3600000;

describe('owner-local weeks', () => {
  it('maps any day to its Monday and rejects non-Monday week starts', () => {
    expect(weekOf('2026-09-27')).toBe('2026-09-21'); // Sunday belongs to the week before
    expect(weekOf('2026-09-21')).toBe('2026-09-21');
    expect(weekOf('2026-09-24')).toBe('2026-09-21');
    expect(() => weekBounds('2026-09-22', zone)).toThrow('Monday');
    expect(reviewInput.safeParse({ weekStart: '2026-09-23' }).success).toBe(
      false,
    );
  });
  it('uses local midnights, giving 167h and 169h weeks across Toronto DST', () => {
    const normal = weekBounds('2026-09-21', zone);
    expect(normal.start.toISOString()).toBe('2026-09-21T04:00:00.000Z');
    expect(+normal.end - +normal.start).toBe(168 * H);
    const spring = weekBounds('2026-03-02', zone); // Sunday 8 March springs forward
    expect(+spring.end - +spring.start).toBe(167 * H);
    const fall = weekBounds('2026-10-26', zone); // Sunday 1 November falls back
    expect(+fall.end - +fall.start).toBe(169 * H);
    expect(fall.days).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});

describe('schedule week', () => {
  const b = weekBounds('2026-09-21', zone);
  const now = at('2026-09-26', '12:00'); // Saturday noon
  const block = (
    id: string,
    day: string,
    start: string,
    end: string,
    category: string,
    status = 'PLANNED',
  ) => ({
    id,
    title: id,
    category,
    status,
    day,
    plannedStart: at(day, start),
    plannedEnd: at(day, end),
  });
  const blocks = [
    block('dsa-mon', '2026-09-21', '07:30', '09:00', 'DSA', 'COMPLETED'),
    block('gym-mon', '2026-09-21', '19:30', '20:30', 'GYM', 'COMPLETED'),
    block('gym-tue', '2026-09-22', '19:30', '20:30', 'GYM', 'SKIPPED'),
    block('ts-wed', '2026-09-23', '21:00', '22:00', 'TECHNICAL'),
    block(
      'sd-thu',
      '2026-09-24',
      '21:00',
      '22:15',
      'SYSTEM_DESIGN',
      'CANCELLED',
    ),
    block('jobs-sun', '2026-09-27', '14:00', '16:00', 'JOB_SEARCH'),
  ];
  const sessions = [
    // Started before the week: only the in-week part counts.
    {
      category: 'DSA',
      startedAt: at('2026-09-20', '23:30'),
      endedAt: at('2026-09-21', '00:30'),
    },
    {
      category: 'DSA',
      startedAt: at('2026-09-21', '07:30'),
      endedAt: at('2026-09-21', '08:45'),
    },
    {
      category: 'GYM',
      startedAt: at('2026-09-21', '19:30'),
      endedAt: at('2026-09-21', '20:30'),
    },
    {
      category: 'Technical',
      startedAt: at('2026-09-23', '21:00'),
      endedAt: at('2026-09-23', '21:40'),
    },
  ];
  const s = scheduleWeek(blocks, sessions, b, now);
  it('reuses the focus rule and clips to the week', () => {
    expect(s.totals).toMatchObject({
      planned: 5,
      completed: 2,
      skipped: 1,
      cancelled: 1,
      unrecorded: 1,
    });
    // DSA 90 + Technical 60 + Job search 120 planned; Gym excluded from focus.
    expect(s.focus).toEqual({ planned: 270, actual: 30 + 75 + 40 });
  });
  it('groups planned vs actual by category family, most planned first', () => {
    expect(s.rows).toEqual(
      [
        { label: 'Job search', planned: 120, actual: 0 },
        { label: 'DSA', planned: 90, actual: 105 },
        { label: 'Gym', planned: 120, actual: 60 },
        { label: 'Technical', planned: 60, actual: 40 },
      ].sort(
        (a, c) =>
          c.planned - a.planned ||
          c.actual - a.actual ||
          a.label.localeCompare(c.label),
      ),
    );
    expect(categoryGroup('system-design')).toBe('Technical');
    expect(categoryGroup('Interview')).toBe('Job search');
  });
  it('counts routine execution and lays out the week by day with plain states', () => {
    expect(s.routines.find((r) => r.label === 'DSA')).toMatchObject({
      planned: 1,
      completed: 1,
    });
    expect(s.routines.find((r) => r.label === 'Gym')).toEqual({
      label: 'Gym',
      planned: 2,
      completed: 1,
      skipped: 1,
      unrecorded: 0,
    });
    expect(s.days.map((d) => d.items.map((i) => i.state))).toEqual([
      ['done', 'done'],
      ['skipped'],
      ['unrecorded'],
      ['cancelled'],
      [],
      [],
      ['planned'],
    ]);
    expect(s.unrecordedBlocks.map((x) => x.id)).toEqual(['ts-wed']);
    expect(formatMinutes(145)).toBe('2h 25m');
    expect(formatMinutes(60)).toBe('1h');
  });
});

describe('module summaries', () => {
  it('summarises DSA attempts and confidence without scoring', () => {
    const r = dsaWeek(
      [
        { problemId: 'a', confidenceBefore: null, confidenceAfter: 'RED' },
        { problemId: 'a', confidenceBefore: 'RED', confidenceAfter: 'YELLOW' },
        {
          problemId: 'b',
          confidenceBefore: 'YELLOW',
          confidenceAfter: 'GREEN',
        },
        { problemId: 'c', confidenceBefore: 'GREEN', confidenceAfter: 'RED' },
      ],
      [
        {
          confidence: 'YELLOW',
          attemptsCount: 2,
          nextRevisionAt: new Date('2026-09-20'),
        },
        {
          confidence: 'GREEN',
          attemptsCount: 3,
          nextRevisionAt: new Date('2026-10-01'),
        },
        {
          confidence: 'RED',
          attemptsCount: 1,
          nextRevisionAt: new Date('2026-09-25'),
        },
        { confidence: 'RED', attemptsCount: 0, nextRevisionAt: null },
      ],
      '2026-09-24',
    );
    expect(r).toEqual({
      attempts: 4,
      uniqueProblems: 3,
      newProblems: 1,
      revisionAttempts: 3,
      redToYellow: 1,
      yellowToGreen: 1,
      toRed: 1,
      current: { RED: 1, YELLOW: 1, GREEN: 1 },
      overdue: 1,
    });
  });
  it('summarises learning activities, readiness gains and regressions', () => {
    expect(
      learningWeek([
        {
          topicId: 't1',
          activityType: 'LEARN',
          statusBefore: 'NOT_STARTED',
          statusAfter: 'LEARNING',
        },
        {
          topicId: 't1',
          activityType: 'NOTE',
          statusBefore: 'LEARNING',
          statusAfter: 'LEARNING',
        },
        {
          topicId: 't2',
          activityType: 'REVIEW',
          statusBefore: 'NEEDS_REVISION',
          statusAfter: 'INTERVIEW_READY',
        },
        {
          topicId: 't3',
          activityType: 'INTERVIEW_RECALL',
          statusBefore: 'INTERVIEW_READY',
          statusAfter: 'NEEDS_REVISION',
        },
        {
          topicId: 't4',
          activityType: 'REVIEW',
          statusBefore: 'LEARNING',
          statusAfter: 'NEEDS_REVISION',
        },
      ]),
    ).toEqual({
      activities: 4,
      studied: 4,
      reviewed: 3,
      becameReady: 1,
      regressed: 1,
    });
  });
  it('summarises job events in the week and the pipeline as it stands', () => {
    const b = weekBounds('2026-09-21', zone);
    const r = jobWeek(
      {
        apps: [
          {
            stage: 'APPLIED',
            appliedAt: new Date('2026-09-21'),
            actionOwner: 'ME',
            nextActionDate: new Date('2026-09-22'),
          },
          {
            stage: 'TECHNICAL',
            appliedAt: new Date('2026-09-10'),
            actionOwner: 'COMPANY',
            nextActionDate: null,
          },
          {
            stage: 'REJECTED',
            appliedAt: new Date('2026-09-27'),
            actionOwner: 'ME',
            nextActionDate: new Date('2026-09-01'),
          },
        ],
        rounds: [
          {
            type: 'RECRUITER',
            status: 'COMPLETED',
            scheduledStart: at('2026-09-22', '10:00'),
            completedAt: at('2026-09-22', '10:30'),
          },
          {
            type: 'CODING',
            status: 'SCHEDULED',
            scheduledStart: at('2026-09-24', '14:00'),
            completedAt: null,
          },
          {
            type: 'SYSTEM_DESIGN',
            status: 'CANCELLED',
            scheduledStart: at('2026-09-25', '14:00'),
            completedAt: null,
          },
          {
            type: 'FINAL',
            status: 'SCHEDULED',
            scheduledStart: at('2026-09-28', '14:00'),
            completedAt: null,
          },
        ],
        activities: [
          {
            type: 'FOLLOW_UP_DONE',
            toStage: null,
            occurredAt: at('2026-09-23', '09:00'),
          },
          {
            type: 'STAGE_CHANGED',
            toStage: 'REJECTED',
            occurredAt: at('2026-09-27', '20:00'),
          },
          {
            type: 'STAGE_CHANGED',
            toStage: 'OFFER',
            occurredAt: at('2026-09-18', '20:00'),
          },
        ],
      },
      b,
      '2026-09-24',
    );
    expect(r).toMatchObject({
      submitted: 2,
      recruiter: 1,
      technical: 1,
      systemDesign: 0,
      final: 0,
      completed: 1,
      followUpsDone: 1,
      offers: 0,
      rejections: 1,
      active: 2,
      waiting: 1,
      actionRequired: 1,
      followUpsOverdue: 1,
    });
  });
});

describe('next week and prompts', () => {
  it('previews routines per day without generating anything, skipping DST-gap times', () => {
    const days = routinePreview(
      [
        {
          id: 'r1',
          title: 'DSA',
          category: 'DSA',
          weekdays: [1, 2, 3, 4],
          startLocal: '07:30',
          endLocal: '09:00',
          enabled: true,
        },
        {
          id: 'r2',
          title: 'Gym',
          category: 'GYM',
          weekdays: [1],
          startLocal: '06:30',
          endLocal: '07:15',
          enabled: true,
        },
        {
          id: 'r3',
          title: 'Paused',
          category: 'X',
          weekdays: [1],
          startLocal: '10:00',
          endLocal: '11:00',
          enabled: false,
        },
        {
          id: 'r4',
          title: 'Night',
          category: 'X',
          weekdays: [0],
          startLocal: '02:30',
          endLocal: '03:30',
          enabled: true,
        },
      ],
      '2026-03-02',
      zone,
    );
    expect(days[0].items.map((i) => i.title)).toEqual(['Gym', 'DSA']);
    expect(days[4].items).toEqual([]);
    expect(days[6].items).toEqual([]); // 02:30 does not exist on 8 March in Toronto
  });
  it('prompts and reminds only on Sunday while the review is open', () => {
    const sunday = at('2026-09-27', '19:00'),
      saturday = at('2026-09-26', '19:00');
    expect(weeklyPromptDue(sunday, zone, null)).toBe(true);
    expect(weeklyPromptDue(sunday, zone, { completedAt: sunday })).toBe(false);
    expect(weeklyPromptDue(saturday, zone, null)).toBe(false);
    expect(
      weeklyReminderDue(at('2026-09-27', '17:59'), zone, '18:00', false),
    ).toBeNull();
    expect(weeklyReminderDue(sunday, zone, '18:00', false)).toBe('2026-09-21');
    expect(weeklyReminderDue(sunday, zone, '18:00', true)).toBeNull();
    expect(weeklyReminderDue(saturday, zone, '18:00', false)).toBeNull();
  });
});
