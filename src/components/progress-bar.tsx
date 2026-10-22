/**
 * A thin segmented bar: done, in progress, the rest. Counts only; the label carries the
 * numbers and no percentage is ever shown (brand rule: no scores).
 */
export function ProgressBar({
  done,
  inProgress = 0,
  total,
  label,
}: {
  done: number;
  inProgress?: number;
  total: number;
  label?: string;
}) {
  if (!total) return null;
  const pct = (n: number) => `${(100 * n) / total}%`;
  const text =
    label ??
    `${done} of ${total} done${inProgress ? `, ${inProgress} in progress` : ''}`;
  return (
    <span className="progress-bar" role="img" aria-label={text} title={text}>
      <span className="progress-done" style={{ width: pct(done) }} />
      <span className="progress-active" style={{ width: pct(inProgress) }} />
    </span>
  );
}
