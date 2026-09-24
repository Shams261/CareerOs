import { describe, expect, it } from 'vitest';
import {
  attention,
  attentionQueue,
  duplicateKey,
  filterApplications,
  followUpReminderDue,
  followUpState,
  interviewInterval,
  interviewTime,
  interviewWindow,
  nextRound,
  prepInput,
  quickAddInput,
  resultNeeded,
  weeklyJobSummary,
} from '../src/features/jobs/domain';

const zone = 'America/Toronto';
// Thursday 2026-09-24, 10:00 Toronto.
const now = new Date('2026-09-24T14:00:00Z');
const round = (
  id: string,
  start: string,
  status = 'SCHEDULED',
  end: string | null = null,
) => ({
  id,
  title: id,
  type: 'CODING',
  status,
  scheduledStart: new Date(start),
  scheduledEnd: end ? new Date(end) : null,
  timezone: zone,
});
const app = (
  id: string,
  over: Partial<{
    stage: string;
    actionOwner: string;
    nextAction: string | null;
    nextActionDate: Date | null;
    rounds: ReturnType<typeof round>[];
    company: string;
    role: string;
    source: string | null;
  }> = {},
) => ({
  id,
  stage: 'APPLIED',
  actionOwner: 'NONE',
  nextAction: null,
  nextActionDate: null,
  rounds: [],
  company: id,
  role: 'Engineer',
  source: null,
  ...over,
});

describe('follow-up state', () => {
  it('classifies overdue, today, upcoming using owner calendar dates', () => {
    const at = (d: string) => app('a', { nextActionDate: new Date(d) });
    expect(followUpState(at('2026-09-22'), '2026-09-24')).toEqual({
      state: 'overdue',
      days: 2,
      date: '2026-09-22',
    });
    expect(followUpState(at('2026-09-24'), '2026-09-24').state).toBe('today');
    expect(followUpState(at('2026-09-27'), '2026-09-24')).toMatchObject({
      state: 'upcoming',
      days: 3,
    });
    expect(followUpState(app('a'), '2026-09-24').state).toBe('none');
  });
  it('never treats closed applications as due', () => {
    expect(
      followUpState(
        app('a', { stage: 'REJECTED', nextActionDate: new Date('2026-09-01') }),
        '2026-09-24',
      ).state,
    ).toBe('none');
  });
});

describe('attention and waiting', () => {
  it('ranks overdue before results, interviews, due-today and undated actions', () => {
    const apps = [
      app('undated', { actionOwner: 'ME', nextAction: 'Send availability' }),
      app('today', { nextActionDate: new Date('2026-09-24') }),
      app('overdue1', { nextActionDate: new Date('2026-09-23') }),
      app('overdue3', { nextActionDate: new Date('2026-09-21') }),
      app('result', { rounds: [round('r', '2026-09-23T15:00:00Z')] }),
      app('interview', { rounds: [round('i', '2026-09-25T18:00:00Z')] }),
    ];
    expect(attentionQueue(apps, now, zone).map((x) => x.app.id)).toEqual([
      'overdue3',
      'overdue1',
      'result',
      'interview',
      'today',
      'undated',
    ]);
  });
  it('limits interview attention to today and tomorrow in the owner zone', () => {
    // Saturday 00:30 Toronto is beyond tomorrow (Friday).
    const later = app('later', {
      rounds: [round('x', '2026-09-26T04:30:00Z')],
    });
    expect(attention(later, now, zone)).toEqual([]);
    const tomorrowLate = app('late', {
      rounds: [round('y', '2026-09-26T03:30:00Z')],
    });
    expect(attention(tomorrowLate, now, zone)[0].kind).toBe('INTERVIEW_SOON');
  });
  it('does not flag waiting-on-company applications or infer rejection from silence', () => {
    const waiting = app('w', {
      actionOwner: 'COMPANY',
      nextActionDate: new Date('2026-10-01'),
    });
    expect(attention(waiting, now, zone)).toEqual([]);
    expect(waiting.stage).toBe('APPLIED');
    const due = { ...waiting, nextActionDate: new Date('2026-09-24') };
    expect(attention(due, now, zone).map((a) => a.kind)).toEqual([
      'FOLLOW_UP_TODAY',
    ]);
  });
  it('ignores closed applications entirely', () => {
    expect(
      attention(
        app('c', {
          stage: 'WITHDRAWN',
          actionOwner: 'ME',
          nextActionDate: new Date('2026-09-01'),
        }),
        now,
        zone,
      ),
    ).toEqual([]);
  });
  it('treats a passed scheduled round as needing a result, not as upcoming', () => {
    const rounds = [
      round(
        'past',
        '2026-09-24T12:00:00Z',
        'SCHEDULED',
        '2026-09-24T13:00:00Z',
      ),
      round('now', '2026-09-24T13:30:00Z', 'SCHEDULED', '2026-09-24T14:30:00Z'),
      round('done', '2026-09-20T13:00:00Z', 'COMPLETED'),
    ];
    expect(resultNeeded(rounds, now).map((r) => r.id)).toEqual(['past']);
    expect(nextRound(rounds, now)?.id).toBe('now');
  });
});

describe('filters', () => {
  const apps = [
    app('amazon', {
      stage: 'TECHNICAL',
      source: 'LinkedIn',
      actionOwner: 'ME',
    }),
    app('shopify', {
      stage: 'RECRUITER_SCREEN',
      actionOwner: 'COMPANY',
      source: 'linkedin',
    }),
    app('offer', { stage: 'OFFER' }),
    app('rejected', { stage: 'REJECTED' }),
    app('withdrawn', { stage: 'WITHDRAWN' }),
    app('next', {
      rounds: [round('n', '2026-10-01T15:00:00Z')],
      company: 'Company X',
    }),
  ];
  const ids = (f: Parameters<typeof filterApplications>[1]) =>
    filterApplications(apps, f, now, zone).map((a) => a.id);
  it('defaults to active and keeps terminal applications filterable', () => {
    expect(ids({})).toEqual(['amazon', 'shopify', 'next']);
    expect(ids({ view: 'offer' })).toEqual(['offer']);
    expect(ids({ view: 'rejected' })).toEqual(['rejected']);
    expect(ids({ view: 'withdrawn' })).toEqual(['withdrawn']);
    expect(ids({ view: 'all' })).toHaveLength(6);
  });
  it('filters by search, stage, source, waiting, action and interview', () => {
    expect(ids({ q: 'company x' })).toEqual(['next']);
    expect(ids({ stage: 'TECHNICAL' })).toEqual(['amazon']);
    expect(ids({ source: 'LinkedIn' })).toEqual(['amazon', 'shopify']);
    expect(ids({ focus: 'waiting' })).toEqual(['shopify']);
    expect(ids({ focus: 'action' })).toEqual(['amazon']);
    expect(ids({ focus: 'interview' })).toEqual(['next']);
  });
});

describe('validation and time', () => {
  const base = {
    requestId: crypto.randomUUID(),
    company: 'Amazon',
    role: 'SDE II',
  };
  it('accepts only HTTP(S) job URLs and keeps quick add minimal', () => {
    expect(quickAddInput.parse(base)).toMatchObject({
      stage: 'APPLIED',
      source: null,
    });
    expect(
      quickAddInput.parse({ ...base, jobUrl: 'https://example.com/job' })
        .jobUrl,
    ).toBe('https://example.com/job');
    for (const jobUrl of [
      'javascript:alert(1)',
      'ftp://example.com',
      'https://user:pass@example.com',
    ])
      expect(quickAddInput.safeParse({ ...base, jobUrl }).success).toBe(false);
  });
  it('normalizes duplicate keys on company, role and URL', () => {
    expect(
      duplicateKey({
        company: ' Amazon ',
        role: 'SDE  II',
        jobUrl: 'https://x.com/j/',
      }),
    ).toBe(
      duplicateKey({
        company: 'amazon',
        role: 'sde ii',
        jobUrl: 'https://x.com/j',
      }),
    );
    expect(duplicateKey({ company: 'Amazon', role: 'Frontend' })).not.toBe(
      duplicateKey({ company: 'Amazon', role: 'SDE II' }),
    );
  });
  it('stores interview instants from their own timezone and shows both zones', () => {
    const interval = interviewInterval({
      date: '2026-10-10',
      start: '14:00',
      end: '15:00',
      timezone: 'America/Vancouver',
    });
    expect(interval.scheduledStart.toISOString()).toBe(
      '2026-10-10T21:00:00.000Z',
    );
    expect(
      interviewTime({ ...interval, timezone: 'America/Vancouver' }, zone),
    ).toBe('Sat, Oct 10 · 5:00 PM–6:00 PM (2:00 PM America/Vancouver)');
    expect(() =>
      interviewInterval({
        date: '2026-10-10',
        start: '14:00',
        end: '13:00',
        timezone: zone,
      }),
    ).toThrow('after');
    // Spring-forward gap in Toronto is rejected rather than silently shifted.
    expect(() =>
      interviewInterval({ date: '2026-03-08', start: '02:30', timezone: zone }),
    ).toThrow('DST');
  });
  it('parses optional prep links without requiring one', () => {
    const base = { roundId: 'r', title: 'Review caching' };
    expect(prepInput.parse(base)).toMatchObject({
      learningTopicId: null,
      dsaProblemId: null,
      dsaTopicId: null,
      kind: 'PREP',
    });
    expect(
      prepInput.parse({ ...base, link: 'learning:t1' }).learningTopicId,
    ).toBe('t1');
    expect(prepInput.parse({ ...base, link: 'problem:p1' }).dsaProblemId).toBe(
      'p1',
    );
  });
});

describe('reminder eligibility', () => {
  it('uses a 24-hour window and a shorter configurable window', () => {
    const r = (h: number, status = 'SCHEDULED') => ({
      status,
      scheduledStart: new Date(+now + h * 3600000),
    });
    expect(interviewWindow(r(25), now, 60)).toBeNull();
    expect(interviewWindow(r(23), now, 60)).toBe('day');
    expect(interviewWindow(r(0.5), now, 60)).toBe('soon');
    expect(interviewWindow(r(-1), now, 60)).toBeNull();
    expect(interviewWindow(r(2, 'CANCELLED'), now, 60)).toBeNull();
  });
  it('fires follow-ups at the preferred local time, keyed by planned date', () => {
    const a = app('a', { nextActionDate: new Date('2026-09-24') });
    expect(followUpReminderDue(a, now, zone, '11:00')).toBeNull();
    expect(followUpReminderDue(a, now, zone, '09:00')).toBe('2026-09-24');
    const overdue = { ...a, nextActionDate: new Date('2026-09-20') };
    expect(followUpReminderDue(overdue, now, zone, '23:00')).toBe('2026-09-20');
    expect(
      followUpReminderDue({ ...a, stage: 'REJECTED' }, now, zone, '09:00'),
    ).toBeNull();
  });
});

describe('weekly summary', () => {
  it('counts factual week-to-date events from Monday in the owner zone', () => {
    const monday = new Date('2026-09-21T13:00:00Z');
    const summary = weeklyJobSummary(
      {
        apps: [
          {
            stage: 'APPLIED',
            appliedAt: new Date('2026-09-21'),
            createdAt: new Date('2026-09-21T15:00:00Z'),
            nextActionDate: new Date('2026-09-23'),
          },
          {
            stage: 'OFFER',
            appliedAt: new Date('2026-09-20'),
            createdAt: new Date('2026-09-20T15:00:00Z'),
            nextActionDate: null,
          },
          {
            stage: 'TECHNICAL',
            appliedAt: new Date('2026-09-24'),
            createdAt: new Date('2026-09-24T13:30:00Z'),
            nextActionDate: new Date('2026-09-30'),
          },
        ],
        rounds: [
          {
            type: 'RECRUITER',
            status: 'COMPLETED',
            scheduledStart: monday,
            completedAt: monday,
          },
          {
            type: 'CODING',
            status: 'SCHEDULED',
            scheduledStart: new Date('2026-09-23T15:00:00Z'),
            completedAt: null,
          },
          {
            type: 'SYSTEM_DESIGN',
            status: 'CANCELLED',
            scheduledStart: monday,
            completedAt: null,
          },
          {
            type: 'CODING',
            status: 'COMPLETED',
            scheduledStart: new Date('2026-09-18T15:00:00Z'),
            completedAt: new Date('2026-09-18T16:00:00Z'),
          },
        ],
        activities: [
          { type: 'FOLLOW_UP_DONE', toStage: null, occurredAt: monday },
          { type: 'STAGE_CHANGED', toStage: 'REJECTED', occurredAt: monday },
          { type: 'STAGE_CHANGED', toStage: 'TECHNICAL', occurredAt: monday },
          {
            type: 'STAGE_CHANGED',
            toStage: 'REJECTED',
            occurredAt: new Date('2026-09-19T12:00:00Z'),
          },
        ],
        sessions: [
          {
            category: 'JOB_SEARCH',
            startedAt: new Date('2026-09-24T13:00:00Z'),
            endedAt: null,
          },
        ],
      },
      now,
      zone,
    );
    expect(summary).toEqual({
      submitted: 2,
      recruiterScreens: 1,
      technical: 1,
      interviewsCompleted: 1,
      followUpsDue: 1,
      followUpsDone: 1,
      stageMoves: 2,
      rejections: 1,
      active: 2,
      offers: 1,
      loggedInSessions: 1,
    });
  });
});
