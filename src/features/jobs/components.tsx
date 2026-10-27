import Link from 'next/link';
import { Briefcase, ChevronRight } from 'lucide-react';
import { applicationMove, label, type AppLike } from './domain';

export type RowApp = AppLike & {
  company: string;
  role: string;
  lastActivityAt: Date;
};

/**
 * One application as Today's row recipe (WI-022): the briefcase tile, the company as the
 * label, the next move as the title, the role and the due context underneath, a chevron.
 * The whole row is the link. The stage pill shows only when rows are not grouped by stage.
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
  return (
    <li
      className={`attention-row${move.urgent ? ' is-urgent' : ''}`}
      data-source="job"
    >
      <Link
        className="attention-link"
        href={`/jobs/${app.id}`}
        prefetch={false}
      >
        <span className="attention-icon" aria-hidden="true">
          <Briefcase size={22} />
        </span>
        <span className="attention-main">
          <span className="attention-label">{app.company}</span>
          <span className="attention-title">{move.title}</span>
          <span className="attention-context">{move.context}</span>
        </span>
        {showStage && (
          <span className="pill application-stage">{label(app.stage)}</span>
        )}
        <ChevronRight
          size={18}
          aria-hidden="true"
          className="attention-chevron"
        />
      </Link>
    </li>
  );
}
