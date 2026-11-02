import Link from 'next/link';
import { dayKey, shortDate } from '@/lib/time';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { AGENT_NAME } from '@/features/agent/constants';
import { PreparePanel } from '@/features/prep/panel';
import type { ApplicationView } from '../page-data';

/** The prep docs and Prepare with Rumi (WI-042), inside the next round or in the rail. */
export function PrepTools({ v }: { v: ApplicationView }) {
  const { app, zone, docs, prepPreview } = v;
  return (
    <>
      {docs.length > 0 && (
        <ul className="plain-list prep-docs">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                className="link"
                href={`/jobs/${app.id}/prep/${d.id}`}
                prefetch={false}
              >
                Prep doc · {shortDate(dayKey(d.createdAt, zone))}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <PanelButton panel="prep-rumi" className="button secondary small">
        {docs.length ? 'Prepare again' : `Prepare with ${AGENT_NAME}`}
      </PanelButton>
      <SidePanel id="prep-rumi" title={`Prepare with ${AGENT_NAME}`}>
        <PreparePanel
          applicationId={app.id}
          company={app.company}
          preview={prepPreview}
        />
      </SidePanel>
    </>
  );
}
