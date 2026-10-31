import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { applicationMove, label, nextRound, type AppLike } from './domain';
import { dayKey, hhmm, weekdayDate } from '@/lib/time';

export type RowApp = AppLike & {
  company: string;
  role: string;
  lastActivityAt: Date;
};

/**
 * One application as two lines (WI-096): the company and the role, then the next move in
 * Today's words with its due context; the next interview's day at the right. The whole
 * row is the link. The stage shows only when rows are not grouped by stage.
 */
export function ApplicationRow({
  app,
  now,
  zone,
  showStage = false,
}: {
  app: RowApp;
  now: Date;
  zone: string;
  showStage?: boolean;
}) {
  const move = applicationMove(app, now, zone);
  const round = nextRound(app.rounds, now);
  const today = dayKey(now, zone);
  const when = round
    ? `${round.title} · ${dayKey(round.scheduledStart, zone) === today ? 'Today' : weekdayDate(dayKey(round.scheduledStart, zone))} ${hhmm(round.scheduledStart, zone)}`
    : null;
  const detail = move.detail;
  return (
    <li
      className={`job-row${move.urgent ? ' is-urgent' : ''}`}
      data-source="job"
    >
      <Link className="job-row-link" href={`/jobs/${app.id}`} prefetch={false}>
        <span className="job-row-main">
          <span className="job-row-name">
            <b>{app.company}</b>
            <span className="muted"> · {app.role}</span>
          </span>
          <span className="job-row-move">
            <span className="job-row-title">{move.title}</span>
            {detail && <span className="muted"> · {detail}</span>}
          </span>
        </span>
        <span className="job-row-side muted">
          {showStage ? label(app.stage) : when}
        </span>
        <ChevronRight
          size={18}
          aria-hidden="true"
          className="job-row-chevron"
        />
      </Link>
    </li>
  );
}
