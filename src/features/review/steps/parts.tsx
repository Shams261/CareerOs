import type { ReactNode } from 'react';
import { formatMinutes } from '../domain';

export function Bar({
  label,
  planned,
  actual,
  max,
}: {
  label: string;
  planned: number;
  actual: number;
  max: number;
}) {
  const pct = (n: number) => `${max ? Math.round((n / max) * 100) : 0}%`;
  return (
    <div className="review-bar">
      <div className="row">
        <strong>{label}</strong>
        <span className="muted">
          Planned {formatMinutes(planned)} · Actual {formatMinutes(actual)}
        </span>
      </div>
      <div className="review-bar-track" aria-hidden="true">
        <span className="review-bar-planned" style={{ width: pct(planned) }} />
        <span className="review-bar-actual" style={{ width: pct(actual) }} />
      </div>
    </div>
  );
}
export const Fact = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <dt className="muted">{label}</dt>
    <dd>{value}</dd>
  </div>
);
/** Facts with a zero value say nothing useful in a review; only the non-zero ones render. */
export const Facts = ({ items }: { items: [string, number][] }) => {
  const shown = items.filter(([, v]) => v > 0);
  return shown.length ? (
    <dl className="job-facts">
      {shown.map(([k, v]) => (
        <Fact key={k} label={k} value={v} />
      ))}
    </dl>
  ) : (
    <p className="muted">Nothing recorded.</p>
  );
};
