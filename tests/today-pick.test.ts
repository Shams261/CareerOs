import { describe, expect, it } from 'vitest';
import { freePick } from '../src/features/today/domain';

describe('The free launcher never offers a block already done today (WI-069)', () => {
  const picks = [
    { title: 'Internet & network foundations', kind: 'study' },
    { title: 'Revise Two Sum', kind: 'revise' },
  ];
  it('skips a pick whose title is a completed block, whatever its case', () => {
    expect(
      freePick(picks, [
        { title: 'internet & network foundations ', status: 'COMPLETED' },
      ])?.title,
    ).toBe('Revise Two Sum');
  });
  it('keeps the first pick while its block is only planned or skipped', () => {
    expect(
      freePick(picks, [
        { title: 'Internet & network foundations', status: 'PLANNED' },
        { title: 'Revise Two Sum', status: 'SKIPPED' },
      ])?.title,
    ).toBe('Internet & network foundations');
    expect(freePick([], [])).toBeNull();
  });
});
