import { describe, expect, it } from 'vitest';
import {
  blockArgs,
  collectIds,
  findArgs,
  noteArgs,
  readActions,
  restArgs,
  spanMinutes,
  undoMatches,
  unseenId,
  withoutIds,
  WRITE_FREE_ROUNDS,
  WRITE_ID_ARGS,
  WRITES_PER_ANSWER,
  WRITES_PER_DAY,
  writeRefusal,
  type WriteAction,
} from '../src/features/agent/write-domain';
import { WRITE_TOOLS } from '../src/features/agent/text';
import { readMetadata } from '../src/features/agent/plan-domain';
import {
  MAX_ROUNDS,
  TOOL_ARGS,
  TOOLS,
  readToolCall,
} from '../src/features/agent/domain';
import { READ_WORDS } from '../src/features/agent/text';
import { readText } from '../src/features/agent/line-domain';

const call = (name: string, args: unknown) => ({
  id: 'c1',
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
});

describe('the write tools (WI-102)', () => {
  it('are offered to the model with strict arguments', () => {
    const names = TOOLS.map((t) => t.function.name);
    for (const w of [...WRITE_TOOLS, 'find_problems'])
      expect(names).toContain(w);
    expect(TOOL_ARGS.add_note).toBe(noteArgs);
    expect(TOOL_ARGS.add_block).toBe(blockArgs);
    expect(TOOL_ARGS.rest_today).toBe(restArgs);
    expect(TOOL_ARGS.find_problems).toBe(findArgs);
    expect(READ_WORDS.find_problems).toBe('practice');
    expect(READ_WORDS.add_note).toBeUndefined();
  });
  it('refuses malformed arguments before anything runs', () => {
    expect(readToolCall(call('add_note', { body: '  ' })).ok).toBe(false);
    expect(readToolCall(call('add_note', { body: 'x'.repeat(501) })).ok).toBe(
      false,
    );
    expect(
      readToolCall(call('add_note', { body: 'Call Priya', userId: 'u2' })).ok,
    ).toBe(false);
    expect(
      readToolCall(
        call('add_block', {
          day: '2026-11-04',
          title: 'Graphs',
          kind: 'DSA',
          start: '25:00',
          end: '19:00',
        }),
      ).ok,
    ).toBe(false);
    expect(readToolCall(call('rest_today', { day: '2026-11-04' })).ok).toBe(
      false,
    );
    expect(
      readToolCall(
        call('add_block', {
          day: '2026-11-04',
          title: 'Graphs',
          kind: 'DSA',
          start: '18:00',
          end: '19:00',
        }),
      ),
    ).toMatchObject({ ok: true, name: 'add_block' });
    expect(spanMinutes('18:00', '21:01')).toBe(181);
  });
});

describe('ids a read returned', () => {
  const read = {
    blocks: [
      { id: 'b1', time: '18:00–19:00', title: 'Graphs' },
      { time: '07:00–08:00', busy: true },
    ],
    applications: [
      {
        applicationId: 'a1',
        upcomingRounds: [{ roundId: 'r1', title: 'Coding' }],
      },
    ],
    lastAttempts: [{ problemId: 'p1', problem: 'Two Sum' }],
    nested: { deep: [{ id: 'x'.repeat(61) }] },
  };
  it('collects ids under their known keys, anywhere in a read', () => {
    expect([...collectIds(read)].sort()).toEqual(['a1', 'b1', 'p1', 'r1']);
  });
  it('drops them for Rumi’s line, so their digits never count as numbers', () => {
    const plain = withoutIds(read) as typeof read;
    expect(plain.blocks[0]).toEqual({ time: '18:00–19:00', title: 'Graphs' });
    expect(JSON.stringify(plain)).not.toMatch(
      /"(id|applicationId|roundId|problemId)"/,
    );
    expect(readText({ blocks: [{ id: 'cm9x28', time: '18:00' }] })).toBe(
      '{"blocks":[{"time":"18:00"}]}',
    );
  });
  it('refuses a write that names a record it never read', () => {
    // Class A writes name no record; the rule is ready for the cards of WI-103.
    for (const t of WRITE_TOOLS) expect(WRITE_ID_ARGS[t]).toEqual([]);
    const seen = new Set(['b1']);
    const withId = { ...WRITE_ID_ARGS, add_block: ['blockId'] };
    const old = WRITE_ID_ARGS.add_block;
    Object.assign(WRITE_ID_ARGS, withId);
    try {
      expect(unseenId('add_block', { blockId: 'b1' }, seen)).toBeNull();
      expect(unseenId('add_block', { blockId: 'b2' }, seen)).toBe('blockId');
      expect(unseenId('add_block', {}, seen)).toBe('blockId');
    } finally {
      WRITE_ID_ARGS.add_block = old;
    }
  });
});

describe('limits', () => {
  const ok = { round: 1, maxRounds: MAX_ROUNDS, inAnswer: 0, today: 0 };
  it('allows a write in the early rounds under both caps', () => {
    expect(writeRefusal(ok)).toBeNull();
    expect(
      writeRefusal({ ...ok, round: MAX_ROUNDS - WRITE_FREE_ROUNDS }),
    ).toBeNull();
  });
  it('keeps the last rounds, the answer’s cap and the day’s cap', () => {
    expect(
      writeRefusal({ ...ok, round: MAX_ROUNDS - WRITE_FREE_ROUNDS + 1 }),
    ).toMatch(/No more changes/);
    expect(writeRefusal({ ...ok, inAnswer: WRITES_PER_ANSWER })).toMatch(
      /At most 2 changes/,
    );
    expect(writeRefusal({ ...ok, today: WRITES_PER_DAY })).toMatch(
      /20 changes today/,
    );
  });
});

describe('actions stored on an answer', () => {
  const note: WriteAction = {
    id: 'w1',
    tool: 'add_note',
    label: 'Note added',
    detail: 'Call Priya on Friday',
    undo: { kind: 'remove-note', payload: { id: 'n1' } },
    status: 'done',
  };
  it('reads back valid actions with the undo their own tool leaves', () => {
    expect(readMetadata({ actions: [note] }).actions).toEqual([note]);
    expect(undoMatches(note)).toBe(true);
  });
  it('drops a tampered or malformed action instead of running it', () => {
    const swapped = {
      ...note,
      undo: { kind: 'cancel-block', payload: { id: 'b9' } },
    };
    const unknown = { ...note, undo: { kind: 'restore-session', payload: {} } };
    const extra = { ...note, payload: { userId: 'u2' } };
    expect(
      readActions({ actions: [swapped, unknown, extra, 'x', null] }),
    ).toEqual([]);
    expect(readMetadata({ actions: 'nope' }).actions).toEqual([]);
  });
});
