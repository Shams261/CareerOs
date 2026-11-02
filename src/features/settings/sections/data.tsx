import { Download, Library, Server } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { SidePanel } from '@/components/side-panel';
import { restoreCurriculumAction } from '@/features/curriculum/actions';
import { SettingRow } from '../rows';
import { dayKey, shortDate } from '@/lib/time';
import type { SettingsView } from '../page-data';

/** Data: the curriculum, export and, when it needs the owner, the system (Rumi and AI have their own group since WI-141). */
export function DataGroup({ v }: { v: SettingsView }) {
  const { user, curriculum, healthy, statusLine } = v;
  return (
    <section
      id="data"
      className="settings-group"
      aria-labelledby="data-heading"
    >
      <div className="agenda-head">
        <h2 id="data-heading" className="agenda-heading">
          Data
        </h2>
      </div>
      <ul className="plain-list attention-list">
        {curriculum && (
          <SettingRow
            source="roadmap"
            icon={<Library size={22} />}
            label="Default curriculum"
            title={`${curriculum.roadmaps} roadmaps · ${curriculum.problems} practice problems`}
            context={`Published ${shortDate(dayKey(curriculum.publishedAt, user.timezone))} · in every workspace`}
            panel="curriculum"
          />
        )}
        <SettingRow
          source="weekly"
          icon={<Download size={22} />}
          label="Export"
          title="Download my data"
          context="JSON · without credentials or device keys"
          href="/api/export"
          download
        />
        {/* The technical line shows only when something needs the owner (WI-063). */}
        {!healthy && (
          <SettingRow
            source="weekly"
            icon={<Server size={22} />}
            label="System"
            title="Needs attention"
            context={statusLine}
          />
        )}
      </ul>
      <SidePanel id="curriculum" title="Default curriculum">
        <p>
          Restore brings back any default roadmap, item or practice problem that
          is missing, archived or hidden. Your marks, attempts and notes stay as
          they are.
        </p>
        <ActionForm
          action={restoreCurriculumAction}
          label="Restore default curriculum"
        >
          <Button variant="secondary">Restore default curriculum</Button>
        </ActionForm>
      </SidePanel>
    </section>
  );
}
