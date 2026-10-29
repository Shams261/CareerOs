import { describe, it, expect } from 'vitest';
import {
  agendaEntries,
  attentionItems,
  blockTitle,
  attentionPage,
  blockResolution,
  daySummary,
  entryEnd,
  formatDuration,
  groupAgenda,
  launcherState,
  notificationEntity,
  summaryLine,
  type BlockLike,
  type RoundLike,
} from '../src/features/today/domain';
import { dayBounds, localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const day = '2026-10-22';
const at = (time: string, d = day) => localInstant(d, time, zone);
const bounds = dayBounds(day, zone);
const noon = at('12:00');
let n = 0;
const block = (over: Partial<BlockLike> = {}): BlockLike => ({
  id: `b${++n}`,
  title: 'Block',
  category: 'DSA',
  status: 'PLANNED',
  plannedStart: at('09:00'),
  plannedEnd: at('10:00'),
  interviewRoundId: null,
  sessions: [],
  ...over,
});
const round = (over: Partial<RoundLike> = {}): RoundLike => ({
  id: `r${++n}`,
  title: 'Coding',
  type: 'CODING',
  applicationId: 'app1',
  company: 'Example Labs',
  scheduledStart: at('14:00'),
  scheduledEnd: at('15:00'),
  openPrep: 0,
  meetingUrl: null,
  ...over,
});

describe('day summary', () => {
  it('counts every category, excludes cancelled blocks and clips to the day', () => {
    const blocks = [
      block({
        category: 'GYM',
        plannedStart: at('06:00'),
        plannedEnd: at('07:00'),
      }),
      block({
        category: 'WORK',
        plannedStart: at('09:00'),
        plannedEnd: at('11:00'),
      }),
      block({
        status: 'CANCELLED',
        plannedStart: at('12:00'),
        plannedEnd: at('13:00'),
      }),
      // Overnight: only the part before local midnight counts.
      block({
        plannedStart: at('23:30'),
        plannedEnd: at('00:30', '2026-10-23'),
      }),
    ];
    const s = daySummary(blocks, [], bounds, noon);
    expect(s.plannedMinutes).toBe(60 + 120 + 30);
    expect(s.planned).toBe(3);
  });
  it('records unique sessions once, a running one up to now, none outside the day', () => {
    const shared = { id: 's1', startedAt: at('09:00'), endedAt: at('09:30') };
    const blocks = [block({ sessions: [shared] })];
    const sessions = [
      shared,
      { id: 's2', startedAt: at('11:00'), endedAt: null },
      {
        id: 's3',
        startedAt: at('08:00', '2026-10-21'),
        endedAt: at('09:00', '2026-10-21'),
      },
    ];
    expect(daySummary(blocks, sessions, bounds, noon).recordedMinutes).toBe(
      30 + 60,
    );
  });
  it('clips a session across midnight on the DST change day', () => {
    const dst = '2026-11-01';
    const b = dayBounds(dst, zone);
    const s = daySummary(
      [],
      [
        {
          id: 'x',
          startedAt: localInstant('2026-10-31', '23:00', zone),
          endedAt: localInstant(dst, '03:00', zone),
        },
      ],
      b,
      localInstant(dst, '12:00', zone),
    );
    // Midnight to 03:00 on the fall-back morning is four real hours.
    expect(s.recordedMinutes).toBe(240);
  });
  it('keeps zero planned time with recorded work as a plain fact', () => {
    const s = daySummary(
      [],
      [{ id: 'a', startedAt: at('08:00'), endedAt: at('08:59') }],
      bounds,
      noon,
    );
    expect(summaryLine(s)).toBe(
      '0 blocks completed · 59 min recorded · 0 min planned',
    );
    expect(formatDuration(135)).toBe('2h 15m');
    expect(formatDuration(120)).toBe('2h');
    expect(summaryLine(s)).not.toMatch(/%/);
  });
});

describe('launcher state', () => {
  const running = {
    id: 'run',
    startedAt: at('11:40'),
    category: 'DSA',
    taskId: null,
    title: null,
  };
  it('prefers a running session, then the block covering now, then the next block', () => {
    const current = block({
      plannedStart: at('11:30'),
      plannedEnd: at('12:30'),
    });
    const next = block({ plannedStart: at('13:00'), plannedEnd: at('14:00') });
    expect(launcherState([current, next], running, noon).kind).toBe('running');
    const s = launcherState([next, current], null, noon);
    expect(s.kind).toBe('current');
    if (s.kind === 'current') {
      expect(s.block).toBe(current);
      expect(s.next).toBe(next);
    }
    expect(launcherState([next], null, noon)).toEqual({
      kind: 'next',
      block: next,
    });
  });
  it('picks the earliest start then the stable id among overlapping blocks', () => {
    const a = block({
      id: 'zz',
      plannedStart: at('11:00'),
      plannedEnd: at('13:00'),
    });
    const b = block({
      id: 'aa',
      plannedStart: at('11:00'),
      plannedEnd: at('12:30'),
    });
    const c = block({
      id: 'mm',
      plannedStart: at('11:30'),
      plannedEnd: at('12:30'),
    });
    const s = launcherState([a, b, c], null, noon);
    expect(s.kind === 'current' && s.block.id).toBe('aa');
  });
  it('asks to update earlier blocks before calling the day done; completed days are done', () => {
    const past = block({ plannedStart: at('08:00'), plannedEnd: at('09:00') });
    expect(launcherState([past], null, noon)).toEqual({
      kind: 'reconcile',
      blocks: [past],
    });
    expect(
      launcherState([block({ ...past, status: 'COMPLETED' })], null, noon),
    ).toEqual({ kind: 'done' });
    expect(launcherState([], null, noon)).toEqual({ kind: 'done' });
  });
  it('lets a running session win on a reviewed day and links it to its block', () => {
    const task = block({
      id: 't1',
      status: 'IN_PROGRESS',
      plannedStart: at('11:30'),
      plannedEnd: at('12:30'),
    });
    const s = launcherState([task], { ...running, taskId: 't1' }, noon);
    expect(s.kind === 'running' && s.block?.id).toBe('t1');
  });
});

describe('agenda entries and groups', () => {
  it('shows a linked interview as one entry and keeps unlinked rounds distinct', () => {
    const r1 = round({ id: 'r-linked' });
    const r2 = round({
      id: 'r-free',
      scheduledStart: at('14:00'),
      scheduledEnd: at('15:00'),
    });
    const r3 = round({
      id: 'r-free-2',
      scheduledStart: at('14:00'),
      scheduledEnd: at('15:00'),
    });
    const linked = block({
      id: 'ib',
      title: 'Coding',
      interviewRoundId: 'r-linked',
      plannedStart: at('14:00'),
      plannedEnd: at('15:00'),
    });
    const same = block({
      id: 'same',
      title: 'Coding',
      plannedStart: at('14:00'),
      plannedEnd: at('15:00'),
    });
    const entries = agendaEntries([linked, same], [r1, r2, r3]);
    expect(entries.map((e) => e.key)).toEqual([
      'block-ib',
      'block-same',
      'round-r-free',
      'round-r-free-2',
    ]);
    const first = entries[0];
    expect(first.kind === 'block' && first.round?.id).toBe('r-linked');
  });
  it('shows an interview without an end time by its start and groups it as an hour', () => {
    const r = round({ scheduledStart: at('11:30'), scheduledEnd: null });
    const [e] = agendaEntries([], [r]);
    expect(e.end).toBeNull();
    expect(entryEnd(e)).toEqual(at('12:30'));
    expect(groupAgenda([e], noon, true).now).toHaveLength(1);
    expect(groupAgenda([e], at('12:31'), true).earlier).toHaveLength(1);
  });
  it('groups by time, finished blocks as Earlier, and parks cancelled; other days get one list', () => {
    const earlier = block({
      plannedStart: at('08:00'),
      plannedEnd: at('09:00'),
      status: 'COMPLETED',
    });
    const nowB = block({ plannedStart: at('11:30'), plannedEnd: at('12:30') });
    const later = block({
      plannedStart: at('13:00'),
      plannedEnd: at('14:00'),
      status: 'COMPLETED',
    });
    const gone = block({
      plannedStart: at('15:00'),
      plannedEnd: at('16:00'),
      status: 'CANCELLED',
    });
    const entries = agendaEntries([gone, later, nowB, earlier], []);
    const g = groupAgenda(entries, noon, true);
    // WI-066: a block completed before its slot is Earlier, not Later.
    expect(g.earlier.map((e) => e.key)).toEqual([
      `block-${earlier.id}`,
      `block-${later.id}`,
    ]);
    expect(g.now.map((e) => e.key)).toEqual([`block-${nowB.id}`]);
    expect(g.later).toEqual([]);
    // A session running on a later block puts it in Now.
    const started = block({
      plannedStart: at('15:00'),
      plannedEnd: at('16:00'),
      status: 'IN_PROGRESS',
    });
    expect(
      groupAgenda(agendaEntries([started], []), noon, true).now,
    ).toHaveLength(1);
    expect(g.cancelled.map((e) => e.key)).toEqual([`block-${gone.id}`]);
    const past = groupAgenda(entries, noon, false);
    expect(past.earlier).toEqual([]);
    expect(past.later).toHaveLength(3);
    expect(past.cancelled).toHaveLength(1);
  });
  it('tells an unrecorded past block from a recorded one that still needs an update', () => {
    const past = block({ plannedStart: at('08:00'), plannedEnd: at('09:00') });
    expect(blockResolution(past, noon)).toBe('not-recorded');
    expect(
      blockResolution(
        {
          ...past,
          sessions: [{ id: 's', startedAt: at('08:00'), endedAt: at('08:20') }],
        },
        noon,
      ),
    ).toBe('needs-update');
    expect(blockResolution({ ...past, status: 'SKIPPED' }, noon)).toBe(
      'skipped',
    );
    expect(blockResolution({ ...past, status: 'CANCELLED' }, noon)).toBe(
      'cancelled',
    );
    expect(blockResolution({ ...past, status: 'COMPLETED' }, noon)).toBe(
      'done',
    );
    expect(
      blockResolution(
        block({ plannedStart: at('11:30'), plannedEnd: at('12:30') }),
        noon,
      ),
    ).toBe('current');
    expect(
      blockResolution(
        block({ plannedStart: at('13:00'), plannedEnd: at('14:00') }),
        noon,
      ),
    ).toBe('upcoming');
  });
});

describe('needs attention', () => {
  const base = {
    now: noon,
    zone,
    interviews: [],
    jobs: [],
    practice: [],
    roadmap: [],
    notifications: [],
    weeklyDue: false,
  };
  it('orders by tier, then due instant, then id, across every source', () => {
    const prep = round({ id: 'rp', scheduledStart: at('16:00'), openPrep: 2 });
    const items = attentionItems({
      ...base,
      interviews: [prep],
      jobs: [
        {
          app: {
            id: 'a1',
            company: 'Over Co',
            nextAction: 'Send availability',
            nextActionDate: new Date('2026-10-20T00:00:00Z'),
          },
          reasons: [{ kind: 'FOLLOW_UP_OVERDUE', days: 2 }],
        },
        {
          app: {
            id: 'a2',
            company: 'Today Co',
            nextAction: null,
            nextActionDate: new Date('2026-10-22T00:00:00Z'),
          },
          reasons: [{ kind: 'FOLLOW_UP_TODAY' }],
        },
        {
          app: {
            id: 'a3',
            company: 'Move Co',
            nextAction: null,
            nextActionDate: null,
          },
          reasons: [{ kind: 'ACTION_REQUIRED' }],
        },
      ],
      practice: [
        {
          id: 'p1',
          title: 'Two Sum',
          confidence: 'YELLOW',
          nextRevisionAt: new Date('2026-10-21T00:00:00Z'),
        },
      ],
      roadmap: [
        {
          id: 'i1',
          title: 'HTTP semantics',
          section: 'Week 1',
          nextRevisionAt: new Date('2026-10-22T00:00:00Z'),
          roadmap: { id: 'rm', title: 'Backend' },
        },
      ],
      weeklyDue: true,
    });
    expect(items.map((i) => i.id)).toEqual([
      'prep:rp',
      'job:a1',
      'practice:p1',
      'job:a2',
      'roadmap:i1',
      'weekly',
      'job:a3',
    ]);
    expect(items[1].context).toBe('Over Co · Overdue by 2 days');
    expect(items[2].context).toBe('Revision overdue by 1 day · Yellow');
    expect(items[4].context).toBe('Revision due today · Backend');
    expect(items[0].context).toBe(
      'Example Labs · Today at 16:00 · 2 prep items open',
    );
  });
  it('merges a reminder into the row keyed on the same entity and keeps its id', () => {
    const prep = round({
      id: 'r9',
      applicationId: 'a9',
      scheduledStart: at('16:00'),
      openPrep: 1,
    });
    const items = attentionItems({
      ...base,
      interviews: [prep],
      jobs: [
        {
          app: {
            id: 'a9',
            company: 'Keyed Co',
            nextAction: 'Reply',
            nextActionDate: new Date('2026-10-22T00:00:00Z'),
          },
          reasons: [{ kind: 'FOLLOW_UP_TODAY' }],
        },
      ],
      notifications: [
        {
          id: 'n1',
          type: 'INTERVIEW',
          title: 'Interview today',
          scheduledFor: at('09:00'),
          dedupeKey: `u:INTERVIEW:r9:${at('16:00').toISOString()}:day`,
        },
        {
          id: 'n2',
          type: 'JOB_FOLLOW_UP',
          title: 'Follow up',
          scheduledFor: at('09:00'),
          dedupeKey: 'u:JOB_FOLLOW_UP:a9:2026-10-22',
        },
        {
          id: 'n3',
          type: 'DAILY_PROGRESS',
          title: 'Check in',
          scheduledFor: at('09:00'),
          dedupeKey: 'u:DAILY_PROGRESS:day:2026-10-22',
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual([
      'prep:r9',
      'job:a9',
      'notification:n3',
    ]);
    expect(items[0].notificationIds).toEqual(['n1']);
    expect(items[1].notificationIds).toEqual(['n2']);
    expect(items[2].notificationIds).toEqual(['n3']);
    expect(
      notificationEntity(`u:INTERVIEW:r9:${at('16:00').toISOString()}:day`),
    ).toBe('r9');
  });
  it('reads a reminder keyed on a block as that block, linked to its row', () => {
    const items = attentionItems({
      ...base,
      blocks: [
        {
          id: 'b1',
          title: 'Cover letter draft',
          plannedStart: at('11:00'),
          plannedEnd: at('12:00'),
        },
        {
          id: 'b2',
          title: 'Example Labs — Coding',
          plannedStart: at('18:00'),
          plannedEnd: at('19:00'),
          interviewRoundId: 'r1',
        },
      ],
      interviews: [
        round({ id: 'r1', title: 'Coding', scheduledStart: at('18:00') }),
      ],
      notifications: [
        {
          id: 'n1',
          type: 'OVERDUE_TASK',
          title:
            'You planned Cover letter draft from 11:00 AM–12:00 PM and haven’t recorded progress.',
          scheduledFor: at('12:00'),
          dedupeKey: `u:OVERDUE_TASK:b1:${at('12:00').toISOString()}`,
        },
        {
          id: 'n2',
          type: 'UPCOMING_BLOCK',
          title: 'Example Labs — Coding starts in 15 minutes.',
          scheduledFor: at('17:45'),
          dedupeKey: `u:UPCOMING_BLOCK:b2:${at('18:00').toISOString()}`,
        },
        {
          id: 'n3',
          type: 'OVERDUE_TASK',
          title: 'A block that is no longer on the plan.',
          scheduledFor: at('13:00'),
          dedupeKey: `u:OVERDUE_TASK:gone:${at('13:00').toISOString()}`,
        },
      ],
    });
    expect(items.map((i) => [i.title, i.context, i.href])).toEqual([
      ['Cover letter draft', 'Not recorded · 11:00–12:00', '#block-b1'],
      ['A block that is no longer on the plan.', 'Today', null],
      ['Coding', 'Starts at 18:00', '#block-b2'],
    ]);
    expect(items[0].notificationIds).toEqual(['n1']);
  });
  it('shows the round title for a block the round form named, and the owner’s title otherwise', () => {
    const r = { title: 'Recruiter call', company: 'Example Labs' };
    expect(blockTitle({ title: 'Example Labs — Recruiter call' }, r)).toBe(
      'Recruiter call',
    );
    expect(blockTitle({ title: 'Prep for the recruiter' }, r)).toBe(
      'Prep for the recruiter',
    );
    expect(blockTitle({ title: 'Example Labs — Recruiter call' }, null)).toBe(
      'Example Labs — Recruiter call',
    );
  });
  it('keeps every reason of an application: an interview tomorrow never hides a follow-up today', () => {
    const tomorrow = round({
      id: 'rt',
      scheduledStart: at('10:00', '2026-10-23'),
      scheduledEnd: at('11:00', '2026-10-23'),
    });
    const items = attentionItems({
      ...base,
      jobs: [
        {
          app: {
            id: 'a1',
            company: 'Both Co',
            nextAction: 'Send thank-you',
            nextActionDate: new Date('2026-10-22T00:00:00Z'),
          },
          reasons: [
            {
              kind: 'INTERVIEW_SOON',
              round: { ...tomorrow, status: 'SCHEDULED', timezone: zone },
            },
            { kind: 'FOLLOW_UP_TODAY' },
          ],
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(['job:a1', 'interview:rt']);
    expect(items[0].context).toBe('Both Co · Due today');
  });
  it('drops the prep row once the interview has ended, so the result row shows', () => {
    const ended = round({
      id: 're',
      scheduledStart: at('09:00'),
      scheduledEnd: at('10:00'),
      openPrep: 3,
    });
    const items = attentionItems({
      ...base,
      interviews: [ended],
      jobs: [
        {
          app: {
            id: 'a1',
            company: 'Done Co',
            nextAction: null,
            nextActionDate: null,
          },
          reasons: [
            {
              kind: 'RESULT_NEEDED',
              round: { ...ended, status: 'SCHEDULED', timezone: zone },
            },
          ],
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(['result:re']);
    const open = round({
      id: 'ro',
      scheduledStart: at('11:30'),
      scheduledEnd: null,
      openPrep: 1,
    });
    expect(
      attentionItems({ ...base, interviews: [open] }).map((i) => i.id),
    ).toEqual(['prep:ro']);
    expect(
      attentionItems({ ...base, now: at('12:31'), interviews: [open] }),
    ).toEqual([]);
  });
  it('merges a follow-up reminder into the follow-up row, never into the interview row', () => {
    const tomorrow = round({
      id: 'rt',
      applicationId: 'a1',
      scheduledStart: at('10:00', '2026-10-23'),
      scheduledEnd: at('11:00', '2026-10-23'),
    });
    const items = attentionItems({
      ...base,
      jobs: [
        {
          app: {
            id: 'a1',
            company: 'Both Co',
            nextAction: 'Reply',
            nextActionDate: new Date('2026-10-22T00:00:00Z'),
          },
          reasons: [
            {
              kind: 'INTERVIEW_SOON',
              round: { ...tomorrow, status: 'SCHEDULED', timezone: zone },
            },
            { kind: 'FOLLOW_UP_TODAY' },
          ],
        },
      ],
      notifications: [
        {
          id: 'n-follow',
          type: 'JOB_FOLLOW_UP',
          title: 'Follow up',
          scheduledFor: at('09:00'),
          dedupeKey: 'u:JOB_FOLLOW_UP:a1:2026-10-22',
        },
        {
          id: 'n-int',
          type: 'INTERVIEW',
          title: 'Interview tomorrow',
          scheduledFor: at('09:00'),
          dedupeKey: `u:INTERVIEW:rt:${at('10:00', '2026-10-23').toISOString()}:day`,
        },
      ],
    });
    const follow = items.find((i) => i.id === 'job:a1')!;
    const interview = items.find((i) => i.id === 'interview:rt')!;
    expect(follow.notificationIds).toEqual(['n-follow']);
    expect(interview.notificationIds).toEqual(['n-int']);
  });
  it('never merges a Practice revision with a roadmap item of the same title', () => {
    const items = attentionItems({
      ...base,
      practice: [
        {
          id: 'p',
          title: 'Two Sum',
          confidence: 'RED',
          nextRevisionAt: new Date('2026-10-22T00:00:00Z'),
        },
      ],
      roadmap: [
        {
          id: 'i',
          title: 'Two Sum',
          section: 'Arrays',
          nextRevisionAt: new Date('2026-10-22T00:00:00Z'),
          roadmap: { id: 'rm', title: 'DSA' },
        },
      ],
    });
    expect(items).toHaveLength(2);
  });
  it('shows an ended round once, as the result row, and pages by twenty', () => {
    const r = round({
      id: 'rr',
      scheduledStart: at('09:00'),
      scheduledEnd: at('10:00'),
      openPrep: 1,
    });
    const items = attentionItems({
      ...base,
      interviews: [r],
      jobs: [
        {
          app: {
            id: 'a1',
            company: 'Example Labs',
            nextAction: null,
            nextActionDate: null,
          },
          reasons: [
            {
              kind: 'RESULT_NEEDED',
              round: { ...r, status: 'SCHEDULED', timezone: zone },
            },
          ],
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(['result:rr']);
    const many = Array.from({ length: 45 }, (_, i) => i);
    expect(attentionPage(many, 1)).toMatchObject({ page: 1, pages: 3 });
    expect(attentionPage(many, 3).items).toEqual([40, 41, 42, 43, 44]);
    expect(attentionPage(many, 9).page).toBe(3);
    expect(attentionPage([], 1)).toEqual({ page: 1, pages: 1, items: [] });
  });
});
