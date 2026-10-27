import { describe, expect, it } from 'vitest';
import {
  FUNNEL_STEPS,
  jobsFunnel,
  reach,
  type FunnelApp,
} from '../src/features/jobs/funnel';
import { weekOf } from '../src/features/review/domain';

const app = (over: Partial<FunnelApp>): FunnelApp => ({
  stage: 'APPLIED',
  appliedOn: '2026-10-27',
  addedOn: '2026-10-27',
  history: [],
  rounds: [],
  ...over,
});

describe('the jobs funnel (WI-056)', () => {
  it('takes the furthest step from stage history, the current stage or a round', () => {
    expect(FUNNEL_STEPS).toEqual([
      'Applied',
      'Screen',
      'Interviews',
      'Final',
      'Offer',
    ]);
    expect(reach(app({ stage: 'SAVED', appliedOn: null }))).toBe(-1);
    // Saved but with an applied date counts as applied.
    expect(reach(app({ stage: 'SAVED' }))).toBe(0);
    expect(reach(app({}))).toBe(0);
    expect(reach(app({ stage: 'RECRUITER_SCREEN' }))).toBe(1);
    // A rejection does not undo the onsite it reached.
    expect(
      reach(app({ stage: 'REJECTED', history: ['TECHNICAL', 'FINAL'] })),
    ).toBe(3);
    // A booked round counts even when the stage was never moved; a cancelled one does not.
    expect(
      reach(app({ rounds: [{ type: 'CODE_REVIEW', status: 'SCHEDULED' }] })),
    ).toBe(2);
    expect(
      reach(app({ rounds: [{ type: 'FINAL', status: 'CANCELLED' }] })),
    ).toBe(0);
    expect(reach(app({ stage: 'OFFER' }))).toBe(4);
  });

  it('counts each week’s applications by how far they got, newest week first', () => {
    const f = jobsFunnel(
      [
        app({ appliedOn: '2026-10-27', stage: 'RECRUITER_SCREEN' }),
        app({ appliedOn: '2026-10-26', history: ['TECHNICAL'] }),
        app({ appliedOn: '2026-10-20', stage: 'OFFER' }),
        app({ appliedOn: null, stage: 'APPLIED', addedOn: '2026-10-21' }),
        app({ appliedOn: null, stage: 'SAVED' }),
        app({ appliedOn: '2026-08-03' }),
      ],
      '2026-10-28',
      weekOf,
      3,
    );
    expect(f.sent).toBe(5);
    expect(f.weeks).toEqual([
      { monday: '2026-10-26', counts: [2, 2, 1, 0, 0] },
      { monday: '2026-10-19', counts: [2, 1, 1, 1, 1] },
      { monday: '2026-10-12', counts: [0, 0, 0, 0, 0] },
    ]);
    // All time includes the August application beyond the three weeks shown.
    expect(f.all).toEqual([5, 3, 2, 1, 1]);
  });
});
