import {
  RumiButtonContext,
  RumiButtonSetting,
} from '@/features/agent/button-setting';
import {
  MessageCircle,
  Mic,
  MessagesSquare,
  MousePointerClick,
} from 'lucide-react';
import { SidePanel } from '@/components/side-panel';
import { SettingRow } from '../rows';
import { dayKey } from '@/lib/time';
import { AiSettings, aiContext } from '@/features/ai/settings';
import { MemorySettings, memoryContext } from '@/features/agent/memory';
import { VoiceSettings } from '@/features/agent/voice-settings';
import { readVoiceLang, VOICE_LANGS } from '@/features/agent/voice-domain';
import { AGENT_NAME } from '@/features/agent/constants';
import type { SettingsView } from '../page-data';

const voiceLangName = (code: string) =>
  VOICE_LANGS.find(([c]) => c === code)?.[1] ?? 'English (India)';

/**
 * Rumi and AI in one group (WI-141): the AI switch and monthly limit, what Rumi knows, the
 * round button and voice, which sat under Data before.
 */
export function RumiGroup({ v }: { v: SettingsView }) {
  const { user, now, rumiButton, ai, memoryLines, agent, style } = v;
  return (
    <section
      id="rumi"
      className="settings-group"
      aria-labelledby="rumi-heading"
    >
      <div className="agenda-head">
        <h2 id="rumi-heading" className="agenda-heading">
          {AGENT_NAME} and AI
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
      </ul>
      <SidePanel id="ai" title="AI and Grill Me">
        <AiSettings state={ai} zone={user.timezone} />
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
