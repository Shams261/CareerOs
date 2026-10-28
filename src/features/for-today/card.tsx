import Link from 'next/link';
import type { TodayPick } from './domain';

/**
 * "For today" (WI-059): the three picks with their reasons, above the full lists. The first
 * pick's Open is the page's one primary unless the page already has one (`lead={false}`).
 */
export function ForTodayCard({
  picks,
  lead = true,
}: {
  picks: TodayPick[];
  lead?: boolean;
}) {
  if (!picks.length) return null;
  return (
    <section
      className="card flat for-today"
      aria-labelledby="for-today-heading"
    >
      <div className="section-head">
        <h2 id="for-today-heading">
          For today <span className="muted">· {picks.length}</span>
        </h2>
      </div>
      <ol className="plain-list for-today-list">
        {picks.map((p, i) => (
          <li key={p.key} className="for-today-row">
            <span className="for-today-main">
              <span className="for-today-title">{p.title}</span>
              <span className="for-today-reason">{p.reason}</span>
            </span>
            <Link
              className={
                lead && i === 0 ? 'button small' : 'button secondary small'
              }
              href={p.href}
              prefetch={false}
              aria-label={`Open: ${p.title}`}
            >
              Open
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
