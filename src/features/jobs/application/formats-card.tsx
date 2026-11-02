import Link from 'next/link';
import { dayKey, shortDate } from '@/lib/time';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { aiPolicyLabel, typeLabel } from '@/features/jobs/formats';
import { FormatsForm } from '@/features/jobs/forms';
import type { ApplicationView } from '../page-data';

/** Interview formats and the owner's own material for each (WI-047); open applications only. */
export function FormatsCard({ v }: { v: ApplicationView }) {
  const { app, zone, loop } = v;
  return (
    <section className="card flat" aria-labelledby="formats-heading">
      <div className="section-head">
        <h2 id="formats-heading">Interview formats</h2>
        <PanelButton panel="formats" className="link-button">
          {app.formats.length ? 'Edit formats' : 'Set formats'}
        </PanelButton>
      </div>
      {!loop.length && (
        <p className="empty">
          No formats yet. Tick the rounds this company uses, or add an interview
          with its type.
        </p>
      )}
      {loop.length > 0 && (
        <ul className="plain-list format-list">
          {loop.map((f) => {
            const href = (i: NonNullable<typeof f.next>) =>
              i.dsaProblemId
                ? `/dsa/${i.dsaProblemId}?from=${i.id}`
                : `/roadmap/${i.roadmapId}?section=${encodeURIComponent(i.section)}#item-${i.id}`;
            return (
              <li className="format-row" key={f.format}>
                <div className="format-main">
                  <strong>{typeLabel[f.format]}</strong>
                  <small>
                    {[
                      f.nextRound
                        ? `Round ${shortDate(dayKey(f.nextRound, zone))}`
                        : null,
                      f.aiPolicy ? aiPolicyLabel[f.aiPolicy] : null,
                      f.total ? `${f.done} of ${f.total} done` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'From this company’s loop'}
                  </small>
                </div>
                <div className="format-links">
                  {f.guide && (
                    <Link
                      className="link"
                      href={href(f.guide)}
                      prefetch={false}
                    >
                      What it tests
                    </Link>
                  )}
                  {f.next && (
                    <Link className="link" href={href(f.next)} prefetch={false}>
                      Next: {f.next.title}
                    </Link>
                  )}
                  {!f.guide && !f.next && (
                    <span className="muted">
                      No roadmap material for this yet
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <SidePanel id="formats" title="Interview formats">
        <FormatsForm id={app.id} formats={app.formats} />
      </SidePanel>
    </section>
  );
}
