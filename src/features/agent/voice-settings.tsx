'use client';
/**
 * Settings → Voice (WI-104). Consent first, in plain words: the browser's own recognition
 * turns speech into text, which leaves Silsila's zero-retention rule (Chrome sends the audio
 * to Google, Safari to Apple); Rumi then gets the same text as if typed. "Check this device"
 * is the R6 spike kept as a tool: it shows what this browser can do, here and now.
 */
import { useCallback, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { useDictation, useSpeaker } from '@/lib/speech';
import { voiceSettingsAction } from './actions';
import { AGENT_NAME } from '@/features/agent/constants';
import { useCanDictate, useCanSpeak, type VoiceState } from './voice';
import { dictationError, SILENCE_MS, VOICE_LANGS } from './voice-domain';

export function VoiceSettings({ state }: { state: VoiceState }) {
  return (
    <div className="voice-settings">
      <ActionForm
        action={voiceSettingsAction}
        label="Voice"
        className="voice-form"
      >
        <p>
          The microphone uses your browser’s own speech recognition: Chrome
          sends the audio to Google and Safari to Apple to turn it into text.
          That happens outside Silsila’s zero-retention AI rule. {AGENT_NAME}{' '}
          then gets the same text as if you had typed it, and nothing is sent
          until you press Send. Silsila keeps no audio and no transcript, only
          that a message came by voice.
        </p>
        <label className="check">
          <input
            type="checkbox"
            name="consent"
            defaultChecked={state.consented}
          />
          I understand; show the microphone button
        </label>
        <label>
          Listen in
          <select name="lang" defaultValue={state.lang}>
            {VOICE_LANGS.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="speakReplies"
            defaultChecked={state.speakReplies}
          />
          Read {AGENT_NAME}’s replies aloud with this device’s voice
        </label>
        <Button className="small">Save</Button>
      </ActionForm>
      <DeviceCheck state={state} />
    </div>
  );
}

/** What this browser can do: recognition and a voice, each tried on a press. */
function DeviceCheck({ state }: { state: VoiceState }) {
  const canDictate = useCanDictate();
  const canSpeak = useCanSpeak();
  const speaker = useSpeaker(state.lang);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const onText = useCallback(
    (f: string, i: string) => setHeard([f, i].filter(Boolean).join(' ')),
    [],
  );
  const onError = useCallback((c: string) => setError(dictationError(c)), []);
  const d = useDictation({
    lang: state.lang,
    silenceMs: SILENCE_MS,
    onText,
    onError,
  });
  return (
    <section className="panel-section" aria-labelledby="voice-check">
      <h3 id="voice-check">Check this device</h3>
      <ul className="plain-list voice-check">
        <li>
          <span>Speech to text</span>
          <span className="muted">
            {canDictate ? 'Available in this browser' : 'Not in this browser'}
          </span>
        </li>
        <li>
          <span>Reading aloud</span>
          <span className="muted">
            {canSpeak ? 'Available in this browser' : 'Not in this browser'}
          </span>
        </li>
      </ul>
      <div className="actions">
        {canDictate && state.consented && (
          <Button
            type="button"
            className="secondary small"
            onClick={() => {
              setError('');
              setHeard('');
              if (d.listening) d.stop();
              else d.start();
            }}
          >
            {d.listening ? 'Stop' : 'Try the microphone'}
          </Button>
        )}
        {canSpeak && (
          <Button
            type="button"
            className="secondary small"
            onClick={() =>
              speaker.speak([
                `This is how ${AGENT_NAME} sounds on this device.`,
              ])
            }
          >
            Try the voice
          </Button>
        )}
      </div>
      {canDictate && !state.consented && (
        <p className="muted">Save your consent above to try the microphone.</p>
      )}
      {(heard || error || d.listening) && (
        <p aria-live="polite">
          {error ||
            (heard ? `Heard: ${heard}` : 'Listening… say a short sentence.')}
        </p>
      )}
    </section>
  );
}
