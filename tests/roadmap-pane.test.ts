import { describe, expect, it } from 'vitest';
import {
  adjacent,
  initialItem,
  openSections,
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
