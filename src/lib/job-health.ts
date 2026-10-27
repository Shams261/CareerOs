/**
 * Scheduled-job freshness (WI-051): a job is stale once it has not succeeded for three of its
 * intervals (docs/engineering/operations.md). Reminders must always run; the others count only
 * once they have run at least once (calendar sync without a connection, AI without a key).
 */
export const JOB_LIMITS_MINUTES: Record<string, number> = {
  // Every minute.
  notifications: 15,
  // Every 5–15 minutes.
  'calendar-sync': 60,
  // Once a day, from the reminders request.
  'ai-provider-check': 3 * 24 * 60,
};
const REQUIRED = ['notifications'];

export function staleJobs(
  runs: { name: string; lastSucceededAt: Date | null }[],
  now: Date,
) {
  return Object.entries(JOB_LIMITS_MINUTES)
    .filter(([name, limit]) => {
      const run = runs.find((r) => r.name === name);
      if (!run) return REQUIRED.includes(name);
      return (
        !run.lastSucceededAt || +now - +run.lastSucceededAt > limit * 60000
      );
    })
    .map(([name]) => name);
}
