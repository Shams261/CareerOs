'use client';
/**
 * The browser's speech, shared by Listen (WI-037) and Rumi's voice (WI-104): the device's
 * voices for reading aloud, and its recognition for dictation. Both are feature-detected;
 * where a browser has neither, nothing renders that needs them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const recognitionSupported = () => !!recognitionCtor();

/** The device's voices for a language, on-device voices before network ones. */
export function useVoices(prefix = 'en') {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechSupported()) return;
    const load = () =>
      setVoices(
        speechSynthesis
          .getVoices()
          .filter((v) => v.lang.toLowerCase().startsWith(prefix))
          .sort((a, b) => Number(b.localService) - Number(a.localService)),
      );
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, [prefix]);
  return voices;
}

/**
 * Reads lines aloud one after another with the device's voice; `stop` cancels at once and a
 * line that ends after Stop never starts the next. Cancelled on unmount.
 */
export function useSpeaker(lang = 'en-IN') {
  const voices = useVoices(lang.slice(0, 2));
  const run = useRef(0);
  const [speaking, setSpeaking] = useState(false);
  const stop = useCallback(() => {
    run.current++;
    if (speechSupported()) speechSynthesis.cancel();
    setSpeaking(false);
  }, []);
  useEffect(() => stop, [stop]);
  const speak = useCallback(
    (lines: string[]) => {
      if (!speechSupported() || !lines.length) return;
      const id = ++run.current;
      speechSynthesis.cancel();
      setSpeaking(true);
      const say = (i: number) => {
        if (id !== run.current) return;
        if (i >= lines.length) return setSpeaking(false);
        const u = new SpeechSynthesisUtterance(lines[i]);
        const v =
          voices.find((x) => x.lang === lang) ??
          voices.find((x) => x.lang.startsWith(lang.slice(0, 2)));
        if (v) u.voice = v;
        u.lang = v?.lang ?? lang;
        u.onend = () => say(i + 1);
        u.onerror = () => {
          if (id === run.current) setSpeaking(false);
        };
        speechSynthesis.speak(u);
      };
      say(0);
    },
    [voices, lang],
  );
  return { speak, stop, speaking };
}

/**
 * Dictation with the browser's recognition: tap to start, tap again or a pause of `silenceMs`
 * to stop, `cancel` to drop what was heard. `onText` gets the words heard so far (final and
 * interim); the caller decides where they go. Nothing is recorded or kept.
 */
export function useDictation({
  lang,
  silenceMs,
  onText,
  onError,
}: {
  lang: string;
  silenceMs: number;
  onText: (finalText: string, interim: string) => void;
  onError: (code: string) => void;
}) {
  const rec = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listening, setListening] = useState(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const stop = useCallback(() => {
    clear();
    rec.current?.stop();
  }, []);
  const cancel = useCallback(() => {
    clear();
    rec.current?.abort();
    rec.current = null;
    setListening(false);
  }, []);
  useEffect(() => cancel, [cancel]);
  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return onError('unsupported');
    rec.current?.abort();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    let heard = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) heard += res[0].transcript;
        else interim += res[0].transcript;
      }
      onText(heard.trim(), interim.trim());
      clear();
      timer.current = setTimeout(() => r.stop(), silenceMs);
    };
    r.onerror = (e) => onError(e.error);
    r.onend = () => {
      clear();
      if (rec.current === r) rec.current = null;
      setListening(false);
    };
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      onError('start');
    }
  }, [lang, silenceMs, onText, onError]);
  return { listening, start, stop, cancel };
}
