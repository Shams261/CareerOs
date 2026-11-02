/**
 * Voice for Rumi (WI-104, ADR-030): pure rules. The browser's own recognition turns speech
 * into text in the composer, and the device's own voice reads replies and Rumi's lines. The
 * microphone alone sends nothing until the owner presses Send; Talk (WI-142, the owner's
 * choice) sends what was heard after a pause the owner can stop, reads the reply and listens
 * again. No audio and no transcript is ever stored; a message only remembers that it came by
 * voice and whether it was edited. Covered by tests/voice-domain.test.ts.
 */
import { renderText } from './text';

/** The languages the microphone listens in (BCP 47), the first the default. */
export const VOICE_LANGS = [
  ['en-IN', 'English (India)'],
  ['en-US', 'English (US)'],
  ['hi-IN', 'Hindi'],
] as const;
export type VoiceLang = (typeof VOICE_LANGS)[number][0];
export const readVoiceLang = (v: unknown): VoiceLang =>
  VOICE_LANGS.some(([code]) => code === v) ? (v as VoiceLang) : 'en-IN';
/** Dictation stops after this long without a new word. */
export const SILENCE_MS = 2000;
/** Talk ends a turn sooner (WI-143): a conversation should not wait. */
export const TALK_SILENCE_MS = 1500;

/** How long Talk shows what it heard before it sends it; Edit or Stop within it keeps it. */
export const TALK_SEND_MS = 2000;
/** Where Talk leaves an answer while /rumi opens the conversation it started (WI-142). */
export const TALK_RESUME_KEY = 'silsila-talk-resume';

/**
 * Talk (WI-142): a conversation by voice. Listening, then what was heard waits `TALK_SEND_MS`
 * (Edit or Send now), then the answer is awaited and read aloud, then it listens again. Stop,
 * Edit, a failure or a turn with nothing heard ends it.
 */
export type TalkPhase =
  'off' | 'listening' | 'confirming' | 'waiting' | 'speaking';
export type TalkEvent =
  | { type: 'start' }
  | { type: 'heard'; text: string }
  | { type: 'sent' }
  | { type: 'replied' }
  | { type: 'spoken' }
  /** The answer arrived as the page moved to the new conversation: read it there. */
  | { type: 'resume' }
  | { type: 'edit' }
  | { type: 'stop' }
  | { type: 'failed' };
export function talkNext(phase: TalkPhase, e: TalkEvent): TalkPhase {
  switch (e.type) {
    case 'stop':
    case 'edit':
    case 'failed':
      return 'off';
    case 'start':
      return phase === 'off' ? 'listening' : phase;
    case 'heard':
      if (phase !== 'listening') return phase;
      return e.text.trim() ? 'confirming' : 'off';
    case 'sent':
      return phase === 'confirming' ? 'waiting' : phase;
    case 'replied':
      return phase === 'waiting' ? 'speaking' : phase;
    case 'spoken':
      return phase === 'speaking' ? 'listening' : phase;
    case 'resume':
      return phase === 'off' ? 'speaking' : phase;
  }
}

/** What a message keeps about voice: that it came by voice, and whether it was edited. */
export type VoiceMeta = { via: 'voice'; edited: boolean };
/** The metadata of a sent message: by voice when dictation filled the composer. */
export function voiceMeta(
  dictated: string | null,
  sent: string,
): VoiceMeta | null {
  if (dictated === null) return null;
  return { via: 'voice', edited: dictated.trim() !== sent.trim() };
}

/** The recognition errors a browser reports, as plain lines for the owner. */
export function dictationError(code: string) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is not allowed. Allow it for Silsila in the browser’s settings.';
    case 'no-speech':
      return 'No speech was heard. Tap the microphone and speak.';
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'network':
      return 'Voice input needs a connection.';
    case 'aborted':
      return '';
    default:
      return 'Voice input stopped. Type instead, or try again.';
  }
}

/** A reply as lines to read aloud: paragraphs and list items, without the bold marks. */
export function speakableLines(text: string) {
  return renderText(text)
    .flatMap((b) =>
      b.type === 'p'
        ? [b.spans.map((s) => s.text).join('')]
        : b.items.map((item) => item.map((s) => s.text).join('')),
    )
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30);
}
