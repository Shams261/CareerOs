'use client';
/**
 * The one sound in WI-027: a soft two-note chime synthesised with Web Audio (no files, works
 * offline). Browsers only allow audio after a user gesture, so `unlockAudio()` runs on the
 * owner's first tap in Focus and the chime can play later when the time is up.
 */
type AudioCtor = typeof AudioContext;
let context: AudioContext | null = null;

function audio() {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    context ??= new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** Called from a tap: lets a later chime play (and keeps iOS from muting it as ambient). */
export function unlockAudio() {
  const ctx = audio();
  if (!ctx) return;
  try {
    const session = (
      navigator as unknown as { audioSession?: { type: string } }
    ).audioSession;
    if (session) session.type = 'playback';
  } catch {
    // Older browsers have no audio session; the chime may follow the silent switch there.
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/** Two soft sine notes, about −24 dB, half a second in all. Silent when audio is unavailable. */
export function playChime() {
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime + 0.02;
  for (const [i, frequency] of [659.25, 880].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = start + i * 0.18;
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.06, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.45);
  }
}
