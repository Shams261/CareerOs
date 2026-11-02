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
import { AudioLines, Mic, MicOff, Square } from 'lucide-react';
import {
  recognitionSupported,
  speechSupported,
  useDictation,
  useSpeaker,
} from '@/lib/speech';
import { voiceStateAction } from './actions';
import { AGENT_NAME } from './constants';
import {
  dictationError,
  SILENCE_MS,
  speakableLines,
  TALK_SEND_MS,
  talkNext,
  type TalkEvent,
  type TalkPhase,
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
  // Talk (WI-142) waits for the end of a turn: the composer's text once something was heard.
  const ended = useRef<((text: string) => void) | null>(null);
  const onEnd = useCallback((heard: string) => {
    const done = ended.current;
    ended.current = null;
    done?.(heard ? (dictated.current ?? heard) : '');
  }, []);
  const d = useDictation({
    lang,
    silenceMs: SILENCE_MS,
    onText,
    onError,
    onEnd,
  });
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
      ended.current = null;
      d.cancel();
      setText(base.current);
      dictated.current = null;
      setInterim('');
    },
    /** One turn for Talk: listens, then hands over the composer's text (empty if nothing). */
    listen: (done: (text: string) => void) => {
      setError('');
      ended.current = done;
      base.current = text;
      d.start();
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
    prime: speaker.prime,
    read: (reply: string) => {
      if (state?.speakReplies) speaker.speak(speakableLines(reply));
    },
    /** Talk reads every reply, whatever the setting, and says when it is done. */
    say: (reply: string, done: () => void) =>
      speaker.speak(speakableLines(reply), done),
  };
}

/**
 * Talk (WI-142): a conversation by voice. One tap listens; a pause shows what was heard for
 * `TALK_SEND_MS` with Edit and Send now, then sends it; the reply is read aloud and it listens
 * again, until Stop, Edit, a failure or a turn with nothing heard. The rules are `talkNext`.
 */
export function useTalk({
  composer,
  reader,
  send,
  text,
}: {
  composer: ReturnType<typeof useComposerVoice>;
  reader: ReturnType<typeof useReplyVoice>;
  /** The page's send, kept current by the page (a timer set renders ago calls it). */
  send: { current: (text: string) => void };
  text: string;
}) {
  const [phase, setPhase] = useState<TalkPhase>('off');
  const [note, setNote] = useState('');
  const now = useRef<TalkPhase>('off');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest text, for a timer set renders ago.
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  });
  const go = (e: TalkEvent) => {
    now.current = talkNext(now.current, e);
    setPhase(now.current);
    return now.current;
  };
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const sendNow = () => {
    clearTimer();
    if (go({ type: 'sent' }) === 'waiting') send.current(latest.current);
  };
  const listen = () =>
    composer.listen((heard) => {
      if (go({ type: 'heard', text: heard }) === 'confirming')
        timer.current = setTimeout(sendNow, TALK_SEND_MS);
      else if (!heard) setNote('Nothing was heard, so Talk stopped.');
    });
  const stop = () => {
    clearTimer();
    if (now.current === 'listening') composer.cancel();
    reader.stop();
    go({ type: 'stop' });
  };
  const latestStop = useRef(stop);
  useEffect(() => {
    latestStop.current = stop;
  });
  useEffect(() => () => latestStop.current(), []);
  return {
    phase,
    note,
    on: () => now.current !== 'off',
    start: () => {
      setNote('');
      // Inside the tap, so a reply read later is allowed on iOS.
      reader.prime();
      reader.stop();
      if (go({ type: 'start' }) === 'listening') listen();
    },
    stop,
    sendNow,
    edit: () => {
      clearTimer();
      go({ type: 'edit' });
    },
    replied: (reply: string) => {
      if (go({ type: 'replied' }) !== 'speaking') return;
      reader.say(reply, () => {
        if (go({ type: 'spoken' }) === 'listening') listen();
      });
    },
    /** Picks Talk up on the conversation's own page: reads the answer, then listens. */
    resume: (reply: string) => {
      if (go({ type: 'resume' }) !== 'speaking') return;
      reader.say(reply, () => {
        if (go({ type: 'spoken' }) === 'listening') listen();
      });
    },
    failed: () => {
      clearTimer();
      go({ type: 'failed' });
    },
  };
}

/** The Talk button beside the microphone (WI-142). */
export function TalkButton({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rumi-mic"
      data-on={on ? 'true' : undefined}
      aria-pressed={on}
      aria-label={on ? 'Stop talking' : `Talk with ${AGENT_NAME}`}
      onClick={onClick}
    >
      <AudioLines size={18} aria-hidden="true" />
    </button>
  );
}

/** What Talk is doing, under the composer, with the one or two things to press (WI-142). */
export function TalkBar({
  talk,
  heard,
}: {
  talk: ReturnType<typeof useTalk>;
  heard: string;
}) {
  if (talk.phase === 'off')
    return talk.note ? (
      <p className="m-0 mt-2 text-[14px] text-meta" role="status">
        {talk.note}
      </p>
    ) : null;
  const words: Record<Exclude<TalkPhase, 'off'>, string> = {
    listening: heard ? `Hearing: ${heard}` : 'Listening…',
    confirming: 'Sending what you said…',
    waiting: `${AGENT_NAME} is answering…`,
    speaking: `${AGENT_NAME} is speaking…`,
  };
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-2"
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0">
        <span className="font-semibold text-primary">Talk</span> ·{' '}
        {words[talk.phase]}
      </span>
      {talk.phase === 'confirming' && (
        <>
          <button type="button" className="link-button" onClick={talk.edit}>
            Edit
          </button>
          <button type="button" className="link-button" onClick={talk.sendNow}>
            Send now
          </button>
        </>
      )}
      <button
        type="button"
        className="link-button inline-flex items-center gap-1"
        onClick={talk.stop}
      >
        <Square size={12} aria-hidden="true" /> Stop
      </button>
    </div>
  );
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
