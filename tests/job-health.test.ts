import { describe, expect, it } from 'vitest';
import { JOB_LIMITS_MINUTES, staleJobs } from '../src/lib/job-health';

const now = new Date('2026-10-28T14:00:00Z');
const ago = (minutes: number) => new Date(+now - minutes * 60000);

describe('scheduled job freshness (WI-051)', () => {
  it('needs the reminders job, and the others once they have run', () => {
    expect(staleJobs([], now)).toEqual(['notifications']);
    expect(
      staleJobs([{ name: 'notifications', lastSucceededAt: ago(2) }], now),
    ).toEqual([]);
  });

  it('marks a job stale after three of its intervals without a success', () => {
    const runs = [
      { name: 'notifications', lastSucceededAt: ago(16) },
      { name: 'calendar-sync', lastSucceededAt: ago(59) },
      { name: 'ai-provider-check', lastSucceededAt: ago(4 * 24 * 60) },
      { name: 'test-job', lastSucceededAt: null },
    ];
    expect(staleJobs(runs, now)).toEqual([
      'notifications',
      'ai-provider-check',
    ]);
    // A job that started but never succeeded is stale; unknown jobs are not watched.
    expect(
      staleJobs(
        [
          { name: 'notifications', lastSucceededAt: ago(1) },
          { name: 'calendar-sync', lastSucceededAt: null },
        ],
        now,
      ),
    ).toEqual(['calendar-sync']);
    expect(Object.keys(JOB_LIMITS_MINUTES)).toEqual([
      'notifications',
      'calendar-sync',
      'ai-provider-check',
    ]);
  });
});
