import { describe, expect, it } from 'vitest';
import { pickVoice } from '../src/lib/speech';

const v = (name: string, lang: string, localService = true) => ({
  name,
  lang,
  localService,
});

describe('pickVoice (WI-143)', () => {
  it('keeps the words on the device: a local voice before a network one', () => {
    const voices = [
      v('Google UK English Female', 'en-GB', false),
      v('Rishi', 'en-IN'),
    ];
    expect(pickVoice(voices, 'en-IN')?.name).toBe('Rishi');
  });

  it('prefers the exact language, then an enhanced or premium voice', () => {
    const voices = [
      v('Samantha', 'en-US'),
      v('Daniel', 'en-GB'),
      v('Samantha (Enhanced)', 'en-US'),
      v('Veena', 'en-IN'),
    ];
    expect(pickVoice(voices, 'en-US')?.name).toBe('Samantha (Enhanced)');
    // An Indian voice says Indian names and Hinglish right, even a compact one.
    expect(pickVoice(voices, 'en-IN')?.name).toBe('Veena');
    expect(
      pickVoice([...voices, v('Veena (Enhanced)', 'en-IN')], 'en-IN')?.name,
    ).toBe('Veena (Enhanced)');
    expect(
      pickVoice([v('Daniel', 'en-GB'), v('Veena', 'en-IN')], 'en-IN')?.name,
    ).toBe('Veena');
  });

  it('finds none for a language the device does not speak', () => {
    expect(pickVoice([v('Samantha', 'en-US')], 'hi-IN')).toBeNull();
  });
});
