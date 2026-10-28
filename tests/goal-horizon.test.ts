import { describe, expect, it } from 'vitest';
import { horizonLabel, quickTargets } from '../src/features/goals/horizon';

describe('goals for any horizon (WI-064)', () => {
  it('offers two days out, this Sunday and the month’s last day', () => {
    // Wednesday 28 October 2026.
    expect(quickTargets('2026-10-28')).toEqual({
      twoDays: '2026-10-30',
      week: '2026-11-01',
      month: '2026-10-31',
    });
    // On a Sunday the week ends today; in December the month ends on the 31st.
    expect(quickTargets('2026-11-01').week).toBe('2026-11-01');
    expect(quickTargets('2026-12-14').month).toBe('2026-12-31');
    expect(quickTargets('2027-02-10').month).toBe('2027-02-28');
  });

  it('names the horizon for Today’s goal line', () => {
    const today = '2026-10-28';
    expect(horizonLabel('2026-10-28', today)).toBe('Today');
    expect(horizonLabel('2026-10-30', today)).toBe('Next 2 days');
    expect(horizonLabel('2026-11-01', today)).toBe('This week');
    expect(horizonLabel('2026-10-31', today)).toBe('This week');
    // Past this Sunday but inside the month, then beyond it.
    expect(horizonLabel('2026-11-20', '2026-11-02')).toBe('This month');
    expect(horizonLabel('2026-11-20', today)).toBeNull();
    expect(horizonLabel('2026-10-20', today)).toBeNull();
    expect(horizonLabel(null, today)).toBeNull();
  });
});
