import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { shortDate } from '@/lib/time';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PanelButton } from '@/components/side-panel';
import { calendarDate, label, type Stage } from '@/features/jobs/domain';
import { ZoneOptions } from '@/features/jobs/forms';
import { StageRow } from '@/features/jobs/stage-row';
import { MoreMenu } from '@/components/more-menu';
import { randomUUID } from 'node:crypto';
import type { ApplicationView } from '../page-data';

/** The back link, the company and role with the posting and ⋯, the stage as a pipeline and the facts line (WI-096). */
export function ApplicationHead({ v }: { v: ApplicationView }) {
  const { app, open } = v;
  return (
    <>
      <ZoneOptions />
      <Link className="link" href="/jobs" prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> Jobs
      </Link>
      <div className="page-head is-problem is-application">
        <div>
          <p className="company-line">
            {app.company}
            {app.location ? ` · ${app.location}` : ''}
            {app.workArrangement !== 'UNKNOWN'
              ? ` · ${label(app.workArrangement)}`
              : ''}
          </p>
          <h1>{app.role}</h1>
        </div>
        {/* The posting as the head's secondary and the less-used actions in one ⋯ (WI-096). */}
        <div className="page-head-actions">
          {app.jobUrl && (
            <a
              className="button secondary"
              href={app.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" /> Job posting
            </a>
          )}
          <MoreMenu label={`More for ${app.company}`}>
            <PanelButton panel="details" className="more-menu-item">
              Edit application
            </PanelButton>
            <PanelButton
              panel="details"
              focus="delete"
              className="more-menu-item danger"
            >
              Delete application
            </PanelButton>
          </MoreMenu>
        </div>
      </div>
      {/* The stage as the pipeline (WI-096), keyed by the stage so a result that moves the
          application remounts it with the new value. */}
      <StageRow
        key={app.stage}
        id={app.id}
        stage={app.stage as Stage}
        requestId={randomUUID()}
      />
      <FeedbackOutlet channel="stage" className="mt-2" />
      <p className="status-line practice-facts mb-5">
        <span>
          Applied{' '}
          {app.appliedAt ? shortDate(calendarDate(app.appliedAt)) : 'not yet'}
          {app.source ? ` via ${app.source}` : ''}
        </span>
        {app.recruiterName && <span>Recruiter: {app.recruiterName}</span>}
        {!open && <span>Closed · {label(app.stage)}</span>}
      </p>
    </>
  );
}
