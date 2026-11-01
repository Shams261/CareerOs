import { describe, expect, it } from 'vitest';
import {
  dictationError,
  readVoiceLang,
  speakableLines,
  voiceInput,
  voiceMeta,
  voiceSettingsInput,
  VOICE_LANGS,
} from '../src/features/agent/voice-domain';
import { staticSecurityHeaders } from '../src/server/security';

describe('voice (WI-104)', () => {
  it('marks a message as voice only when dictation filled it, and says if it was edited', () => {
    expect(voiceMeta(null, 'what is on today')).toBeNull();
    expect(voiceMeta('what is on today', ' what is on today ')).toEqual({
      via: 'voice',
      edited: false,
    });
    expect(voiceMeta('what is on today', 'what is on tomorrow')).toEqual({
      via: 'voice',
      edited: true,
    });
  });
  it('accepts only the voice mark from the page, never audio or text', () => {
    expect(voiceInput.safeParse({ via: 'voice', edited: false }).success).toBe(
      true,
    );
    for (const bad of [
      { via: 'voice', edited: false, transcript: 'x' },
      { via: 'voice', edited: false, audio: 'AAAA' },
      { via: 'typed', edited: false },
      { via: 'voice' },
    ])
      expect(voiceInput.safeParse(bad).success).toBe(false);
  });
  it('turns recognition errors into plain lines', () => {
    expect(dictationError('not-allowed')).toMatch(/not allowed/);
    expect(dictationError('no-speech')).toMatch(/No speech/);
    expect(dictationError('network')).toMatch(/connection/);
    expect(dictationError('aborted')).toBe('');
    expect(dictationError('weird')).toMatch(/Type instead/);
  });
  it('reads a reply as plain lines without its marks', () => {
    expect(
      speakableLines(
        '**Start** with Graphs.\n\n- BFS at 18:00\n- Revise heaps',
      ),
    ).toEqual(['Start with Graphs.', 'BFS at 18:00', 'Revise heaps']);
    expect(speakableLines('')).toEqual([]);
  });
  it('keeps the languages to the listed ones and reads the form', () => {
    expect(VOICE_LANGS.map(([c]) => c)).toEqual(['en-IN', 'en-US', 'hi-IN']);
    expect(readVoiceLang('hi-IN')).toBe('hi-IN');
    expect(readVoiceLang('fr-FR')).toBe('en-IN');
    expect(
      voiceSettingsInput.parse({
        consent: true,
        lang: 'xx',
        speakReplies: false,
      }),
    ).toEqual({ consent: true, lang: 'en-IN', speakReplies: false });
  });
  it('lets the microphone work only on Silsila’s own pages', () => {
    const policy = staticSecurityHeaders(true).find(
      (h) => h.key === 'Permissions-Policy',
    )!.value;
    expect(policy).toContain('microphone=(self)');
    expect(policy).toContain('camera=()');
    expect(policy).toContain('geolocation=()');
  });
});
