import {
  RumiButtonContext,
  RumiButtonSetting,
} from '@/features/agent/button-setting';
import {
  Download,
  Library,
  MessageCircle,
  Mic,
  MessagesSquare,
  Server,
  MousePointerClick,
} from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { SidePanel } from '@/components/side-panel';
import { restoreCurriculumAction } from '@/features/curriculum/actions';
import { SettingRow } from '../rows';
import { dayKey, shortDate } from '@/lib/time';
import { AiSettings, aiContext } from '@/features/ai/settings';
import { MemorySettings, memoryContext } from '@/features/agent/memory';
import { VoiceSettings } from '@/features/agent/voice-settings';
import { readVoiceLang, VOICE_LANGS } from '@/features/agent/voice-domain';
import { AGENT_NAME } from '@/features/agent/constants';
import type { SettingsView } from '../page-data';

const voiceLangName = (code: string) =>
  VOICE_LANGS.find(([c]) => c === code)?.[1] ?? 'English (India)';

/** Data: AI, Rumi, voice, the curriculum, export and, when it needs the owner, the system. */
export function DataGroup({ v }: { v: SettingsView }) {
  const {
    user,
    now,
    rumiButton,
    ai,
    memoryLines,
    agent,
    style,
    curriculum,
    healthy,
    statusLine,
  } = v;
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
        <SettingRow
          source="roadmap"
          icon={<MessagesSquare size={22} />}
          label="AI"
          title="AI and Grill Me"
          context={aiContext(ai)}
          panel="ai"
        />
        {ai.configured && (
          <SettingRow
            source="roadmap"
            icon={<MessageCircle size={22} />}
            label={AGENT_NAME}
            title={`${AGENT_NAME} knows`}
            context={memoryContext(memoryLines)}
            panel="rumi-memory"
          />
        )}
        {ai.configured && (
          <SettingRow
            source="roadmap"
            icon={<MousePointerClick size={22} />}
            label={`${AGENT_NAME} button`}
            title="The round button on every page"
            context={<RumiButtonContext initial={rumiButton} />}
            control={<RumiButtonSetting initial={rumiButton} />}
          />
        )}
        {ai.configured && (
          <SettingRow
            source="roadmap"
            icon={<Mic size={22} />}
            label="Voice"
            title={`Speak to ${AGENT_NAME}`}
            context={
              agent.voiceConsentAt
                ? `On · ${voiceLangName(agent.voiceLang)}${agent.speakReplies ? ' · replies read aloud' : ''}`
                : 'Off'
            }
            panel="rumi-voice"
          />
        )}
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
      <SidePanel id="ai" title="AI and Grill Me">
        <AiSettings state={ai} zone={user.timezone} />
      </SidePanel>
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
      <SidePanel id="rumi-voice" title="Voice">
        <VoiceSettings
          state={{
            consented: !!agent.voiceConsentAt,
            lang: readVoiceLang(agent.voiceLang),
            speakReplies: agent.speakReplies,
          }}
        />
      </SidePanel>
      <SidePanel id="rumi-memory" title={`${AGENT_NAME} knows`}>
        <MemorySettings
          lines={memoryLines}
          today={dayKey(now, user.timezone)}
          memoryEnabled={agent.memoryEnabled}
          style={style}
        />
      </SidePanel>
    </section>
  );
}
