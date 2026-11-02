import { ConfirmDelete } from '@/components/confirm-delete';
import { deleteApplicationAction } from '@/features/deletes/actions';
import { ResourceLink } from '@/components/resource-link';
import { Disclosure } from '@/components/disclosure';
import { PanelButton, SidePanel } from '@/components/side-panel';

import { DetailsForm } from '@/features/jobs/forms';
import { AGENT_NAME } from '@/features/agent/constants';
import { PrepTools } from './prep-tools';
import type { ApplicationView } from '../page-data';

/** Prepare with Rumi when no round holds it, Details and the edit panel. */
export function ApplicationRail({ v }: { v: ApplicationView }) {
  const { app, showPrep, prepRound, details } = v;
  return (
    <>
      {showPrep && !prepRound && (
        <section className="card rail-card" aria-labelledby="prep-heading">
          <div className="attention-head">
            <h2 id="prep-heading">Prepare with {AGENT_NAME}</h2>
          </div>
          <PrepTools v={v} />
        </section>
      )}
      {/* One Details card (WI-096): only the lines that exist, Edit opens the panel. */}
      <section className="card rail-card" aria-labelledby="details-heading">
        <div className="attention-head">
          <h2 id="details-heading">Details</h2>
          <PanelButton panel="details" className="link-button">
            {details.length ? 'Edit' : 'Add details'}
          </PanelButton>
        </div>
        {details.length > 0 && (
          <dl className="details-list">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt className="muted">{k}</dt>
                <dd className="learning-notes">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {app.jobDescription && (
          <Disclosure variant="link" label="Job description" className="mt-3">
            <p className="learning-notes">{app.jobDescription}</p>
          </Disclosure>
        )}
        {app.resources.map((r) => (
          <p key={r.id} className="mt-2">
            <ResourceLink url={r.url}>{r.title}</ResourceLink>
          </p>
        ))}
      </section>
      <SidePanel id="details" title="Edit application">
        <DetailsForm app={app} />
        <div className="panel-danger">
          <h3 data-panel-focus="delete" tabIndex={-1}>
            Delete
          </h3>
          <ConfirmDelete
            action={deleteApplicationAction}
            id={app.id}
            label="Delete application"
            question={`Delete ${app.company}${app.rounds.length ? `, its ${app.rounds.length} interview${app.rounds.length === 1 ? '' : 's'}` : ''} and its history? This cannot be undone.`}
          />
        </div>
      </SidePanel>
    </>
  );
}
