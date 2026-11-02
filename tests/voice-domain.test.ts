import { describe, expect, it } from 'vitest';
import {
  dictationError,
  readVoiceLang,
  speakableLines,
  TALK_SEND_MS,
  talkNext,
  voiceMeta,
  VOICE_LANGS,
} from '../src/features/agent/voice-domain';
import {
  voiceInput,
  voiceSettingsInput,
} from '../src/features/agent/voice-schema';
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

describe('Talk (WI-142)', () => {
  it('goes round: listen, show what was heard, send, read the answer, listen again', () => {
    let p = talkNext('off', { type: 'start' });
    expect(p).toBe('listening');
    p = talkNext(p, { type: 'heard', text: 'what is on today' });
    expect(p).toBe('confirming');
    p = talkNext(p, { type: 'sent' });
    expect(p).toBe('waiting');
    p = talkNext(p, { type: 'replied' });
    expect(p).toBe('speaking');
    expect(talkNext(p, { type: 'spoken' })).toBe('listening');
  });

  it('ends on a turn with nothing heard, on Stop, Edit or a failure', () => {
    expect(talkNext('listening', { type: 'heard', text: '  ' })).toBe('off');
    for (const phase of [
      'listening',
      'confirming',
      'waiting',
      'speaking',
    ] as const)
      for (const type of ['stop', 'edit', 'failed'] as const)
        expect(talkNext(phase, { type })).toBe('off');
  });

  it('ignores an event that does not belong to the moment', () => {
    // A late answer after Stop is not read; a second Start does not restart a turn.
    expect(talkNext('off', { type: 'replied' })).toBe('off');
    expect(talkNext('off', { type: 'spoken' })).toBe('off');
    expect(talkNext('waiting', { type: 'start' })).toBe('waiting');
    expect(talkNext('speaking', { type: 'heard', text: 'x' })).toBe('speaking');
    expect(talkNext('listening', { type: 'sent' })).toBe('listening');
  });

  it('picks up on the new conversation page by reading the answer (resume)', () => {
    expect(talkNext('off', { type: 'resume' })).toBe('speaking');
    expect(talkNext('listening', { type: 'resume' })).toBe('listening');
  });

  it('waits long enough to stop it, not long enough to wait', () => {
    expect(TALK_SEND_MS).toBeGreaterThanOrEqual(1500);
    expect(TALK_SEND_MS).toBeLessThanOrEqual(3000);
  });
});
