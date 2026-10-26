import { describe, expect, it } from 'vitest';
import {
  noteCommand,
  openKeyLabel,
  PLACES,
  rankCommands,
  score,
  searchTerms,
  stageWords,
  words,
  type Command,
} from '../src/features/command/domain';

const item = (title: string, extra: Partial<Command> = {}): Command => ({
  id: `item:${title}`,
  group: 'Roadmap',
  verb: 'Open',
  title,
  ...extra,
});
const grill = (title: string): Command => ({
  ...item(title),
  id: `grill:${title}`,
  verb: 'Grill me',
  explicit: true,
});

describe('command words', () => {
  it('splits on anything but letters and digits, without case or accents', () => {
    expect(words('Café · Two-Sum (LC 1)')).toEqual([
      'cafe',
      'two',
      'sum',
      'lc',
      '1',
    ]);
    expect(searchTerms('a grill  idem grill x rate limit')).toEqual([
      'grill',
      'idem',
      'rate',
      'limit',
    ]);
  });
});

describe('command ranking', () => {
  it('needs every typed word, at a word start or (three letters on) inside a word', () => {
    const c = item('Idempotency keys', { meta: 'Backend · Week 1' });
    expect(score(c, 'idem key')).not.toBeNull();
    expect(score(c, 'backend')).not.toBeNull();
    expect(score(c, 'potency')).not.toBeNull();
    expect(score(c, 'po')).toBeNull();
    expect(score(c, 'idem cache')).toBeNull();
  });
  it('lists Grill me only when a typed word names it, and then first', () => {
    const list = [item('Idempotency keys'), grill('Idempotency keys')];
    expect(rankCommands(list, 'idem').map((c) => c.id)).toEqual([
      'item:Idempotency keys',
    ]);
    expect(rankCommands(list, 'grill idem').map((c) => c.id)).toEqual([
      'grill:Idempotency keys',
    ]);
    expect(rankCommands(list, '').map((c) => c.id)).toEqual([
      'item:Idempotency keys',
    ]);
  });
  it('orders groups, ranks a title start first, caps five a group and drops repeats', () => {
    const list: Command[] = [
      ...PLACES,
      { id: 'focus:1', group: 'Today', verb: 'Start focus', title: 'Graphs' },
      item('Breadth-first graphs'),
      item('Graphs: BFS'),
      ...['a', 'b', 'c', 'd', 'e'].map((x) => item(`Graph ${x}`)),
      item('Graphs: BFS'),
    ];
    const ranked = rankCommands(list, 'graph');
    expect(ranked.map((c) => c.group)).toEqual([
      'Today',
      ...Array(5).fill('Roadmap'),
    ]);
    expect(ranked[1].title).toBe('Graphs: BFS');
    expect(new Set(ranked.map((c) => c.id)).size).toBe(ranked.length);
    expect(rankCommands(PLACES, 'look').map((c) => c.href)).toEqual([
      '/review/look-back',
    ]);
  });
});

describe('command helpers', () => {
  it('offers the typed words as a note, within the note limit', () => {
    expect(noteCommand('  Ask   about on-call ')).toMatchObject({
      verb: 'Add a note',
      title: '“Ask about on-call”',
      note: 'Ask about on-call',
    });
    expect(noteCommand('   ')).toBeNull();
    expect(noteCommand('x'.repeat(501))).toBeNull();
  });
  it('names stages and the open key for the device', () => {
    expect(stageWords('RECRUITER_SCREEN')).toBe('Recruiter screen');
    expect(openKeyLabel('MacIntel')).toBe('⌘K');
    expect(openKeyLabel('iPhone')).toBe('⌘K');
    expect(openKeyLabel('Win32')).toBe('Ctrl K');
  });
});
