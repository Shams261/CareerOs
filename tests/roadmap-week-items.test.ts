import { describe, expect, it } from 'vitest';
import {
  adjacent,
  afterDone,
  afterRemoval,
  initialItem,
  kindBadge,
  linkTitle,
  neighbourSections,
  nextSectionWithMatch,
  primaryAction,
  problemFacts,
  scopeLines,
  statusBadge,
  weekSection,
  type PaneRow,
} from '@/features/roadmap/week-items-domain';

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

describe('initialItem (WI-084, kept by WI-088)', () => {
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
  it('skips a Continue item the filter hides', () => {
    expect(initialItem(rows, { hash: null, section: null, next: 'd' })).toBe(
      'a',
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

describe('afterRemoval', () => {
  it('keeps an item that is still there, else moves to the next shown row, else the previous', () => {
    expect(afterRemoval(rows, rows, 'c')).toBe('c');
    const without = (id: string) => rows.filter((r) => r.id !== id);
    expect(afterRemoval(rows, without('c'), 'c')).toBe('e');
    expect(afterRemoval(rows, without('e'), 'e')).toBe('c');
    expect(afterRemoval(rows, [], 'c')).toBeNull();
    expect(afterRemoval(rows, rows, null)).toBeNull();
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

describe('the roadmap as weeks (WI-088)', () => {
  const sections = ['Week 1', 'Week 2', 'Week 3'];
  it('shows the section asked for, else the first with a match under a filter, else the current, else the first', () => {
    const input = { asked: null, filtered: false, rows, current: 'Week 2' };
    expect(weekSection(sections, { ...input, asked: 'Week 3' })).toBe('Week 3');
    expect(weekSection(sections, { ...input, asked: 'Nope' })).toBe('Week 2');
    expect(weekSection(sections, input)).toBe('Week 2');
    expect(weekSection(sections, { ...input, current: null })).toBe('Week 1');
    expect(weekSection([], { ...input, current: null })).toBeNull();
  });
  it('opens the first week with a shown row while a filter is on, unless a section is named', () => {
    const only2 = rows.map((r) => ({ ...r, shown: r.section === 'Week 2' }));
    expect(
      weekSection(sections, {
        asked: null,
        filtered: true,
        rows: only2,
        current: 'Week 1',
      }),
    ).toBe('Week 2');
    expect(
      weekSection(sections, {
        asked: 'Week 1',
        filtered: true,
        rows: only2,
        current: null,
      }),
    ).toBe('Week 1');
    // Nothing matches anywhere: the current week, so the page can say so.
    expect(
      weekSection(sections, {
        asked: null,
        filtered: true,
        rows: rows.map((r) => ({ ...r, shown: false })),
        current: 'Week 3',
      }),
    ).toBe('Week 3');
  });
  it('finds the next week with a match, wrapping round, for the filtered count (WI-089)', () => {
    const only2 = rows.map((r) => ({ ...r, shown: r.section === 'Week 2' }));
    expect(nextSectionWithMatch(sections, only2, 'Week 1')).toBe('Week 2');
    expect(nextSectionWithMatch(sections, only2, 'Week 3')).toBe('Week 2');
    expect(nextSectionWithMatch(sections, only2, 'Week 2')).toBeNull();
    expect(nextSectionWithMatch(sections, rows, null)).toBe('Week 1');
    expect(
      nextSectionWithMatch(
        sections,
        rows.map((r) => ({ ...r, shown: false })),
        'Week 1',
      ),
    ).toBeNull();
  });
  it('names the weeks before and after', () => {
    expect(neighbourSections(sections, 'Week 2')).toEqual({
      prev: 'Week 1',
      next: 'Week 3',
    });
    expect(neighbourSections(sections, 'Week 1').prev).toBeNull();
    expect(neighbourSections(sections, 'Week 3').next).toBeNull();
    expect(neighbourSections(sections, null)).toEqual({
      prev: null,
      next: null,
    });
  });
  it('moves the open row to the next item left after Mark done, else stays', () => {
    expect(afterDone(rows, 'b')).toBe('c');
    // d is hidden, so c skips to e.
    expect(afterDone(rows, 'c')).toBe('e');
    expect(afterDone(rows, 'e')).toBe('e');
    expect(afterDone(rows, 'zz')).toBe('zz');
    expect(afterDone(rows, null)).toBeNull();
    // Nothing after it but done rows: it stays.
    expect(afterDone([row('x', 'S'), row('y', 'S', 'DONE')], 'x')).toBe('x');
  });
});
