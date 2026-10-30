import { describe, expect, it } from 'vitest';
import {
  adjacent,
  initialItem,
  kindBadge,
  linkTitle,
  openSections,
  primaryAction,
  problemFacts,
  scopeLines,
  statusBadge,
  statusOp,
  type PaneRow,
} from '@/features/roadmap/pane-domain';
import { nextStatus } from '@/features/roadmap/domain';

const row = (
  id: string,
  section: string,
  status: PaneRow['status'] = 'NOT_STARTED',
  shown = true,
): PaneRow => ({ id, section, status, shown });
const rows = [
  row('a', 'Week 1', 'DONE'),
  row('b', 'Week 1', 'IN_PROGRESS'),
  row('c', 'Week 1'),
  row('d', 'Week 2', 'NOT_STARTED', false),
  row('e', 'Week 2'),
];

describe('initialItem (WI-084)', () => {
  it('prefers the hash, then the section asked for, then Continue, then the first shown row', () => {
    expect(initialItem(rows, { hash: 'e', section: 'Week 1', next: 'b' })).toBe(
      'e',
    );
    expect(
      initialItem(rows, { hash: 'zz', section: 'Week 2', next: 'b' }),
    ).toBe('e');
    expect(
      initialItem(rows, { hash: null, section: 'Week 1', next: 'e' }),
    ).toBe('b');
    expect(initialItem(rows, { hash: null, section: 'Nope', next: 'c' })).toBe(
      'c',
    );
    expect(initialItem(rows, { hash: null, section: null, next: null })).toBe(
      'a',
    );
    expect(initialItem([], { hash: null, section: null, next: null })).toBe(
      null,
    );
  });
  it('opens a finished section on its first item', () => {
    expect(
      initialItem([row('x', 'S', 'DONE'), row('y', 'S', 'DONE')], {
        hash: null,
        section: 'S',
        next: null,
      }),
    ).toBe('x');
  });
});

describe('adjacent', () => {
  it('walks the shown rows and skips hidden ones', () => {
    expect(adjacent(rows, 'c')).toEqual({ prev: rows[1], next: rows[4] });
    expect(adjacent(rows, 'a').prev).toBeNull();
    expect(adjacent(rows, 'e').next).toBeNull();
  });
  it('keeps a hidden open row in the walk', () => {
    expect(adjacent(rows, 'd')).toEqual({ prev: rows[2], next: rows[4] });
    expect(adjacent(rows, null)).toEqual({ prev: null, next: null });
  });
});

describe('openSections', () => {
  it('opens the open item’s section and the one asked for', () => {
    expect(openSections(rows, { openId: 'e', section: null, q: '' })).toEqual([
      'Week 2',
    ]);
    expect(
      openSections(rows, { openId: 'b', section: 'Week 2', q: '' }),
    ).toEqual(['Week 1', 'Week 2']);
  });
  it('opens every section with a match while searching', () => {
    expect(
      openSections(
        [row('a', 'S1', 'DONE', false), row('b', 'S2'), row('c', 'S3')],
        { openId: null, section: null, q: 'x' },
      ),
    ).toEqual(['S2', 'S3']);
  });
});

describe('statusOp', () => {
  it('sends the op that reaches the chosen status, none for the current one', () => {
    expect(statusOp('IN_PROGRESS', 'NOT_STARTED')).toBe('start');
    expect(statusOp('IN_PROGRESS', 'DONE')).toBe('reopen');
    expect(statusOp('DONE', 'IN_PROGRESS')).toBe('done');
    expect(statusOp('NOT_STARTED', 'IN_PROGRESS')).toBe('unstart');
    expect(statusOp('NOT_STARTED', 'DONE')).toBe('unstart');
    expect(statusOp('DONE', 'DONE')).toBeNull();
  });
  it('lands where it says through nextStatus', () => {
    for (const from of ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const)
      for (const to of ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const) {
        const op = statusOp(to, from);
        expect(op ? nextStatus(op, from) : from).toBe(to);
      }
  });
});

describe('the task card (WI-085)', () => {
  it('splits scope into lines by newline, middle dot or a long comma list', () => {
    expect(scopeLines('A, B\nC · D')).toEqual(['A, B', 'C', 'D']);
    expect(
      scopeLines(
        'Methods, status codes, headers, content negotiation, conditional requests, ETag',
      ),
    ).toEqual([
      'Methods',
      'status codes',
      'headers',
      'content negotiation',
      'conditional requests',
      'ETag',
    ]);
    expect(
      scopeLines('Signal: Counting, de-duplication, O(1) lookup.'),
    ).toEqual(['Signal: Counting, de-duplication, O(1) lookup.']);
    expect(scopeLines('')).toEqual([]);
  });
  it('reads a problem’s facts from its scope', () => {
    expect(
      problemFacts(
        'Easy · pattern: Arrays & Hashing\nLists: NeetCode 150, Blind 75\nAsked at (Prashad): Google, Amazon',
      ),
    ).toEqual({
      difficulty: 'Easy',
      pattern: 'Arrays & Hashing',
      lists: ['NeetCode 150', 'Blind 75'],
      companies: ['Google', 'Amazon'],
    });
    expect(problemFacts(null)).toEqual({
      difficulty: null,
      pattern: null,
      lists: [],
      companies: [],
    });
  });
  it('badges a reference by its kind and names a problem link', () => {
    expect(kindBadge('Video channel: find matching lecture')).toBe('VIDEO');
    expect(kindBadge('Official documentation')).toBe('DOCS');
    expect(kindBadge('Protocol standard')).toBe('SPEC');
    expect(kindBadge('Security guidance')).toBe('DOCS');
    expect(kindBadge(undefined)).toBe('LINK');
    expect(linkTitle('https://leetcode.com/problems/two-sum/')).toBe(
      'Open on LeetCode',
    );
    expect(linkTitle('https://example.org/x')).toBe('Open link');
    expect(linkTitle('not a url')).toBe('Open link');
  });
  it('shows the status and picks one primary action', () => {
    const base = {
      revision: 'none' as const,
      revisionText: null,
      doneLabel: null,
      revisionLabel: null,
    };
    expect(statusBadge({ ...base, status: 'NOT_STARTED' })).toEqual({
      text: 'Not started',
      tone: 'quiet',
    });
    expect(statusBadge({ ...base, status: 'IN_PROGRESS' })).toEqual({
      text: 'Started',
      tone: 'on',
    });
    expect(
      statusBadge({
        ...base,
        status: 'DONE',
        doneLabel: 'Oct 28',
        revisionLabel: 'Nov 4',
        revision: 'upcoming',
      }),
    ).toEqual({ text: 'Done Oct 28 · revise Nov 4', tone: 'on' });
    expect(
      statusBadge({
        ...base,
        status: 'DONE',
        revision: 'overdue',
        revisionText: 'Revision overdue by 3 days',
      }),
    ).toEqual({ text: 'Revision overdue by 3 days', tone: 'due' });
    expect(
      primaryAction({
        status: 'NOT_STARTED',
        revision: 'none',
        practice: false,
      }),
    ).toBe('done');
    expect(
      primaryAction({ status: 'DONE', revision: 'due', practice: false }),
    ).toBe('revised');
    expect(
      primaryAction({ status: 'DONE', revision: 'upcoming', practice: false }),
    ).toBe('is-done');
    expect(
      primaryAction({
        status: 'NOT_STARTED',
        revision: 'none',
        practice: true,
      }),
    ).toBe('attempt');
  });
});
