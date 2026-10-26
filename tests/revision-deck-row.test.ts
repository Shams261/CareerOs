import { describe, expect, it } from 'vitest';
import { revisionDeckRow } from '../src/features/attention/domain';

describe('the revision deck row (WI-032)', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  it('appears only when due items hold kept cards', () => {
    expect(
      revisionDeckRow([{ nextRevisionAt: d('2026-10-26'), cards: 0 }]),
    ).toBeNull();
    expect(revisionDeckRow([{ nextRevisionAt: d('2026-10-26') }])).toBeNull();
    const row = revisionDeckRow([
      { nextRevisionAt: d('2026-10-26'), cards: 4 },
      { nextRevisionAt: d('2026-10-24'), cards: 2 },
      { nextRevisionAt: d('2026-10-25'), cards: 0 },
    ])!;
    expect(row).toMatchObject({
      title: 'Revision deck',
      context: '6 cards from 2 items due',
      href: '/roadmap/deck',
      tier: 3,
    });
    expect(row.due).toBeLessThan(+d('2026-10-24'));
    expect(
      revisionDeckRow([{ nextRevisionAt: d('2026-10-26'), cards: 1 }])!.context,
    ).toBe('1 card from 1 item due');
  });
});
