import { dayKey, shortDate } from '@/lib/time';
import { Disclosure } from '@/components/disclosure';

import { NoteForm } from '@/features/jobs/forms';
import { activityLine } from '@/features/jobs/domain';
import type { ApplicationView } from '../page-data';

/** The application's history and Add a note. */
export function Timeline({ v }: { v: ApplicationView }) {
  const { app, zone, hasCreated } = v;
  return (
    <section className="card flat" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading">Timeline</h2>
      <ol className="plain-list">
        {app.activities.map((a) => (
          <li className="dsa-item" key={a.id}>
            <strong>{shortDate(dayKey(a.occurredAt, zone))}</strong> —{' '}
            {activityLine(a, zone)}
            {a.note &&
              !['INTERVIEW_RESULT', 'INTERVIEW_SCHEDULED'].includes(a.type) && (
                <p className="muted learning-notes">{a.note}</p>
              )}
          </li>
        ))}
      </ol>
      {!hasCreated && (
        <p className="status-line">
          <span>Earlier events were not recorded.</span>
        </p>
      )}
      <Disclosure
        variant="link"
        label="Add a note"
        className="mt-3"
        draft={`job-note:${app.id}`}
      >
        <NoteForm id={app.id} />
      </Disclosure>
    </section>
  );
}
