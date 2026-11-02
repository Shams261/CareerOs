import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { ownerLabel } from '@/features/jobs/domain';
import { FollowUpDoneForm, FollowUpForm } from '@/features/jobs/forms';
import { NextActionBox } from '@/features/jobs/next-action';
import { MoreMenu } from '@/components/more-menu';
import { randomUUID } from 'node:crypto';
import type { ApplicationView } from '../page-data';

/** The next action strip with its panel (WI-096). */
export function NextMove({ v }: { v: ApplicationView }) {
  const { app, follow, open, primary, hasAction, moveContext } = v;
  return (
    <section aria-label="Next action" className="next-move-section">
      <div
        className={`next-move${['overdue', 'today'].includes(follow.state) ? ' is-urgent' : ''}`}
      >
        <div className="next-move-main">
          <span className="attention-label">Next action</span>
          <strong>
            {hasAction
              ? (app.nextAction ?? 'Follow up')
              : open
                ? 'Nothing set yet'
                : 'Closed application'}
          </strong>
          {hasAction && <small>{moveContext}</small>}
          {!hasAction && open && <small>{ownerLabel(app.actionOwner)}</small>}
        </div>
        {open && (
          <div className="next-move-actions">
            {hasAction && (
              <NextActionBox
                id={app.id}
                requestId={randomUUID()}
                title={app.nextAction ?? 'Follow up'}
                primary={primary === 'mark-done'}
              />
            )}
            {hasAction ? (
              <MoreMenu label="More for the next action">
                <PanelButton
                  panel="next-action"
                  focus="done"
                  className="more-menu-item"
                >
                  Done with a note
                </PanelButton>
                <PanelButton
                  panel="next-action"
                  focus="edit"
                  className="more-menu-item"
                >
                  Edit next action
                </PanelButton>
              </MoreMenu>
            ) : (
              <PanelButton
                panel="next-action"
                focus="edit"
                className={
                  primary === 'set-next-action' ? 'button' : 'link-button'
                }
              >
                Set next action
              </PanelButton>
            )}
          </div>
        )}
      </div>
      <FeedbackOutlet channel="next-action" className="mt-3" />
      <SidePanel id="next-action" title="Next action">
        {hasAction && (
          <div className="panel-section">
            <h3 data-panel-focus="done" tabIndex={-1}>
              Done with a note
            </h3>
            <FollowUpDoneForm app={app} />
          </div>
        )}
        <div className="panel-section">
          <h3 data-panel-focus="edit" tabIndex={-1}>
            {hasAction ? 'Edit next action' : 'Set next action'}
          </h3>
          <FollowUpForm app={app} />
        </div>
      </SidePanel>
    </section>
  );
}
