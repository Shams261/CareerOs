'use client';
/**
 * Rumi's voice in the composer (WI-104): the microphone button, the words heard so far, and
 * the reply read aloud. Shown only with the owner's consent and only where the browser has
 * recognition (R6: the device decides; nothing pretends to work).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import {
  recognitionSupported,
  speechSupported,
  useDictation,
  useSpeaker,
} from '@/lib/speech';
import { voiceStateAction } from './actions';
import {
  dictationError,
  SILENCE_MS,
  speakableLines,
  type VoiceLang,
} from './voice-domain';

export type VoiceState = {
  consented: boolean;
  lang: VoiceLang;
  speakReplies: boolean;
};
const noop = () => () => undefined;
export const useCanDictate = () =>
  useSyncExternalStore(noop, recognitionSupported, () => false);
export const useCanSpeak = () =>
  useSyncExternalStore(noop, speechSupported, () => false);

/** The owner's voice settings: given by the page, or read once (the drawer). */
export function useVoiceState(initial: VoiceState | null | undefined) {
  const [state, setState] = useState<VoiceState | null>(initial ?? null);
  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    voiceStateAction()
      .then((s) => live && setState(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initial]);
  return state;
}

/**
 * Dictation into the composer: `base` is what was typed before the microphone; the words
 * heard are added after it. Escape drops them and puts the typed text back.
 */
export function useComposerVoice({
  lang,
  text,
  setText,
}: {
  lang: VoiceLang;
  text: string;
  setText: (t: string) => void;
}) {
  const base = useRef('');
  const dictated = useRef<string | null>(null);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const join = (a: string, b: string) =>
    [a.trim(), b].filter(Boolean).join(' ');
  const onText = useCallback(
    (finalText: string, heard: string) => {
      const next = join(base.current, finalText);
      dictated.current = next;
      setText(next);
      setInterim(heard);
    },
    [setText],
  );
  const onError = useCallback(
    (code: string) => setError(dictationError(code)),
    [],
  );
  const d = useDictation({ lang, silenceMs: SILENCE_MS, onText, onError });
  return {
    listening: d.listening,
    // Interim words only mean something while listening.
    interim: d.listening ? interim : '',
    error,
    toggle: () => {
      setError('');
      if (d.listening) return d.stop();
      base.current = text;
      d.start();
    },
    cancel: () => {
      d.cancel();
      setText(base.current);
      dictated.current = null;
      setInterim('');
    },
    /** What dictation filled, for the message's voice mark; cleared after a send. */
    take: () => {
      const v = dictated.current;
      dictated.current = null;
      return v;
    },
  };
}

export function MicButton({
  listening,
  onClick,
}: {
  listening: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rumi-mic"
      data-on={listening ? 'true' : undefined}
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : 'Speak your question'}
      onClick={onClick}
    >
      {listening ? (
        <MicOff size={18} aria-hidden="true" />
      ) : (
        <Mic size={18} aria-hidden="true" />
      )}
    </button>
  );
}

/** Reads a reply aloud when the owner turned that on; Stop while it reads. */
export function useReplyVoice(state: VoiceState | null) {
  const speaker = useSpeaker(state?.lang ?? 'en-IN');
  return {
    speaking: speaker.speaking,
    stop: speaker.stop,
    read: (reply: string) => {
      if (state?.speakReplies) speaker.speak(speakableLines(reply));
    },
  };
}

export function StopReading({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="link-button rumi-stop" onClick={onClick}>
      <Square size={12} aria-hidden="true" /> Stop reading
    </button>
  );
}

/** Listen on a short text (Rumi's line on Today): the device's voice, with Stop. */
export function ListenLine({
  text,
  lang = 'en-IN',
}: {
  text: string;
  lang?: string;
}) {
  const can = useCanSpeak();
  const speaker = useSpeaker(lang);
  if (!can) return null;
  return speaker.speaking ? (
    <button type="button" className="button secondary" onClick={speaker.stop}>
      Stop
    </button>
  ) : (
    <button
      type="button"
      className="button secondary"
      onClick={() => speaker.speak([text])}
    >
      Listen
    </button>
  );
}
